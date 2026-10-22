import {
  canTransitionOnboarding,
  ONBOARDING_CODE_PATTERN,
  PLATFORM_DPA,
  PLATFORM_TERMS,
  type ComplianceChecklist,
  type KybChecklistRow,
  type PrecheckResult,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import {
  isValidOnboardingAccessKey,
  onboardingAccessKey,
  onboardingTrackingPath,
} from '@/modules/platform-onboarding/access-key'
import {
  approvalBlockers,
  CANCELABLE_STATUSES,
  checkSlugFormat,
  completenessIssues,
  computeCompleteness,
  DECISION_STATUSES,
  describePendingItem,
  expiryDecision,
  fullChecklist,
  generateProposalCode,
  isComplete,
  isEditableStatus,
  PAYABLE_STATUSES,
  REJECTABLE_STATUSES,
  resubmitTarget,
  signerNameMatches,
  slugCandidates,
  WAIVABLE_STATUSES,
  type CompletenessInput,
} from '@/modules/platform-onboarding/rules'

/** Máquina de estados, completude, bloqueios da aprovação, expiração, protocolo e chave. */

const ID = '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f'

describe('máquina de estados da proposta', () => {
  it('as listas de estados do serviço respeitam ONBOARDING_TRANSITIONS', () => {
    for (const status of CANCELABLE_STATUSES) expect(canTransitionOnboarding(status, 'canceled')).toBe(true)
    for (const status of DECISION_STATUSES) {
      expect(canTransitionOnboarding(status, 'approved')).toBe(true)
      expect(canTransitionOnboarding(status, 'pending_info')).toBe(true)
    }
    for (const status of REJECTABLE_STATUSES) expect(canTransitionOnboarding(status, 'rejected')).toBe(true)
    for (const status of PAYABLE_STATUSES) expect(canTransitionOnboarding(status, 'provisioning')).toBe(true)
    for (const status of WAIVABLE_STATUSES) expect(canTransitionOnboarding(status, 'provisioning')).toBe(true)
    expect(canTransitionOnboarding('provisioning', 'canceled')).toBe(false)
    expect(canTransitionOnboarding('provisioning', 'active')).toBe(true)
    expect(canTransitionOnboarding('draft', 'approved')).toBe(false)
  })

  it('só draft e pending_info são editáveis', () => {
    expect(isEditableStatus('draft')).toBe(true)
    expect(isEditableStatus('pending_info')).toBe(true)
    expect(isEditableStatus('submitted')).toBe(false)
    expect(isEditableStatus('approved')).toBe(false)
  })

  it('reenvio volta para o analista quando havia um, senão para a fila', () => {
    expect(resubmitTarget('pending_info', 'user-1')).toBe('in_review')
    expect(resubmitTarget('pending_info', null)).toBe('submitted')
    expect(resubmitTarget('draft', 'user-1')).toBe('submitted')
    expect(canTransitionOnboarding('pending_info', 'in_review')).toBe(true)
  })
})

describe('protocolo e chave de acompanhamento', () => {
  it('protocolo segue ANN-AAMM-XXXXX com o mês de São Paulo', () => {
    // 1º de outubro 01:00 UTC ainda é 30 de setembro em São Paulo.
    const code = generateProposalCode(new Date('2026-10-01T01:00:00Z'), size => new Uint8Array(size).fill(31))
    expect(code).toBe('ANN-2609-ZZZZZ')
    expect(ONBOARDING_CODE_PATTERN.test(code)).toBe(true)
    for (let i = 0; i < 50; i++) {
      const random = generateProposalCode(new Date(), size => crypto.getRandomValues(new Uint8Array(size)))
      expect(ONBOARDING_CODE_PATTERN.test(random)).toBe(true)
    }
  })

  it('chave HMAC: 32 caracteres, confere só para a mesma proposta', () => {
    const key = onboardingAccessKey(ID)
    expect(key).toHaveLength(32)
    expect(isValidOnboardingAccessKey(ID, key)).toBe(true)
    expect(isValidOnboardingAccessKey(ID, `${key.slice(0, 31)}x`)).toBe(false)
    expect(isValidOnboardingAccessKey(ID, key.slice(0, 20))).toBe(false)
    expect(isValidOnboardingAccessKey(ID, null)).toBe(false)
    expect(isValidOnboardingAccessKey('0b6f6c2e-3f1a-4c55-9d0e-000000000000', key)).toBe(false)
    expect(onboardingTrackingPath(ID)).toBe(`/contratar/${ID}?chave=${key}`)
  })
})

function completeInput(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    planId: 'plan-1',
    expectedLives: 1200,
    hasCompany: true,
    people: [{ id: 'p1', isLegalRepresentative: true }],
    requirements: [
      { required: true, state: 'uploaded', label: 'Estatuto social' },
      { required: false, state: 'missing', label: 'Cartão CNPJ' },
    ],
    brand: { slug: 'asserv' },
    brandSlugTaken: false,
    contract: { termsVersion: PLATFORM_TERMS.version, dpaVersion: PLATFORM_DPA.version, signerPersonId: 'p1' },
    paymentMethod: 'pix',
    ...overrides,
  }
}

