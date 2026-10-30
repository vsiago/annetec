import {
  MANAGED_ACCOUNT_DOCUMENT_STATUS_LABELS,
  MANAGED_ACCOUNT_GENERAL_STATUS_LABELS,
  MANAGED_ACCOUNT_REQUEST_FIELD_LABELS,
  MANAGED_AUTO_DEBIT_STATUS_LABELS,
  onlyDigits,
  roundCents,
  type ClubManagedAccountInfo,
  type ManagedAccountDocument,
  type ManagedAccountGeneralStatus,
  type ManagedAccountRequestStatus,
  type ManagedAutoDebit,
  type ManagedAutoDebitFailureCode,
  type UpdateManagedAccountRequestInput,
} from '@annetec/contracts'
import type { AsaasAccountStatusSnapshot, ManagedAccountDocumentsSnapshot, ManagedAccountRequestData } from '@/db/schema'
import type { AsaasAccountDocuments, AsaasCreateSubaccountInput, AsaasTransferStatus } from '@/integrations/asaas/types'

/**
 * Regras PURAS da conta gerenciada (sem banco e sem rede) —
 * `tests/managed-account.test.ts`: situação/documentos da subconta, quando
 * debitar uma fatura, o que o webhook de validação aprova e o corpo da
 * criação da subconta.
 */

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

/** Pedido "em aberto": bloqueia um novo (índice único parcial no banco). */
export const OPEN_REQUEST_STATUSES: ManagedAccountRequestStatus[] = ['pendente', 'aprovando', 'falhou']

/** Pedido que o superadmin pode aprovar (de novo, no caso de falha sem subconta criada). */
export const APPROVABLE_REQUEST_STATUSES: ManagedAccountRequestStatus[] = ['pendente', 'falhou']

export type PersonType = 'PJ' | 'PF'

export function personTypeOf(cpfCnpj: string | null | undefined): PersonType | null {
  const digits = onlyDigits(cpfCnpj)
  if (digits.length === 14) return 'PJ'
  if (digits.length === 11) return 'PF'
  return null
}

/** `12.345.678/0001-90` ou `123.456.789-09`; outro tamanho volta só com os dígitos. */
export function formatCpfCnpj(value: string | null | undefined): string | null {
  const d = onlyDigits(value)
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return d || null
}

/** Corpo do `POST /v3/accounts` a partir do pedido (campos vazios não vão). */
export function subaccountPayload(data: ManagedAccountRequestData): AsaasCreateSubaccountInput {
  const person = personTypeOf(data.cpfCnpj)
  const payload: AsaasCreateSubaccountInput = {
    name: data.name,
    email: data.email,
    loginEmail: data.loginEmail,
    cpfCnpj: onlyDigits(data.cpfCnpj),
    mobilePhone: onlyDigits(data.mobilePhone),
    incomeValue: roundCents(data.incomeValue),
    address: data.address.street,
    addressNumber: data.address.number,
    province: data.address.province,
    postalCode: onlyDigits(data.address.postalCode),
  }
  if (person === 'PJ' && data.companyType) payload.companyType = data.companyType
  if (person === 'PF' && data.birthDate) payload.birthDate = data.birthDate
  if (data.phone) payload.phone = onlyDigits(data.phone)
  if (data.site) payload.site = data.site
  if (data.address.complement) payload.complement = data.address.complement
  return payload
}

export interface RequestCorrection {
  /** Dados do pedido depois da correção (sem o histórico `corrections`, que o serviço acrescenta). */
  next: ManagedAccountRequestData
  /** Só o que mudou: campo → antes/depois (vai para a auditoria). */
  changes: Partial<Record<keyof UpdateManagedAccountRequestInput, { de: unknown; para: unknown }>>
  /** Rótulos dos campos alterados, na ordem do formulário. */
  fields: string[]
}

/**
 * Correção do superadmin nos dados do pedido (antes da aprovação). Pura: devolve
 * os dados novos e o antes/depois do que mudou. Nome e CPF/CNPJ nunca mudam
 * aqui (vêm do cadastro do clube). `companyType` só vale para CNPJ e
 * `birthDate` só para CPF — o contrário é erro de validação.
 */
