import {
  isComplianceChecklistComplete,
  kybChecklist,
  kybRequirementsFor,
  maskCpfPartially,
  quotePlatformPlan,
  type ContractAcceptance,
  type KybChecklistRow,
  type KybDocument,
  type OnboardingApplicantView,
  type OnboardingCompletenessItem,
  type OnboardingEvent,
  type OnboardingPerson,
  type OnboardingProposalDetail,
  type PlatformCharge,
  type PlatformEmailListItem,
  type PlatformPlanOffer,
  type ProposalDiscount,
  type ProposalDiscountRecord,
  type ProposalSellerRef,
} from '@annetec/contracts'
import { platformDemoToolsEnabled, webBaseUrl } from '@/config/env'
import { publicFileUrl } from '@/lib/storage/files'
import { canSimulatePlatformCharge } from '@/modules/platform-billing/charges.service'
import type { DocumentWithFile, EventRow, PersonRow, ProposalBundle } from './repository'
import { computeCompleteness, fullChecklist, isComplete, isEditableStatus } from './rules'

/**
 * Proposta → contratos da API. Duas visões:
 *  - candidato (`OnboardingApplicantView`): CPF mascarado, só eventos públicos,
 *    nome de analista trocado por "Equipe ANNETEC";
 *  - console (`OnboardingProposalDetail`): tudo, inclusive pré-checagens,
 *    checklist, eventos internos e e-mails.
 */

export interface ViewContext {
  offer: PlatformPlanOffer | null
  activationCharge: PlatformCharge | null
}

/** Parte pública do desconto aprovado (sem quem aprovou). */
export function publicDiscount(record: ProposalDiscountRecord | null | undefined): ProposalDiscount | null {
  if (!record) return null
  return {
    setupFeePercent: Number(record.setupFeePercent) || 0,
    monthlyPercent: Number(record.monthlyPercent) || 0,
    monthlyMonths: record.monthlyMonths ?? null,
  }
}

const STAFF_LABEL = 'Equipe ANNETEC'

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)

export function siteUrlOf(slug: string): string {
  return `${webBaseUrl}/${slug}`
}

export function loginUrl(): string {
  return `${webBaseUrl}/login`
}

/** Documentos que contam (arquivo não excluído). */
function liveDocuments(documents: DocumentWithFile[]): DocumentWithFile[] {
  return documents.filter(d => !d.file.deletedAt)
}

export function requirementRows(bundle: Pick<ProposalBundle, 'proposal' | 'people' | 'documents'>): KybChecklistRow[] {
  const requirements = kybRequirementsFor(
    bundle.proposal.legalForm,
    bundle.people.map(p => ({
      id: p.id,
      name: p.name,
      isLegalRepresentative: p.isLegalRepresentative,
      actsByPowerOfAttorney: p.actsByPowerOfAttorney,
    })),
  )
  return kybChecklist(
    requirements,
    liveDocuments(bundle.documents).map(d => ({
      id: d.id,
      kind: d.kind,
      personId: d.personId,
      status: d.status,
      uploadedAt: d.createdAt.toISOString(),
    })),
  )
}

export function completenessOf(bundle: ProposalBundle, requirements = requirementRows(bundle)): OnboardingCompletenessItem[] {
  const { proposal } = bundle
  return computeCompleteness({
    planId: proposal.planId,
    expectedLives: proposal.expectedLives,
    hasCompany: Boolean(proposal.company),
    people: bundle.people,
    requirements,
    brand: proposal.brand ? { slug: proposal.brand.slug } : null,
    brandSlugTaken: bundle.brandSlugTaken,
    contract: proposal.contractAcceptance,
    paymentMethod: proposal.paymentMethod,
  })
}

function toPerson(row: PersonRow, masked: boolean): OnboardingPerson {
  return {
    id: row.id,
    name: row.name,
    cpf: masked ? maskCpfPartially(row.cpf) : row.cpf,
    birthDate: row.birthDate,
    email: row.email,
    phone: row.phone,
    position: row.position,
    positionOther: row.positionOther,
    isLegalRepresentative: row.isLegalRepresentative,
    isPartner: row.isPartner,
    isBeneficialOwner: row.isBeneficialOwner,
    ownershipPercent: row.ownershipPercent === null ? null : Number(row.ownershipPercent),
    actsByPowerOfAttorney: row.actsByPowerOfAttorney,
    isPep: row.isPep,
    pepRole: row.pepRole,
    pepRelationship: row.pepRelationship,
    qsaMatch: row.qsaMatch,
  }
}

function toDocument(row: DocumentWithFile, people: Map<string, string>): KybDocument {
  return {
    id: row.id,
    kind: row.kind,
    personId: row.personId,
    personName: row.personId ? (people.get(row.personId) ?? null) : null,
    status: row.status,
    fileName: row.file.fileName,
    mimeType: row.file.mimeType,
    sizeBytes: row.file.sizeBytes,
    reviewNote: row.reviewNote,
    reviewedAt: iso(row.reviewedAt),
    uploadedAt: row.createdAt.toISOString(),
  }
}

