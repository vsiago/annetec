import {
  contractDocumentText,
  DEFAULT_PLATFORM_BILLING_POLICY,
  ERROR_CODES,
  KYB_DOCUMENT_KIND_LABELS,
  KYB_DOCUMENT_REQUIREMENTS,
  KYB_MAX_DOCUMENTS_PER_PROPOSAL,
  onlyDigits,
  ONBOARDING_EDITABLE_STATUSES,
  ONBOARDING_SECTION_LABELS,
  ONBOARDING_STATUS_LABELS,
  PLATFORM_DPA,
  PLATFORM_TERMS,
  type ContractAcceptance,
  type FieldIssue,
  type OnboardingApplicantView,
  type OnboardingBrandInput,
  type OnboardingCompanyInput,
  type OnboardingContractAcceptanceInput,
  type OnboardingEventType,
  type OnboardingPaymentInput,
  type OnboardingPeopleInput,
  type OnboardingPersonInput,
  type OnboardingPlanInput,
  type OnboardingSection,
  type PlatformCharge,
  type SlugAvailability,
  type StartOnboardingInput,
  type StartOnboardingResult,
  type UploadedFile,
  type UploadKybDocumentFields,
} from '@annetec/contracts'
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  platformBillingConfig,
  platformOnboardingDocuments,
  platformOnboardingPeople,
  platformOnboardingProposals,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { lookupCnpj } from '@/integrations/cnpj'
import { BrandImageError, processLogo } from '@/lib/branding/logo-pipeline'
import { logger } from '@/lib/logger'
import { notify, proposalSubmittedNotification } from '@/lib/notifications'
import { checkUpload, discardFile, findFile, publicFileUrl, sanitizeFileName, storeFile } from '@/lib/storage'
import type { PlatformFileRow } from '@/lib/storage/files'
import { cancelActivationCharge, getActivationCharge } from '@/modules/platform-billing/activation'
import { createReferralProspect, resolveReferral } from '@/modules/platform-sales/referral'
import { onboardingAccessKey, onboardingTrackingPath } from './access-key'
import { notifyApplicant } from './notify'
import { findPlanOffer } from './plans'
import { runPrechecks } from './prechecks.service'
import { completenessOf, toApplicantView } from './presenter'
import {
  getProposal,
  insertEvent,
  loadBundle,
  loadPeople,
  openProposalForCnpj,
  cnpjIsTenant,
  slugStatus,
  takenSlugs,
  transitionProposal,
  type Actor,
  type PersonRow,
  type ProposalBundle,
  type ProposalPatch,
  type ProposalRow,
  type SlugStatus,
} from './repository'
import {
  CANCELABLE_STATUSES,
  completenessIssues,
  generateProposalCode,
  isComplete,
  isEditableStatus,
  PAYABLE_STATUSES,
  resubmitTarget,
  signerNameMatches,
  slugCandidates,
} from './rules'

/**
 * Jornada do CANDIDATO (rotas públicas com `?chave=`) — blueprint da
 * plataforma §0.3/§0.6. A chave já foi conferida no controller; aqui só regras.
 */

export interface RequestMeta {
  ip: string | null
  userAgent: string | null
}

/** Status em que a proposta tem (ou teve) cobrança de ativação. */
const CHARGE_STATUSES = ['approved', 'awaiting_payment', 'provisioning', 'active', 'canceled'] as const

// ---------------------------------------------------------------------------
// Erros e utilidades
// ---------------------------------------------------------------------------

export function proposalNotFound() {
  return AppError.notFound('Proposta')
}

async function notEditableError(id: string): Promise<AppError> {
  const proposal = await getProposal(id)
  if (!proposal) return proposalNotFound()
  return AppError.businessRule(
    `A proposta está "${ONBOARDING_STATUS_LABELS[proposal.status]}" e não pode ser alterada agora.`,
  )
}

