import {
  COMPLIANCE_CHECKLIST_LABELS,
  ERROR_CODES,
  formatBRL,
  formatDateBR,
  KYB_DOCUMENT_KIND_LABELS,
  ONBOARDING_REVIEW_SLA_HOURS,
  ONBOARDING_STATUS_LABELS,
  onboardingStatus,
  type ApproveOnboardingInput,
  type ComplianceChecklist,
  type ListOnboardingProposalsQuery,
  type OnboardingNoteInput,
  type OnboardingProposalDetail,
  type OnboardingProposalListItem,
  type OnboardingQueueSummary,
  type OnboardingStatus,
  type OnboardingStatusGroup,
  type RejectOnboardingInput,
  type RequestOnboardingInfoInput,
  type ReviewKybDocumentInput,
  type UpdateComplianceChecklistInput,
} from '@annetec/contracts'
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  platformFiles,
  platformOnboardingDocuments,
  platformOnboardingPeople,
  platformOnboardingProposals,
  tenantPlans,
  user,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { listProposalEmails } from '@/lib/email/outbox'
import { logger } from '@/lib/logger'
import { createActivationCharge } from '@/modules/platform-billing/activation'
import { hasPendingDiscount } from '@/modules/platform-sales/prospect-sync'
import { notifyApplicant } from './notify'
import { findPlanOffer } from './plans'
import { runPrechecks } from './prechecks.service'
import { requirementRows, toProposalDetail } from './presenter'
import {
  getProposal,
  insertEvent,
  loadBundle,
  transitionProposal,
  type Actor,
  type DocumentWithFile,
  type PersonRow,
  type ProposalRow,
} from './repository'
import { approvalBlockers, DECISION_STATUSES, describePendingItem, REJECTABLE_STATUSES, REVIEW_STATUSES } from './rules'
import { activationChargeOf, proposalNotFound } from './service'

/**
 * Console de compliance da plataforma (`/api/v1/platform/onboarding`) —
 * fila, detalhe, pré-checagens, checklist, documentos, pendências e decisões
 * (blueprint da plataforma §0.3/§0.6).
 */

const GROUP_STATUSES: Record<Exclude<OnboardingStatusGroup, 'all'>, OnboardingStatus[]> = {
  queue: ['submitted', 'in_review'],
  awaiting_applicant: ['draft', 'pending_info'],
  awaiting_payment: ['approved', 'awaiting_payment', 'provisioning'],
  done: ['active', 'rejected', 'canceled'],
}
const QUEUE = GROUP_STATUSES.queue
const SLA_MS = ONBOARDING_REVIEW_SLA_HOURS * 3_600_000

function stateChanged(): AppError {
  return AppError.conflict('A proposta mudou de estado enquanto a ação era feita. Recarregue e tente de novo.')
}

function statusError(proposal: ProposalRow, action: string): AppError {
  return AppError.businessRule(`Não é possível ${action} com a proposta "${ONBOARDING_STATUS_LABELS[proposal.status]}".`)
}

async function requireProposal(id: string): Promise<ProposalRow> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  return proposal
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Vendedor atribuído à proposta (nome atual da conta). */
async function sellerRefOf(proposal: Pick<ProposalRow, 'sellerUserId' | 'referralCode'>) {
  if (!proposal.sellerUserId) return null
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, proposal.sellerUserId)).limit(1)
  return { userId: proposal.sellerUserId, name: row?.name ?? 'Vendedor removido', referralCode: proposal.referralCode ?? null }
}

export async function getProposalDetail(id: string): Promise<OnboardingProposalDetail> {
  const bundle = await loadBundle(id)
  if (!bundle) throw proposalNotFound()
  const [offer, charge, emails, seller, discountPending] = await Promise.all([
    bundle.proposal.planId ? findPlanOffer(bundle.proposal.planId) : Promise.resolve(null),
    activationChargeOf(bundle.proposal, false),
    listProposalEmails(id),
    sellerRefOf(bundle.proposal),
    bundle.proposal.sellerUserId ? hasPendingDiscount(id) : Promise.resolve(false),
  ])
  return toProposalDetail(bundle, { offer, activationCharge: charge, emails, seller, discountPending })
}

