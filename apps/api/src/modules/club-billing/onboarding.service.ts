import { platformRole, type ClubAccessStatus, type ClubSubscriptionStatus, type EmailStatus, type EmailTemplate } from '@annetec/contracts'
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import { env, isProduction, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { clientProfiles, clubOnboardingEmails, clubPlans, clubSubscriptions, member, organization, tenantProfiles, user } from '@/db/schema'
import { sendEmail, type SendEmailInput } from '@/lib/email'
import { parseAddress } from '@/lib/email/providers'
import type { ClubEmailTemplate } from '@/lib/email/templates'
import { logger } from '@/lib/logger'
import { clubAccessStatusOf, needsSubscription } from './access.service'

/**
 * Régua "assine seu plano" (white label): quem tem conta de associado no
 * clube e ainda não liberou os benefícios — nunca assinou, ou começou o
 * checkout e não pagou (`pending_payment`) — recebe no máximo 4 e-mails:
 * boas-vindas (D0, na hora do cadastro) e lembretes em D+1, D+3 e D+7,
 * contados a partir da entrada no clube (`member.createdAt`). Para assim que
 * houver assinatura viva (a elegibilidade é conferida a cada envio) — e
 * nunca vai para vínculo excluído ou bloqueado (`member.accessStatus`).
 *
 * Rodadas: associado excluído que VOLTA pelo site (`member-access.ts`) abre
 * a rodada seguinte (`member.onboardingRound` + 1, contada de
 * `member.onboardingStartedAt`) e recebe a régua de novo, uma vez por
 * retorno — as linhas da rodada anterior ficam como histórico
 * (`club_onboarding_emails.round`) em vez de serem apagadas. O D0 de quem
 * voltou diz "Que bom te ver de volta".
 *
 * Idempotência: cada passo é RESERVADO em `club_onboarding_emails` (unique
 * por clube + pessoa + passo) antes do envio — o timer da automação e o
 * envio na hora do cadastro nunca mandam o mesmo passo duas vezes; falha de
 * envio fica registrada e não vira reenvio (mesmo padrão do `reminderSentAt`).
 */

export const ONBOARDING_STEPS = [
  { step: 'd0', offsetDays: 0 },
  { step: 'd1', offsetDays: 1 },
  { step: 'd3', offsetDays: 3 },
  { step: 'd7', offsetDays: 7 },
] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]['step']

const DAY_MS = 86_400_000
/**
 * Só entra na régua quem chegou ao clube há no máximo isto. Evita, na 1ª
 * rodada depois do deploy, disparar para associados antigos sem assinatura.
 */
export const ONBOARDING_WINDOW_DAYS = 10
/** Checkout iniciado há menos que isto: o pagamento ainda pode estar a caminho — não lembrar ainda. */
export const RECENT_CHECKOUT_GRACE_MS = DAY_MS

const STEP_INDEX: Record<string, number> = Object.fromEntries(ONBOARDING_STEPS.map((item, index) => [item.step, index]))

/**
 * Qual passo enviar agora (ou nenhum). Pura. Sempre o passo MAIS RECENTE cujo
 * prazo já chegou, e nunca um passo anterior ou igual a um já registrado —
 * quem perdeu uma janela (servidor parado, entrou na régua no meio) recebe o
 * passo atual, não uma rajada de atrasados. Fora da janela, nada.
 */