/** Erro 23505 do Postgres (direto do postgres.js ou embrulhado pelo Drizzle). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause]
  return candidates.some(candidate => {
    const e = candidate as { code?: string; constraint_name?: string; constraint?: string } | null
    if (!e || e.code !== '23505') return false
    return !constraint || e.constraint_name === constraint || e.constraint === constraint
  })
}

function fieldError(path: string, message: string, status?: number): AppError {
  return new AppError(ERROR_CODES.VALIDATION_ERROR, message, { issues: [{ path, message }], status })
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Ativação da proposta (Q2), sem derrubar a tela se o gateway falhar. */
export async function activationChargeOf(proposal: ProposalRow, sync: boolean): Promise<PlatformCharge | null> {
  if (!(CHARGE_STATUSES as readonly string[]).includes(proposal.status)) return null
  try {
    return await getActivationCharge(proposal.id, { sync: sync && PAYABLE_STATUSES.includes(proposal.status) })
  } catch (error) {
    logger.warn({ proposalId: proposal.id, err: error }, 'Não foi possível ler a cobrança de ativação')
    return null
  }
}

export async function buildApplicantView(bundle: ProposalBundle, charge: PlatformCharge | null): Promise<OnboardingApplicantView> {
  const offer = bundle.proposal.planId ? await findPlanOffer(bundle.proposal.planId) : null
  return toApplicantView(bundle, { offer, activationCharge: charge })
}

/** `GET /public/contratacao/propostas/:id` — sincroniza a ativação antes de montar a visão. */
export async function getApplicantView(id: string, opts: { sync?: boolean } = {}): Promise<OnboardingApplicantView> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  const charge = await activationChargeOf(proposal, opts.sync ?? false)
  // A sincronização pode ter confirmado o pagamento (→ provisionamento): relê.
  const bundle = await loadBundle(id)
  if (!bundle) throw proposalNotFound()
  return buildApplicantView(bundle, charge)
}

// ---------------------------------------------------------------------------
// Início e recuperação de acesso
// ---------------------------------------------------------------------------

const OPEN_CNPJ_MESSAGE =
  'Já existe uma proposta em andamento para este CNPJ. Use "Recuperar acesso" para receber o link de acompanhamento.'

/** CNPJ já é inquilino ou tem proposta aberta → 409 (antes de gravar). */
export async function assertCnpjAvailable(cnpj: string, openMessage = OPEN_CNPJ_MESSAGE): Promise<void> {
  if (await cnpjIsTenant(cnpj)) {
    throw AppError.conflict('Este CNPJ já é cliente da plataforma ANNETEC. Fale com o nosso time para mudanças no contrato.')
  }
  if (await openProposalForCnpj(cnpj)) throw AppError.conflict(openMessage)
}

type NewProposalValues = Omit<typeof platformOnboardingProposals.$inferInsert, 'code'>

/**
 * Grava a proposta com protocolo único (até 5 tentativas no raro choque de
 * código). CNPJ/slug já em proposta aberta (índice parcial) → 409.
 */
export async function insertProposal(values: NewProposalValues, now: Date, openMessage = OPEN_CNPJ_MESSAGE): Promise<ProposalRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [row] = await db
        .insert(platformOnboardingProposals)
        .values({ ...values, code: generateProposalCode(now, size => randomBytes(size)) })
        .returning()
      if (row) return row
    } catch (error) {
      if (isUniqueViolation(error, 'platform_onboarding_code_key')) continue
      if (isUniqueViolation(error)) throw AppError.conflict(openMessage)
      throw error
    }
  }
  throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Não foi possível gerar o protocolo da proposta')
}

