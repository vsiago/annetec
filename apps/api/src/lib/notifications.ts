import {
  CARD_BRAND_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  NOTIFICATION_SIGNUP_VIA_LABELS,
  formatBRL,
  type CardBrand,
  type ClubPaymentMethod,
  type NotificationAudience,
  type NotificationKind,
  type NotificationPayload,
  type NotificationSignupVia,
} from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubCharges, clubSubscriptions, notifications, organization, platformCharges, user } from '@/db/schema'
import { logger } from './logger'

/**
 * Emissão de notificações em tempo real (painel do clube e backoffice).
 *
 * Duas regras, as mesmas da auditoria (`lib/audit.ts`):
 *
 *  - **Nunca derruba a operação.** Toda função exportada engole o erro e só
 *    loga: um pagamento confirmado não pode virar 500 porque o sino falhou.
 *  - **É `await`, chamada DEPOIS do commit.** Quem emite é quem acabou de
 *    fazer a transição de status (`UPDATE … WHERE status IN (…) RETURNING`
 *    devolveu linha) — webhook reprocessado não chega aqui. A `dedupe_key`
 *    única por público é a segunda trava (dois caminhos concorrendo).
 *
 * Cada fato vira até duas linhas: `tenant` (admin do clube) e `platform`
 * (equipe Annetec). Quem lê e entrega é `modules/notifications`.
 */

export interface NotifyInput {
  audience: NotificationAudience
  kind: NotificationKind
  organizationId: string | null
  title: string
  body?: string | null
  amount?: number | null
  payload?: NotificationPayload
  link?: string | null
  dedupeKey?: string | null
  /** Público `seller`: o vendedor que recebe. Obrigatório nesse público. */
  recipientUserId?: string | null
}

export interface NotifyDeps {
  /** Grava as linhas (ignorando conflito de `dedupe_key`) e devolve quantas entraram. */
  insert: (rows: NotifyInput[]) => Promise<number>
}

const dbNotifyDeps: NotifyDeps = {
  insert: async rows => {
    const inserted = await db
      .insert(notifications)
      .values(
        rows.map(row => ({
          audience: row.audience,
          kind: row.kind,
          organizationId: row.organizationId,
          title: row.title.slice(0, 200),
          body: row.body ? row.body.slice(0, 500) : null,
          amount: row.amount === null || row.amount === undefined ? null : String(row.amount),
          payload: row.payload ?? {},
          link: row.link ?? null,
          dedupeKey: row.dedupeKey ?? null,
          recipientUserId: row.recipientUserId ?? null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: notifications.id })
    return inserted.length
  },
}

/** Grava notificações. Nunca lança: falha vira log e devolve 0. */
export async function notify(input: NotifyInput | NotifyInput[], deps: NotifyDeps = dbNotifyDeps): Promise<number> {
  const rows = Array.isArray(input) ? input : [input]
  if (rows.length === 0) return 0
  try {
    return await deps.insert(rows)
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), kinds: rows.map(row => row.kind) },
      'Falha ao gravar notificação (operação segue)',
    )
    return 0
  }
}

// ---------------------------------------------------------------------------
// Textos (puros — testados sem banco)
// ---------------------------------------------------------------------------

export interface TenantRef {
  id: string
  slug: string
  name: string
}

/** "Pix", "Boleto", "Cartão Visa •••• 4242". */
export function paymentMethodLabel(method: ClubPaymentMethod, cardBrand?: string | null, cardLast4?: string | null): string {
  if (method !== 'credit_card') return CLUB_PAYMENT_METHOD_LABELS[method]
  const brand = cardBrand ? (CARD_BRAND_LABELS[cardBrand as CardBrand] ?? 'Cartão') : null
  const label = brand && brand !== 'Cartão' ? `Cartão ${brand}` : 'Cartão'
  return cardLast4 ? `${label} •••• ${cardLast4}` : label
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ')
}

export interface ClubPaymentFacts {
  tenant: TenantRef
  chargeId: string
  subscriptionId: string
  userId: string | null
  personName: string
  planName: string
  amount: number
  methodLabel: string
  /** 1ª cobrança da assinatura (a compra) → "Nova assinatura paga". */
  firstPayment: boolean
  /** Cobrança avulsa: a descrição dela entra no lugar do plano. */
  chargeDescription?: string | null
  test?: boolean
}

