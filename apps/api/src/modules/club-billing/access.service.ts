import type { ClubAccessStatus, ClubSubscriptionStatus, MyClubAccess } from '@annetec/contracts'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { clientProfiles, clubSubscriptions } from '@/db/schema'

/**
 * "Esta pessoa já liberou os benefícios do clube?" — a pergunta que o portal
 * (onboarding e bloqueios), o login com Google (`needsSubscription`) e a
 * régua de e-mails "assine seu plano" fazem. Uma regra só, pura, mais a
 * leitura mínima do banco.
 */

/** Assinatura "viva": o associado tem (ou teve até regularizar) os benefícios. */
export const LIVE_SUBSCRIPTION_STATUSES = ['active', 'past_due', 'suspended'] as const satisfies readonly ClubSubscriptionStatus[]

export function clubAccessStatusOf(input: {
  subscriptionStatuses: readonly ClubSubscriptionStatus[]
  /** Contrato da operadora no perfil (associado antigo, login por CPF). */
  hasUpstreamContract: boolean
}): ClubAccessStatus {
  const statuses = input.subscriptionStatuses
  if (statuses.some(status => (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status))) return 'subscribed'
  if (input.hasUpstreamContract) return 'contract'
  if (statuses.includes('pending_payment')) return 'pending_payment'
  return 'none'
}

export function needsSubscription(status: ClubAccessStatus): boolean {
  return status === 'none' || status === 'pending_payment'
}

export async function loadClubAccess(organizationId: string, userId: string): Promise<MyClubAccess> {
  const [subs, [profile]] = await Promise.all([
    db
      .select({ status: clubSubscriptions.status })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, organizationId), eq(clubSubscriptions.userId, userId))),
    db
      .select({ contract: clientProfiles.primaryContractCodigo })
      .from(clientProfiles)
      .where(and(eq(clientProfiles.organizationId, organizationId), eq(clientProfiles.userId, userId)))
      .limit(1),
  ])
  const status = clubAccessStatusOf({
    subscriptionStatuses: subs.map(row => row.status),
    hasUpstreamContract: Boolean(profile?.contract),
  })
  return { status, needsSubscription: needsSubscription(status) }
}