export async function startProposal(input: StartOnboardingInput, meta: RequestMeta): Promise<StartOnboardingResult> {
  const offer = await findPlanOffer(input.planId)
  if (!offer || !offer.pricing.publicVisible) throw fieldError('planId', 'Plano indisponível para contratação')

  await assertCnpjAvailable(input.cnpj)

  const lookup = await lookupCnpj(input.cnpj)
  const receita = lookup.found ? lookup.result : null
  const now = new Date()
  // Código de vendedor ATIVO vincula a proposta; outro qualquer é ignorado.
  const seller = await resolveReferral(input.referralCode)

  const proposal = await insertProposal(
    {
      status: 'draft',
      contractorType: input.contractorType,
      legalForm: input.legalForm,
      cnpj: input.cnpj,
      legalName: receita?.legalName ?? null,
      tradeName: receita?.tradeName ?? null,
      planId: input.planId,
      expectedLives: input.expectedLives,
      applicant: input.applicant,
      receitaSnapshot: receita,
      receitaCheckedAt: receita ? now : null,
      source: 'site',
      sellerUserId: seller?.userId ?? null,
      referralCode: seller?.referralCode ?? null,
      applicantIp: meta.ip,
      applicantUserAgent: meta.userAgent?.slice(0, 400) ?? null,
      lastActivityAt: now,
    },
    now,
  )

  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'PROPOSAL_CREATED',
    visibility: 'public',
    message: `Proposta iniciada — protocolo ${proposal.code}.`,
    data: {
      planId: input.planId,
      expectedLives: input.expectedLives,
      receita: lookup.found ? 'found' : lookup.unavailable ? 'unavailable' : 'not_found',
      ...(seller ? { sellerUserId: seller.userId, referralCode: seller.referralCode } : {}),
    },
  })
  if (seller) {
    await insertEvent(db, {
      proposalId: proposal.id,
      type: 'NOTE_ADDED',
      visibility: 'internal',
      message: `Indicação do vendedor ${seller.name} (código "${seller.referralCode}").`,
    })
    await createReferralProspect({
      seller,
      proposalId: proposal.id,
      proposalCode: proposal.code,
      name: receita?.tradeName || receita?.legalName || input.applicant.name,
      cnpj: input.cnpj,
      applicant: input.applicant,
      expectedLives: input.expectedLives,
      planId: input.planId,
      city: receita?.address.city ?? null,
      state: receita?.address.state ?? null,
    })
  }
  await notifyApplicant(proposal, 'onboarding_started')

  const view = await getApplicantView(proposal.id)
  return {
    proposalId: proposal.id,
    code: proposal.code,
    accessKey: onboardingAccessKey(proposal.id),
    trackingPath: onboardingTrackingPath(proposal.id),
    proposal: view,
  }
}

