/**
 * Atalhos do modo demonstração da contratação: CNPJs de cenário, pessoas
 * fictícias do contrato, e-mails de exemplo e arquivos gerados no navegador.
 *
 * NUNCA importe este módulo estaticamente: ele só entra pela `import()` de
 * `useContratarDemo` (./use-demo.ts), que só carrega quando a API diz que o
 * ambiente é de demonstração (`isDemoMode({ demoToolsEnabled })`). Assim estes
 * dados fictícios ficam num chunk separado que produção nunca baixa.
 */
import {
  DEMO_PEOPLE,
  SIMULATED_CNPJ_DATA,
  contractorTypeOf,
  normalizePersonName,
  onlyDigits,
  type ContractorType,
  type LegalForm,
  type PersonPosition,
} from '@annetec/contracts'
import { positionFromQualification } from '@/lib/adapters/contratacao'

export { buildSampleLogo, buildSamplePdf } from './files'

/**
 * Forma jurídica de cada CNPJ de demonstração (o código de natureza 3999 serve
 * a mais de uma forma, então o cenário decide).
 */
const DEMO_CNPJ_FORMS: Record<string, LegalForm> = {
  '11222333000181': 'associacao',
  '45678901000175': 'ltda',
  '33445566000186': 'sindicato',
  '77889900000166': 'ltda',
  '22334455000186': 'ong_oscip',
  '66554433000105': 'instituicao_religiosa',
}

/** CNPJ da demonstração ao vivo (ASSERV) — livre para criar a proposta na hora. */
export const DEMO_LIVE_CNPJ = '11222333000181'

export interface DemoScenario {
  cnpj: string
  legalName: string
  tradeName: string | null
  scenario: string
  legalForm: LegalForm
  contractorType: ContractorType
}

export function demoScenarios(): DemoScenario[] {
  return Object.entries(SIMULATED_CNPJ_DATA).map(([cnpj, data]) => {
    const legalForm = DEMO_CNPJ_FORMS[cnpj] ?? 'ltda'
    return {
      cnpj,
      legalName: data.legalName,
      tradeName: data.tradeName,
      scenario: data.scenario,
      legalForm,
      contractorType: contractorTypeOf(legalForm),
    }
  })
}

export function demoScenarioFor(cnpj: string): DemoScenario | null {
  return demoScenarios().find(item => item.cnpj === onlyDigits(cnpj)) ?? null
}

export function isDemoCnpj(cnpj: string | null | undefined): boolean {
  return onlyDigits(cnpj) in SIMULATED_CNPJ_DATA
}

export interface DemoPerson {
  name: string
  cpf: string
  isPep: boolean
  pepRole: string | null
  position: PersonPosition
  birthDate: string
  email: string
  phone: string
}

/** Domínio de e-mail do cenário (`contato@asserv.org.br` → `asserv.org.br`). */
export function demoDomain(cnpj: string): string {
  const email = SIMULATED_CNPJ_DATA[onlyDigits(cnpj)]?.email
  return email?.split('@')[1] ?? 'exemplo.org.br'
}

const DEMO_BIRTH_DATES = ['1982-04-17', '1976-11-02', '1988-07-23', '1970-01-30']

function emailLocal(name: string): string {
  const parts = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  return `${parts[0] ?? 'contato'}.${parts[parts.length - 1] ?? 'demo'}`
}

export function demoPeopleFor(cnpj: string): DemoPerson[] {
  const digits = onlyDigits(cnpj)
  const people = DEMO_PEOPLE[digits] ?? []
  const partners = SIMULATED_CNPJ_DATA[digits]?.partners ?? []
  const domain = demoDomain(digits)
  const phone = SIMULATED_CNPJ_DATA[digits]?.phone ?? '2130001000'
  return people.map((person, index) => {
    const partner = partners.find(p => normalizePersonName(p.name) === normalizePersonName(person.name))
    return {
      name: person.name,
      cpf: person.cpf,
      isPep: person.isPep === true,
      pepRole: person.pepRole ?? null,
      position: positionFromQualification(partner?.qualification ?? partners[index]?.qualification),
      birthDate: DEMO_BIRTH_DATES[index % DEMO_BIRTH_DATES.length] as string,
      email: `${emailLocal(person.name)}@${domain}`,
      phone: `${phone.slice(0, 2)}9${String(88000000 + index * 1111 + 1234).slice(0, 8)}`,
    }
  })
}

/**
 * E-mail do administrador do painel na demonstração. Leva um sufixo curto
 * para não colidir com uma conta criada numa rodada anterior (a pré-checagem
 * `admin_email_available` reprova e-mail que já existe).
 */
export function demoAdminEmail(cnpj: string): string {
  const suffix = Date.now().toString(36).slice(-4)
  return `painel.${suffix}@${demoDomain(cnpj)}`
}

/** Contato de tecnologia fictício do cenário (passo "Dados cadastrais"). */
export function demoTechnicalContact(cnpj: string): { name: string; email: string; phone: string; role: string } {
  return { name: 'Carla Menezes Rocha', email: `ti@${demoDomain(cnpj)}`, phone: '(21) 98877-6655', role: 'Tecnologia' }
}