export function clubPaymentNotifications(facts: ClubPaymentFacts): NotifyInput[] {
  const kind: NotificationKind = facts.firstPayment ? 'subscription_activated' : 'payment_received'
  const payload: NotificationPayload = {
    chargeId: facts.chargeId,
    subscriptionId: facts.subscriptionId,
    ...(facts.userId ? { userId: facts.userId } : {}),
    personName: facts.personName,
    planName: facts.planName,
    ...(facts.chargeDescription ? { chargeDescription: facts.chargeDescription } : {}),
    methodLabel: facts.methodLabel,
    ...(facts.test ? { test: true } : {}),
  }
  const body = joinParts([facts.personName, facts.chargeDescription || facts.planName, facts.methodLabel])
  const dedupeKey = facts.test ? null : `club_charge_paid:${facts.chargeId}`
  const amount = formatBRL(facts.amount)
  return [
    {
      audience: 'tenant',
      kind,
      organizationId: facts.tenant.id,
      title: facts.firstPayment ? 'Nova assinatura paga' : 'Pagamento recebido',
      body,
      amount: facts.amount,
      payload,
      link: `/${facts.tenant.slug}/admin/financeiro/recebimento?cobranca=${encodeURIComponent(facts.chargeId)}`,
      dedupeKey,
    },
    {
      audience: 'platform',
      kind,
      organizationId: facts.tenant.id,
      title: `${facts.tenant.name} · ${facts.firstPayment ? 'nova assinatura' : 'pagamento'} ${amount}`,
      body,
      amount: facts.amount,
      payload,
      link: `/admin/inquilinos/${encodeURIComponent(facts.tenant.id)}`,
      dedupeKey,
    },
  ]
}

export interface ClientSignupFacts {
  tenant: TenantRef
  userId: string
  personName: string
  via: NotificationSignupVia
  planName?: string | null
  test?: boolean
}

export function clientSignupNotifications(facts: ClientSignupFacts): NotifyInput[] {
  const payload: NotificationPayload = {
    userId: facts.userId,
    personName: facts.personName,
    via: facts.via,
    ...(facts.planName ? { planName: facts.planName } : {}),
    ...(facts.test ? { test: true } : {}),
  }
  const body = joinParts([facts.personName, facts.planName, NOTIFICATION_SIGNUP_VIA_LABELS[facts.via]])
  return [
    {
      audience: 'tenant',
      kind: 'client_signed_up',
      organizationId: facts.tenant.id,
      title: facts.via === 'returned' ? 'Associado de volta' : 'Novo cadastro',
      body,
      payload,
      link: `/${facts.tenant.slug}/admin/clientes/${encodeURIComponent(facts.userId)}`,
    },
    {
      audience: 'platform',
      kind: 'client_signed_up',
      organizationId: facts.tenant.id,
      title: `${facts.tenant.name} · ${facts.via === 'returned' ? 'associado de volta' : 'novo cadastro'}`,
      body,
      payload,
      link: `/admin/inquilinos/${encodeURIComponent(facts.tenant.id)}`,
    },
  ]
}

// ---------------------------------------------------------------------------
// Emissores com leitura do banco (nunca lançam)
// ---------------------------------------------------------------------------

async function loadTenantRef(organizationId: string): Promise<TenantRef | null> {
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return row ?? null
}

/** Cobrança do clube que ACABOU de virar `paid` (chamado após o commit). */
export async function notifyClubChargePaid(input: { chargeId: string; firstPayment: boolean }): Promise<void> {
  try {
    const [row] = await db
      .select({
        chargeId: clubCharges.id,
        kind: clubCharges.kind,
        description: clubCharges.description,
        amount: clubCharges.amount,
        paidAmount: clubCharges.paidAmount,
        method: clubCharges.method,
        cardBrand: clubCharges.cardBrand,
        cardLast4: clubCharges.cardLast4,
        subscriptionId: clubSubscriptions.id,
        userId: clubSubscriptions.userId,
        holderName: clubSubscriptions.holderName,
        planName: clubSubscriptions.planName,
        orgId: organization.id,
        orgSlug: organization.slug,
        orgName: organization.name,
      })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .innerJoin(organization, eq(organization.id, clubCharges.organizationId))
      .where(eq(clubCharges.id, input.chargeId))
      .limit(1)
    if (!row) return
    await notify(
      clubPaymentNotifications({
        tenant: { id: row.orgId, slug: row.orgSlug, name: row.orgName },
        chargeId: row.chargeId,
        subscriptionId: row.subscriptionId,
        userId: row.userId,
        personName: row.holderName,
        planName: row.planName,
        amount: Number(row.paidAmount ?? row.amount),
        methodLabel: paymentMethodLabel(row.method, row.cardBrand, row.cardLast4),
        firstPayment: input.firstPayment,
        chargeDescription: row.kind === 'one_off' ? row.description : null,
      }),
    )
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), chargeId: input.chargeId }, 'Falha ao notificar pagamento')
  }
}