/** Sempre responde `{ sent: true }` (não revela se o CNPJ/e-mail existe). */
export async function recoverAccess(input: { email: string; cnpj: string }): Promise<{ sent: true }> {
  try {
    const [proposal] = await db
      .select()
      .from(platformOnboardingProposals)
      .where(
        and(
          eq(platformOnboardingProposals.cnpj, input.cnpj),
          sql`lower(${platformOnboardingProposals.applicant}->>'email') = ${input.email.trim().toLowerCase()}`,
        ),
      )
      .orderBy(
        sql`case when ${platformOnboardingProposals.status} in ('active', 'rejected', 'canceled') then 1 else 0 end`,
        desc(platformOnboardingProposals.createdAt),
      )
      .limit(1)
    if (proposal) {
      await insertEvent(db, {
        proposalId: proposal.id,
        type: 'ACCESS_RECOVERED',
        visibility: 'internal',
        message: 'Link de acompanhamento reenviado a pedido do candidato.',
      })
      await notifyApplicant(proposal, 'onboarding_access_recovered')
    }
  } catch (error) {
    logger.warn({ err: error }, 'Falha ao recuperar acesso da proposta')
  }
  return { sent: true }
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

const SLUG_MESSAGES: Record<Exclude<SlugStatus, 'free'>, string> = {
  invalid: 'Use só letras minúsculas, números e hífens (de 2 a 40 caracteres).',
  reserved: 'Este endereço é reservado pela plataforma.',
  taken: 'Este endereço já é de outro clube.',
  pending_proposal: 'Este endereço está reservado por outra proposta em andamento.',
}

export async function checkSlugAvailability(value: string, proposalId?: string | null): Promise<SlugAvailability> {
  const normalized = value.trim().toLowerCase()
  const status = await slugStatus(normalized, proposalId ?? null)
  if (status === 'free') return { slug: normalized, available: true, reason: null, message: null, suggestions: [] }
  const candidates = slugCandidates(normalized).filter(c => c !== normalized)
  const taken = await takenSlugs(candidates)
  return {
    slug: normalized,
    available: false,
    reason: status,
    message: SLUG_MESSAGES[status],
    suggestions: candidates.filter(c => !taken.has(c)).slice(0, 4),
  }
}

// ---------------------------------------------------------------------------
// Seções (só em draft | pending_info)
// ---------------------------------------------------------------------------

async function saveSection(
  id: string,
  section: OnboardingSection,
  patch: ProposalPatch,
  event?: { type: OnboardingEventType; visibility: 'public' | 'internal'; message: string },
): Promise<ProposalRow> {
  const row = await transitionProposal(db, id, ONBOARDING_EDITABLE_STATUSES, { ...patch, lastActivityAt: new Date() })
  if (!row) throw await notEditableError(id)
  await insertEvent(db, {
    proposalId: id,
    ...(event ?? {
      type: 'SECTION_SAVED',
      visibility: 'internal',
      message: `Etapa salva: ${ONBOARDING_SECTION_LABELS[section]}.`,
    }),
    data: { section },
  })
  return row
}

export async function savePlan(id: string, input: OnboardingPlanInput): Promise<void> {
  const offer = await findPlanOffer(input.planId)
  if (!offer) throw fieldError('planId', 'Plano indisponível para contratação')
  if (!offer.pricing.publicVisible) {
    // Plano fora da vitrine só vale na proposta que o VENDEDOR montou com ele
    // (o cliente pode ajustar as vidas, não trocar para outro plano oculto).
    const proposal = await getProposal(id)
    const sellerPlan = proposal?.source === 'console' && Boolean(proposal.sellerUserId) && proposal.planId === input.planId
    if (!sellerPlan) throw fieldError('planId', 'Plano indisponível para contratação')
  }
  await saveSection(id, 'plan', { planId: input.planId, expectedLives: input.expectedLives })
}

export async function saveCompany(id: string, input: OnboardingCompanyInput): Promise<void> {
  await saveSection(id, 'company', { company: input, legalName: input.legalName, tradeName: input.tradeName ?? null })
}

export async function savePayment(id: string, input: OnboardingPaymentInput): Promise<void> {
  const [settings] = await db
    .select({ enabledMethods: platformBillingConfig.enabledMethods })
    .from(platformBillingConfig)
    .where(eq(platformBillingConfig.id, 'default'))
    .limit(1)
  const enabled: readonly string[] = settings?.enabledMethods ?? DEFAULT_PLATFORM_BILLING_POLICY.enabledMethods
  if (!enabled.includes(input.paymentMethod)) {
    throw fieldError('paymentMethod', 'Esta forma de pagamento não está disponível no momento')
  }
  await saveSection(id, 'payment', { paymentMethod: input.paymentMethod })
}

export async function saveBrand(id: string, input: OnboardingBrandInput): Promise<void> {
  const status = await slugStatus(input.slug, id)
  if (status !== 'free') {
    throw new AppError(ERROR_CODES.CONFLICT, SLUG_MESSAGES[status], { issues: [{ path: 'slug', message: SLUG_MESSAGES[status] }] })
  }
  if (input.logoFileId) {
    const file = await findFile(input.logoFileId)
    const valid =
      file && file.ownerType === 'proposal' && file.ownerId === id && file.purpose === 'brand_logo' && !file.deletedAt
    if (!valid) throw fieldError('logoFileId', 'Logo não encontrado: envie a imagem de novo')
  }
  try {
    await saveSection(id, 'brand', { brand: { ...input, logoFileId: input.logoFileId ?? null }, slug: input.slug })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(ERROR_CODES.CONFLICT, SLUG_MESSAGES.pending_proposal, {
        issues: [{ path: 'slug', message: SLUG_MESSAGES.pending_proposal }],
      })
    }
    throw error
  }
}

function personColumns(person: OnboardingPersonInput, index: number, now: Date) {
  return {
    name: person.name,
    cpf: person.cpf,
    birthDate: person.birthDate,
    email: person.email ?? null,
    phone: person.phone ?? null,
    position: person.position,
    positionOther: person.positionOther ?? null,
    isLegalRepresentative: person.isLegalRepresentative,
    isPartner: person.isPartner,
    isBeneficialOwner: person.isBeneficialOwner,
    ownershipPercent:
      person.ownershipPercent === null || person.ownershipPercent === undefined ? null : String(person.ownershipPercent),
    actsByPowerOfAttorney: person.actsByPowerOfAttorney,
    isPep: person.isPep,
    pepRole: person.isPep ? (person.pepRole ?? null) : null,
    pepRelationship: person.isPep ? (person.pepRelationship ?? null) : null,
    qsaMatch: null,
    sortOrder: index,
    updatedAt: now,
  }
}