describe('completude para enviar', () => {
  it('tudo preenchido = completo (opcional faltando não bloqueia)', () => {
    const items = computeCompleteness(completeInput())
    expect(items.map(i => i.section)).toEqual(['plan', 'company', 'people', 'documents', 'brand', 'contract', 'payment'])
    expect(isComplete(items)).toBe(true)
  })

  it('rascunho vazio lista o que falta em cada seção', () => {
    const items = computeCompleteness({
      planId: null,
      expectedLives: 0,
      hasCompany: false,
      people: [],
      requirements: [{ required: true, state: 'missing', label: 'Estatuto social' }],
      brand: null,
      brandSlugTaken: false,
      contract: null,
      paymentMethod: null,
    })
    expect(isComplete(items)).toBe(false)
    expect(items.every(i => !i.complete)).toBe(true)
    const issues = completenessIssues(items)
    expect(issues).toContainEqual({ path: 'documents', message: 'Envie: Estatuto social' })
    expect(issues.find(i => i.path === 'payment')?.message).toMatch(/forma de pagamento/)
  })

  it('documento recusado, slug tomado, termos antigos e signatário que deixou de ser representante', () => {
    const items = computeCompleteness(
      completeInput({
        requirements: [{ required: true, state: 'rejected', label: 'Ata de eleição' }],
        brandSlugTaken: true,
        people: [{ id: 'p1', isLegalRepresentative: false }, { id: 'p2', isLegalRepresentative: true }],
      }),
    )
    const bySection = Object.fromEntries(items.map(i => [i.section, i]))
    expect(bySection.documents?.missing).toEqual(['Reenvie (recusado): Ata de eleição'])
    expect(bySection.brand?.missing[0]).toMatch(/não está mais disponível/)
    expect(bySection.contract?.missing[0]).toMatch(/não é mais representante/)

    const outdated = computeCompleteness(
      completeInput({ contract: { termsVersion: '2020.01', dpaVersion: PLATFORM_DPA.version, signerPersonId: 'p1' } }),
    )
    expect(outdated.find(i => i.section === 'contract')?.missing[0]).toMatch(/versão vigente/)
  })
})

