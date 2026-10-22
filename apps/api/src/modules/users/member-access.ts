import { ERROR_CODES } from '@annetec/contracts'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubSubscriptions, member, type MemberAccessStatusValue } from '@/db/schema'
import { AppError } from '@/http/errors'
import { recordSystemAudit } from '@/lib/audit'
import { runInBackground } from '@/lib/background'
import { logger } from '@/lib/logger'
import { membershipRulesDb, revokeClubSessions, type MembershipRulesDeps } from './membership-rules'

/**
 * Estado do vínculo pessoa↔clube (`member.access_status`) e as três coisas
 * que mexem nele fora do CRUD comum:
 *
 *  - LOGIN (`admitLogin`): todo caminho que abre sessão de inquilino — senha,
 *    Google, portal CPF + e-mail — e o checkout sem sessão (e-mail + CPF)
 *    passam por aqui. `blocked` e equipe desligada são recusados com a
 *    mensagem genérica `ACCESS_UNAVAILABLE_MESSAGE`; associado `removed` é
 *    REATIVADO no mesmo vínculo (mesmo user id, histórico preservado), sem
 *    assinatura — cai no onboarding — com auditoria `client.returned` e uma
 *    rodada nova da régua "assine seu plano";
 *  - EXCLUIR / BLOQUEAR (`cutMemberAccess`): cancela as assinaturas vivas do
 *    clube (mesmo serviço do "Cancelar assinatura" do admin: cobranças
 *    abertas canceladas no gateway) e esquece o cartão salvo, marca o vínculo
 *    e derruba as sessões, devolvendo os números reais para a auditoria;
 *  - SESSÃO: `resolveActiveMembership` (getSession) só reconhece vínculo
 *    `active` — sessão antiga de vínculo cortado fica sem inquilino e
 *    `requireAuth` responde 401.
 *
 * O banco entra por `MemberAccessDeps` para os testes rodarem sem Postgres.
 */

export const ACCESS_UNAVAILABLE_MESSAGE = 'Acesso indisponível. Fale com o clube.'
export const MEMBER_REMOVED_REASON = 'Associado excluído pelo clube'
export const MEMBER_BLOCKED_REASON = 'Associado bloqueado pelo clube'

export function accessUnavailable(): AppError {
  return new AppError(ERROR_CODES.ACCESS_UNAVAILABLE, ACCESS_UNAVAILABLE_MESSAGE)
}

export type TenantRoleValue = 'admin' | 'seller' | 'client'
export type LoginVia = 'password' | 'google' | 'portal' | 'checkout'

export interface MemberAccessRow {
  role: TenantRoleValue
  accessStatus: MemberAccessStatusValue
  onboardingRound: number
}

/**
 * O que um login faz com este vínculo. Pura.
 *  - `active` → entra;
 *  - `blocked` → recusa (qualquer papel);
 *  - `removed` + associado → reativa (volta pelo site);
 *  - `removed` + equipe → recusa: equipe só volta reativada pelo admin.
 */
export function loginAccessDecision(row: Pick<MemberAccessRow, 'role' | 'accessStatus'>): 'allow' | 'reactivate' | 'refuse' {
  if (row.accessStatus === 'active') return 'allow'
  if (row.accessStatus === 'removed' && row.role === 'client') return 'reactivate'
  return 'refuse'
}

/** Assinatura que ainda gera cobrança ou dá benefício: tudo menos cancelada. */
export const CUTTABLE_SUBSCRIPTION_STATUSES = ['active', 'past_due', 'suspended', 'pending_payment'] as const

export interface CuttableSubscription {
  id: string
  organizationId: string
  gatewayProvider: (typeof clubSubscriptions.$inferSelect)['gatewayProvider']
}