/**
 * A visão do candidato devolve o CPF MASCARADO (`***.456.789-**`). No
 * `PUT /pessoas`, pessoa já gravada (`id` da proposta) que volta com CPF
 * mascarado, parcial ou vazio mantém o CPF gravado — só um CPF completo
 * substitui o anterior (completo e inválido segue para a validação e vira
 * erro de campo). Roda ANTES do zod do contracts, que exige 11 dígitos.
 */
export async function restoreMaskedCpfs(proposalId: string, raw: unknown): Promise<unknown> {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { people?: unknown }).people)) return raw
  const stored = new Map((await loadPeople(proposalId)).map(p => [p.id, p.cpf]))
  const people = (raw as { people: unknown[] }).people.map(item => {
    if (!item || typeof item !== 'object') return item
    const person = item as { id?: unknown; cpf?: unknown }
    const current = typeof person.id === 'string' ? stored.get(person.id) : undefined
    if (!current) return item
    const digits = onlyDigits(typeof person.cpf === 'string' ? person.cpf : '')
    return digits.length === 11 ? item : { ...person, cpf: current }
  })
  return { ...(raw as object), people }
}

/**
 * Substitui a lista de pessoas. Casa por `id` (explícito) e depois por CPF,
 * para preservar documentos vinculados; quem sai da lista tem os documentos
 * marcados `replaced`.
 */
export async function savePeople(id: string, input: OnboardingPeopleInput): Promise<void> {
  await db.transaction(async tx => {
    const [proposal] = await tx
      .select({ status: platformOnboardingProposals.status })
      .from(platformOnboardingProposals)
      .where(eq(platformOnboardingProposals.id, id))
      .for('update')
    if (!proposal) throw proposalNotFound()
    if (!isEditableStatus(proposal.status)) throw await notEditableError(id)

    const existing = await loadPeople(id, tx)
    const byId = new Map(existing.map(p => [p.id, p]))
    const claimed = new Set<string>()
    const issues: FieldIssue[] = []
    const targets: (PersonRow | undefined)[] = input.people.map((person, index) => {
      if (!person.id) return undefined
      const target = byId.get(person.id)
      if (!target) issues.push({ path: `people.${index}.id`, message: 'Pessoa não pertence a esta proposta' })
      else claimed.add(target.id)
      return target
    })
    if (issues.length) throw AppError.validation(issues)
    input.people.forEach((person, index) => {
      if (person.id) return
      const match = existing.find(e => e.cpf === person.cpf && !claimed.has(e.id))
      if (match) {
        claimed.add(match.id)
        targets[index] = match
      }
    })

    const now = new Date()
    const removed = existing.filter(p => !claimed.has(p.id)).map(p => p.id)
    if (removed.length) {
      await tx
        .update(platformOnboardingDocuments)
        .set({ status: 'replaced', replacedAt: now, updatedAt: now })
        .where(and(inArray(platformOnboardingDocuments.personId, removed), ne(platformOnboardingDocuments.status, 'replaced')))
      await tx.delete(platformOnboardingPeople).where(inArray(platformOnboardingPeople.id, removed))
    }
    // CPFs trocados entre pessoas existentes: libera o índice único antes de gravar.
    for (const [index, target] of targets.entries()) {
      if (target && target.cpf !== input.people[index]!.cpf) {
        await tx.update(platformOnboardingPeople).set({ cpf: `tmp-${target.id}` }).where(eq(platformOnboardingPeople.id, target.id))
      }
    }
    for (const [index, person] of input.people.entries()) {
      const values = personColumns(person, index, now)
      const target = targets[index]
      if (target) await tx.update(platformOnboardingPeople).set(values).where(eq(platformOnboardingPeople.id, target.id))
      else await tx.insert(platformOnboardingPeople).values({ proposalId: id, ...values })
    }
    await tx
      .update(platformOnboardingProposals)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(platformOnboardingProposals.id, id))
    await insertEvent(tx, {
      proposalId: id,
      type: 'SECTION_SAVED',
      visibility: 'internal',
      message: `Etapa salva: ${ONBOARDING_SECTION_LABELS.people} (${input.people.length} pessoa(s)).`,
      data: { section: 'people' },
    })
  })
}