describe('bloqueios da aprovação', () => {
  const pass = (code: PrecheckResult['code']): Pick<PrecheckResult, 'code' | 'outcome' | 'message'> => ({ code, outcome: 'pass', message: 'ok' })
  const allChecked = (hasPep: boolean): ComplianceChecklist => {
    const list = fullChecklist({})
    for (const key of Object.keys(list) as (keyof ComplianceChecklist)[]) {
      if (key === 'pep_due_diligence' && !hasPep) continue
      list[key] = { checked: true, note: null, checkedBy: 'Ana', checkedAt: new Date().toISOString() }
    }
    return list
  }
  const approvedDocs: Pick<KybChecklistRow, 'required' | 'state' | 'label'>[] = [{ required: true, state: 'approved', label: 'Estatuto' }]

  it('sem pré-checagem, com falha bloqueante, checklist incompleto e documento sem aprovação', () => {
    expect(approvalBlockers({ prechecks: [], checklist: allChecked(false), hasPep: false, requirements: approvedDocs })[0]?.path).toBe('prechecks')
    const blockers = approvalBlockers({
      prechecks: [pass('cnpj_valid'), { code: 'cnpj_active', outcome: 'fail', message: 'Situação cadastral BAIXADA.' }],
      checklist: fullChecklist({}),
      hasPep: false,
      requirements: [{ required: true, state: 'uploaded', label: 'Estatuto' }],
    })
    expect(blockers.map(b => b.path)).toEqual(['prechecks', 'checklist', 'documents'])
    expect(blockers[0]?.message).toContain('BAIXADA')
  })

  it('falha NÃO bloqueante (ex.: empresa nova) não impede; PEP exige a diligência', () => {
    const prechecks = [pass('cnpj_active'), { code: 'company_age' as const, outcome: 'warn' as const, message: 'nova' }]
    expect(approvalBlockers({ prechecks, checklist: allChecked(false), hasPep: false, requirements: approvedDocs })).toEqual([])
    const withPep = approvalBlockers({ prechecks, checklist: allChecked(false), hasPep: true, requirements: approvedDocs })
    expect(withPep).toHaveLength(1)
    expect(withPep[0]?.message).toMatch(/pessoa politicamente exposta/i)
    expect(approvalBlockers({ prechecks, checklist: allChecked(true), hasPep: true, requirements: approvedDocs })).toEqual([])
  })
})

describe('expiração', () => {
  const policy = { draftExpiryDays: 30, activationExpiryDays: 15 }
  const now = new Date('2026-09-27T12:00:00Z')
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

  it('rascunho parado > 30 dias e ativação não paga > 15 dias expiram', () => {
    expect(expiryDecision({ status: 'draft', lastActivityAt: daysAgo(31), approvedAt: null }, now, policy)).toBe('draft')
    expect(expiryDecision({ status: 'draft', lastActivityAt: daysAgo(29), approvedAt: null }, now, policy)).toBeNull()
    expect(expiryDecision({ status: 'awaiting_payment', lastActivityAt: daysAgo(1), approvedAt: daysAgo(16) }, now, policy)).toBe('activation')
    expect(expiryDecision({ status: 'awaiting_payment', lastActivityAt: daysAgo(1), approvedAt: daysAgo(10) }, now, policy)).toBeNull()
    expect(expiryDecision({ status: 'submitted', lastActivityAt: daysAgo(90), approvedAt: null }, now, policy)).toBeNull()
  })
})

describe('contrato, pendências e slugs', () => {
  it('nome do signatário confere sem acento/caixa', () => {
    expect(signerNameMatches('mariana costa lima', 'Mariana Costa Lima')).toBe(true)
    expect(signerNameMatches('Márcia  Conceição', 'MARCIA CONCEICAO')).toBe(true)
    expect(signerNameMatches('Mariana Lima', 'Mariana Costa Lima')).toBe(false)
  })

  it('item de pendência legível', () => {
    expect(describePendingItem({ section: 'documents', documentKind: 'ata_eleicao', note: 'Sem registro' })).toBe(
      'Documentos — Ata de eleição da diretoria vigente: Sem registro',
    )
  })

  it('slugs: formato, reservados e sugestões válidas', () => {
    expect(checkSlugFormat('asserv')).toBe('ok')
    expect(checkSlugFormat('admin')).toBe('reserved')
    expect(checkSlugFormat('Clube Legal!')).toBe('invalid')
    const suggestions = slugCandidates('Clube ASSERV — Vale!')
    expect(suggestions[0]).toBe('clube-asserv-vale')
    expect(suggestions.every(s => checkSlugFormat(s) === 'ok')).toBe(true)
    expect(slugCandidates('admin')).not.toContain('admin')
  })
})
