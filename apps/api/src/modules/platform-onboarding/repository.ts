import type { OnboardingEventType, OnboardingEventVisibility, OnboardingStatus } from '@annetec/contracts'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  organization,
  platformFiles,
  platformOnboardingDocuments,
  platformOnboardingEvents,
  platformOnboardingPeople,
  platformOnboardingProposals,
  tenantPlans,
  tenantProfiles,
  user,
} from '@/db/schema'
import { syncProspectsWithProposal } from '@/modules/platform-sales/prospect-sync'
import { checkSlugFormat, OPEN_STATUSES } from './rules'

/**
 * Acesso a dados da proposta. Toda mudança de estado passa por
 * `transitionProposal` (`UPDATE … WHERE status IN (…) RETURNING`): quem perde
 * a corrida recebe `null` em vez de sobrescrever o estado de outro.
 */
export type ProposalRow = typeof platformOnboardingProposals.$inferSelect
export type ProposalPatch = Partial<typeof platformOnboardingProposals.$inferInsert>
export type PersonRow = typeof platformOnboardingPeople.$inferSelect
export type DocumentRow = typeof platformOnboardingDocuments.$inferSelect
export type EventRow = typeof platformOnboardingEvents.$inferSelect
export type FileRow = typeof platformFiles.$inferSelect

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type Executor = typeof db | Transaction

export interface DocumentWithFile extends DocumentRow {
  file: Pick<FileRow, 'id' | 'fileName' | 'mimeType' | 'sizeBytes' | 'deletedAt' | 'driver' | 'storageKey'>
}

export interface ProposalBundle {
  proposal: ProposalRow
  people: PersonRow[]
  documents: DocumentWithFile[]
  events: EventRow[]
  organization: { id: string; slug: string; name: string } | null
  planName: string | null
  /** O slug da marca já é de OUTRO inquilino (o desta proposta não conta). */
  brandSlugTaken: boolean
}

export interface Actor {
  userId: string
  name: string
}

export async function getProposal(id: string, executor: Executor = db): Promise<ProposalRow | null> {
  const [row] = await executor
    .select()
    .from(platformOnboardingProposals)
    .where(eq(platformOnboardingProposals.id, id))
    .limit(1)
  return row ?? null
}

export async function loadPeople(proposalId: string, executor: Executor = db): Promise<PersonRow[]> {
  return executor
    .select()
    .from(platformOnboardingPeople)
    .where(eq(platformOnboardingPeople.proposalId, proposalId))
    .orderBy(asc(platformOnboardingPeople.sortOrder), asc(platformOnboardingPeople.createdAt))
}

export async function loadDocuments(proposalId: string, executor: Executor = db): Promise<DocumentWithFile[]> {
  const rows = await executor
    .select({
      document: platformOnboardingDocuments,
      file: {
        id: platformFiles.id,
        fileName: platformFiles.fileName,
        mimeType: platformFiles.mimeType,
        sizeBytes: platformFiles.sizeBytes,
        deletedAt: platformFiles.deletedAt,
        driver: platformFiles.driver,
        storageKey: platformFiles.storageKey,
      },
    })
    .from(platformOnboardingDocuments)
    .innerJoin(platformFiles, eq(platformFiles.id, platformOnboardingDocuments.fileId))
    .where(eq(platformOnboardingDocuments.proposalId, proposalId))
    .orderBy(asc(platformOnboardingDocuments.createdAt))
  return rows.map(row => ({ ...row.document, file: row.file }))
}

export async function loadBundle(id: string): Promise<ProposalBundle | null> {
  const proposal = await getProposal(id)
  if (!proposal) return null
  const [people, documents, events, org, plan] = await Promise.all([
    loadPeople(id),
    loadDocuments(id),
    db
      .select()
      .from(platformOnboardingEvents)
      .where(eq(platformOnboardingEvents.proposalId, id))
      .orderBy(desc(platformOnboardingEvents.createdAt)),
    proposal.organizationId
      ? db
          .select({ id: organization.id, slug: organization.slug, name: organization.name })
          .from(organization)
          .where(eq(organization.id, proposal.organizationId))
          .limit(1)
      : Promise.resolve([]),
    proposal.planId
      ? db.select({ name: tenantPlans.name }).from(tenantPlans).where(eq(tenantPlans.id, proposal.planId)).limit(1)
      : Promise.resolve([]),
  ])
  const ownOrg = org[0] ?? null
  let brandSlugTaken = false
  if (proposal.slug && (!ownOrg || ownOrg.slug !== proposal.slug)) {
    const [taken] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, proposal.slug))
      .limit(1)
    brandSlugTaken = Boolean(taken)
  }
  return { proposal, people, documents, events, organization: ownOrg, planName: plan[0]?.name ?? null, brandSlugTaken }
}

