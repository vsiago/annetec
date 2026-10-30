import {
  ERROR_CODES,
  MANAGED_ACCOUNT_GENERAL_STATUS_LABELS,
  MANAGED_ACCOUNT_REQUEST_STATUS_LABELS,
  MANAGED_ACCOUNT_TERMS_TEXT,
  MANAGED_ACCOUNT_TERMS_VERSION,
  formatPhone,
  onlyDigits,
  roundCents,
  type ClubManagedAccountStatus,
  type ClubReceivingAccount,
  type ListManagedAccountsQuery,
  type ManagedAccountDetail,
  type ManagedAccountListItem,
  type ManagedAccountRequest,
  type RequestManagedAccountInput,
  type TenantAddress,
} from '@annetec/contracts'
import { and, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm'
import { allowedClubAsaasEnvironments } from '@/config/assert-production'
import { env } from '@/config/env'
import { db } from '@/db/client'
import {
  managedAccountDebits,
  managedAccountRequests,
  organization,
  tenantAsaasAccounts,
  tenantProfiles,
  type ManagedAccountRequestData,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { AsaasApiError, type AsaasClient } from '@/integrations/asaas/client'
import type { AsaasSubaccount } from '@/integrations/asaas/types'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { notify } from '@/lib/notifications'
import {
  countLinkedSubscriptions,
  deleteWebhookBestEffort,
  forgetClosedGatewayLinks,
  invalidateClubCredentials,
  receivingAccountDto,
  receivingAccountService,
} from '@/modules/club-billing/receiving-account.service'
import { environmentPolicyIssue, keyHintOf, maskCpfCnpj } from '@/modules/club-billing/receiving-account.rules'
import { todaySP } from '@/modules/club-billing/dates'
import { isPlatformAsaasConfigured } from '@/modules/platform-billing/gateway'
import { managedAccountEnvironment, requirePlatformAsaasClient, subaccountClient } from './asaas'
import { debitDto, listDebitsOf, type DebitRow } from './queries'
import {
  APPROVABLE_REQUEST_STATUSES,
  OPEN_REQUEST_STATUSES,
  documentsSnapshotOf,
  formatCpfCnpj,
  generalStatusOf,
  documentsOf,
  personTypeOf,
  subaccountPayload,
  type PersonType,
} from './rules'

/**
 * Conta de recebimento GERENCIADA pela ANNETEC (decisão do cliente,
 * 2026-10): em vez de colar a chave da própria conta Asaas, o clube pede e a
 * ANNETEC cria uma SUBCONTA Asaas do clube dentro da conta da ANNETEC.
 *
 *  1. o admin do clube pede, com os dados cadastrais e o aceite do termo
 *     (texto/versão, usuário, data/hora, IP, user-agent gravados);
 *  2. o superadmin aprova → `POST /v3/accounts` com a chave da plataforma; a
 *     chave da subconta (só vem nessa resposta) é gravada cifrada em
 *     `tenant_asaas_accounts` (`source = 'subaccount'`) na mesma operação, com
 *     a carteira; o webhook do clube é cadastrado com a chave da subconta e o
 *     provider do club-billing passa a usar essa conta;
 *  3. gravação falhou depois da criação → erro CRÍTICO no log com o id da
 *     subconta; "Recuperar chave" gera uma chave nova pela API
 *     (`POST /v3/accounts/{id}/accessTokens`) e grava;
 *  4. documentos (KYC) e situação: `GET /myAccount/documents|status` com a
 *     chave da subconta, sob demanda e na automação;
 *  5. débito automático das faturas da ANNETEC: `debit.service.ts`.
 */

type AccountRow = typeof tenantAsaasAccounts.$inferSelect
type RequestRow = typeof managedAccountRequests.$inferSelect

export interface ManagedActor {
  userId: string | null
}

export interface RequestActor {
  userId: string
  userName: string | null
  ip: string | null
  userAgent: string | null
}

/** Tentativas de gravar a chave depois de criar a subconta (ela só vem uma vez). */
const PERSIST_ATTEMPTS = 3
let persistRetryDelayMs = 150

/** Testes. */
export function setPersistRetryDelayMs(ms: number): void {
  persistRetryDelayMs = ms
}

export const KEY_RECOVERY_FORBIDDEN_MESSAGE =
  'O Asaas recusou gerar a chave da subconta (403). No painel do Asaas da ANNETEC, habilite Integrações → Chaves de API → ' +
  '"Gerenciamento de Chaves de API de Subcontas" (vale por 2 horas) e confira se o IP de saída do servidor está na whitelist de IPs.'

const SUBACCOUNT_KEY_REJECTED =
  'O Asaas recusou a chave da subconta. Use "Recuperar chave" em Contas gerenciadas (superadmin).'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeAsaasError(error: unknown): string {
  const status = error instanceof AsaasApiError ? error.httpStatus : 0
  return `${errorText(error)}${status ? ` (HTTP ${status})` : ''}`.slice(0, 400)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

interface TenantBasics {
  name: string
  slug: string
  legalName: string | null
  document: string | null
  email: string | null
  phone: string | null
  address: TenantAddress | null
}

async function tenantBasics(orgId: string): Promise<TenantBasics> {
  const [row] = await db
    .select({
      name: organization.name,
      slug: organization.slug,
      legalName: tenantProfiles.legalName,
      document: tenantProfiles.document,
      email: tenantProfiles.email,
      phone: tenantProfiles.phone,
      address: tenantProfiles.address,
    })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, orgId))
    .limit(1)
  if (!row) throw AppError.notFound('Clube')
  return { ...row, address: row.address ?? null }
}

async function loadAccountRow(orgId: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(tenantAsaasAccounts).where(eq(tenantAsaasAccounts.organizationId, orgId)).limit(1)
  return row ?? null
}

async function latestRequest(orgId: string): Promise<RequestRow | null> {
  const [row] = await db
    .select()
    .from(managedAccountRequests)
    .where(eq(managedAccountRequests.organizationId, orgId))
    .orderBy(desc(managedAccountRequests.createdAt))
    .limit(1)
  return row ?? null
}

export function requestDto(row: RequestRow): ManagedAccountRequest {
  const data = row.data
  const person = personTypeOf(data.cpfCnpj) ?? 'PJ'
  return {
    id: row.id,
    status: row.status,
    statusLabel: MANAGED_ACCOUNT_REQUEST_STATUS_LABELS[row.status],
    name: data.name,
    cpfCnpj: maskCpfCnpj(data.cpfCnpj),
    personType: person,
    companyType: data.companyType ?? null,
    birthDate: data.birthDate ?? null,
    incomeValue: Number(data.incomeValue),
    email: data.email,
    loginEmail: data.loginEmail,
    phone: data.phone ?? null,
    mobilePhone: data.mobilePhone,
    site: data.site ?? null,
    address: data.address,
    terms: {
      version: row.termsVersion,
      text: row.termsText,
      acceptedAt: row.acceptedAt.toISOString(),
      acceptedByName: row.acceptedByName ?? null,
      acceptedIp: row.acceptedIp ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    refuseReason: row.refuseReason ?? null,
    lastError: row.lastError ?? null,
  }
}

function linkedToManagedMessage(count: number): string {
  const subject = count === 1 ? '1 assinatura vinculada' : `${count} assinaturas vinculadas`
  return (
    `A conta Asaas própria do clube ainda tem ${subject}. Para passar para a conta gerenciada pela ANNETEC, ` +
    'cancele ou encerre essas assinaturas antes — os clientes e cartões salvos só existem na conta atual.'
  )
}

/** Por que o clube não pode pedir agora (`null` = pode). */
function requestBlockReason(args: {
  platformReady: boolean
  request: RequestRow | null
  account: AccountRow | null
  linked: number
  personType: PersonType | null
}): string | null {
  if (!args.platformReady) return 'A conta gerenciada ainda não está disponível neste servidor (Asaas da ANNETEC não configurado).'
  if (args.account?.source === 'subaccount') return 'O recebimento do clube já é gerenciado pela ANNETEC.'
  if (args.request && OPEN_REQUEST_STATUSES.includes(args.request.status)) return 'Já existe um pedido em análise pela ANNETEC.'
  if (!args.personType) return 'O cadastro do clube está sem CPF/CNPJ válido. Atualize os dados do clube antes de pedir.'
  if (args.account && args.linked > 0) return linkedToManagedMessage(args.linked)
  return null
}

function defaultsOf(basics: TenantBasics): ClubManagedAccountStatus['defaults'] {
  const address = basics.address
  return {
    name: basics.legalName || basics.name,
    cpfCnpj: formatCpfCnpj(basics.document),
    personType: personTypeOf(basics.document),
    email: basics.email,
    phone: basics.phone ? formatPhone(basics.phone) : null,
    address: address
      ? {
          postalCode: onlyDigits(address.cep),
          street: address.street,
          number: address.number,
          complement: address.complement ?? null,
          province: address.neighborhood,
          city: address.city,
          state: address.state,
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// Gravação da subconta (criação e recuperação de chave)
// ---------------------------------------------------------------------------

interface SubaccountCredentials {
  apiKey: string
  walletId: string | null
  asaasAccountId: string
  name: string
  cpfCnpj: string
  email: string | null
}

/**
 * Grava a chave/carteira na linha do clube e fecha o pedido — UMA transação.
 * `create`: conta nova (webhook recomeça, débito automático ligado); `rotate`:
 * mesma subconta, só a chave muda (o resto fica).
 */
async function saveSubaccount(
  orgId: string,
  requestId: string | null,
  credentials: SubaccountCredentials,
  mode: 'create' | 'rotate',
  actor: ManagedActor,
): Promise<void> {
  await db.transaction(async tx => {
    const now = new Date()
    if (mode === 'rotate') {
      await tx
        .update(tenantAsaasAccounts)
        .set({
          apiKeyEncrypted: encryptSecret(credentials.apiKey),
          keyHint: keyHintOf(credentials.apiKey),
          asaasAccountId: credentials.asaasAccountId,
          ...(credentials.walletId ? { walletId: credentials.walletId } : {}),
          updatedAt: now,
        })
        .where(and(eq(tenantAsaasAccounts.organizationId, orgId), eq(tenantAsaasAccounts.source, 'subaccount')))
    } else {
      const values = {
        source: 'subaccount' as const,
        apiKeyEncrypted: encryptSecret(credentials.apiKey),
        env: managedAccountEnvironment(),
        keyHint: keyHintOf(credentials.apiKey),
        asaasAccountId: credentials.asaasAccountId,
        walletId: credentials.walletId,
        accountName: credentials.name,
        accountCpfCnpj: onlyDigits(credentials.cpfCnpj) || null,
        accountEmail: credentials.email,
        accountStatusJson: null,
        documentsJson: null,
        documentsCheckedAt: null,
        autoDebitEnabled: true,
        managedRequestId: requestId,
        connectedBy: actor.userId,
        connectedAt: now,
        lastCheckedAt: null,
        updatedAt: now,
        webhookId: null,
        webhookTokenEncrypted: null,
        webhookStatus: 'pendente' as const,
        webhookLastError: null,
      }
      await tx
        .insert(tenantAsaasAccounts)
        .values({ organizationId: orgId, ...values })
        .onConflictDoUpdate({ target: tenantAsaasAccounts.organizationId, set: values })
    }
    if (requestId) {
      await tx
        .update(managedAccountRequests)
        .set({
          status: 'aprovado',
          asaasAccountId: credentials.asaasAccountId,
          walletId: credentials.walletId,
          decidedAt: now,
          decidedByUserId: actor.userId,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(managedAccountRequests.id, requestId))
    }
  })
  invalidateClubCredentials(orgId)
}

/** Grava com retentativas; `false` = não deu (a chave só existe na memória deste processo). */
async function persistSubaccount(
  orgId: string,
  requestId: string | null,
  credentials: SubaccountCredentials,
  mode: 'create' | 'rotate',
  actor: ManagedActor,
): Promise<boolean> {
  for (let attempt = 1; attempt <= PERSIST_ATTEMPTS; attempt += 1) {
    try {
      await saveSubaccount(orgId, requestId, credentials, mode, actor)
      return true
    } catch (error) {
      // Só a causa: a mensagem do erro de query do drizzle traz os parâmetros (chave cifrada, final da chave).
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : error instanceof Error ? error.name : 'erro'
      logger.error(
        { organizationId: orgId, asaasAccountId: credentials.asaasAccountId, attempt, err: cause },
        'Conta gerenciada: falha ao gravar a chave da subconta (tentando de novo)',
      )
      if (attempt < PERSIST_ATTEMPTS) await sleep(persistRetryDelayMs * attempt)
    }
  }
  return false
}

/** Marca o pedido (best effort — usado nos caminhos de erro). */
async function markRequest(requestId: string, values: Partial<Omit<RequestRow, 'id' | 'organizationId'>>): Promise<void> {
  try {
    await db
      .update(managedAccountRequests)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(managedAccountRequests.id, requestId))
  } catch (error) {
    logger.error({ requestId, err: errorText(error) }, 'Conta gerenciada: falha ao atualizar o pedido')
  }
}

function keyOf(created: AsaasSubaccount): string | null {
  return created.accessToken?.apiKey || created.apiKey || null
}

/**
 * Subconta da conta da ANNETEC com EXATAMENTE este CPF/CNPJ. Nunca confia só
 * no filtro do Asaas: um filtro ignorado/parcial devolveria a subconta de
 * OUTRO clube (e a chave dela seria gravada aqui).
 */
async function findSubaccountByDocument(client: AsaasClient, cpfCnpj: string): Promise<AsaasSubaccount | undefined> {
  const document = onlyDigits(cpfCnpj)
  if (!document) return undefined
  const page = await client.accounts.list({ cpfCnpj: document, limit: 10 })
  return (page.data ?? []).find(account => onlyDigits(account.cpfCnpj) === document)
}

/** A subconta já pertence a OUTRO clube (conectada nele, ou foi aprovada para ele e depois desconectada)? */
async function subaccountOwnedByOtherClub(orgId: string, asaasAccountId: string): Promise<boolean> {
  const [account] = await db
    .select({ organizationId: tenantAsaasAccounts.organizationId })
    .from(tenantAsaasAccounts)
    .where(and(eq(tenantAsaasAccounts.asaasAccountId, asaasAccountId), ne(tenantAsaasAccounts.organizationId, orgId)))
    .limit(1)
  if (account) return true
  const [request] = await db
    .select({ id: managedAccountRequests.id })
    .from(managedAccountRequests)
    .where(
      and(
        eq(managedAccountRequests.asaasAccountId, asaasAccountId),
        ne(managedAccountRequests.organizationId, orgId),
        eq(managedAccountRequests.status, 'aprovado'),
      ),
    )
    .limit(1)
  return Boolean(request)
}

function criticalKeyNotSaved(orgId: string, requestId: string | null, credentials: Pick<SubaccountCredentials, 'asaasAccountId' | 'walletId'>): AppError {
  logger.error(
    {
      alert: 'managed_account_key_not_saved',
      organizationId: orgId,
      requestId,
      asaasAccountId: credentials.asaasAccountId,
      walletId: credentials.walletId,
    },
    'CRÍTICO: subconta criada no Asaas, mas a chave NÃO foi gravada — use "Recuperar chave" em Contas gerenciadas (ou o gerente Asaas) com este id',
  )
  return new AppError(
    ERROR_CODES.INTERNAL_ERROR,
    `A subconta foi criada no Asaas (id ${credentials.asaasAccountId}), mas a chave não foi gravada. Use "Recuperar chave" para concluir.`,
  )
}

async function notifyDecision(orgId: string, approved: boolean, reason: string | null): Promise<void> {
  const basics = await tenantBasics(orgId).catch(() => null)
  await notify({
    audience: 'tenant',
    kind: 'managed_account_decided',
    organizationId: orgId,
    title: approved ? 'Conta gerenciada aprovada' : 'Pedido de conta gerenciada recusado',
    body: approved
      ? 'A conta de recebimento foi criada. Envie os documentos pedidos pelo Asaas para liberar a conta.'
      : reason,
    link: basics ? `/${basics.slug}/admin/faturamento?tab=recebimento` : null,
  })
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export const managedAccountService = {
  // ---- Clube ---------------------------------------------------------------

  async clubStatus(orgId: string): Promise<ClubManagedAccountStatus> {
    const [basics, request, row] = await Promise.all([tenantBasics(orgId), latestRequest(orgId), loadAccountRow(orgId)])
    const linked = row && row.source !== 'subaccount' ? await countLinkedSubscriptions(orgId) : 0
    const blockedReason = requestBlockReason({
      platformReady: isPlatformAsaasConfigured(),
      request,
      account: row,
      linked,
      personType: personTypeOf(basics.document),
    })
    return {
      request: request ? requestDto(request) : null,
      account: await receivingAccountDto(row, orgId),
      canRequest: blockedReason === null,
      blockedReason,
      defaults: defaultsOf(basics),
      terms: { version: MANAGED_ACCOUNT_TERMS_VERSION, text: MANAGED_ACCOUNT_TERMS_TEXT },
    }
  },

  /** Pedido do clube (admin): dados + aceite. Regra de troca igual à do connect (409). */
  async submitRequest(orgId: string, input: RequestManagedAccountInput, actor: RequestActor): Promise<ClubManagedAccountStatus> {
    if (input.termsVersion !== MANAGED_ACCOUNT_TERMS_VERSION) {
      throw AppError.businessRule('O termo de aceite foi atualizado. Recarregue a página e aceite a versão atual.')
    }
    const basics = await tenantBasics(orgId)
    const cpfCnpj = onlyDigits(basics.document)
    const person = personTypeOf(cpfCnpj)
    if (person === 'PJ' && !input.companyType) {
      throw AppError.validation([{ path: 'companyType', message: 'Informe a natureza jurídica do clube' }])
    }
    if (person === 'PF' && !input.birthDate) {
      throw AppError.validation([{ path: 'birthDate', message: 'Informe a data de nascimento do titular' }])
    }
    const [request, row] = await Promise.all([latestRequest(orgId), loadAccountRow(orgId)])
    const linked = row && row.source !== 'subaccount' ? await countLinkedSubscriptions(orgId) : 0
    const blocked = requestBlockReason({ platformReady: isPlatformAsaasConfigured(), request, account: row, linked, personType: person })
    if (blocked) throw AppError.conflict(blocked)

    const data: ManagedAccountRequestData = {
      name: basics.legalName || basics.name,
      cpfCnpj,
      companyType: person === 'PJ' ? (input.companyType ?? null) : null,
      birthDate: person === 'PF' ? (input.birthDate ?? null) : null,
      incomeValue: roundCents(input.incomeValue),
      email: input.email,
      loginEmail: input.loginEmail,
      phone: input.phone ?? null,
      mobilePhone: input.mobilePhone,
      site: input.site ?? null,
      address: {
        postalCode: input.address.postalCode,
        street: input.address.street,
        number: input.address.number,
        complement: input.address.complement ?? null,
        province: input.address.province,
        city: input.address.city ?? null,
        state: input.address.state ?? null,
      },
    }
    const now = new Date()
    const [inserted] = await db
      .insert(managedAccountRequests)
      .values({
        organizationId: orgId,
        status: 'pendente',
        data,
        termsVersion: MANAGED_ACCOUNT_TERMS_VERSION,
        termsText: MANAGED_ACCOUNT_TERMS_TEXT,
        acceptedByUserId: actor.userId,
        acceptedByName: actor.userName,
        acceptedAt: now,
        acceptedIp: actor.ip ? actor.ip.slice(0, 64) : null,
        acceptedUserAgent: actor.userAgent ? actor.userAgent.slice(0, 300) : null,
      })
      // Índice único parcial (pedido em aberto por clube): dois envios simultâneos → um só.
      .onConflictDoNothing()
      .returning()
    if (!inserted) throw AppError.conflict('Já existe um pedido em análise pela ANNETEC.')

    await notify({
      audience: 'platform',
      kind: 'managed_account_requested',
      organizationId: orgId,
      title: `${basics.name} pediu a conta gerenciada`,
      body: 'Aprovar ou recusar em Financeiro → Contas gerenciadas',
      link: `/admin/financeiro/contas-gerenciadas?clube=${encodeURIComponent(orgId)}`,
      dedupeKey: `managed_account_requested:${inserted.id}`,
    })
    return this.clubStatus(orgId)
  },

  /**
   * Situação e documentos da subconta (chave DELA). Grava o retrato e devolve
   * a conta. Clube (admin) e superadmin; a automação chama para as não aprovadas.
   */
  async refreshStatus(orgId: string): Promise<ClubReceivingAccount> {
    const row = await loadAccountRow(orgId)
    if (!row || row.source !== 'subaccount') throw AppError.businessRule('O recebimento deste clube não é gerenciado pela ANNETEC.')
    const client = subaccountClient(decryptSecret(row.apiKeyEncrypted), row.env)
    const [status, documents] = await Promise.allSettled([client.account.status(), client.account.documents()])
    for (const result of [status, documents]) {
      if (result.status === 'rejected' && result.reason instanceof AsaasApiError && (result.reason.httpStatus === 401 || result.reason.httpStatus === 403)) {
        throw AppError.businessRule(SUBACCOUNT_KEY_REJECTED)
      }
    }
    if (status.status === 'rejected' && documents.status === 'rejected') throw status.reason
    const now = new Date()
    await db
      .update(tenantAsaasAccounts)
      .set({
        ...(status.status === 'fulfilled'
          ? {
              accountStatusJson: {
                id: status.value.id ?? null,
                commercialInfo: status.value.commercialInfo ?? null,
                bankAccountInfo: status.value.bankAccountInfo ?? null,
                documentation: status.value.documentation ?? null,
                general: status.value.general ?? null,
              },
            }
          : {}),
        ...(documents.status === 'fulfilled' ? { documentsJson: documentsSnapshotOf(documents.value), documentsCheckedAt: now } : {}),
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(and(eq(tenantAsaasAccounts.organizationId, orgId), eq(tenantAsaasAccounts.source, 'subaccount')))
    if (status.status === 'rejected') logger.warn({ tenantId: orgId, err: errorText(status.reason) }, 'Conta gerenciada: /myAccount/status indisponível')
    if (documents.status === 'rejected') logger.warn({ tenantId: orgId, err: errorText(documents.reason) }, 'Conta gerenciada: /myAccount/documents indisponível')
    return receivingAccountDto(await loadAccountRow(orgId), orgId)
  },

  // ---- Plataforma ----------------------------------------------------------

  async list(query: ListManagedAccountsQuery = {}): Promise<ManagedAccountListItem[]> {
    const [requests, accounts, debits] = await Promise.all([
      db.select().from(managedAccountRequests).orderBy(desc(managedAccountRequests.createdAt)).limit(1_000),
      db.select().from(tenantAsaasAccounts).where(eq(tenantAsaasAccounts.source, 'subaccount')),
      db.select().from(managedAccountDebits).orderBy(desc(managedAccountDebits.createdAt)).limit(1_000),
    ])
    const latestByOrg = new Map<string, RequestRow>()
    for (const request of requests) if (!latestByOrg.has(request.organizationId)) latestByOrg.set(request.organizationId, request)
    const accountByOrg = new Map(accounts.map(account => [account.organizationId, account]))
    const debitByOrg = new Map<string, DebitRow>()
    for (const debit of debits) if (!debitByOrg.has(debit.organizationId)) debitByOrg.set(debit.organizationId, debit)

    const orgIds = [...new Set([...latestByOrg.keys(), ...accountByOrg.keys()])]
    if (orgIds.length === 0) return []
    const orgs = await db.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(inArray(organization.id, orgIds))
    const orgById = new Map(orgs.map(org => [org.id, org]))
    const needle = query.q?.toLowerCase()

    const items: ManagedAccountListItem[] = []
    for (const orgId of orgIds) {
      const org = orgById.get(orgId)
      if (!org) continue
      const request = latestByOrg.get(orgId) ?? null
      if (query.status && request?.status !== query.status) continue
      if (needle && !org.name.toLowerCase().includes(needle) && !org.slug.toLowerCase().includes(needle)) continue
      const account = accountByOrg.get(orgId) ?? null
      const general = account ? generalStatusOf(account.accountStatusJson) : null
      const debit = debitByOrg.get(orgId) ?? null
      items.push({
        organizationId: orgId,
        tenantName: org.name,
        tenantSlug: org.slug,
        request: request
          ? {
              id: request.id,
              status: request.status,
              statusLabel: MANAGED_ACCOUNT_REQUEST_STATUS_LABELS[request.status],
              createdAt: request.createdAt.toISOString(),
              decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
            }
          : null,
        source: account ? 'subaccount' : null,
        env: account?.env ?? null,
        generalStatus: general,
        generalStatusLabel: general ? MANAGED_ACCOUNT_GENERAL_STATUS_LABELS[general] : null,
        pendingDocuments: account ? documentsOf(account.documentsJson).filter(doc => doc.actionRequired).length : 0,
        autoDebitEnabled: Boolean(account?.autoDebitEnabled),
        lastDebit: debit ? debitDto(debit, null) : null,
      })
    }
    // Pedidos aguardando decisão primeiro; depois por nome.
    const weight = (item: ManagedAccountListItem) => (item.request && OPEN_REQUEST_STATUSES.includes(item.request.status) ? 0 : 1)
    return items.sort((a, b) => weight(a) - weight(b) || a.tenantName.localeCompare(b.tenantName, 'pt-BR'))
  },

  async detail(orgId: string, options: { withBalance?: boolean } = {}): Promise<ManagedAccountDetail> {
    const [basics, request, row] = await Promise.all([tenantBasics(orgId), latestRequest(orgId), loadAccountRow(orgId)])
    const managed = row?.source === 'subaccount'
    let balance: number | null = null
    let balanceError: string | null = null
    if (managed && options.withBalance !== false) {
      try {
        balance = Number((await subaccountClient(decryptSecret(row!.apiKeyEncrypted), row!.env).finance.balance()).balance)
      } catch (error) {
        balanceError = describeAsaasError(error)
      }
    }
    const stuckApproving = request?.status === 'aprovando' && Date.now() - request.updatedAt.getTime() > 10 * 60_000
    return {
      organizationId: orgId,
      tenantName: basics.name,
      tenantSlug: basics.slug,
      request: request ? requestDto(request) : null,
      account: await receivingAccountDto(row, orgId),
      asaasAccountId: (managed ? row!.asaasAccountId : null) ?? request?.asaasAccountId ?? null,
      walletId: (managed ? row!.walletId : null) ?? request?.walletId ?? null,
      balance,
      balanceError,
      linkedSubscriptions: row ? await countLinkedSubscriptions(orgId) : 0,
      keyRecoveryNeeded: !managed && ((request?.status === 'falhou' && Boolean(request.asaasAccountId)) || stuckApproving),
      debits: await listDebitsOf(orgId, 50),
    }
  },

  /**
   * Aprova: cria a subconta no Asaas (chave da plataforma) e grava chave +
   * carteira na mesma operação. Antes de criar, confere se já existe subconta
   * com este CPF/CNPJ (retentativa após timeout nunca cria duas).
   */
  async approve(orgId: string, actor: ManagedActor): Promise<ManagedAccountDetail> {
    const client = requirePlatformAsaasClient()
    const environment = managedAccountEnvironment()
    const policy = environmentPolicyIssue(environment, allowedClubAsaasEnvironments({ NODE_ENV: env.NODE_ENV, DEPLOY_STAGE: env.DEPLOY_STAGE }))
    if (policy) throw AppError.businessRule(`O Asaas da ANNETEC está no ambiente ${environment}, que este servidor não aceita para recebimento de clubes.`)

    const [claimed] = await db
      .update(managedAccountRequests)
      .set({ status: 'aprovando', decidedByUserId: actor.userId, lastError: null, updatedAt: new Date() })
      .where(
        and(
          eq(managedAccountRequests.organizationId, orgId),
          inArray(managedAccountRequests.status, APPROVABLE_REQUEST_STATUSES),
          isNull(managedAccountRequests.asaasAccountId),
        ),
      )
      .returning()
    if (!claimed) {
      const latest = await latestRequest(orgId)
      if (latest?.status === 'falhou' && latest.asaasAccountId) {
        throw AppError.conflict(`A subconta deste clube já existe no Asaas (id ${latest.asaasAccountId}). Use "Recuperar chave" em vez de aprovar de novo.`)
      }
      if (latest?.status === 'aprovando') throw AppError.conflict('A conta deste clube já está sendo criada. Aguarde alguns segundos.')
      throw AppError.conflict('Não há pedido aguardando aprovação para este clube.')
    }

    const previous = await loadAccountRow(orgId)
    const backToPending = async (message: string) => {
      await markRequest(claimed.id, { status: 'pendente', lastError: message })
      return AppError.conflict(message)
    }
    if (previous?.source === 'subaccount') throw await backToPending('O recebimento do clube já é gerenciado pela ANNETEC.')
    if (previous) {
      const linked = await countLinkedSubscriptions(orgId)
      if (linked > 0) throw await backToPending(linkedToManagedMessage(linked))
    }

    const payload = subaccountPayload(claimed.data)
    // Já existe subconta com este documento na conta da ANNETEC? Nunca cria a segunda.
    let existing: AsaasSubaccount | undefined
    try {
      existing = await findSubaccountByDocument(client, payload.cpfCnpj)
    } catch (error) {
      await markRequest(claimed.id, { status: 'pendente', lastError: `Não foi possível consultar as subcontas no Asaas: ${describeAsaasError(error)}` })
      throw error
    }
    if (existing) {
      const message = `Já existe uma subconta com este CPF/CNPJ na conta da ANNETEC (id ${existing.id}). Use "Recuperar chave" para conectá-la.`
      await markRequest(claimed.id, { status: 'falhou', asaasAccountId: existing.id, walletId: existing.walletId ?? null, lastError: message })
      throw AppError.conflict(message)
    }

    let created: AsaasSubaccount
    try {
      created = await client.accounts.create(payload)
    } catch (error) {
      // Erro que não é uma recusa do Asaas (timeout, 5xx, resposta 2xx ilegível…): a subconta PODE existir.
      // Nunca repassar o texto do erro: a resposta da criação traz a chave da subconta.
      if (!(error instanceof AsaasApiError) || error.inconclusive) {
        const message =
          'O Asaas não respondeu a tempo à criação da subconta (ela pode ter sido criada). Aprove de novo: antes de criar, a API confere se ela já existe pelo CPF/CNPJ.'
        logger.error(
          {
            alert: 'managed_account_create_inconclusive',
            organizationId: orgId,
            requestId: claimed.id,
            err: error instanceof AsaasApiError ? errorText(error) : error instanceof Error ? error.name : 'erro desconhecido',
          },
          message,
        )
        await markRequest(claimed.id, { status: 'falhou', lastError: message })
        throw new AppError(ERROR_CODES.UPSTREAM_ERROR, message)
      }
      const message = `O Asaas recusou a criação da subconta: ${describeAsaasError(error)}`
      await markRequest(claimed.id, { status: 'falhou', lastError: message })
      throw AppError.businessRule(message)
    }

    const credentials: SubaccountCredentials = {
      apiKey: keyOf(created) ?? '',
      walletId: created.walletId ?? null,
      asaasAccountId: created.id,
      name: created.name || claimed.data.name,
      cpfCnpj: claimed.data.cpfCnpj,
      email: created.email ?? claimed.data.email,
    }
    if (!credentials.apiKey) {
      await markRequest(claimed.id, { status: 'falhou', asaasAccountId: created.id, walletId: credentials.walletId, lastError: 'O Asaas não devolveu a chave da subconta.' })
      throw criticalKeyNotSaved(orgId, claimed.id, credentials)
    }

    const saved = await persistSubaccount(orgId, claimed.id, credentials, 'create', actor)
    if (!saved) {
      await markRequest(claimed.id, {
        status: 'falhou',
        asaasAccountId: created.id,
        walletId: credentials.walletId,
        lastError: 'Subconta criada no Asaas, mas a chave não foi gravada. Use "Recuperar chave".',
      })
      throw criticalKeyNotSaved(orgId, claimed.id, credentials)
    }

    await afterConnected(orgId, previous)
    await notifyDecision(orgId, true, null)
    return this.detail(orgId, { withBalance: false })
  },

  /** Recusa (pendente ou falhou) com motivo. */
  async refuse(orgId: string, reason: string, actor: ManagedActor): Promise<ManagedAccountDetail> {
    const now = new Date()
    const [refused] = await db
      .update(managedAccountRequests)
      .set({ status: 'recusado', refuseReason: reason, decidedAt: now, decidedByUserId: actor.userId, updatedAt: now })
      .where(and(eq(managedAccountRequests.organizationId, orgId), inArray(managedAccountRequests.status, APPROVABLE_REQUEST_STATUSES)))
      .returning()
    if (!refused) throw AppError.conflict('Não há pedido em aberto para recusar (ou a conta está sendo criada agora).')
    if (refused.asaasAccountId) {
      logger.warn(
        { organizationId: orgId, requestId: refused.id, asaasAccountId: refused.asaasAccountId },
        'Conta gerenciada recusada com subconta já criada no Asaas — ela fica sem uso (encerrar pelo painel/gerente Asaas, se for o caso)',
      )
    }
    await notifyDecision(orgId, false, reason)
    return this.detail(orgId, { withBalance: false })
  },

  /**
   * Recupera a chave da subconta pela API (`POST /v3/accounts/{id}/accessTokens`):
   * subconta criada sem chave gravada (pedido `falhou`/`aprovando` travado) ou
   * chave da conta gerenciada revogada. Exige a habilitação no painel do Asaas
   * (2 h) e o IP do servidor na whitelist.
   */
  async recoverKey(orgId: string, actor: ManagedActor): Promise<ManagedAccountDetail> {
    const client = requirePlatformAsaasClient()
    const [row, request, basics] = await Promise.all([loadAccountRow(orgId), latestRequest(orgId), tenantBasics(orgId)])
    if (row && row.source !== 'subaccount') {
      throw AppError.conflict('O clube recebe numa conta Asaas própria. Desconecte-a antes de recuperar a conta gerenciada.')
    }
    const mode: 'create' | 'rotate' = row ? 'rotate' : 'create'
    if (mode === 'create' && (!request || !['falhou', 'aprovando'].includes(request.status))) {
      throw AppError.conflict('Não há subconta a recuperar para este clube.')
    }
    if (mode === 'create' && request!.status === 'aprovando' && Date.now() - request!.updatedAt.getTime() < 10 * 60_000) {
      throw AppError.conflict('A conta deste clube está sendo criada agora. Aguarde alguns minutos antes de recuperar.')
    }

    let asaasAccountId = (row?.asaasAccountId ?? request?.asaasAccountId) || null
    let walletId = (row?.walletId ?? request?.walletId) || null
    let found: AsaasSubaccount | undefined
    if (!asaasAccountId) {
      const document = request?.data.cpfCnpj ?? onlyDigits(basics.document)
      found = await findSubaccountByDocument(client, document)
      if (!found) {
        if (request && mode === 'create') {
          await markRequest(request.id, { status: 'falhou', lastError: 'Nenhuma subconta com este CPF/CNPJ no Asaas: pode aprovar de novo.' })
        }
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Nenhuma subconta com este CPF/CNPJ na conta da ANNETEC. Se o pedido falhou, aprove de novo.')
      }
      asaasAccountId = found.id
      walletId = found.walletId ?? walletId
    }
    // Nunca gerar/gravar a chave de uma subconta que já é de OUTRO clube (saldo e débitos de terceiros).
    if (await subaccountOwnedByOtherClub(orgId, asaasAccountId)) {
      logger.error(
        { alert: 'managed_account_owned_by_other_club', organizationId: orgId, asaasAccountId },
        'Conta gerenciada: recuperação recusada — a subconta já pertence a outro clube',
      )
      throw AppError.conflict(`A subconta ${asaasAccountId} já pertence a outro clube. Confira o CPF/CNPJ do cadastro deste clube.`)
    }

    let apiKey: string | undefined
    try {
      apiKey = (await client.accounts.createAccessToken(asaasAccountId, { name: `ANNETEC ${todaySP()}` })).apiKey
    } catch (error) {
      if (error instanceof AsaasApiError && error.httpStatus === 403) throw AppError.businessRule(KEY_RECOVERY_FORBIDDEN_MESSAGE)
      throw error
    }
    if (!apiKey) throw new AppError(ERROR_CODES.UPSTREAM_ERROR, 'O Asaas não devolveu a nova chave da subconta.')
    if (!walletId) {
      try {
        walletId = (await subaccountClient(apiKey, managedAccountEnvironment()).wallets.list()).data?.[0]?.id ?? null
      } catch (error) {
        logger.warn({ organizationId: orgId, err: errorText(error) }, 'Conta gerenciada: carteira da subconta não consultada (seguindo)')
      }
    }

    const credentials: SubaccountCredentials = {
      apiKey,
      walletId,
      asaasAccountId,
      name: found?.name || request?.data.name || basics.legalName || basics.name,
      cpfCnpj: request?.data.cpfCnpj ?? onlyDigits(basics.document),
      email: found?.email ?? request?.data.email ?? basics.email,
    }
    const saved = await persistSubaccount(orgId, mode === 'create' ? request!.id : null, credentials, mode, actor)
    if (!saved) throw criticalKeyNotSaved(orgId, request?.id ?? null, credentials)

    if (mode === 'create') {
      await afterConnected(orgId, null)
      await notifyDecision(orgId, true, null)
    } else {
      await syncWebhookSafely(orgId)
    }
    return this.detail(orgId, { withBalance: false })
  },

  /** Liga/desliga o débito automático (só conta gerenciada). */
  async setAutoDebit(orgId: string, enabled: boolean): Promise<ManagedAccountDetail> {
    const [updated] = await db
      .update(tenantAsaasAccounts)
      .set({ autoDebitEnabled: enabled, updatedAt: new Date() })
      .where(and(eq(tenantAsaasAccounts.organizationId, orgId), eq(tenantAsaasAccounts.source, 'subaccount')))
      .returning({ organizationId: tenantAsaasAccounts.organizationId })
    if (!updated) throw AppError.businessRule('O recebimento deste clube não é gerenciado pela ANNETEC.')
    return this.detail(orgId, { withBalance: false })
  },

  /** Desconecta a conta gerenciada (superadmin). A subconta continua existindo no Asaas. */
  async disconnect(orgId: string): Promise<ManagedAccountDetail> {
    const row = await loadAccountRow(orgId)
    if (!row || row.source !== 'subaccount') throw AppError.businessRule('O recebimento deste clube não é gerenciado pela ANNETEC.')
    await receivingAccountService.disconnect(orgId, { allowManaged: true })
    logger.warn(
      { organizationId: orgId, asaasAccountId: row.asaasAccountId, walletId: row.walletId },
      'Conta gerenciada desconectada — a subconta (e o saldo dela) continua no Asaas; encerrar/transferir pelo painel se for o caso',
    )
    return this.detail(orgId, { withBalance: false })
  },
}

async function syncWebhookSafely(orgId: string): Promise<void> {
  try {
    await receivingAccountService.syncWebhook(orgId)
  } catch (error) {
    logger.warn({ tenantId: orgId, err: errorText(error) }, 'Conta gerenciada: webhook do clube não cadastrado (use "Testar" depois)')
  }
}

/** Depois de gravar a conta nova: limpa o que era da conta própria anterior e cadastra o webhook. */
async function afterConnected(orgId: string, previous: AccountRow | null): Promise<void> {
  if (previous && previous.source !== 'subaccount') {
    await deleteWebhookBestEffort(orgId, previous)
    await forgetClosedGatewayLinks(orgId)
  }
  await syncWebhookSafely(orgId)
}

/** Revisão automática da situação: subcontas ainda não aprovadas, no máximo 1× a cada 6 h por clube. */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Passo da automação da plataforma: atualiza situação e documentos das
 * subcontas ainda NÃO aprovadas (as aprovadas só sob demanda). Devolve os erros.
 */
export async function refreshPendingManagedAccounts(now = new Date(), limit = 20): Promise<string[]> {
  const cutoff = new Date(now.getTime() - REFRESH_INTERVAL_MS)
  const rows = await db
    .select({
      organizationId: tenantAsaasAccounts.organizationId,
      accountStatusJson: tenantAsaasAccounts.accountStatusJson,
      documentsCheckedAt: tenantAsaasAccounts.documentsCheckedAt,
    })
    .from(tenantAsaasAccounts)
    .where(
      and(
        eq(tenantAsaasAccounts.source, 'subaccount'),
        or(isNull(tenantAsaasAccounts.documentsCheckedAt), lt(tenantAsaasAccounts.documentsCheckedAt, cutoff)),
      ),
    )
    .limit(100)
  const errors: string[] = []
  let processed = 0
  for (const row of rows) {
    if (processed >= limit) break
    if (row.accountStatusJson?.general === 'APPROVED' && row.documentsCheckedAt) continue
    processed += 1
    try {
      await managedAccountService.refreshStatus(row.organizationId)
    } catch (error) {
      errors.push(`${row.organizationId}: ${errorText(error)}`)
    }
  }
  return errors
}