export async function acceptContract(id: string, input: OnboardingContractAcceptanceInput, meta: RequestMeta): Promise<void> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  if (!isEditableStatus(proposal.status)) throw await notEditableError(id)
  const people = await loadPeople(id)
  const signer = people.find(p => p.id === input.signerPersonId)
  if (!signer || !signer.isLegalRepresentative) {
    throw fieldError('signerPersonId', 'Quem aceita precisa ser um representante legal cadastrado na proposta')
  }
  if (!signerNameMatches(input.signerName, signer.name)) {
    throw fieldError('signerName', 'O nome digitado não confere com o do representante legal')
  }
  const now = new Date()
  const acceptance: ContractAcceptance = {
    termsVersion: PLATFORM_TERMS.version,
    dpaVersion: PLATFORM_DPA.version,
    termsHash: sha256(contractDocumentText(PLATFORM_TERMS)),
    dpaHash: sha256(contractDocumentText(PLATFORM_DPA)),
    signerPersonId: signer.id,
    signerName: input.signerName,
    signerCpf: signer.cpf,
    signerEmail: signer.email,
    acceptedAt: now.toISOString(),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 400) ?? null,
  }
  await saveSection(
    id,
    'contract',
    { contractAcceptance: acceptance, acceptedAt: now },
    {
      type: 'CONTRACT_ACCEPTED',
      visibility: 'public',
      message: `Contrato aceito por ${signer.name} (termo ${PLATFORM_TERMS.version}, acordo de dados ${PLATFORM_DPA.version}).`,
    },
  )
}

// ---------------------------------------------------------------------------
// Documentos e logo
// ---------------------------------------------------------------------------

function uploadError(check: { reason: 'empty' | 'too_large' | 'unsupported_type'; message: string }): AppError {
  if (check.reason === 'too_large') return fieldError('file', check.message, 413)
  return new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, check.message, { issues: [{ path: 'file', message: check.message }] })
}

export async function uploadDocument(id: string, file: File, fields: UploadKybDocumentFields): Promise<void> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  if (!isEditableStatus(proposal.status)) throw await notEditableError(id)

  const requirement = KYB_DOCUMENT_REQUIREMENTS[proposal.legalForm].find(r => r.kind === fields.kind)
  if (!requirement && fields.kind !== 'outro') {
    throw fieldError('kind', 'Este documento não é pedido para a forma jurídica da proposta')
  }
  let personId: string | null = null
  if (requirement?.scope === 'person' || (fields.kind === 'outro' && fields.personId)) {
    if (!fields.personId) throw fieldError('personId', 'Indique de quem é o documento')
    const people = await loadPeople(id)
    if (!people.some(p => p.id === fields.personId)) throw fieldError('personId', 'Pessoa não pertence a esta proposta')
    personId = fields.personId
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkUpload('kyb_document', bytes)
  if (!check.ok) throw uploadError(check)

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(platformOnboardingDocuments)
    .where(and(eq(platformOnboardingDocuments.proposalId, id), ne(platformOnboardingDocuments.status, 'replaced')))
  if (total >= KYB_MAX_DOCUMENTS_PER_PROPOSAL) {
    throw AppError.businessRule(`Limite de ${KYB_MAX_DOCUMENTS_PER_PROPOSAL} documentos por proposta atingido: remova algum antes.`)
  }

  const label = KYB_DOCUMENT_KIND_LABELS[fields.kind]
  const stored = await storeFile({
    bytes,
    fileName: sanitizeFileName(file.name, check.type.ext, label),
    mimeType: check.type.mime,
    ext: check.type.ext,
    purpose: 'kyb_document',
    visibility: 'private',
    ownerType: 'proposal',
    ownerId: id,
    uploadedBy: 'applicant',
    keyPrefix: `kyb/${id}`,
  })

  try {
    await db.transaction(async tx => {
      const [locked] = await tx
        .select({ status: platformOnboardingProposals.status })
        .from(platformOnboardingProposals)
        .where(eq(platformOnboardingProposals.id, id))
        .for('update')
      if (!locked || !isEditableStatus(locked.status)) throw await notEditableError(id)
      const now = new Date()
      if (fields.kind !== 'outro') {
        await tx
          .update(platformOnboardingDocuments)
          .set({ status: 'replaced', replacedAt: now, updatedAt: now })
          .where(
            and(
              eq(platformOnboardingDocuments.proposalId, id),
              eq(platformOnboardingDocuments.kind, fields.kind),
              personId
                ? eq(platformOnboardingDocuments.personId, personId)
                : sql`${platformOnboardingDocuments.personId} is null`,
              ne(platformOnboardingDocuments.status, 'replaced'),
            ),
          )
      }
      await tx.insert(platformOnboardingDocuments).values({ proposalId: id, personId, kind: fields.kind, fileId: stored.id })
      await tx
        .update(platformOnboardingProposals)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(platformOnboardingProposals.id, id))
      await insertEvent(tx, {
        proposalId: id,
        type: 'DOCUMENT_UPLOADED',
        visibility: 'public',
        message: `Documento enviado: ${label}.`,
        data: { kind: fields.kind, personId, fileId: stored.id },
      })
    })
  } catch (error) {
    await discardFile(stored).catch(() => {})
    throw error
  }
}