export function correctRequestData(
  data: ManagedAccountRequestData,
  input: UpdateManagedAccountRequestInput,
): { ok: true; correction: RequestCorrection } | { ok: false; path: string; message: string } {
  const person = personTypeOf(data.cpfCnpj) ?? 'PJ'
  if (input.companyType !== undefined && person !== 'PJ') {
    return { ok: false, path: 'companyType', message: 'O tipo de empresa só vale para clube com CNPJ' }
  }
  if (input.birthDate !== undefined && person !== 'PF') {
    return { ok: false, path: 'birthDate', message: 'A data de nascimento só vale para clube com CPF' }
  }
  const candidate: ManagedAccountRequestData = {
    ...data,
    ...(input.companyType !== undefined ? { companyType: input.companyType } : {}),
    ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
    ...(input.incomeValue !== undefined ? { incomeValue: roundCents(input.incomeValue) } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.loginEmail !== undefined ? { loginEmail: input.loginEmail } : {}),
    ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
    ...(input.mobilePhone !== undefined ? { mobilePhone: input.mobilePhone } : {}),
    ...(input.site !== undefined ? { site: input.site ?? null } : {}),
    ...(input.address !== undefined
      ? {
          address: {
            postalCode: input.address.postalCode,
            street: input.address.street,
            number: input.address.number,
            complement: input.address.complement ?? null,
            province: input.address.province,
            city: input.address.city ?? null,
            state: input.address.state ? input.address.state.toUpperCase() : null,
          },
        }
      : {}),
  }
  const changes: RequestCorrection['changes'] = {}
  const fields: string[] = []
  for (const key of Object.keys(MANAGED_ACCOUNT_REQUEST_FIELD_LABELS) as (keyof UpdateManagedAccountRequestInput)[]) {
    if (input[key] === undefined) continue
    const before = data[key] ?? null
    const after = candidate[key] ?? null
    if (JSON.stringify(before) === JSON.stringify(after)) continue
    changes[key] = { de: before, para: after }
    fields.push(MANAGED_ACCOUNT_REQUEST_FIELD_LABELS[key])
  }
  return { ok: true, correction: { next: candidate, changes, fields } }
}

// ---------------------------------------------------------------------------
// Situação e documentos da subconta
// ---------------------------------------------------------------------------

/** `general` do `GET /myAccount/status` → situação resumida. */
export function generalStatusOf(snapshot: AsaasAccountStatusSnapshot | null | undefined): ManagedAccountGeneralStatus {
  switch (snapshot?.general) {
    case 'APPROVED':
      return 'aprovada'
    case 'AWAITING_APPROVAL':
      return 'em_analise'
    case 'REJECTED':
      return 'recusada'
    case 'PENDING':
      return 'pendente'
    default:
      return 'desconhecida'
  }
}

/** Grupos que pedem ação do clube: não enviado ou recusado. */
const ACTION_REQUIRED = new Set(['NOT_SENT', 'REJECTED'])

export function documentsSnapshotOf(response: AsaasAccountDocuments): ManagedAccountDocumentsSnapshot {
  return {
    rejectReasons: response.rejectReasons?.trim() || null,
    groups: (response.data ?? []).map(group => ({
      id: group.id,
      status: group.status ?? 'NOT_SENT',
      type: group.type ?? null,
      title: group.title ?? null,
      description: group.description ?? null,
      responsibleName: group.responsible?.name ?? null,
      onboardingUrl: group.onboardingUrl ?? null,
      onboardingUrlExpirationDate: group.onboardingUrlExpirationDate ?? null,
    })),
  }
}

export function documentsOf(snapshot: ManagedAccountDocumentsSnapshot | null | undefined): ManagedAccountDocument[] {
  return (snapshot?.groups ?? []).map(group => ({
    id: group.id,
    type: group.type,
    title: group.title || group.type || 'Documento',
    description: group.description,
    status: group.status,
    statusLabel: MANAGED_ACCOUNT_DOCUMENT_STATUS_LABELS[group.status] ?? group.status,
    actionRequired: ACTION_REQUIRED.has(group.status),
    responsibleName: group.responsibleName,
    onboardingUrl: group.onboardingUrl,
    onboardingUrlExpiresAt: group.onboardingUrlExpirationDate,
  }))
}

export interface ManagedRowView {
  accountStatusJson: AsaasAccountStatusSnapshot | null
  documentsJson: ManagedAccountDocumentsSnapshot | null
  documentsCheckedAt: Date | null
  autoDebitEnabled: boolean
}

