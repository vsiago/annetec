import {
  blockingPrecheckFailures,
  COMPLIANCE_CHECKLIST_LABELS,
  complianceChecklistItem,
  isComplianceChecklistComplete,
  isReservedSlug,
  KYB_DOCUMENT_KIND_LABELS,
  normalizePersonName,
  ONBOARDING_EDITABLE_STATUSES,
  ONBOARDING_FINAL_STATUSES,
  ONBOARDING_SECTION_LABELS,
  PLATFORM_DPA,
  PLATFORM_TERMS,
  PRECHECK_LABELS,
  slug as slugSchema,
  suggestSlug,
  type ComplianceChecklist,
  type ContractAcceptance,
  type KybChecklistRow,
  type OnboardingCompletenessItem,
  type OnboardingStatus,
  type PendingRequestItem,
  type PrecheckResult,
} from '@annetec/contracts'

/**
 * Regras PURAS da proposta (máquina de estados, completude, bloqueios da
 * aprovação, expiração, protocolo, slugs) — blueprint da plataforma §0.2/§0.6.
 * Sem banco: os serviços carregam os dados e decidem com estas funções.
 */

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/** Estados que ainda "seguram" CNPJ e slug (índices únicos parciais). */
export const OPEN_STATUSES: OnboardingStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
  'provisioning',
]
/** Candidato ou console podem cancelar (provisionamento em curso não). */
export const CANCELABLE_STATUSES: OnboardingStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
]
/** Compliance revisa documentos, checklist e assume. */
export const REVIEW_STATUSES: OnboardingStatus[] = ['submitted', 'in_review', 'pending_info']
/** Aprovar e pedir pendência. */
export const DECISION_STATUSES: OnboardingStatus[] = ['submitted', 'in_review']
export const REJECTABLE_STATUSES: OnboardingStatus[] = ['submitted', 'in_review', 'pending_info']
/** Isenção da ativação pelo superadmin. */
export const WAIVABLE_STATUSES: OnboardingStatus[] = ['approved', 'awaiting_payment']
/** `onActivationPaid`: de onde o pagamento leva ao provisionamento. */
export const PAYABLE_STATUSES: OnboardingStatus[] = ['approved', 'awaiting_payment']

export function isEditableStatus(status: OnboardingStatus): boolean {
  return ONBOARDING_EDITABLE_STATUSES.includes(status)
}

export function isFinalStatus(status: OnboardingStatus): boolean {
  return ONBOARDING_FINAL_STATUSES.includes(status)
}

/** Reenvio após pendência: volta para quem já analisava, senão para a fila. */
export function resubmitTarget(current: OnboardingStatus, assignedToUserId: string | null): 'submitted' | 'in_review' {
  if (current === 'pending_info' && assignedToUserId) return 'in_review'
  return 'submitted'
}

// ---------------------------------------------------------------------------
// Protocolo
// ---------------------------------------------------------------------------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** `ANN-AAMM-XXXXX` (ano/mês em São Paulo + 5 caracteres base32 Crockford). */
export function generateProposalCode(now: Date, random: (size: number) => Uint8Array): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value ?? '00'
  const month = parts.find(p => p.type === 'month')?.value ?? '00'
  const suffix = Array.from(random(5), byte => CROCKFORD[byte % 32]).join('')
  return `ANN-${year}${month}-${suffix}`
}

// ---------------------------------------------------------------------------
// Completude (o que falta para enviar)
// ---------------------------------------------------------------------------

export interface CompletenessInput {
  planId: string | null
  expectedLives: number
  hasCompany: boolean
  people: { id: string; isLegalRepresentative: boolean }[]
  requirements: Pick<KybChecklistRow, 'required' | 'state' | 'label'>[]
  brand: { slug: string } | null
  /** O slug da marca virou inquilino (ou reservado) depois de salvo. */
  brandSlugTaken: boolean
  contract: Pick<ContractAcceptance, 'termsVersion' | 'dpaVersion' | 'signerPersonId'> | null
  paymentMethod: string | null
}

export function computeCompleteness(input: CompletenessInput): OnboardingCompletenessItem[] {
  const item = (section: OnboardingCompletenessItem['section'], missing: string[]): OnboardingCompletenessItem => ({
    section,
    complete: missing.length === 0,
    missing,
  })

  const plan: string[] = []
  if (!input.planId) plan.push('Escolha o plano')
  if (!(input.expectedLives >= 1)) plan.push('Informe a quantidade estimada de vidas')

  const company = input.hasCompany ? [] : ['Preencha os dados cadastrais da instituição']

  const representatives = input.people.filter(p => p.isLegalRepresentative)
  const people = representatives.length > 0 ? [] : ['Cadastre ao menos um representante legal']

  const documents: string[] = []
  for (const req of input.requirements) {
    if (!req.required) continue
    if (req.state === 'missing') documents.push(`Envie: ${req.label}`)
    else if (req.state === 'rejected') documents.push(`Reenvie (recusado): ${req.label}`)
  }

  const brand: string[] = []
  if (!input.brand) brand.push('Defina a marca, o endereço do site e o administrador do painel')
  else if (input.brandSlugTaken) brand.push(`O endereço "${input.brand.slug}" não está mais disponível: escolha outro`)

  const contract: string[] = []
  if (!input.contract) {
    contract.push('Aceite o termo de contratação e o acordo de tratamento de dados')
  } else if (input.contract.termsVersion !== PLATFORM_TERMS.version || input.contract.dpaVersion !== PLATFORM_DPA.version) {
    contract.push('Os termos foram atualizados: aceite a versão vigente')
  } else if (!representatives.some(p => p.id === input.contract!.signerPersonId)) {
    contract.push('Quem aceitou o contrato não é mais representante legal: aceite novamente')
  }

  const payment = input.paymentMethod ? [] : ['Escolha a forma de pagamento']

  return [
    item('plan', plan),
    item('company', company),
    item('people', people),
    item('documents', documents),
    item('brand', brand),
    item('contract', contract),
    item('payment', payment),
  ]
}