export async function removeDocument(id: string, documentId: string): Promise<void> {
  const fileId = await db.transaction(async tx => {
    const [locked] = await tx
      .select({ status: platformOnboardingProposals.status })
      .from(platformOnboardingProposals)
      .where(eq(platformOnboardingProposals.id, id))
      .for('update')
    if (!locked) throw proposalNotFound()
    if (!isEditableStatus(locked.status)) throw await notEditableError(id)
    const [document] = await tx
      .select()
      .from(platformOnboardingDocuments)
      .where(and(eq(platformOnboardingDocuments.id, documentId), eq(platformOnboardingDocuments.proposalId, id)))
      .limit(1)
    if (!document) throw AppError.notFound('Documento')
    if (document.status !== 'uploaded' && document.status !== 'rejected') {
      throw AppError.businessRule('Só é possível remover documento aguardando análise ou recusado.')
    }
    await tx.delete(platformOnboardingDocuments).where(eq(platformOnboardingDocuments.id, document.id))
    const now = new Date()
    await tx
      .update(platformOnboardingProposals)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(platformOnboardingProposals.id, id))
    await insertEvent(tx, {
      proposalId: id,
      type: 'DOCUMENT_REMOVED',
      visibility: 'public',
      message: `Documento removido: ${KYB_DOCUMENT_KIND_LABELS[document.kind]}.`,
      data: { kind: document.kind, personId: document.personId },
    })
    return document.fileId
  })
  const file = await findFile(fileId)
  if (file && !file.deletedAt) await discardFile(file)
}

/** Arquivo de um documento da proposta (candidato ou console). */
export async function documentFile(id: string, documentId: string): Promise<PlatformFileRow> {
  const [document] = await db
    .select({ fileId: platformOnboardingDocuments.fileId })
    .from(platformOnboardingDocuments)
    .where(and(eq(platformOnboardingDocuments.id, documentId), eq(platformOnboardingDocuments.proposalId, id)))
    .limit(1)
  if (!document) throw AppError.notFound('Documento')
  const file = await findFile(document.fileId)
  if (!file || file.deletedAt) throw AppError.notFound('Arquivo')
  return file
}

export async function uploadLogo(id: string, file: File): Promise<UploadedFile> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  if (!isEditableStatus(proposal.status)) throw await notEditableError(id)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkUpload('brand_logo', bytes)
  if (!check.ok) throw uploadError(check)
  // O arquivo da proposta é o logo JÁ ADAPTADO (PNG ≤ 800×400, sem metadados):
  // a prévia mostra o que o clube vai ter, e SVG nunca é guardado.
  let adapted: Uint8Array
  try {
    adapted = (await processLogo(bytes, check.type.mime)).variants.logo
  } catch (error) {
    if (error instanceof BrandImageError) {
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, error.message, { issues: [{ path: 'file', message: error.message }] })
    }
    throw error
  }
  const stored = await storeFile({
    bytes: adapted,
    fileName: sanitizeFileName(file.name, 'png', 'logo'),
    mimeType: 'image/png',
    ext: 'png',
    purpose: 'brand_logo',
    visibility: 'public',
    ownerType: 'proposal',
    ownerId: id,
    uploadedBy: 'applicant',
    keyPrefix: 'logos',
  })
  await db
    .update(platformOnboardingProposals)
    .set({ lastActivityAt: new Date() })
    .where(eq(platformOnboardingProposals.id, id))
  return { fileId: stored.id, url: publicFileUrl(stored.id), fileName: stored.fileName, sizeBytes: stored.sizeBytes }
}

