import {
  OPEN_PROSPECT_STAGES,
  PROSPECT_STAGE_LABELS,
  type CreateProspectInput,
  type CreateProspectInteractionInput,
  type ListProspectsQuery,
  type Prospect,
  type ProspectDetail,
  type ProspectInteraction,
  type ReassignProspectInput,
  type UpdateProspectInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  platformOnboardingProposals,
  platformProspectInteractions,
  platformProspects,
  tenantPlans,
  user,
  type PlatformProspectInteractionRow,
  type PlatformProspectRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { OPEN_PROPOSAL_STATUSES } from './rules'
import { findActiveSellerById } from './seller-profile'

/**
 * Funil da plataforma. ISOLAMENTO: toda leitura/escrita do vendedor passa o
 * `sellerUserId` da SESSÃO (`Viewer`), e o prospect de outro vendedor responde
 * 404 — como se não existisse. A equipe lê todos; só o superadmin reatribui.
 */

export type Viewer = { kind: 'seller'; userId: string } | { kind: 'staff' }

export interface Author {
  userId: string
  name: string
}

type ProspectJoin = {
  prospect: PlatformProspectRow
  sellerName: string | null
  planName: string | null
  proposalCode: string | null
  proposalStatus: (typeof platformOnboardingProposals.$inferSelect)['status'] | null
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)

export function toProspect(row: ProspectJoin): Prospect {
  const p = row.prospect
  return {
    id: p.id,
    sellerUserId: p.sellerUserId,
    sellerName: row.sellerName,
    name: p.name,
    cnpj: p.cnpj,
    contactName: p.contactName,
    email: p.email,
    phone: p.phone,
    city: p.city,
    state: p.state,
    estimatedLives: p.estimatedLives,
    interestPlanId: p.interestPlanId,
    interestPlanName: row.planName,
    estimatedValue: p.estimatedValue === null ? null : Number(p.estimatedValue),
    origin: p.origin,
    stage: p.stage,
    lostReason: p.lostReason,
    nextAction: p.nextAction,
    nextActionAt: p.nextActionAt,
    proposal:
      p.proposalId && row.proposalCode && row.proposalStatus
        ? { id: p.proposalId, code: row.proposalCode, status: row.proposalStatus }
        : null,
    stageChangedAt: p.stageChangedAt.toISOString(),
    wonAt: iso(p.wonAt),
    lostAt: iso(p.lostAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export function toInteraction(row: PlatformProspectInteractionRow): ProspectInteraction {
  return {
    id: row.id,
    prospectId: row.prospectId,
    kind: row.kind,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  }
}

export function prospectSelect() {
  return db
    .select({
      prospect: platformProspects,
      sellerName: user.name,
      planName: tenantPlans.name,
      proposalCode: platformOnboardingProposals.code,
      proposalStatus: platformOnboardingProposals.status,
    })
    .from(platformProspects)
    .leftJoin(user, eq(user.id, platformProspects.sellerUserId))
    .leftJoin(tenantPlans, eq(tenantPlans.id, platformProspects.interestPlanId))
    .leftJoin(platformOnboardingProposals, eq(platformOnboardingProposals.id, platformProspects.proposalId))
}

function viewerFilter(viewer: Viewer): SQL | undefined {
  return viewer.kind === 'seller' ? eq(platformProspects.sellerUserId, viewer.userId) : undefined
}

export async function listProspects(query: ListProspectsQuery, viewer: Viewer): Promise<{ items: Prospect[]; total: number }> {
  const filters: SQL[] = []
  const own = viewerFilter(viewer)
  if (own) filters.push(own)
  // Na visão do vendedor o filtro por vendedor é ignorado (a sessão manda).
  if (viewer.kind === 'staff' && query.sellerUserId) filters.push(eq(platformProspects.sellerUserId, query.sellerUserId))
  if (query.stage) filters.push(eq(platformProspects.stage, query.stage))
  if (query.status === 'open') filters.push(inArray(platformProspects.stage, [...OPEN_PROSPECT_STAGES]))
  if (query.status === 'closed') filters.push(notInArray(platformProspects.stage, [...OPEN_PROSPECT_STAGES]))
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, m => `\\${m}`)}%`
    const digits = query.q.replace(/\D/g, '')
    const match = or(
      ilike(platformProspects.name, term),
      ilike(platformProspects.contactName, term),
      ilike(platformProspects.email, term),
      ilike(platformProspects.city, term),
      ...(digits.length >= 3 ? [ilike(platformProspects.cnpj, `%${digits}%`)] : []),
    )
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const [rows, [total]] = await Promise.all([
    prospectSelect()
      .where(where)
      .orderBy(desc(platformProspects.updatedAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(platformProspects).where(where),
  ])
  return { items: rows.map(toProspect), total: total?.value ?? 0 }
}

/** Prospect visível para quem pede — de outro vendedor = 404. */
export async function loadProspect(id: string, viewer: Viewer): Promise<ProspectJoin> {
  const own = viewerFilter(viewer)
  const [row] = await prospectSelect()
    .where(and(eq(platformProspects.id, id), ...(own ? [own] : [])))
    .limit(1)
  if (!row) throw AppError.notFound('Prospect')
  return row
}

export async function getProspectDetail(id: string, viewer: Viewer): Promise<ProspectDetail> {
  const row = await loadProspect(id, viewer)
  const interactions = await db
    .select()
    .from(platformProspectInteractions)
    .where(eq(platformProspectInteractions.prospectId, id))
    .orderBy(desc(platformProspectInteractions.occurredAt), desc(platformProspectInteractions.createdAt))
  return { ...toProspect(row), interactions: interactions.map(toInteraction) }
}

async function assertPlanExists(planId: string | null | undefined): Promise<void> {
  if (!planId) return
  const [plan] = await db.select({ id: tenantPlans.id }).from(tenantPlans).where(eq(tenantPlans.id, planId)).limit(1)
  if (!plan) throw AppError.validation([{ path: 'interestPlanId', message: 'Plano não encontrado' }])
}

function columnsOf(input: Omit<Partial<CreateProspectInput>, 'stage'> & Omit<Partial<UpdateProspectInput>, 'stage'>) {
  const set: Partial<typeof platformProspects.$inferInsert> = {}
  if (input.name !== undefined) set.name = input.name
  if (input.cnpj !== undefined) set.cnpj = input.cnpj
  if (input.contactName !== undefined) set.contactName = input.contactName
  if (input.email !== undefined) set.email = input.email
  if (input.phone !== undefined) set.phone = input.phone
  if (input.city !== undefined) set.city = input.city
  if (input.state !== undefined) set.state = input.state
  if (input.estimatedLives !== undefined) set.estimatedLives = input.estimatedLives
  if (input.interestPlanId !== undefined) set.interestPlanId = input.interestPlanId
  if (input.estimatedValue !== undefined) set.estimatedValue = input.estimatedValue === null ? null : String(input.estimatedValue)
  if (input.origin !== undefined) set.origin = input.origin
  if (input.nextAction !== undefined) set.nextAction = input.nextAction
  if (input.nextActionAt !== undefined) set.nextActionAt = input.nextActionAt
  return set
}

export async function createProspect(input: CreateProspectInput, seller: Author): Promise<ProspectDetail> {
  await assertPlanExists(input.interestPlanId)
  const now = new Date()
  const [row] = await db
    .insert(platformProspects)
    .values({
      ...columnsOf(input),
      name: input.name,
      sellerUserId: seller.userId,
      stage: input.stage ?? 'novo',
      stageChangedAt: now,
    })
    .returning({ id: platformProspects.id })
  if (!row) throw new Error('Falha ao gravar o prospect')
  await db.insert(platformProspectInteractions).values({
    prospectId: row.id,
    kind: 'sistema',
    description: `Prospect cadastrado por ${seller.name} (${PROSPECT_STAGE_LABELS[input.stage ?? 'novo']}).`,
    occurredAt: now,
    authorUserId: seller.userId,
    authorName: seller.name,
  })
  return getProspectDetail(row.id, { kind: 'seller', userId: seller.userId })
}

export async function updateProspect(
  id: string,
  input: UpdateProspectInput,
  seller: Author,
): Promise<{ before: Prospect; after: ProspectDetail }> {
  const viewer: Viewer = { kind: 'seller', userId: seller.userId }
  const current = await loadProspect(id, viewer)
  await assertPlanExists(input.interestPlanId)
  const now = new Date()
  const set = columnsOf(input)
  const stage = input.stage
  if (stage && stage !== current.prospect.stage) {
    set.stage = stage
    set.stageChangedAt = now
    if (stage === 'ganho') set.wonAt = now
    if (stage === 'perdido') {
      set.lostAt = now
      set.lostReason = input.lostReason ?? current.prospect.lostReason
    } else {
      set.lostAt = null
      set.lostReason = null
    }
  } else if (input.lostReason !== undefined && current.prospect.stage === 'perdido') {
    set.lostReason = input.lostReason
  }
  await db
    .update(platformProspects)
    .set({ ...set, updatedAt: now })
    .where(and(eq(platformProspects.id, id), eq(platformProspects.sellerUserId, seller.userId)))
  if (set.stage) {
    await db.insert(platformProspectInteractions).values({
      prospectId: id,
      kind: 'sistema',
      description: `Etapa: ${PROSPECT_STAGE_LABELS[current.prospect.stage]} → ${PROSPECT_STAGE_LABELS[set.stage]}${
        set.stage === 'perdido' && set.lostReason ? ` (motivo: ${set.lostReason})` : ''
      }.`,
      occurredAt: now,
      authorUserId: seller.userId,
      authorName: seller.name,
    })
  }
  return { before: toProspect(current), after: await getProspectDetail(id, viewer) }
}

export async function addInteraction(id: string, input: CreateProspectInteractionInput, seller: Author): Promise<ProspectDetail> {
  const viewer: Viewer = { kind: 'seller', userId: seller.userId }
  await loadProspect(id, viewer)
  const now = new Date()
  await db.insert(platformProspectInteractions).values({
    prospectId: id,
    kind: input.kind,
    description: input.description,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : now,
    authorUserId: seller.userId,
    authorName: seller.name,
  })
  await db.update(platformProspects).set({ updatedAt: now }).where(eq(platformProspects.id, id))
  return getProspectDetail(id, viewer)
}

/**
 * Reatribuição (superadmin): o prospect E a proposta vinculada ainda em
 * andamento passam ao novo vendedor (a comissão segue a proposta). Proposta já
 * ganha/encerrada mantém quem vendeu.
 */
export async function reassignProspect(
  id: string,
  input: ReassignProspectInput,
  actor: Author,
): Promise<{ detail: ProspectDetail; fromUserId: string; proposalMoved: boolean }> {
  const current = await loadProspect(id, { kind: 'staff' })
  if (current.prospect.sellerUserId === input.sellerUserId) {
    throw AppError.businessRule('O prospect já é deste vendedor')
  }
  const target = await findActiveSellerById(input.sellerUserId)
  if (!target) throw AppError.validation([{ path: 'sellerUserId', message: 'Vendedor inexistente ou inativo' }])
  const now = new Date()
  const fromName = current.sellerName ?? 'vendedor anterior'
  let proposalMoved = false
  await db.transaction(async tx => {
    await tx.update(platformProspects).set({ sellerUserId: target.userId, updatedAt: now }).where(eq(platformProspects.id, id))
    if (current.prospect.proposalId) {
      const moved = await tx
        .update(platformOnboardingProposals)
        .set({ sellerUserId: target.userId, referralCode: target.referralCode, updatedAt: now })
        .where(
          and(
            eq(platformOnboardingProposals.id, current.prospect.proposalId),
            inArray(platformOnboardingProposals.status, [...OPEN_PROPOSAL_STATUSES]),
          ),
        )
        .returning({ id: platformOnboardingProposals.id })
      proposalMoved = moved.length > 0
    }
    await tx.insert(platformProspectInteractions).values({
      prospectId: id,
      kind: 'sistema',
      description: `Reatribuído de ${fromName} para ${target.name} por ${actor.name}${input.reason ? ` — ${input.reason}` : ''}${
        proposalMoved ? ' (a proposta em andamento também)' : ''
      }.`,
      occurredAt: now,
      authorUserId: actor.userId,
      authorName: actor.name,
    })
  })
  return { detail: await getProspectDetail(id, { kind: 'staff' }), fromUserId: current.prospect.sellerUserId, proposalMoved }
}

/** Prospects do vendedor com próxima ação até `untilDate` (inclusive atrasadas). */
export async function upcomingActions(sellerUserId: string, untilDate: string, limit = 10): Promise<Prospect[]> {
  const rows = await prospectSelect()
    .where(
      and(
        eq(platformProspects.sellerUserId, sellerUserId),
        inArray(platformProspects.stage, [...OPEN_PROSPECT_STAGES]),
        sql`${platformProspects.nextActionAt} is not null and ${platformProspects.nextActionAt} <= ${untilDate}`,
      ),
    )
    .orderBy(platformProspects.nextActionAt)
    .limit(limit)
  return rows.map(toProspect)
}