export function managedInfoOf(row: ManagedRowView, lastDebit: ManagedAutoDebit | null): ClubManagedAccountInfo {
  const generalStatus = generalStatusOf(row.accountStatusJson)
  const documents = documentsOf(row.documentsJson)
  return {
    generalStatus,
    generalStatusLabel: MANAGED_ACCOUNT_GENERAL_STATUS_LABELS[generalStatus],
    documents,
    pendingDocuments: documents.filter(doc => doc.actionRequired).length,
    rejectReasons: row.documentsJson?.rejectReasons ?? null,
    documentsCheckedAt: row.documentsCheckedAt ? row.documentsCheckedAt.toISOString() : null,
    autoDebitEnabled: row.autoDebitEnabled,
    lastDebit,
  }
}

// ---------------------------------------------------------------------------
// Débito automático
// ---------------------------------------------------------------------------

/** `externalReference` da transferência — único, reencontra a transferência se a resposta do Asaas se perder. */
export function debitExternalReference(debitId: string): string {
  return `adb_${debitId.replace(/-/g, '')}`
}

/** Id sintético do `PAYMENT_RECEIVED` que quita a fatura (dedupe no `platform_billing_events`). */
export function autoDebitEventId(debitId: string): string {
  return `evt_plt_autodebit_${debitId}`
}

export function sameMoney(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
}

export interface DebitConfig {
  /** Tentativas que falharam (contam para o limite) antes de desistir da fatura. */
  maxAttempts: number
  /** Intervalo mínimo entre tentativas automáticas na mesma fatura. */
  retryIntervalHours: number
}

/** Falhas que contam para o limite de tentativas (as outras não foram "tentativas de cobrar"). */
export const COUNTED_FAILURES: ManagedAutoDebitFailureCode[] = [
  'saldo_insuficiente',
  'transferencia_recusada',
  'transferencia_cancelada',
  'erro_asaas',
]

export interface ChargeForDebit {
  status: string
  kind: string
  method: string
  dueDate: string
  amount: string | number
  organizationId: string | null
}

export interface AttemptForDebit {
  status: 'em_andamento' | 'concluida' | 'falhou'
  failureCode: ManagedAutoDebitFailureCode | null
  startedAt: Date
}

export type DebitDecision =
  | { action: 'debit' }
  | { action: 'reconcile' }
  | { action: 'skip'; reason: string; done?: boolean }

/**
 * Quando debitar uma fatura da ANNETEC no saldo da conta gerenciada (puro):
 *  - fatura de clube, em aberto, mensal/ajuste, com valor, vencida (vence hoje conta);
 *  - cartão só depois de esgotadas as tentativas no cartão (`overdue`) — senão
 *    o cartão e o débito cobrariam no mesmo dia;
 *  - nunca se já houve débito concluído; tentativa em andamento = conferir (não transferir);
 *  - automação: no máximo `maxAttempts` falhas e uma tentativa a cada
 *    `retryIntervalHours`; manual (superadmin, "debitar agora") ignora os dois limites.
 */
export function debitDecision(
  charge: ChargeForDebit,
  attempts: AttemptForDebit[],
  today: string,
  now: Date,
  config: DebitConfig,
  source: 'automation' | 'manual',
): DebitDecision {
  if (attempts.some(attempt => attempt.status === 'concluida')) return { action: 'skip', reason: 'Esta fatura já foi debitada do saldo', done: true }
  if (attempts.some(attempt => attempt.status === 'em_andamento')) return { action: 'reconcile' }
  if (!charge.organizationId) return { action: 'skip', reason: 'Fatura sem clube' }
  if (!['pending', 'overdue', 'failed'].includes(charge.status)) return { action: 'skip', reason: 'A fatura não está em aberto' }
  if (charge.kind === 'activation') return { action: 'skip', reason: 'Fatura de ativação não entra no débito automático' }
  if (!(Number(charge.amount) > 0)) return { action: 'skip', reason: 'Fatura sem valor' }
  if (charge.dueDate > today) return { action: 'skip', reason: 'A fatura ainda não venceu' }
  if (source === 'manual') return { action: 'debit' }

  if (charge.method === 'credit_card' && charge.status !== 'overdue') {
    return { action: 'skip', reason: 'Fatura no cartão: aguardando as tentativas no cartão' }
  }
  const failures = attempts.filter(attempt => attempt.status === 'falhou' && attempt.failureCode && COUNTED_FAILURES.includes(attempt.failureCode))
  if (failures.length >= config.maxAttempts) return { action: 'skip', reason: `Tentativas esgotadas (${failures.length})` }
  const last = attempts.reduce<Date | null>((latest, attempt) => (!latest || attempt.startedAt > latest ? attempt.startedAt : latest), null)
  if (last && now.getTime() - last.getTime() < config.retryIntervalHours * 3_600_000) {
    return { action: 'skip', reason: 'Próxima tentativa ainda não chegou' }
  }
  return { action: 'debit' }
}