export function nextOnboardingStep(joinedAt: Date, now: Date, recorded: readonly string[]): OnboardingStep | null {
  const elapsed = now.getTime() - joinedAt.getTime()
  if (elapsed < 0 || elapsed > ONBOARDING_WINDOW_DAYS * DAY_MS) return null
  const dueIndex = ONBOARDING_STEPS.reduce((found, item, index) => (elapsed >= item.offsetDays * DAY_MS ? index : found), -1)
  if (dueIndex < 0) return null
  const lastRecorded = recorded.reduce((max, step) => Math.max(max, STEP_INDEX[step] ?? -1), -1)
  if (lastRecorded >= dueIndex) return null
  return ONBOARDING_STEPS[dueIndex]!.step
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export interface OnboardingTarget {
  organizationId: string
  userId: string
  email: string
  name: string
  accessStatus: Extract<ClubAccessStatus, 'none' | 'pending_payment'>
  /** Plano do checkout pendente, quando houver. */
  planName?: string | null
  /** Rodada da régua (`member.onboardingRound`); > 1 = associado que voltou. Padrão 1. */
  round?: number
}

export interface OnboardingClub {
  name: string
  slug: string
  primaryColor: string | null
  logoUrl: string | null
  plans: { name: string; priceMonthly: number }[]
}

export interface OnboardingDeps {
  send: (input: SendEmailInput) => Promise<{ id: string | null; status: EmailStatus }>
  loadClub: (organizationId: string) => Promise<OnboardingClub | null>
  /** Reserva o passo; `null` = já reservado/enviado antes. */
  claim: (target: OnboardingTarget, step: OnboardingStep) => Promise<string | null>
  finish: (id: string, result: { status: 'sent' | 'failed' | 'skipped'; emailId: string | null; reason: string | null }) => Promise<void>
  /** Em produção, e-mail só gravado na caixa de saída (sem provedor) NÃO conta como entregue. */
  production: boolean
}

export type OnboardingOutcome = 'sent' | 'failed' | 'skipped' | 'duplicate'

async function loadOnboardingClub(organizationId: string): Promise<OnboardingClub | null> {
  const [[row], plans] = await Promise.all([
    db
      .select({ name: organization.name, slug: organization.slug, logo: organization.logo, branding: tenantProfiles.branding })
      .from(organization)
      .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
      .where(eq(organization.id, organizationId))
      .limit(1),
    db
      .select({ name: clubPlans.name, priceMonthly: clubPlans.priceMonthly })
      .from(clubPlans)
      .where(and(eq(clubPlans.organizationId, organizationId), eq(clubPlans.status, 'active')))
      .orderBy(asc(clubPlans.sortOrder), asc(clubPlans.priceMonthly))
      .limit(4),
  ])
  if (!row) return null
  return {
    name: row.name,
    slug: row.slug,
    primaryColor: row.branding?.primaryColor ?? null,
    logoUrl: row.branding?.logoUrl ?? row.logo ?? null,
    plans: plans.map(plan => ({ name: plan.name, priceMonthly: Number(plan.priceMonthly) })),
  }
}

const defaultDeps: OnboardingDeps = {
  send: sendEmail,
  loadClub: loadOnboardingClub,
  claim: async (target, step) => {
    const [row] = await db
      .insert(clubOnboardingEmails)
      .values({
        organizationId: target.organizationId,
        userId: target.userId,
        round: target.round ?? 1,
        step,
        accessStatus: target.accessStatus,
      })
      .onConflictDoNothing()
      .returning({ id: clubOnboardingEmails.id })
    return row?.id ?? null
  },
  finish: async (id, result) => {
    await db
      .update(clubOnboardingEmails)
      .set({ status: result.status, emailId: result.emailId, reason: result.reason, updatedAt: new Date() })
      .where(eq(clubOnboardingEmails.id, id))
  },
  production: isProduction,
}

/**
 * Reserva o passo e envia o e-mail com a marca do clube. Nunca lança por
 * falha de envio (vai para `status`/`reason`); lança só se a gravação falhar.
 */
export async function deliverOnboardingEmail(
  target: OnboardingTarget,
  step: OnboardingStep,
  overrides: Partial<OnboardingDeps> = {},
): Promise<OnboardingOutcome> {
  const deps = { ...defaultDeps, ...overrides }
  const claimId = await deps.claim(target, step)
  if (!claimId) return 'duplicate'

  const email = target.email.trim()
  if (!email.includes('@')) {
    await deps.finish(claimId, { status: 'skipped', emailId: null, reason: 'sem e-mail' })
    return 'skipped'
  }

  let result: { id: string | null; status: EmailStatus | 'error' }
  let reason: string | null = null
  try {
    const club = await deps.loadClub(target.organizationId)
    const template: ClubEmailTemplate = step === 'd0' ? 'club_subscribe_welcome' : 'club_subscribe_reminder'
    result = await deps.send({
      // Chave fora do enum da plataforma (ver `CLUB_EMAIL_TEMPLATES`); a coluna é texto.
      template: template as unknown as EmailTemplate,
      to: { email, name: target.name },
      data: {
        clubName: club?.name ?? 'Seu clube',
        brandColor: club?.primaryColor ?? null,
        logoUrl: club?.logoUrl ?? null,
        senderEmail: parseAddress(env.EMAIL_FROM).email,
        holderName: target.name,
        step,
        accessStatus: target.accessStatus,
        planName: target.planName ?? null,
        returning: (target.round ?? 1) > 1,
        plans: club?.plans ?? [],
        // Onboarding do portal (pede login e leva aos planos com a sessão).
        subscribeUrl: club ? `${webBaseUrl}/${club.slug}/cliente/assinar` : null,
        portalUrl: club ? `${webBaseUrl}/${club.slug}/cliente` : null,
      },
      organizationId: target.organizationId,
      relatedType: 'club_onboarding',
      relatedId: target.userId,
    })
  } catch (error) {
    result = { id: null, status: 'error' }
    reason = (error instanceof Error ? error.message : String(error)).slice(0, 200)
  }

  const delivered = result.status === 'sent' || (result.status === 'simulated' && !deps.production)
  if (delivered) {
    await deps.finish(claimId, { status: 'sent', emailId: result.id, reason: null })
    return 'sent'
  }
  reason ??= result.status === 'simulated' ? 'sem provedor de e-mail em produção' : 'provedor recusou o envio'
  logger.warn({ tenantId: target.organizationId, userId: target.userId, step, emailStatus: result.status }, 'E-mail "assine seu plano" não enviado')
  await deps.finish(claimId, { status: 'failed', emailId: result.id, reason })
  return 'failed'
}

// ---------------------------------------------------------------------------
// Seleção (banco)
// ---------------------------------------------------------------------------

export interface OnboardingCandidate {
  target: OnboardingTarget
  joinedAt: Date
  recorded: string[]
  /** Criação da assinatura mais recente (qualquer status), se houver. */
  lastSubscriptionAt: Date | null
}

/**
 * Associados do clube que entraram (ou voltaram) dentro da janela da régua
 * e ainda não liberaram os benefícios, com os passos já registrados NA
 * RODADA ATUAL. Conta de plataforma nunca entra (papel `client` em `member`
 * + `user.role` comum), nem vínculo excluído/bloqueado.
 */
export async function listOnboardingCandidates(
  organizationId: string,
  now: Date,
  options: { userId?: string } = {},
): Promise<OnboardingCandidate[]> {
  const since = new Date(now.getTime() - ONBOARDING_WINDOW_DAYS * DAY_MS)
  const roundStartedAt = sql<Date>`coalesce(${member.onboardingStartedAt}, ${member.createdAt})`
  const members = await db
    .select({
      userId: member.userId,
      createdAt: member.createdAt,
      startedAt: member.onboardingStartedAt,
      round: member.onboardingRound,
      email: user.email,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.role, 'client'),
        eq(member.accessStatus, 'active'),
        sql`${roundStartedAt} >= ${since.toISOString()}::timestamptz`,
        or(isNull(user.role), notInArray(user.role, [...platformRole.options])),
        options.userId ? eq(member.userId, options.userId) : undefined,
      ),
    )
  if (members.length === 0) return []
  const userIds = members.map(row => row.userId)

  const [subs, profiles, recorded] = await Promise.all([
    db
      .select({ userId: clubSubscriptions.userId, status: clubSubscriptions.status, planName: clubSubscriptions.planName, createdAt: clubSubscriptions.createdAt })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, organizationId), inArray(clubSubscriptions.userId, userIds)))
      .orderBy(desc(clubSubscriptions.createdAt)),
    db
      .select({ userId: clientProfiles.userId, contract: clientProfiles.primaryContractCodigo })
      .from(clientProfiles)
      .where(and(eq(clientProfiles.organizationId, organizationId), inArray(clientProfiles.userId, userIds))),
    db
      .select({ userId: clubOnboardingEmails.userId, round: clubOnboardingEmails.round, step: clubOnboardingEmails.step })
      .from(clubOnboardingEmails)
      .where(and(eq(clubOnboardingEmails.organizationId, organizationId), inArray(clubOnboardingEmails.userId, userIds))),
  ])

  const candidates: OnboardingCandidate[] = []
  for (const row of members) {
    const mine = subs.filter(sub => sub.userId === row.userId)
    const status = clubAccessStatusOf({
      subscriptionStatuses: mine.map(sub => sub.status as ClubSubscriptionStatus),
      hasUpstreamContract: profiles.some(profile => profile.userId === row.userId && Boolean(profile.contract)),
    })
    if (!needsSubscription(status)) continue
    const pending = mine.find(sub => sub.status === 'pending_payment')
    candidates.push({
      target: {
        organizationId,
        userId: row.userId,
        email: row.email,
        name: row.name,
        accessStatus: status as OnboardingTarget['accessStatus'],
        planName: pending?.planName ?? null,
        round: row.round,
      },
      joinedAt: row.startedAt ?? row.createdAt,
      recorded: recorded.filter(item => item.userId === row.userId && item.round === row.round).map(item => item.step),
      // Assinatura de antes do retorno (já cancelada) não segura a régua nova.
      lastSubscriptionAt:
        mine[0] && (!row.startedAt || mine[0].createdAt >= row.startedAt) ? mine[0].createdAt : null,
    })
  }
  return candidates
}

/** Decide o passo de um candidato agora: respeita a carência de checkout recém-iniciado. */
export function onboardingStepFor(candidate: OnboardingCandidate, now: Date): OnboardingStep | null {
  if (candidate.lastSubscriptionAt && now.getTime() - candidate.lastSubscriptionAt.getTime() < RECENT_CHECKOUT_GRACE_MS) {
    return null
  }
  return nextOnboardingStep(candidate.joinedAt, now, candidate.recorded)
}

/**
 * Boas-vindas (D0) na hora do cadastro — fora do timer. Só envia se a pessoa
 * continua sem assinatura e o D0 ainda não saiu (a reserva garante 1×).
 */
export async function sendOnboardingWelcome(organizationId: string, userId: string, now = new Date()): Promise<OnboardingOutcome | null> {
  const [candidate] = await listOnboardingCandidates(organizationId, now, { userId })
  if (!candidate || candidate.target.accessStatus !== 'none' || candidate.recorded.length > 0) return null
  return deliverOnboardingEmail(candidate.target, 'd0')
}
