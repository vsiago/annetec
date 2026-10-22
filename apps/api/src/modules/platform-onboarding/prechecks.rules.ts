import {
  formatDateBR,
  isCnaeCompatible,
  isLegalNatureCompatible,
  isValidCnpj,
  LEGAL_FORM_LABELS,
  matchPartnerInQsa,
  MIN_COMPANY_AGE_DAYS,
  summarizePrechecks,
  type CnpjLookupResult,
  type ContractorType,
  type KybChecklistRow,
  type LegalForm,
  type OnboardingCompanyInput,
  type PrecheckCode,
  type PrecheckOutcome,
  type PrecheckResult,
  type PrecheckSummary,
} from '@annetec/contracts'

/**
 * Pré-checagens automáticas do KYB (blueprint da plataforma §0.6) — PURAS.
 * O serviço reúne Receita, pessoas, documentos e as consultas de unicidade;
 * aqui só se decide pass/warn/fail/skipped com a frase pronta.
 */

export type QsaMatch = 'matched' | 'not_found' | 'not_applicable'

export interface PrecheckPerson {
  id: string
  name: string
  cpf: string
  isLegalRepresentative: boolean
  isPartner: boolean
  isBeneficialOwner: boolean
  ownershipPercent: number | null
  actsByPowerOfAttorney: boolean
  isPep: boolean
  pepRole: string | null
}

export interface PrecheckInput {
  now: Date
  cnpj: string
  contractorType: ContractorType
  legalForm: LegalForm
  /** `found` = dados da Receita (ou retrato anterior); `not_found`; `unavailable` = consulta falhou sem retrato. */
  receita: { status: 'found'; data: CnpjLookupResult; fromSnapshot: boolean } | { status: 'not_found' | 'unavailable' }
  company: Pick<OnboardingCompanyInput, 'openingDate' | 'legalNatureCode' | 'mainCnae' | 'secondaryCnaes'> | null
  people: PrecheckPerson[]
  requirements: Pick<KybChecklistRow, 'required' | 'state' | 'label'>[]
  uniqueness: { isTenant: boolean; otherOpenProposalCode: string | null }
  /** `null` = marca ainda não salva. */
  slug: { value: string; status: 'free' | 'taken' | 'reserved' | 'pending_proposal' | 'invalid' } | null
  /** `null` = marca (e admin) ainda não salva. */
  adminEmail: { value: string; taken: boolean } | null
  /**
   * Resultado de `cnpj_active` quando o cadastro veio de consulta SIMULADA e
   * está ATIVA. Padrão `pass` (demo segue verde); `prechecks.service` passa
   * `warn` em produção.
   */
  simulatedLookupOutcome?: 'pass' | 'warn'
}

export interface PrecheckOutput {
  results: PrecheckResult[]
  summary: PrecheckSummary
  hasPep: boolean
  qsa: Record<string, QsaMatch>
}

/** Dias corridos de `fromIsoDate` até hoje (data de São Paulo). */
function daysBetween(fromIsoDate: string, now: Date): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  }
  const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
  return Math.floor((utc(todaySP) - utc(fromIsoDate)) / 86_400_000)
}