export async function listProposals(
  query: ListOnboardingProposalsQuery,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ items: OnboardingProposalListItem[]; total: number }> {
  const t = platformOnboardingProposals
  const filters: SQL[] = []
  if (query.status) filters.push(eq(t.status, query.status))
  if (query.group && query.group !== 'all') filters.push(inArray(t.status, GROUP_STATUSES[query.group]))
  if (query.precheck) filters.push(eq(t.precheckSummary, query.precheck))
  if (query.assigned === 'me') filters.push(eq(t.assignedToUserId, actor.userId))
  if (query.assigned === 'unassigned') filters.push(isNull(t.assignedToUserId))
  if (query.contractorType) filters.push(eq(t.contractorType, query.contractorType))
  if (query.sellerUserId) filters.push(eq(t.sellerUserId, query.sellerUserId))
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, m => `\\${m}`)}%`
    const digits = query.q.replace(/\D/g, '')
    const match = or(
      ilike(t.code, term),
      ilike(t.legalName, term),
      ilike(t.tradeName, term),
      ilike(t.slug, term),
      ...(digits.length >= 3 ? [ilike(t.cnpj, `%${digits}%`)] : []),
    )
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const order = query.group === 'queue' ? [asc(t.submittedAt), asc(t.createdAt)] : [desc(t.updatedAt)]

  const [rows, [total]] = await Promise.all([
    db
      .select({ proposal: t, planName: tenantPlans.name, sellerName: user.name })
      .from(t)
      .leftJoin(tenantPlans, eq(tenantPlans.id, t.planId))
      .leftJoin(user, eq(user.id, t.sellerUserId))
      .where(where)
      .orderBy(...order)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(t).where(where),
  ])

  const ids = rows.map(r => r.proposal.id)
  const [people, documents] = ids.length
    ? await Promise.all([
        db.select().from(platformOnboardingPeople).where(inArray(platformOnboardingPeople.proposalId, ids)),
        db
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
          .where(inArray(platformOnboardingDocuments.proposalId, ids)),
      ])
    : [[] as PersonRow[], [] as { document: DocumentWithFile; file: DocumentWithFile['file'] }[]]

  const items = rows.map(({ proposal, planName, sellerName }): OnboardingProposalListItem => {
    const ownPeople = people.filter(p => p.proposalId === proposal.id)
    const ownDocs: DocumentWithFile[] = documents
      .filter(d => d.document.proposalId === proposal.id)
      .map(d => ({ ...d.document, file: d.file }))
    const requirements = requirementRows({ proposal, people: ownPeople, documents: ownDocs })
    const inQueue = QUEUE.includes(proposal.status)
    const slaDue = inQueue && proposal.submittedAt ? new Date(proposal.submittedAt.getTime() + SLA_MS) : null
    return {
      id: proposal.id,
      code: proposal.code,
      status: proposal.status,
      contractorType: proposal.contractorType,
      legalForm: proposal.legalForm,
      cnpj: proposal.cnpj,
      legalName: proposal.legalName,
      tradeName: proposal.tradeName,
      clubName: proposal.brand?.clubName ?? null,
      planName: planName ?? null,
      expectedLives: proposal.expectedLives,
      precheckSummary: proposal.precheckSummary,
      hasPep: proposal.hasPep,
      documentsToReview: ownDocs.filter(d => d.status === 'uploaded' && !d.file.deletedAt).length,
      documentsMissing: requirements.filter(r => r.required && r.state === 'missing').length,
      assignedTo:
        proposal.assignedToUserId && proposal.assignedToName
          ? { userId: proposal.assignedToUserId, name: proposal.assignedToName }
          : null,
      seller: proposal.sellerUserId
        ? { userId: proposal.sellerUserId, name: sellerName ?? 'Vendedor removido', referralCode: proposal.referralCode ?? null }
        : null,
      submittedAt: proposal.submittedAt?.toISOString() ?? null,
      slaDueAt: slaDue?.toISOString() ?? null,
      slaBreached: slaDue ? slaDue.getTime() < now.getTime() : false,
      organizationId: proposal.organizationId,
      updatedAt: proposal.updatedAt.toISOString(),
    }
  })
  return { items, total: total?.value ?? 0 }
}

/** Início do mês corrente em São Paulo (UTC−3, sem horário de verão desde 2019). */
function startOfMonthSP(now: Date): Date {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(now)
  return new Date(`${ym.slice(0, 7)}-01T00:00:00-03:00`)
}

export async function queueSummary(now: Date = new Date()): Promise<OnboardingQueueSummary> {
  const t = platformOnboardingProposals
  const slaLimit = new Date(now.getTime() - SLA_MS)
  const since90 = new Date(now.getTime() - 90 * 86_400_000)
  const [byStatusRows, [unassigned], [breached], [provisioned], [decision]] = await Promise.all([
    db.select({ status: t.status, value: count() }).from(t).groupBy(t.status),
    db.select({ value: count() }).from(t).where(and(inArray(t.status, QUEUE), isNull(t.assignedToUserId))),
    db.select({ value: count() }).from(t).where(and(inArray(t.status, QUEUE), lt(t.submittedAt, slaLimit))),
    db.select({ value: count() }).from(t).where(gte(t.provisionedAt, startOfMonthSP(now))),
    db
      .select({
        hours: sql<string | null>`avg(extract(epoch from (${t.decidedAt} - coalesce(${t.firstSubmittedAt}, ${t.submittedAt}))) / 3600)`,
      })
      .from(t)
      .where(and(isNotNull(t.decidedAt), gte(t.decidedAt, since90), inArray(t.status, ['approved', 'awaiting_payment', 'provisioning', 'active', 'rejected']))),
  ])
  const byStatus = Object.fromEntries(onboardingStatus.options.map(s => [s, 0])) as Record<OnboardingStatus, number>
  for (const row of byStatusRows) byStatus[row.status] = row.value
  const sum = (statuses: OnboardingStatus[]) => statuses.reduce((acc, s) => acc + byStatus[s], 0)
  const hours = decision?.hours === null || decision?.hours === undefined ? null : Number(decision.hours)
  return {
    byStatus,
    queue: sum(QUEUE),
    unassigned: unassigned?.value ?? 0,
    slaBreached: breached?.value ?? 0,
    awaitingApplicant: sum(GROUP_STATUSES.awaiting_applicant),
    awaitingPayment: sum(['approved', 'awaiting_payment']),
    provisionedThisMonth: provisioned?.value ?? 0,
    avgDecisionHours: hours === null || Number.isNaN(hours) ? null : Math.round(hours * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export async function claimProposal(id: string, actor: Actor): Promise<void> {
  const proposal = await requireProposal(id)
  if (!REVIEW_STATUSES.includes(proposal.status)) throw statusError(proposal, 'assumir a análise')
  const now = new Date()
  const patch = { assignedToUserId: actor.userId, assignedToName: actor.name, assignedAt: now, lastActivityAt: now }
  const starting = proposal.status === 'submitted'
  const row = starting
    ? await transitionProposal(db, id, ['submitted'], { ...patch, status: 'in_review' })
    : await transitionProposal(db, id, ['in_review', 'pending_info'], patch)
  if (!row) throw stateChanged()
  await insertEvent(db, {
    proposalId: id,
    type: 'CLAIMED',
    visibility: starting ? 'public' : 'internal',
    message: starting ? 'Análise cadastral iniciada.' : `Análise assumida por ${actor.name}.`,
    actor,
  })
}

export async function rerunPrechecks(id: string, actor: Actor): Promise<void> {
  const proposal = await requireProposal(id)
  if (proposal.status === 'active') throw statusError(proposal, 'rodar as pré-checagens')
  await runPrechecks(id, { actor, trigger: 'manual' })
}

/**
 * Emite a cobrança de ativação (Q2) e leva `approved → awaiting_payment` +
 * e-mail `onboarding_approved`. Falha do gateway: a proposta fica `approved`
 * com nota interna, e o console usa "Emitir cobrança" (`throwOnError`).
 */
export async function issueActivationCharge(id: string, actor: Actor | null, opts: { throwOnError: boolean }): Promise<void> {
  const proposal = await requireProposal(id)
  if (proposal.status === 'awaiting_payment') return
  if (proposal.status !== 'approved') throw statusError(proposal, 'emitir a cobrança de ativação')
  let charge
  try {
    charge = await createActivationCharge(id, { actorUserId: actor?.userId ?? null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error({ proposalId: id, err: error }, 'Falha ao emitir a cobrança de ativação')
    await insertEvent(db, {
      proposalId: id,
      type: 'NOTE_ADDED',
      visibility: 'internal',
      message: `Falha ao emitir a cobrança de ativação: ${message}. Use "Emitir cobrança" para tentar de novo.`,
      actor,
    }).catch(() => {})
    if (opts.throwOnError) {
      throw new AppError(ERROR_CODES.UPSTREAM_ERROR, `Não foi possível emitir a cobrança de ativação: ${message}`, { cause: error })
    }
    return
  }
  const row = await transitionProposal(db, id, ['approved'], { status: 'awaiting_payment', lastActivityAt: new Date() })
  if (!row) return // pago antes da transição (já em provisionamento) ou cancelado
  await insertEvent(db, {
    proposalId: id,
    type: 'ACTIVATION_CHARGE_CREATED',
    visibility: 'public',
    message: `Cobrança de ativação emitida: ${formatBRL(charge.amount)}, vencimento ${formatDateBR(charge.dueDate)}.`,
    data: { chargeId: charge.id, amount: charge.amount, dueDate: charge.dueDate, method: charge.method },
    actor,
  })
  await notifyApplicant(row, 'onboarding_approved', {
    payUrl: charge.publicUrl,
    amount: charge.amount,
    dueDate: charge.dueDate,
  })
}

export async function updateChecklist(id: string, input: UpdateComplianceChecklistInput, actor: Actor): Promise<void> {
  const proposal = await requireProposal(id)
  if (!REVIEW_STATUSES.includes(proposal.status)) throw statusError(proposal, 'alterar o checklist')
  const now = new Date()
  const patch: ComplianceChecklist = {}
  for (const entry of input.items) {
    patch[entry.item] = {
      checked: entry.checked,
      note: entry.note ?? null,
      checkedBy: entry.checked ? actor.name : null,
      checkedAt: entry.checked ? now.toISOString() : null,
    }
  }
  // Merge atômico no jsonb: dois analistas marcando itens diferentes não se sobrescrevem.
  const row = await transitionProposal(db, id, REVIEW_STATUSES, {
    checklist: sql`coalesce(${platformOnboardingProposals.checklist}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` as unknown as ComplianceChecklist,
    lastActivityAt: now,
  })
  if (!row) throw stateChanged()
  const checked = input.items.filter(i => i.checked).map(i => COMPLIANCE_CHECKLIST_LABELS[i.item])
  const unchecked = input.items.filter(i => !i.checked).map(i => COMPLIANCE_CHECKLIST_LABELS[i.item])
  await insertEvent(db, {
    proposalId: id,
    type: 'CHECKLIST_UPDATED',
    visibility: 'internal',
    message: [checked.length ? `Marcado: ${checked.join('; ')}` : '', unchecked.length ? `Desmarcado: ${unchecked.join('; ')}` : '']
      .filter(Boolean)
      .join(' · '),
    actor,
  })
}

export async function reviewDocument(id: string, documentId: string, input: ReviewKybDocumentInput, actor: Actor): Promise<void> {
  const proposal = await requireProposal(id)
  if (!REVIEW_STATUSES.includes(proposal.status)) throw statusError(proposal, 'revisar documentos')
  const now = new Date()
  const [document] = await db
    .update(platformOnboardingDocuments)
    .set({
      status: input.status,
      reviewNote: input.note ?? null,
      reviewedByUserId: actor.userId,
      reviewedByName: actor.name,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(platformOnboardingDocuments.id, documentId),
        eq(platformOnboardingDocuments.proposalId, id),
        ne(platformOnboardingDocuments.status, 'replaced'),
      ),
    )
    .returning()
  if (!document) throw AppError.notFound('Documento')
  await db
    .update(platformOnboardingProposals)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(platformOnboardingProposals.id, id))
  const label = KYB_DOCUMENT_KIND_LABELS[document.kind]
  await insertEvent(db, {
    proposalId: id,
    type: input.status === 'approved' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
    visibility: 'public',
    message: input.status === 'approved' ? `Documento aprovado: ${label}.` : `Documento recusado: ${label} — ${input.note ?? ''}`.trim(),
    data: { documentId, kind: document.kind },
    actor,
  })
}

export async function requestInfo(id: string, input: RequestOnboardingInfoInput, actor: Actor): Promise<void> {
  const bundle = await loadBundle(id)
  if (!bundle) throw proposalNotFound()
  const { proposal } = bundle
  if (!DECISION_STATUSES.includes(proposal.status)) throw statusError(proposal, 'pedir pendência')
  const names = new Map(bundle.people.map(p => [p.id, p.name]))
  const issues = input.items
    .map((item, index) => (item.personId && !names.has(item.personId) ? { path: `items.${index}.personId`, message: 'Pessoa não pertence a esta proposta' } : null))
    .filter((issue): issue is { path: string; message: string } => issue !== null)
  if (issues.length) throw AppError.validation(issues)

  const now = new Date()
  const row = await transitionProposal(db, id, DECISION_STATUSES, {
    status: 'pending_info',
    pendingRequest: { ...input, requestedAt: now.toISOString(), requestedBy: actor.name, resolvedAt: null },
    lastActivityAt: now,
  })
  if (!row) throw stateChanged()
  const lines = input.items.map(item => describePendingItem(item, item.personId ? names.get(item.personId) : null))
  await insertEvent(db, {
    proposalId: id,
    type: 'INFO_REQUESTED',
    visibility: 'public',
    message: `Pendência solicitada: ${input.message}`,
    data: { items: lines },
    actor,
  })
  await notifyApplicant(row, 'onboarding_pending_info', { message: input.message, items: lines })
}

export async function approveProposal(id: string, input: ApproveOnboardingInput, actor: Actor): Promise<void> {
  let proposal = await requireProposal(id)
  if (!DECISION_STATUSES.includes(proposal.status)) throw statusError(proposal, 'aprovar')
  // A aprovação emite a cobrança de ativação: o preço precisa estar decidido.
  if (proposal.sellerUserId && (await hasPendingDiscount(id))) {
    throw AppError.businessRule(
      'Há um pedido de desconto do vendedor aguardando o superadmin. Decida o desconto (Comercial → Descontos) antes de aprovar a proposta.',
    )
  }
  const now = new Date()
  if (!proposal.precheckRanAt || now.getTime() - proposal.precheckRanAt.getTime() > 24 * 3_600_000) {
    proposal = await runPrechecks(id, { actor, trigger: 'approve' })
  }
  const bundle = await loadBundle(id)
  if (!bundle) throw proposalNotFound()
  const blockers = approvalBlockers({
    prechecks: bundle.proposal.prechecks ?? [],
    checklist: bundle.proposal.checklist ?? {},
    hasPep: bundle.proposal.hasPep,
    requirements: requirementRows(bundle),
  })
  if (blockers.length > 0 && !input.override) {
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `A proposta ainda não pode ser aprovada — ${blockers.map(b => b.message).join(' | ')}. Para aprovar mesmo assim, use a aprovação com ressalva e justifique.`,
      { issues: blockers },
    )
  }
  const overrideReason = input.override ? (input.overrideReason ?? null) : null
  const row = await transitionProposal(db, id, DECISION_STATUSES, {
    status: 'approved',
    approvedAt: now,
    decisionNote: input.note ?? null,
    overrideReason,
    decidedByUserId: actor.userId,
    decidedByName: actor.name,
    decidedAt: now,
    lastActivityAt: now,
  })
  if (!row) throw stateChanged()
  await insertEvent(db, {
    proposalId: id,
    type: 'APPROVED',
    visibility: 'public',
    message: 'Proposta aprovada na análise cadastral.',
    actor,
  })
  if (overrideReason) {
    await insertEvent(db, {
      proposalId: id,
      type: 'APPROVED',
      visibility: 'internal',
      message: `Aprovada com ressalva: ${overrideReason}${blockers.length ? ` — pendências no momento: ${blockers.map(b => b.message).join(' | ')}` : ''}`,
      actor,
    })
  }
  await issueActivationCharge(id, actor, { throwOnError: false })
}

export async function rejectProposal(id: string, input: RejectOnboardingInput, actor: Actor): Promise<void> {
  const proposal = await requireProposal(id)
  if (!REJECTABLE_STATUSES.includes(proposal.status)) throw statusError(proposal, 'reprovar')
  const now = new Date()
  const row = await transitionProposal(db, id, REJECTABLE_STATUSES, {
    status: 'rejected',
    rejectionReason: input.reason,
    decidedByUserId: actor.userId,
    decidedByName: actor.name,
    decidedAt: now,
    lastActivityAt: now,
  })
  if (!row) throw stateChanged()
  await insertEvent(db, {
    proposalId: id,
    type: 'REJECTED',
    visibility: 'public',
    message: `Proposta reprovada: ${input.reason}`,
    actor,
  })
  await notifyApplicant(row, 'onboarding_rejected', { reason: input.reason })
}

export async function addNote(id: string, input: OnboardingNoteInput, actor: Actor): Promise<void> {
  await requireProposal(id)
  await insertEvent(db, { proposalId: id, type: 'NOTE_ADDED', visibility: 'internal', message: input.text, actor })
}
