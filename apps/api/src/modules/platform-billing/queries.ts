import { ERROR_CODES, type ProposalDiscountRecord } from '@annetec/contracts'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { organization, platformCharges, platformOnboardingProposals, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import type { PlatformChargeRow, PlatformSubscriptionRow, TenantRef } from './presenter'

/** Leituras simples compartilhadas pelos serviços da cobrança da plataforma. */

export type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>

export async function loadPlatformCharge(id: string, executor: Pick<typeof db, 'select'> = db): Promise<PlatformChargeRow> {
  const [row] = await executor.select().from(platformCharges).where(eq(platformCharges.id, id)).limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Fatura não encontrada')
  return row
}

export async function loadPlatformSubscription(id: string, executor: Pick<typeof db, 'select'> = db): Promise<PlatformSubscriptionRow> {
  const [row] = await executor.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, id)).limit(1)
  if (!row) throw AppError.notFound('Assinatura')
  return row
}

export async function findSubscriptionByOrg(orgId: string): Promise<PlatformSubscriptionRow | null> {
  const [row] = await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.organizationId, orgId)).limit(1)
  return row ?? null
}

export async function tenantRefOf(orgId: string | null, executor: Pick<typeof db, 'select'> = db): Promise<TenantRef | null> {
  if (!orgId) return null
  const [row] = await executor
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1)
  return row ?? null
}

export async function tenantRefsOf(orgIds: (string | null)[]): Promise<Map<string, TenantRef>> {
  const ids = [...new Set(orgIds.filter((id): id is string => Boolean(id)))]
  const map = new Map<string, TenantRef>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(inArray(organization.id, ids))
  for (const row of rows) map.set(row.id, { name: row.name, slug: row.slug })
  return map
}

export interface ProposalBasics {
  id: string
  code: string
  status: string
  cnpj: string
  legalName: string | null
  tradeName: string | null
  planId: string | null
  paymentMethod: PlatformChargeRow['method'] | null
  organizationId: string | null
  applicant: { name: string; email: string; phone: string }
  company: { legalName?: string; email?: string; phone?: string } | null
  /** Desconto aprovado pelo superadmin (pedido do vendedor). */
  discount: ProposalDiscountRecord | null
}

export async function proposalBasics(proposalId: string, executor: Pick<typeof db, 'select'> = db): Promise<ProposalBasics | null> {
  const [row] = await executor
    .select({
      id: platformOnboardingProposals.id,
      code: platformOnboardingProposals.code,
      status: platformOnboardingProposals.status,
      cnpj: platformOnboardingProposals.cnpj,
      legalName: platformOnboardingProposals.legalName,
      tradeName: platformOnboardingProposals.tradeName,
      planId: platformOnboardingProposals.planId,
      paymentMethod: platformOnboardingProposals.paymentMethod,
      organizationId: platformOnboardingProposals.organizationId,
      applicant: platformOnboardingProposals.applicant,
      company: platformOnboardingProposals.company,
      discount: platformOnboardingProposals.discount,
    })
    .from(platformOnboardingProposals)
    .where(eq(platformOnboardingProposals.id, proposalId))
    .limit(1)
  if (!row) return null
  return {
    ...row,
    company: row.company ? { legalName: row.company.legalName, email: row.company.email, phone: row.company.phone } : null,
    discount: row.discount ?? null,
  }
}

/** Nome exibido do contratante de uma proposta (antes de virar inquilino). */
export function proposalDisplayName(p: Pick<ProposalBasics, 'tradeName' | 'legalName' | 'company' | 'applicant'>): string {
  return p.tradeName || p.company?.legalName || p.legalName || p.applicant.name
}