/** Status final da transferência no Asaas → o que fazer com a tentativa. */
export function transferOutcome(status: AsaasTransferStatus | null | undefined): 'done' | 'failed' | 'cancelled' | 'pending' {
  switch (status) {
    case 'DONE':
      return 'done'
    case 'FAILED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function debitStatusLabel(status: ManagedAutoDebit['status']): string {
  return MANAGED_AUTO_DEBIT_STATUS_LABELS[status]
}

// ---------------------------------------------------------------------------
// Webhook de validação de transferências
// ---------------------------------------------------------------------------

export interface ValidationTransfer {
  id: string
  value: number | null
  walletId: string | null
  type: string | null
}

export interface ValidationDebit {
  status: 'em_andamento' | 'concluida' | 'falhou'
  amount: string | number
  destinationWalletId: string | null
  /** A conta do clube ainda é gerenciada (`source = 'subaccount'`). */
  managedAccount: boolean
  /** A fatura do débito ainda está em aberto no nosso banco (Pix/boleto pago no meio = recusa). */
  chargeOpen: boolean
}

export type ValidationDecision = { status: 'APPROVED' } | { status: 'REFUSED'; refuseReason: string } | { status: 'RETRY' }

/**
 * O que responder ao Asaas (puro). Só aprova uma transferência que é a de uma
 * tentativa NOSSA em andamento: mesmo id (gravado da resposta do
 * `POST /transfers` que NÓS fizemos com a chave da subconta e o `walletId` da
 * ANNETEC), mesmo valor, mesma carteira de destino (quando o Asaas informa) e
 * fatura ainda em aberto. O `transfer.type` NÃO é conferido: no payload de
 * validação ele é o tipo de destino e o Asaas documenta valores diferentes
 * (`BANK_ACCOUNT`, `ASAAS_ACCOUNT`, `INTERNAL`) — conferi-lo recusaria a nossa
 * própria transferência; o vínculo pelo id já garante o destino.
 * Sem tentativa com esse id, mas com uma tentativa do mesmo valor cujo
 * `POST` ainda não teve a resposta gravada → `RETRY` (HTTP 503: o Asaas
 * repete; 3 falhas = cancelada, o lado seguro). Todo o resto é recusado.
 */
export function transferValidationDecision(
  type: string | null | undefined,
  transfer: ValidationTransfer | null,
  debit: ValidationDebit | null,
  awaitingResponseWithSameValue: boolean,
): ValidationDecision {
  if (type !== 'TRANSFER' || !transfer?.id) {
    return { status: 'REFUSED', refuseReason: 'Operação não autorizada pela ANNETEC' }
  }
  if (!debit) {
    if (awaitingResponseWithSameValue) return { status: 'RETRY' }
    return { status: 'REFUSED', refuseReason: 'Transferência não reconhecida pela ANNETEC' }
  }
  if (debit.status !== 'em_andamento') return { status: 'REFUSED', refuseReason: 'A tentativa de débito desta transferência foi encerrada' }
  if (!debit.managedAccount) return { status: 'REFUSED', refuseReason: 'A conta do clube não é mais gerenciada pela ANNETEC' }
  if (!debit.chargeOpen) return { status: 'REFUSED', refuseReason: 'A fatura deste débito não está mais em aberto' }
  if (!sameMoney(debit.amount, transfer.value)) return { status: 'REFUSED', refuseReason: 'Valor diferente do débito autorizado' }
  if (!debit.destinationWalletId) return { status: 'REFUSED', refuseReason: 'Débito sem carteira de destino registrada' }
  if (transfer.walletId && transfer.walletId !== debit.destinationWalletId) {
    return { status: 'REFUSED', refuseReason: 'Carteira de destino diferente da ANNETEC' }
  }
  return { status: 'APPROVED' }
}