function toEvent(row: EventRow, forApplicant: boolean): OnboardingEvent {
  return {
    id: row.id,
    type: row.type,
    visibility: row.visibility,
    message: row.message,
    actorName: forApplicant ? (row.actorUserId ? STAFF_LABEL : null) : row.actorName,
    createdAt: row.createdAt.toISOString(),
  }
}

function toContract(acceptance: ContractAcceptance | null, masked: boolean): ContractAcceptance | null {
  if (!acceptance) return null
  return masked ? { ...acceptance, signerCpf: maskCpfPartially(acceptance.signerCpf) } : { ...acceptance }
}

/** Mesma regra da fatura pública (`canSimulatePlatformCharge`): nunca em produção. */
function canSimulate(charge: PlatformCharge | null): boolean {
  return charge ? canSimulatePlatformCharge(charge) : false
}

function buildView(bundle: ProposalBundle, ctx: ViewContext, forApplicant: boolean): OnboardingApplicantView {
  const { proposal } = bundle
  const peopleNames = new Map(bundle.people.map(p => [p.id, p.name]))
  const requirements = requirementRows(bundle)
  const completeness = completenessOf(bundle, requirements)
  const canEdit = isEditableStatus(proposal.status)
  const brand = proposal.brand
  const documents = liveDocuments(bundle.documents).filter(d => !forApplicant || d.status !== 'replaced')
  const discount = publicDiscount(proposal.discount)

  return {
    id: proposal.id,
    code: proposal.code,
    status: proposal.status,
    contractorType: proposal.contractorType,
    legalForm: proposal.legalForm,
    cnpj: proposal.cnpj,
    applicant: proposal.applicant,
    plan: {
      planId: proposal.planId,
      expectedLives: proposal.expectedLives,
      offer: ctx.offer,
      quote: ctx.offer ? quotePlatformPlan(ctx.offer, ctx.offer.pricing, proposal.expectedLives, { discount }) : null,
      discount,
    },
    paymentMethod: proposal.paymentMethod,
    company: proposal.company,
    receita: proposal.receitaSnapshot,
    people: bundle.people.map(p => toPerson(p, forApplicant)),
    documents: documents.map(d => toDocument(d, peopleNames)),
    requirements,
    brand: brand
      ? {
          ...brand,
          logoFileId: brand.logoFileId ?? null,
          logoUrl: brand.logoFileId ? publicFileUrl(brand.logoFileId) : null,
          siteUrl: siteUrlOf(brand.slug),
        }
      : null,
    contract: toContract(proposal.contractAcceptance, forApplicant),
    completeness,
    canEdit,
    canSubmit: canEdit && isComplete(completeness),
    pendingRequest: proposal.pendingRequest,
    rejectionReason: proposal.rejectionReason,
    activationCharge: ctx.activationCharge,
    canSimulatePayment: canSimulate(ctx.activationCharge),
    demoToolsEnabled: platformDemoToolsEnabled,
    tenant:
      proposal.status === 'active' && bundle.organization
        ? {
            organizationId: bundle.organization.id,
            slug: bundle.organization.slug,
            name: bundle.organization.name,
            siteUrl: siteUrlOf(bundle.organization.slug),
            loginUrl: loginUrl(),
          }
        : null,
    events: bundle.events.filter(e => !forApplicant || e.visibility === 'public').map(e => toEvent(e, forApplicant)),
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    submittedAt: iso(proposal.submittedAt),
  }
}

export function toApplicantView(bundle: ProposalBundle, ctx: ViewContext): OnboardingApplicantView {
  return buildView(bundle, ctx, true)
}

export function toProposalDetail(
  bundle: ProposalBundle,
  ctx: ViewContext & { emails: PlatformEmailListItem[]; seller?: ProposalSellerRef | null; discountPending?: boolean },
): OnboardingProposalDetail {
  const { proposal } = bundle
  const base = buildView(bundle, ctx, false)
  const checklist = fullChecklist(proposal.checklist)
  const hasDecision = Boolean(proposal.decidedAt || proposal.decisionNote || proposal.overrideReason)
  return {
    ...base,
    prechecks: proposal.prechecks ?? [],
    precheckSummary: proposal.precheckSummary,
    precheckRanAt: iso(proposal.precheckRanAt),
    hasPep: proposal.hasPep,
    checklist,
    checklistComplete: isComplianceChecklistComplete(checklist, proposal.hasPep),
    assignedTo:
      proposal.assignedToUserId && proposal.assignedToName
        ? { userId: proposal.assignedToUserId, name: proposal.assignedToName }
        : null,
    decision: hasDecision
      ? {
          note: proposal.decisionNote,
          overrideReason: proposal.overrideReason,
          decidedBy: proposal.decidedByName,
          decidedAt: iso(proposal.decidedAt),
        }
      : null,
    provisioning: {
      attempts: proposal.provisioningAttempts,
      error: proposal.provisioningError,
      provisionedAt: iso(proposal.provisionedAt),
      activationWaived: proposal.activationWaived,
    },
    source: proposal.source,
    applicantIp: proposal.applicantIp,
    emails: ctx.emails,
    seller: ctx.seller ?? null,
    discountPending: ctx.discountPending ?? false,
  }
}