/** Associado novo no clube. `personName` evita uma leitura quando quem chama já sabe. */
export async function notifyClientSignup(input: {
  organizationId: string
  userId: string
  via: NotificationSignupVia
  personName?: string | null
  planName?: string | null
}): Promise<void> {
  try {
    const tenant = await loadTenantRef(input.organizationId)
    if (!tenant) return
    let personName = input.personName?.trim() || null
    if (!personName) {
      const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, input.userId)).limit(1)
      personName = row?.name?.trim() || 'Associado'
    }
    await notify(
      clientSignupNotifications({ tenant, userId: input.userId, personName, via: input.via, planName: input.planName }),
    )
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error), tenantId: input.organizationId },
      'Falha ao notificar cadastro',
    )
  }
}

function competenceLabel(periodStart: string | null, dueDate: string): string {
  const source = periodStart ?? dueDate
  const [year, month] = source.split('-')
  return `${month}/${year}`
}

/** Fatura da Annetec que ACABOU de ser paga (só backoffice). */
export async function notifyPlatformInvoicePaid(input: { chargeId: string }): Promise<void> {
  try {
    const [row] = await db
      .select({
        id: platformCharges.id,
        kind: platformCharges.kind,
        amount: platformCharges.amount,
        paidAmount: platformCharges.paidAmount,
        periodStart: platformCharges.periodStart,
        dueDate: platformCharges.dueDate,
        method: platformCharges.method,
        cardBrand: platformCharges.cardBrand,
        cardLast4: platformCharges.cardLast4,
        organizationId: platformCharges.organizationId,
        orgName: organization.name,
      })
      .from(platformCharges)
      .leftJoin(organization, eq(organization.id, platformCharges.organizationId))
      .where(eq(platformCharges.id, input.chargeId))
      .limit(1)
    if (!row) return
    const who = row.orgName ?? 'Novo clube'
    const amount = Number(row.paidAmount ?? row.amount)
    const what = row.kind === 'activation' ? 'a ativação' : `a fatura de ${competenceLabel(row.periodStart, row.dueDate)}`
    await notify({
      audience: 'platform',
      kind: 'platform_invoice_paid',
      organizationId: row.organizationId,
      title: `${who} pagou ${what}`,
      body: joinParts([formatBRL(amount), paymentMethodLabel(row.method, row.cardBrand, row.cardLast4)]),
      amount,
      payload: { platformChargeId: row.id, methodLabel: paymentMethodLabel(row.method, row.cardBrand, row.cardLast4) },
      link: '/admin/financeiro?aba=faturas',
      dedupeKey: `platform_charge_paid:${row.id}`,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), chargeId: input.chargeId }, 'Falha ao notificar fatura paga')
  }
}

// ---------------------------------------------------------------------------
// Vendas da plataforma (pedido de desconto)
// ---------------------------------------------------------------------------

export interface DiscountNoticeFacts {
  requestId: string
  proposalId: string
  proposalCode: string
  customerName: string
  sellerUserId: string
  sellerName: string
  /** Frase pronta do desconto ("adesão 50% · mensalidade 20% por 3 meses"). */
  summary: string
}

/** Vendedor pediu desconto: sino da equipe (decide o superadmin). Puro. */
export function discountRequestedNotification(facts: DiscountNoticeFacts): NotifyInput {
  return {
    audience: 'platform',
    kind: 'sales_discount_requested',
    organizationId: null,
    title: `${facts.sellerName} pediu desconto para ${facts.customerName}`,
    body: joinParts([facts.summary, `proposta ${facts.proposalCode}`]),
    payload: { proposalId: facts.proposalId, discountRequestId: facts.requestId, personName: facts.sellerName },
    link: `/admin/comercial/descontos?pedido=${facts.requestId}`,
    dedupeKey: `sales_discount_requested:${facts.requestId}`,
  }
}

/** Decisão do superadmin: sino SÓ do vendedor do pedido. Puro. */
export function discountDecidedNotification(
  facts: DiscountNoticeFacts,
  decision: { approved: boolean; reason?: string | null },
): NotifyInput {
  return {
    audience: 'seller',
    recipientUserId: facts.sellerUserId,
    kind: decision.approved ? 'sales_discount_approved' : 'sales_discount_rejected',
    organizationId: null,
    title: decision.approved
      ? `Desconto aprovado para ${facts.customerName}`
      : `Desconto recusado para ${facts.customerName}`,
    body: decision.approved
      ? joinParts([facts.summary, 'o link de contratação foi enviado ao cliente'])
      : joinParts([decision.reason ?? null, 'reenvie o link sem desconto ou faça um novo pedido']),
    payload: { proposalId: facts.proposalId, discountRequestId: facts.requestId },
    link: `/vendas/propostas/${facts.proposalId}`,
    dedupeKey: `sales_discount_decided:${facts.requestId}`,
  }
}