export function isComplete(items: OnboardingCompletenessItem[]): boolean {
  return items.every(i => i.complete)
}

/** Pendências de completude como issues (`path` = seção). */
export function completenessIssues(items: OnboardingCompletenessItem[]): { path: string; message: string }[] {
  return items.flatMap(i => i.missing.map(message => ({ path: i.section, message })))
}

// ---------------------------------------------------------------------------
// Aprovação
// ---------------------------------------------------------------------------

export interface ApprovalInput {
  prechecks: Pick<PrecheckResult, 'code' | 'outcome' | 'message'>[]
  checklist: ComplianceChecklist
  hasPep: boolean
  requirements: Pick<KybChecklistRow, 'required' | 'state' | 'label'>[]
}

/** O que impede aprovar sem ressalva (vazio = pode aprovar). */
export function approvalBlockers(input: ApprovalInput): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  if (input.prechecks.length === 0) {
    issues.push({ path: 'prechecks', message: 'As pré-checagens ainda não foram executadas' })
  }
  for (const failure of blockingPrecheckFailures(input.prechecks)) {
    issues.push({ path: 'prechecks', message: `${PRECHECK_LABELS[failure.code]}: ${failure.message}` })
  }
  if (!isComplianceChecklistComplete(input.checklist, input.hasPep)) {
    const pending = complianceChecklistItem.options
      .filter(item => !(item === 'pep_due_diligence' && !input.hasPep))
      .filter(item => input.checklist[item]?.checked !== true)
      .map(item => COMPLIANCE_CHECKLIST_LABELS[item])
    issues.push({ path: 'checklist', message: `Checklist de compliance incompleto: ${pending.join('; ')}` })
  }
  const notApproved = input.requirements.filter(r => r.required && r.state !== 'approved').map(r => r.label)
  if (notApproved.length > 0) {
    issues.push({ path: 'documents', message: `Documentos obrigatórios sem aprovação: ${notApproved.join('; ')}` })
  }
  return issues
}

/** Checklist com os 8 itens (os não marcados vêm zerados). */
export function fullChecklist(checklist: ComplianceChecklist | null | undefined): ComplianceChecklist {
  const out: ComplianceChecklist = {}
  for (const item of complianceChecklistItem.options) {
    out[item] = checklist?.[item] ?? { checked: false, note: null, checkedBy: null, checkedAt: null }
  }
  return out
}

// ---------------------------------------------------------------------------
// Expiração (automação)
// ---------------------------------------------------------------------------

export function expiryDecision(
  proposal: { status: OnboardingStatus; lastActivityAt: Date; approvedAt: Date | null },
  now: Date,
  policy: { draftExpiryDays: number; activationExpiryDays: number },
): 'draft' | 'activation' | null {
  const day = 86_400_000
  if (proposal.status === 'draft' && now.getTime() - proposal.lastActivityAt.getTime() > policy.draftExpiryDays * day) {
    return 'draft'
  }
  if (proposal.status === 'awaiting_payment') {
    const since = proposal.approvedAt ?? proposal.lastActivityAt
    if (now.getTime() - since.getTime() > policy.activationExpiryDays * day) return 'activation'
  }
  return null
}

// ---------------------------------------------------------------------------
// Contrato, pessoas, pendências, slugs
// ---------------------------------------------------------------------------

/** O nome digitado no aceite confere com o do representante? */
export function signerNameMatches(typed: string, registered: string): boolean {
  return normalizePersonName(typed) === normalizePersonName(registered)
}

/** Linha legível de um item de pendência (e-mail e timeline). */
export function describePendingItem(item: PendingRequestItem, personName?: string | null): string {
  const parts: string[] = [ONBOARDING_SECTION_LABELS[item.section]]
  if (item.documentKind) parts.push(KYB_DOCUMENT_KIND_LABELS[item.documentKind])
  if (personName) parts.push(personName)
  return `${parts.join(' — ')}: ${item.note}`
}

export type SlugCheck = 'invalid' | 'reserved' | 'ok'

export function checkSlugFormat(value: string): SlugCheck {
  const parsed = slugSchema.safeParse(value)
  if (!parsed.success) return 'invalid'
  return isReservedSlug(parsed.data) ? 'reserved' : 'ok'
}

/** Candidatos de sugestão a partir de um slug ou nome (válidos e não reservados). */
export function slugCandidates(input: string): string[] {
  const base = (suggestSlug(input) || 'meu-clube').slice(0, 28).replace(/-+$/g, '') || 'meu-clube'
  const raw = [
    base,
    `${base}-clube`,
    `clube-${base}`,
    `${base}-beneficios`,
    `${base}-vantagens`,
    `${base}-2`,
    `${base}-3`,
    `${base}-${new Date().getFullYear() % 100}`,
  ]
  return [...new Set(raw)].filter(candidate => checkSlugFormat(candidate) === 'ok')
}
