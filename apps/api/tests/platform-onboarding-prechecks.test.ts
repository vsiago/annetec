import {
  blockingPrecheckFailures,
  DEMO_PEOPLE,
  matchPartnerInQsa,
  type ContractorType,
  type LegalForm,
  type PrecheckCode,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { demoCnpjLookup } from '@/integrations/cnpj/simulated'
import { runPrecheckRules, type PrecheckInput, type PrecheckPerson } from '@/modules/platform-onboarding/prechecks.rules'

/** Pré-checagens do KYB (blueprint §0.6) com os CNPJs e pessoas de demonstração. */

const NOW = new Date('2026-09-27T15:00:00Z')

function people(cnpj: string, overrides: Partial<PrecheckPerson>[] = []): PrecheckPerson[] {
  return (DEMO_PEOPLE[cnpj] ?? []).map((p, index) => ({
    id: `p${index}`,
    name: p.name,
    cpf: p.cpf,
    isLegalRepresentative: index === 0,
    isPartner: false,
    isBeneficialOwner: false,
    ownershipPercent: null,
    actsByPowerOfAttorney: false,
    isPep: p.isPep ?? false,
    pepRole: p.pepRole ?? null,
    ...overrides[index],
  }))
}

function input(cnpj: string, contractorType: ContractorType, legalForm: LegalForm, extra: Partial<PrecheckInput> = {}): PrecheckInput {
  const data = demoCnpjLookup(cnpj, NOW)!
  return {
    now: NOW,
    cnpj,
    contractorType,
    legalForm,
    receita: { status: 'found', data: { ...data, cached: false, fetchedAt: NOW.toISOString() }, fromSnapshot: false },
    company: null,
    people: people(cnpj),
    requirements: [
      { required: true, state: 'approved', label: 'Estatuto social' },
      { required: false, state: 'missing', label: 'Cartão CNPJ' },
    ],
    uniqueness: { isTenant: false, otherOpenProposalCode: null },
    slug: { value: 'clube-demo', status: 'free' },
    adminEmail: { value: 'painel@demo.org.br', taken: false },
    ...extra,
  }
}

const outcome = (results: { code: PrecheckCode; outcome: string }[], code: PrecheckCode) => results.find(r => r.code === code)?.outcome

describe('pré-checagens com os cenários de demonstração', () => {
  it('ASSERV (associação) passa em todas com as pessoas de DEMO_PEOPLE', () => {
    const out = runPrecheckRules(
      input('11222333000181', 'entidade', 'associacao', {
        people: people('11222333000181', [{ isLegalRepresentative: true }, { isLegalRepresentative: false, isPartner: true }]),
      }),
    )
    expect(out.results).toHaveLength(12)
    const notPass = out.results.filter(r => r.outcome !== 'pass' && r.outcome !== 'skipped')
    expect(notPass).toEqual([])
    expect(out.summary).toBe('pass')
    expect(out.hasPep).toBe(false)
    expect(out.qsa).toEqual({ p0: 'matched', p1: 'matched' })
    expect(outcome(out.results, 'beneficial_owners_declared')).toBe('skipped')
  })

  it('CLUBE ANTIGO (BAIXADA) falha em cnpj_active — bloqueante', () => {
    const out = runPrecheckRules(input('77889900000166', 'empresa', 'ltda'))
    const active = out.results.find(r => r.code === 'cnpj_active')!
    expect(active.outcome).toBe('fail')
    expect(active.message).toContain('BAIXADA')
    expect(out.summary).toBe('fail')
    expect(blockingPrecheckFailures(out.results).map(r => r.code)).toEqual(['cnpj_active'])
  })

  it('VIDA MAIS (LTDA com sócia PEP) alerta PEP e aceita sócios que somam 100%', () => {
    const out = runPrecheckRules(
      input('45678901000175', 'empresa', 'ltda', {
        people: people('45678901000175', [
          { isPartner: true, ownershipPercent: 60 },
          { isPartner: true, ownershipPercent: 40 },
        ]),
      }),
    )
    expect(out.hasPep).toBe(true)
    expect(outcome(out.results, 'pep_alert')).toBe('warn')
    expect(outcome(out.results, 'beneficial_owners_declared')).toBe('pass')
    expect(outcome(out.results, 'representatives_in_qsa')).toBe('pass')
    expect(out.summary).toBe('warn')
  })

  it('BOAS NOVAS (aberta há 60 dias) alerta company_age', () => {
    const out = runPrecheckRules(input('66554433000105', 'organizacao', 'instituicao_religiosa'))
    const age = out.results.find(r => r.code === 'company_age')!
    expect(age.outcome).toBe('warn')
    expect(age.details?.days).toBe(60)
    expect(outcome(out.results, 'legal_nature_compatible')).toBe('pass')
  })

  it('SINDCOM (sindicato) passa natureza 3131 e CNAE 94', () => {
    const out = runPrecheckRules(input('33445566000186', 'entidade', 'sindicato'))
    expect(outcome(out.results, 'legal_nature_compatible')).toBe('pass')
    expect(outcome(out.results, 'cnae_compatible')).toBe('pass')
    expect(outcome(out.results, 'representatives_in_qsa')).toBe('pass')
    expect(out.summary).toBe('pass')
  })
})

describe('regras isoladas', () => {
  it('Receita indisponível = alerta; CNPJ não encontrado = falha; QSA ausente = skipped', () => {
    const unavailable = runPrecheckRules(input('11222333000181', 'entidade', 'associacao', { receita: { status: 'unavailable' } }))
    expect(outcome(unavailable.results, 'cnpj_active')).toBe('warn')
    expect(outcome(unavailable.results, 'representatives_in_qsa')).toBe('skipped')
    expect(outcome(unavailable.results, 'company_age')).toBe('skipped')
    const notFound = runPrecheckRules(input('11222333000181', 'entidade', 'associacao', { receita: { status: 'not_found' } }))
    expect(outcome(notFound.results, 'cnpj_active')).toBe('fail')
  })

  it('sem Receita, usa natureza/CNAE/abertura informados pela empresa', () => {
    const out = runPrecheckRules(
      input('11222333000181', 'entidade', 'associacao', {
        receita: { status: 'unavailable' },
        company: { openingDate: '2010-01-01', legalNatureCode: '2062', mainCnae: { code: '4711302', description: 'x' }, secondaryCnaes: [] },
      }),
    )
    expect(outcome(out.results, 'company_age')).toBe('pass')
    expect(outcome(out.results, 'legal_nature_compatible')).toBe('warn')
    expect(outcome(out.results, 'cnae_compatible')).toBe('warn')
  })

  it('CNPJ inválido, documentos, unicidade, slug e e-mail do admin', () => {
    const out = runPrecheckRules(
      input('11222333000181', 'entidade', 'associacao', {
        cnpj: '11222333000182',
        requirements: [
          { required: true, state: 'missing', label: 'Estatuto social' },
          { required: true, state: 'uploaded', label: 'Ata' },
        ],
        uniqueness: { isTenant: false, otherOpenProposalCode: 'ANN-2609-ABCDE' },
        slug: { value: 'admin', status: 'reserved' },
        adminEmail: { value: 'ja@existe.com', taken: true },
      }),
    )
    for (const code of ['cnpj_valid', 'required_documents', 'document_unique', 'slug_available', 'admin_email_available'] as const) {
      expect(outcome(out.results, code)).toBe('fail')
    }
    expect(out.results.find(r => r.code === 'document_unique')?.message).toContain('ANN-2609-ABCDE')
    const pending = runPrecheckRules(
      input('11222333000181', 'entidade', 'associacao', { requirements: [{ required: true, state: 'uploaded', label: 'Ata' }] }),
    )
    expect(outcome(pending.results, 'required_documents')).toBe('warn')
  })

  it('representante fora do QSA = alerta; procurador não é conferido', () => {
    const out = runPrecheckRules(
      input('11222333000181', 'entidade', 'associacao', {
        people: [
          ...people('11222333000181'),
          {
            id: 'px',
            name: 'Fulano de Tal',
            cpf: '52998224725',
            isLegalRepresentative: true,
            isPartner: false,
            isBeneficialOwner: false,
            ownershipPercent: null,
            actsByPowerOfAttorney: false,
            isPep: false,
            pepRole: null,
          },
          {
            id: 'proc',
            name: 'Procurador Externo',
            cpf: '39053344705',
            isLegalRepresentative: true,
            isPartner: false,
            isBeneficialOwner: false,
            ownershipPercent: null,
            actsByPowerOfAttorney: true,
            isPep: false,
            pepRole: null,
          },
        ],
      }),
    )
    expect(outcome(out.results, 'representatives_in_qsa')).toBe('warn')
    expect(out.qsa.px).toBe('not_found')
    expect(out.qsa.proc).toBe('not_applicable')
  })

  it('matchPartnerInQsa aceita nome abreviado quando os 6 dígitos do CPF batem', () => {
    const partners = demoCnpjLookup('11222333000181')!.partners
    expect(matchPartnerInQsa({ name: 'Mariana Lima', cpf: '11144477735' }, partners)).toBe(true)
    expect(matchPartnerInQsa({ name: 'Mariana Lima', cpf: '52998224725' }, partners)).toBe(false)
  })
})