export async function insertEvent(
  executor: Executor,
  event: {
    proposalId: string
    type: OnboardingEventType
    visibility: OnboardingEventVisibility
    message: string
    data?: Record<string, unknown> | null
    actor?: Actor | null
  },
): Promise<void> {
  await executor.insert(platformOnboardingEvents).values({
    proposalId: event.proposalId,
    type: event.type,
    visibility: event.visibility,
    message: event.message,
    data: event.data ?? null,
    actorUserId: event.actor?.userId ?? null,
    actorName: event.actor?.name ?? null,
  })
}

/**
 * `UPDATE … SET patch WHERE id = ? AND status IN (from) RETURNING *`.
 * `null` = a proposta não está (mais) num dos estados de origem.
 *
 * Mudou o status de uma proposta com vendedor: o prospect vinculado acompanha
 * (`syncProspectsWithProposal`, nunca derruba a transição).
 */
export async function transitionProposal(
  executor: Executor,
  id: string,
  from: readonly OnboardingStatus[],
  patch: ProposalPatch,
): Promise<ProposalRow | null> {
  const [row] = await executor
    .update(platformOnboardingProposals)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(platformOnboardingProposals.id, id), inArray(platformOnboardingProposals.status, [...from])))
    .returning()
  if (row && patch.status !== undefined && (row.sellerUserId || row.vendasLeadId)) await syncProspectsWithProposal(executor, row)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Unicidade (CNPJ, slug, e-mail do admin)
// ---------------------------------------------------------------------------

export async function cnpjIsTenant(cnpj: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantProfiles.organizationId })
    .from(tenantProfiles)
    .where(eq(tenantProfiles.document, cnpj))
    .limit(1)
  return Boolean(row)
}

export async function openProposalForCnpj(
  cnpj: string,
  excludeId?: string,
): Promise<{ id: string; code: string; status: OnboardingStatus } | null> {
  const filters = [eq(platformOnboardingProposals.cnpj, cnpj), inArray(platformOnboardingProposals.status, OPEN_STATUSES)]
  if (excludeId) filters.push(ne(platformOnboardingProposals.id, excludeId))
  const [row] = await db
    .select({ id: platformOnboardingProposals.id, code: platformOnboardingProposals.code, status: platformOnboardingProposals.status })
    .from(platformOnboardingProposals)
    .where(and(...filters))
    .limit(1)
  return row ?? null
}

export type SlugStatus = 'free' | 'taken' | 'reserved' | 'pending_proposal' | 'invalid'

/** Situação de um slug: formato, reservado, inquilino existente, outra proposta aberta. */
export async function slugStatus(value: string, excludeProposalId?: string | null): Promise<SlugStatus> {
  const format = checkSlugFormat(value)
  if (format !== 'ok') return format
  const normalized = value.trim().toLowerCase()
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, normalized)).limit(1)
  if (org) {
    // O inquilino que ESTA proposta criou não conta como ocupado.
    if (excludeProposalId) {
      const own = await getProposal(excludeProposalId)
      if (own?.organizationId === org.id) return 'free'
    }
    return 'taken'
  }
  const filters = [eq(platformOnboardingProposals.slug, normalized), inArray(platformOnboardingProposals.status, OPEN_STATUSES)]
  if (excludeProposalId) filters.push(ne(platformOnboardingProposals.id, excludeProposalId))
  const [other] = await db
    .select({ id: platformOnboardingProposals.id })
    .from(platformOnboardingProposals)
    .where(and(...filters))
    .limit(1)
  return other ? 'pending_proposal' : 'free'
}

/** Slugs ocupados dentre `candidates` (inquilinos + propostas abertas). */
export async function takenSlugs(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()
  const [orgs, proposals] = await Promise.all([
    db.select({ slug: organization.slug }).from(organization).where(inArray(organization.slug, candidates)),
    db
      .select({ slug: platformOnboardingProposals.slug })
      .from(platformOnboardingProposals)
      .where(and(inArray(platformOnboardingProposals.slug, candidates), inArray(platformOnboardingProposals.status, OPEN_STATUSES))),
  ])
  return new Set([...orgs.map(o => o.slug), ...proposals.map(p => p.slug).filter((s): s is string => Boolean(s))])
}

export async function emailHasAccount(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
    .limit(1)
  return Boolean(row)
}