// ---------------------------------------------------------------------------
// Envio e cancelamento
// ---------------------------------------------------------------------------

export async function submitProposal(id: string): Promise<void> {
  const bundle = await loadBundle(id)
  if (!bundle) throw proposalNotFound()
  const { proposal } = bundle
  if (!isEditableStatus(proposal.status)) {
    throw AppError.businessRule(`A proposta já foi enviada (${ONBOARDING_STATUS_LABELS[proposal.status]}).`)
  }
  const completeness = completenessOf(bundle)
  if (!isComplete(completeness)) {
    const pending = completeness
      .filter(item => !item.complete)
      .map(item => `${ONBOARDING_SECTION_LABELS[item.section]}: ${item.missing.join('; ')}`)
    throw new AppError(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      `Falta completar antes de enviar — ${pending.join(' | ')}`,
      { issues: completenessIssues(completeness) },
    )
  }

  const resubmission = proposal.status === 'pending_info'
  const target = resubmitTarget(proposal.status, proposal.assignedToUserId)
  const now = new Date()
  const row = await transitionProposal(db, id, [proposal.status], {
    status: target,
    submittedAt: now,
    firstSubmittedAt: proposal.firstSubmittedAt ?? now,
    lastActivityAt: now,
    pendingRequest: proposal.pendingRequest ? { ...proposal.pendingRequest, resolvedAt: now.toISOString() } : null,
  })
  if (!row) throw await notEditableError(id)
  await insertEvent(db, {
    proposalId: id,
    type: resubmission ? 'RESUBMITTED' : 'SUBMITTED',
    visibility: 'public',
    message: resubmission ? 'Proposta reenviada após a pendência.' : 'Proposta enviada para análise.',
  })
  try {
    await runPrechecks(id, { trigger: resubmission ? 'resubmit' : 'submit' })
  } catch (error) {
    logger.error({ proposalId: id, err: error }, 'Pré-checagens falharam no envio')
    await insertEvent(db, {
      proposalId: id,
      type: 'PRECHECKS_RAN',
      visibility: 'internal',
      message: 'Pré-checagens não puderam ser executadas no envio: rode de novo pelo console.',
    }).catch(() => {})
  }
  await notifyApplicant(row, 'onboarding_submitted')
  // Sino da equipe: o pedido aparece em Aprovações › Novos clubes (notify nunca lança).
  await notify(
    proposalSubmittedNotification({
      proposalId: row.id,
      code: row.code,
      clubName: row.brand?.clubName || row.tradeName || row.legalName || row.company?.legalName || 'Um clube',
      resubmission,
      submittedAt: now,
    }),
  )
}

/** Cancelamento pelo candidato (`actor` nulo) ou pelo console. */
export async function cancelProposal(id: string, reason: string, actor: Actor | null): Promise<void> {
  const proposal = await getProposal(id)
  if (!proposal) throw proposalNotFound()
  if (!CANCELABLE_STATUSES.includes(proposal.status)) {
    throw AppError.businessRule(`Não é possível cancelar uma proposta "${ONBOARDING_STATUS_LABELS[proposal.status]}".`)
  }
  if (PAYABLE_STATUSES.includes(proposal.status)) {
    try {
      await cancelActivationCharge(id, reason)
    } catch (error) {
      logger.warn({ proposalId: id, err: error }, 'Falha ao cancelar a cobrança de ativação')
    }
  }
  const now = new Date()
  const row = await transitionProposal(db, id, CANCELABLE_STATUSES, {
    status: 'canceled',
    canceledAt: now,
    cancelReason: reason,
    lastActivityAt: now,
  })
  if (!row) throw AppError.conflict('A proposta mudou de estado enquanto era cancelada. Recarregue a página.')
  await insertEvent(db, {
    proposalId: id,
    type: 'CANCELED',
    visibility: 'public',
    message: actor ? `Proposta cancelada pela ANNETEC: ${reason}` : `Proposta cancelada pelo contratante: ${reason}`,
    actor,
  })
  await notifyApplicant(row, 'onboarding_canceled', { reason })
}