export interface MemberAccessDeps extends Pick<MembershipRulesDeps, 'countOtherMemberships' | 'revokeSessions'> {
  find: (organizationId: string, userId: string) => Promise<MemberAccessRow | null>
  /** Grava o estado. Devolve se mudou algo. */
  setStatus: (organizationId: string, userId: string, status: MemberAccessStatusValue, now: Date) => Promise<boolean>
  /**
   * `removed` → `active` só para associado, abrindo a rodada seguinte da
   * régua. Condicional (corrida entre dois logins reativa uma vez só):
   * devolve a rodada nova, ou `null` se outro caminho já reativou.
   */
  reopenAsClient: (organizationId: string, userId: string, now: Date) => Promise<number | null>
  liveSubscriptions: (organizationId: string, userId: string) => Promise<CuttableSubscription[]>
  cancelSubscription: (sub: CuttableSubscription, reason: string, actorUserId: string | null) => Promise<boolean>
  /** Apaga o token do cartão salvo (a recorrência não tem mais com o que cobrar). */
  forgetCard: (subscriptionId: string) => Promise<void>
  audit: (entry: {
    organizationId: string
    actorId: string | null
    action: string
    resourceId: string
    metadata: Record<string, unknown>
  }) => Promise<void>
  /** Boas-vindas (D0) da rodada nova, em segundo plano. */
  welcome: (organizationId: string, userId: string) => void
  /** Sino do admin do clube e do backoffice: "associado de volta". Nunca lança. */
  notifyReturned?: (organizationId: string, userId: string) => Promise<void>
}

export const memberAccessDb: MemberAccessDeps = {
  countOtherMemberships: membershipRulesDb.countOtherMemberships,
  revokeSessions: membershipRulesDb.revokeSessions,

  find: async (organizationId, userId) => {
    const [row] = await db
      .select({ role: member.role, accessStatus: member.accessStatus, onboardingRound: member.onboardingRound })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .limit(1)
    return row ? { ...row, role: row.role as TenantRoleValue } : null
  },

  setStatus: async (organizationId, userId, status, now) => {
    const updated = await db
      .update(member)
      .set({ accessStatus: status, accessChangedAt: now })
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
          sql`${member.accessStatus} <> ${status}`,
        ),
      )
      .returning({ id: member.id })
    return updated.length > 0
  },

  reopenAsClient: async (organizationId, userId, now) => {
    const [row] = await db
      .update(member)
      .set({
        accessStatus: 'active',
        accessChangedAt: now,
        onboardingRound: sql`${member.onboardingRound} + 1`,
        onboardingStartedAt: now,
      })
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
          eq(member.role, 'client'),
          eq(member.accessStatus, 'removed'),
        ),
      )
      .returning({ round: member.onboardingRound })
    return row?.round ?? null
  },

  liveSubscriptions: async (organizationId, userId) =>
    db
      .select({
        id: clubSubscriptions.id,
        organizationId: clubSubscriptions.organizationId,
        gatewayProvider: clubSubscriptions.gatewayProvider,
      })
      .from(clubSubscriptions)
      .where(
        and(
          eq(clubSubscriptions.organizationId, organizationId),
          eq(clubSubscriptions.userId, userId),
          inArray(clubSubscriptions.status, [...CUTTABLE_SUBSCRIPTION_STATUSES]),
        ),
      ),

  cancelSubscription: async (sub, reason, actorUserId) => {
    // Import tardio: subscriptions.service puxa gateways e cobranças, e este
    // módulo é carregado pelo plugin de login (dentro de `lib/auth`).
    const { cancelSubscription } = await import('@/modules/club-billing/subscriptions.service')
    return cancelSubscription(sub, reason, { source: 'manual', actorUserId })
  },

  forgetCard: async subscriptionId => {
    await db
      .update(clubSubscriptions)
      .set({ cardToken: null, updatedAt: new Date() })
      .where(eq(clubSubscriptions.id, subscriptionId))
  },

  audit: entry =>
    recordSystemAudit({
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      actorScope: 'tenant',
      action: entry.action,
      resource: 'member',
      resourceId: entry.resourceId,
      metadata: entry.metadata,
    }),

  welcome: (organizationId, userId) => {
    runInBackground(
      import('@/modules/club-billing/onboarding.service').then(({ sendOnboardingWelcome }) =>
        sendOnboardingWelcome(organizationId, userId),
      ),
      error => logger.error({ err: error, tenantId: organizationId, userId }, 'Falha nas boas-vindas do associado que voltou'),
    )
  },

  notifyReturned: async (organizationId, userId) => {
    const { notifyClientSignup } = await import('@/lib/notifications')
    await notifyClientSignup({ organizationId, userId, via: 'returned' })
  },
}

