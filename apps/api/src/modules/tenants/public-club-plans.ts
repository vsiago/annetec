import { sortClubPlansForDisplay, type ClubPlan } from '@annetec/contracts'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubPlans } from '@/db/schema'
import { toClubPlan } from '@/modules/network/controller'

/**
 * Planos do clube na vitrine pública — `GET /t/:slug/public/planos`.
 *
 * É a mesma leitura de `GET /rede/planos` (módulo network), com o mesmo mapper
 * (`toClubPlan`: coberturas, regras, adesão, fidelidade…) e dois recortes de
 * vitrine: só plano ATIVO — inativo é oferta encerrada, e anunciá-lo leva o
 * visitante a um checkout que não fecha — e a ordem de exibição do contrato
 * (`sortClubPlansForDisplay`: `sortOrder`, depois destaque e preço).
 */

/** Mantido como alias: o plano público é o `ClubPlan` completo. */
export type PublicClubPlan = ClubPlan

export async function listPublicClubPlans(tenantId: string): Promise<PublicClubPlan[]> {
  const rows = await db
    .select()
    .from(clubPlans)
    .where(and(eq(clubPlans.organizationId, tenantId), eq(clubPlans.status, 'active')))
  return sortClubPlansForDisplay(rows.map(toClubPlan))
}

/** Plano ativo do inquilino, para quem precisa confirmar um `planId` vindo da tela. */
export async function findPublicClubPlan(tenantId: string, id: string): Promise<PublicClubPlan | null> {
  const [row] = await db
    .select()
    .from(clubPlans)
    .where(and(eq(clubPlans.organizationId, tenantId), eq(clubPlans.id, id), eq(clubPlans.status, 'active')))
    .limit(1)
  return row ? toClubPlan(row) : null
}
