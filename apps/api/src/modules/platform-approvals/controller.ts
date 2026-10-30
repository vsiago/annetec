import type { ApprovalsSummary, OnboardingStatus } from '@annetec/contracts'
import { count, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '@/db/client'
import { managedAccountRequests, platformDiscountRequests, platformOnboardingProposals } from '@/db/schema'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { OPEN_REQUEST_STATUSES } from '@/modules/managed-account/rules'

/**
 * Central de Aprovações do console — `/api/v1/platform/aprovacoes`.
 *
 * `GET /resumo`: quantos pedidos esperam a equipe em cada fila (novos clubes,
 * contas gerenciadas, descontos de vendedores). Só contagens — alimenta o
 * contador do item "Aprovações" no menu (a cada minuto) e as pílulas das abas.
 * Equipe (superadmin + platform_admin); vendedor ANNETEC nunca entra.
 */

/** Fila "Para analisar" dos novos clubes (mesma regra do resumo do compliance). */
const CLUB_QUEUE: OnboardingStatus[] = ['submitted', 'in_review']

export async function approvalsSummary(): Promise<ApprovalsSummary> {
  const [[clubs], [managed], [discounts]] = await Promise.all([
    db.select({ value: count() }).from(platformOnboardingProposals).where(inArray(platformOnboardingProposals.status, CLUB_QUEUE)),
    // Um pedido em aberto por clube (índice único parcial): contar as linhas é contar os clubes.
    db.select({ value: count() }).from(managedAccountRequests).where(inArray(managedAccountRequests.status, OPEN_REQUEST_STATUSES)),
    db.select({ value: count() }).from(platformDiscountRequests).where(eq(platformDiscountRequests.status, 'pending')),
  ])
  const summary = {
    clubs: clubs?.value ?? 0,
    managedAccounts: managed?.value ?? 0,
    discounts: discounts?.value ?? 0,
  }
  return { ...summary, total: summary.clubs + summary.managedAccounts + summary.discounts }
}

export const platformApprovalsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())
  .get('/resumo', async c => ok(c, await approvalsSummary()))