/**
 * Porta de entrada de todo login de inquilino (ver topo). Lança
 * `ACCESS_UNAVAILABLE` quando o vínculo não pode abrir sessão — quem chama
 * revoga a sessão recém-aberta antes de propagar. Sem vínculo: `'missing'`
 * (quem chama decide; normalmente o vínculo acabou de ser resolvido).
 */
export async function admitLogin(
  organizationId: string,
  userId: string,
  via: LoginVia,
  deps: MemberAccessDeps = memberAccessDb,
  now = new Date(),
): Promise<'allow' | 'reactivated' | 'missing'> {
  const row = await deps.find(organizationId, userId)
  if (!row) return 'missing'
  const decision = loginAccessDecision(row)
  if (decision === 'refuse') {
    logger.warn({ tenantId: organizationId, userId, via, accessStatus: row.accessStatus, role: row.role }, 'Login recusado: vínculo com o clube indisponível')
    throw accessUnavailable()
  }
  if (decision === 'allow') return 'allow'

  const round = await deps.reopenAsClient(organizationId, userId, now)
  if (round === null) return 'allow' // outro login reativou no meio do caminho
  await deps.audit({
    organizationId,
    actorId: userId,
    action: 'client.returned',
    resourceId: userId,
    metadata: { via, rodadaOnboarding: round, assinaturaExigida: true },
  })
  deps.welcome(organizationId, userId)
  await deps.notifyReturned?.(organizationId, userId)
  logger.info({ tenantId: organizationId, userId, via, round }, 'Associado excluído voltou: vínculo reativado, onboarding exigido')
  return 'reactivated'
}

export interface CutAccessResult {
  /** Assinaturas que estavam vivas e foram canceladas agora. */
  canceledSubscriptions: number
  /** Sessões encerradas agora (número real devolvido pelo banco). */
  revokedSessions: number
  previousStatus: MemberAccessStatusValue
}

/**
 * Exclui (`removed`) ou bloqueia (`blocked`) o vínculo. Ordem pensada para
 * falha parcial ser segura e o reenvio idempotente:
 *  1. cancela as assinaturas vivas (cobranças abertas canceladas no gateway,
 *     best-effort, e o cartão salvo esquecido) — se algo falhar aqui nada
 *     mais mudou e o admin pode repetir;
 *  2. marca o vínculo (a partir daqui nenhum login nem getSession passa);
 *  3. derruba as sessões (todas, se este era o único vínculo da pessoa).
 * Não confere a regra do último responsável — quem chama faz isso antes.
 */
export async function cutMemberAccess(
  organizationId: string,
  target: { userId: string; platformRole: string },
  status: Exclude<MemberAccessStatusValue, 'active'>,
  ctx: { actorUserId: string | null; reason: string },
  deps: MemberAccessDeps = memberAccessDb,
  now = new Date(),
): Promise<CutAccessResult> {
  const row = await deps.find(organizationId, target.userId)
  if (!row) throw AppError.notFound('Usuário')

  let canceledSubscriptions = 0
  for (const sub of await deps.liveSubscriptions(organizationId, target.userId)) {
    if (await deps.cancelSubscription(sub, ctx.reason, ctx.actorUserId)) canceledSubscriptions += 1
    await deps.forgetCard(sub.id)
  }

  await deps.setStatus(organizationId, target.userId, status, now)
  const revokedSessions = await revokeClubSessions(deps, organizationId, target)
  return { canceledSubscriptions, revokedSessions, previousStatus: row.accessStatus }
}