export function runPrecheckRules(input: PrecheckInput): PrecheckOutput {
  const checkedAt = input.now.toISOString()
  const results: PrecheckResult[] = []
  const add = (code: PrecheckCode, outcome: PrecheckOutcome, message: string, details: Record<string, unknown> | null = null) =>
    results.push({ code, outcome, message, details, checkedAt })

  const receita = input.receita.status === 'found' ? input.receita.data : null

  // 1. CNPJ válido
  if (isValidCnpj(input.cnpj)) add('cnpj_valid', 'pass', 'Dígitos verificadores do CNPJ conferem.')
  else add('cnpj_valid', 'fail', 'CNPJ inválido (dígitos verificadores não conferem).')

  // 2. Situação cadastral
  if (receita) {
    const status = receita.registrationStatus.toUpperCase()
    const details = {
      registrationStatus: status,
      registrationStatusDate: receita.registrationStatusDate,
      reason: receita.registrationStatusReason,
      provider: receita.provider,
      fromSnapshot: input.receita.status === 'found' ? input.receita.fromSnapshot : false,
    }
    // Cadastro simulado (CNPJ de demonstração/provider `simulated`) NÃO foi
    // conferido na Receita: a frase diz isso, e em produção (onde nem deveria
    // existir — retrato antigo) o serviço pede alerta para a análise conferir à mão.
    const simulated = receita.provider === 'simulated'
    if (status === 'ATIVA') {
      if (!simulated) add('cnpj_active', 'pass', 'Situação cadastral ATIVA na Receita Federal.', details)
      else
        add(
          'cnpj_active',
          input.simulatedLookupOutcome ?? 'pass',
          'Situação cadastral ATIVA em consulta simulada (não conferida na Receita Federal).',
          details,
        )
    } else {
      const since = receita.registrationStatusDate ? ` desde ${formatDateBR(receita.registrationStatusDate)}` : ''
      const why = receita.registrationStatusReason ? ` (${receita.registrationStatusReason})` : ''
      const origin = simulated ? ' (consulta simulada)' : ''
      add('cnpj_active', 'fail', `Situação cadastral ${status}${since}${why}${origin}.`, details)
    }
  } else if (input.receita.status === 'not_found') {
    add('cnpj_active', 'fail', 'CNPJ não encontrado na base da Receita Federal.', { registrationStatus: null })
  } else {
    add('cnpj_active', 'warn', 'Consulta à Receita indisponível: confirme a situação cadastral manualmente.', {
      registrationStatus: null,
    })
  }

  // 3. Tempo de abertura
  const openingDate = receita?.openingDate ?? input.company?.openingDate ?? null
  if (!openingDate) {
    add('company_age', 'skipped', 'Data de abertura desconhecida.')
  } else {
    const days = daysBetween(openingDate, input.now)
    const details = { openingDate, days, minimumDays: MIN_COMPANY_AGE_DAYS }
    if (days >= MIN_COMPANY_AGE_DAYS) add('company_age', 'pass', `Aberta em ${formatDateBR(openingDate)} (${days} dias).`, details)
    else add('company_age', 'warn', `Aberta há só ${Math.max(0, days)} dias (mínimo recomendado: ${MIN_COMPANY_AGE_DAYS}).`, details)
  }

  // 4. Natureza jurídica
  const natureCode = receita?.legalNatureCode ?? input.company?.legalNatureCode ?? null
  const natureOk = isLegalNatureCompatible(input.legalForm, natureCode)
  const formLabel = LEGAL_FORM_LABELS[input.legalForm]
  if (natureOk === null) add('legal_nature_compatible', 'skipped', 'Natureza jurídica não informada.')
  else if (natureOk) {
    add('legal_nature_compatible', 'pass', `Natureza ${natureCode} compatível com ${formLabel}.`, { code: natureCode })
  } else {
    add('legal_nature_compatible', 'warn', `Natureza ${natureCode}${receita?.legalNatureName ? ` (${receita.legalNatureName})` : ''} não é a esperada para ${formLabel}.`, {
      code: natureCode,
    })
  }

  // 5. CNAE
  const main = receita?.mainCnae ?? input.company?.mainCnae ?? null
  const secondary = receita?.secondaryCnaes ?? input.company?.secondaryCnaes ?? []
  const cnaes = [main?.code, ...secondary.map(c => c.code)]
  const cnaeOk = isCnaeCompatible(input.contractorType, cnaes)
  if (cnaeOk === null) add('cnae_compatible', 'skipped', 'Nenhum CNAE informado.')
  else if (cnaeOk) add('cnae_compatible', 'pass', `Atividade compatível (CNAE principal ${main?.code ?? '—'}).`, { cnaes: cnaes.filter(Boolean) })
  else add('cnae_compatible', 'warn', 'Nenhum CNAE (principal ou secundário) na lista esperada para o tipo de contratante.', { cnaes: cnaes.filter(Boolean) })

  // 6. Representantes/sócios no QSA
  const qsa: Record<string, QsaMatch> = {}
  const partners = receita?.partners ?? []
  const checkable = input.people.filter(p => (p.isLegalRepresentative || p.isPartner) && !p.actsByPowerOfAttorney)
  for (const person of input.people) qsa[person.id] = 'not_applicable'
  if (partners.length === 0 || checkable.length === 0) {
    add('representatives_in_qsa', 'skipped', partners.length === 0 ? 'Quadro societário (QSA) indisponível.' : 'Nenhum representante ou sócio para conferir.')
  } else {
    const missing: string[] = []
    for (const person of checkable) {
      const matched = matchPartnerInQsa({ name: person.name, cpf: person.cpf }, partners)
      qsa[person.id] = matched ? 'matched' : 'not_found'
      if (!matched) missing.push(person.name)
    }
    if (missing.length === 0) add('representatives_in_qsa', 'pass', 'Todos os representantes e sócios constam no QSA da Receita.')
    else add('representatives_in_qsa', 'warn', `Não encontrado(s) no QSA: ${missing.join(', ')}.`, { notFound: missing })
  }

  // 7. Beneficiários finais (só empresa)
  if (input.contractorType !== 'empresa') {
    add('beneficial_owners_declared', 'skipped', 'Não se aplica a entidades e organizações sem fins lucrativos.')
  } else {
    const ownership = input.people.filter(p => p.isPartner).reduce((acc, p) => acc + (p.ownershipPercent ?? 0), 0)
    const owners = input.people.filter(p => p.isBeneficialOwner)
    const details = { ownershipTotal: Math.round(ownership * 100) / 100, beneficialOwners: owners.length }
    if (ownership >= 99.5 || owners.length > 0) {
      add('beneficial_owners_declared', 'pass', owners.length > 0 ? `${owners.length} beneficiário(s) final(is) declarado(s).` : 'Participações dos sócios somam 100%.', details)
    } else {
      add('beneficial_owners_declared', 'warn', `Participações somam ${details.ownershipTotal}% e nenhum beneficiário final foi indicado.`, details)
    }
  }

  // 8. PEP
  const peps = input.people.filter(p => p.isPep)
  if (peps.length === 0) add('pep_alert', 'pass', 'Nenhuma pessoa politicamente exposta declarada.')
  else {
    add('pep_alert', 'warn', `Pessoa politicamente exposta: ${peps.map(p => (p.pepRole ? `${p.name} (${p.pepRole})` : p.name)).join(', ')} — diligência reforçada.`, {
      people: peps.map(p => p.name),
    })
  }

  // 9. Documentos obrigatórios
  const required = input.requirements.filter(r => r.required)
  const missingDocs = required.filter(r => r.state === 'missing' || r.state === 'rejected')
  const unreviewed = required.filter(r => r.state === 'uploaded')
  if (missingDocs.length > 0) {
    add('required_documents', 'fail', `Faltando ou recusado: ${missingDocs.map(r => r.label).join('; ')}.`, {
      missing: missingDocs.map(r => r.label),
    })
  } else if (unreviewed.length > 0) {
    add('required_documents', 'warn', `${unreviewed.length} documento(s) obrigatório(s) enviado(s) aguardando revisão.`, {
      toReview: unreviewed.map(r => r.label),
    })
  } else {
    add('required_documents', 'pass', `Todos os ${required.length} documentos obrigatórios aprovados.`)
  }

  // 10. CNPJ único
  if (input.uniqueness.isTenant) add('document_unique', 'fail', 'Este CNPJ já é inquilino da plataforma.')
  else if (input.uniqueness.otherOpenProposalCode) {
    add('document_unique', 'fail', `Há outra proposta em andamento para este CNPJ (${input.uniqueness.otherOpenProposalCode}).`)
  } else add('document_unique', 'pass', 'CNPJ ainda não é contratante nem tem outra proposta aberta.')

  // 11. Slug
  if (!input.slug) add('slug_available', 'skipped', 'Marca e endereço do site ainda não definidos.')
  else if (input.slug.status === 'free') add('slug_available', 'pass', `Endereço "${input.slug.value}" disponível.`)
  else {
    const why = {
      taken: 'já é de outro clube',
      reserved: 'é reservado pela plataforma',
      pending_proposal: 'está reservado por outra proposta',
      invalid: 'é inválido',
    }[input.slug.status]
    add('slug_available', 'fail', `O endereço "${input.slug.value}" ${why}.`)
  }

  // 12. E-mail do admin
  if (!input.adminEmail) add('admin_email_available', 'skipped', 'Administrador do painel ainda não informado.')
  else if (input.adminEmail.taken) {
    add('admin_email_available', 'fail', `O e-mail ${input.adminEmail.value} já tem conta na plataforma: indique outro administrador.`)
  } else add('admin_email_available', 'pass', `E-mail ${input.adminEmail.value} disponível para o administrador.`)

  return { results, summary: summarizePrechecks(results), hasPep: peps.length > 0, qsa }
}
