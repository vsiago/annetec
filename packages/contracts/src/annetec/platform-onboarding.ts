import { z } from 'zod'
import { ageOn, onlyDigits } from '../common/br'
import { paginationQuery } from '../common/pagination'
import { cnpj, cpf, dateOnly, email, hexColor, slug, telefone, uuid } from '../common/primitives'
import { clubPaymentMethod } from './enums'
import { platformCharge, platformPlanOffer, platformPlanQuote } from './platform-billing'
import { tenantAddress } from './tenant'

/**
 * Contratação pública da SUBOPERADORA no site da ANNETEC, com análise cadastral
 * (KYB) e provisionamento automático — blueprint da plataforma §0.1–§0.3.
 *
 * Fluxo: plano (simulação por vidas) → dados cadastrais (CNPJ com preenchimento
 * pela Receita) → representantes e sócios → documentos → marca e site →
 * contrato (aceite registrado) → forma de pagamento → envio para análise
 * (pré-checagens automáticas + fila de compliance) → aprovação → cobrança de
 * ativação → pagamento confirmado → provisionamento → vitrine em `/{slug}`.
 *
 * O candidato não tem conta: acompanha por link com chave HMAC (`?chave=`).
 * A conta do admin do inquilino só nasce no provisionamento.
 */

// ---------------------------------------------------------------------------
// Tipo de contratante e forma jurídica
// ---------------------------------------------------------------------------

export const contractorType = z.enum(['empresa', 'entidade', 'organizacao'])
export type ContractorType = z.infer<typeof contractorType>

export const CONTRACTOR_TYPE_LABELS: Record<ContractorType, string> = {
  empresa: 'Empresa',
  entidade: 'Entidade',
  organizacao: 'Organização',
}

export const CONTRACTOR_TYPE_DESCRIPTIONS: Record<ContractorType, string> = {
  empresa: 'LTDA, S.A., sociedade unipessoal ou empresário individual que vai operar o clube como negócio.',
  entidade: 'Associação, sindicato, cooperativa ou conselho de classe que oferece o clube aos seus membros.',
  organizacao: 'ONG/OSCIP, fundação ou instituição religiosa que oferece o clube à sua comunidade.',
}

export const legalForm = z.enum([
  'ltda',
  'sa',
  'slu',
  'ei',
  'associacao',
  'sindicato',
  'cooperativa',
  'conselho_classe',
  'ong_oscip',
  'fundacao',
  'instituicao_religiosa',
])
export type LegalForm = z.infer<typeof legalForm>

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  ltda: 'Sociedade Limitada (LTDA)',
  sa: 'Sociedade Anônima (S.A.)',
  slu: 'Sociedade Limitada Unipessoal (SLU)',
  ei: 'Empresário Individual',
  associacao: 'Associação',
  sindicato: 'Sindicato',
  cooperativa: 'Cooperativa',
  conselho_classe: 'Conselho de classe',
  ong_oscip: 'ONG / OSCIP',
  fundacao: 'Fundação',
  instituicao_religiosa: 'Instituição religiosa',
}

export const LEGAL_FORMS_BY_CONTRACTOR_TYPE: Record<ContractorType, LegalForm[]> = {
  empresa: ['ltda', 'sa', 'slu', 'ei'],
  entidade: ['associacao', 'sindicato', 'cooperativa', 'conselho_classe'],
  organizacao: ['ong_oscip', 'fundacao', 'instituicao_religiosa'],
}

export function contractorTypeOf(form: LegalForm): ContractorType {
  for (const type of contractorType.options) {
    if (LEGAL_FORMS_BY_CONTRACTOR_TYPE[type].includes(form)) return type
  }
  return 'empresa'
}

/**
 * Naturezas jurídicas aceitas por forma (tabela da Receita/CONCLA, 4 dígitos
 * sem hífen, igual ao `codigo_natureza_juridica` da BrasilAPI). Divergência é
 * ALERTA na pré-checagem, nunca bloqueio — quem decide é o compliance.
 */
export const LEGAL_NATURE_CODES_BY_FORM: Record<LegalForm, string[]> = {
  ltda: ['2062', '2240'],
  sa: ['2046', '2054'],
  slu: ['2062', '2305', '2313'],
  ei: ['2135'],
  associacao: ['3999'],
  sindicato: ['3131'],
  cooperativa: ['2143'],
  conselho_classe: ['1104', '1112', '3077', '3999'],
  ong_oscip: ['3999', '3069', '3301'],
  fundacao: ['3069', '1139', '1252'],
  instituicao_religiosa: ['3220'],
}

/**
 * Divisões CNAE (2 primeiros dígitos) esperadas por tipo. Basta a principal OU
 * uma secundária cair na lista. Divergência = alerta.
 */
export const EXPECTED_CNAE_DIVISIONS_BY_TYPE: Record<ContractorType, string[]> = {
  empresa: ['47', '62', '63', '64', '65', '66', '70', '73', '74', '78', '82', '86', '96'],
  entidade: ['64', '65', '66', '82', '86', '88', '94'],
  organizacao: ['85', '86', '87', '88', '94'],
}

/** `null` = sem código para comparar (pré-checagem `skipped`). */
export function isLegalNatureCompatible(form: LegalForm, code: string | null | undefined): boolean | null {
  const digits = onlyDigits(code)
  if (digits.length !== 4) return null
  return LEGAL_NATURE_CODES_BY_FORM[form].includes(digits)
}

/** `cnaes` com 7 dígitos (com ou sem máscara). `null` = nenhum CNAE informado. */
export function isCnaeCompatible(type: ContractorType, cnaes: (string | null | undefined)[]): boolean | null {
  const divisions = cnaes.map(c => onlyDigits(c).slice(0, 2)).filter(d => d.length === 2)
  if (divisions.length === 0) return null
  return divisions.some(d => EXPECTED_CNAE_DIVISIONS_BY_TYPE[type].includes(d))
}

// ---------------------------------------------------------------------------
// Máquina de estados da proposta
// ---------------------------------------------------------------------------

/**
 *  - `draft`: o candidato preenche (editável);
 *  - `submitted`: enviada, na fila, sem analista;
 *  - `in_review`: um analista assumiu;
 *  - `pending_info`: compliance pediu pendência — o candidato corrige e reenvia (editável);
 *  - `approved`: aprovada; a cobrança de ativação ainda não foi emitida (falha do gateway → retentativa);
 *  - `awaiting_payment`: cobrança de ativação emitida, aguardando pagamento;
 *  - `provisioning`: pago; criando organização, admin, régua, planos e assinatura;
 *  - `active`: inquilino no ar (final);
 *  - `rejected`: reprovada (final);
 *  - `canceled`: desistência, expiração ou cancelamento manual (final).
 */
export const onboardingStatus = z.enum([
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
  'provisioning',
  'active',
  'rejected',
  'canceled',
])
export type OnboardingStatus = z.infer<typeof onboardingStatus>

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  draft: 'Em preenchimento',
  submitted: 'Enviada para análise',
  in_review: 'Em análise',
  pending_info: 'Pendência para o contratante',
  approved: 'Aprovada',
  awaiting_payment: 'Aguardando pagamento da ativação',
  provisioning: 'Provisionando',
  active: 'Ativa',
  rejected: 'Reprovada',
  canceled: 'Cancelada',
}

/** Frase para o candidato na página de acompanhamento. */
export const ONBOARDING_STATUS_APPLICANT_HINTS: Record<OnboardingStatus, string> = {
  draft: 'Complete as etapas e envie a proposta para análise.',
  submitted: 'Recebemos sua proposta. A análise cadastral começa em até 1 dia útil.',
  in_review: 'Nossa equipe de compliance está analisando seus dados e documentos.',
  pending_info: 'Precisamos de alguns ajustes. Veja as pendências abaixo, corrija e reenvie.',
  approved: 'Proposta aprovada! Estamos emitindo a cobrança de ativação.',
  awaiting_payment: 'Proposta aprovada. Pague a ativação para colocar seu clube no ar.',
  provisioning: 'Pagamento confirmado. Estamos criando seu clube — leva poucos segundos.',
  active: 'Seu clube está no ar. Enviamos o acesso do painel para o e-mail do administrador.',
  rejected: 'Não foi possível aprovar a proposta. Veja o motivo abaixo.',
  canceled: 'Esta proposta foi cancelada.',
}

/** Transições permitidas (quem dispara cada uma: blueprint §0.2). */
export const ONBOARDING_TRANSITIONS: Record<OnboardingStatus, OnboardingStatus[]> = {
  draft: ['submitted', 'canceled'],
  submitted: ['in_review', 'pending_info', 'approved', 'rejected', 'canceled'],
  in_review: ['pending_info', 'approved', 'rejected', 'canceled'],
  pending_info: ['submitted', 'in_review', 'rejected', 'canceled'],
  approved: ['awaiting_payment', 'provisioning', 'canceled'],
  awaiting_payment: ['provisioning', 'canceled'],
  provisioning: ['active'],
  active: [],
  rejected: [],
  canceled: [],
}

export function canTransitionOnboarding(from: OnboardingStatus, to: OnboardingStatus): boolean {
  return ONBOARDING_TRANSITIONS[from].includes(to)
}

/** Estados em que o candidato edita as seções. */
export const ONBOARDING_EDITABLE_STATUSES: readonly OnboardingStatus[] = ['draft', 'pending_info']
export const ONBOARDING_FINAL_STATUSES: readonly OnboardingStatus[] = ['active', 'rejected', 'canceled']
/** Fila do compliance. */
export const ONBOARDING_QUEUE_STATUSES: readonly OnboardingStatus[] = ['submitted', 'in_review']

/** Prazo de análise a partir do envio (alerta de SLA na fila e na holding). */
export const ONBOARDING_REVIEW_SLA_HOURS = 48

/** Protocolo exibido ao candidato: `ANN-AAMM-XXXXX` (base32 Crockford). */
export const ONBOARDING_CODE_PATTERN = /^ANN-\d{4}-[0-9A-HJKMNP-TV-Z]{5}$/

/** Seções (etapas) do wizard, na ordem. */
export const onboardingSection = z.enum(['plan', 'company', 'people', 'documents', 'brand', 'contract', 'payment'])
export type OnboardingSection = z.infer<typeof onboardingSection>

export const ONBOARDING_SECTION_LABELS: Record<OnboardingSection, string> = {
  plan: 'Plano',
  company: 'Dados cadastrais',
  people: 'Representantes e sócios',
  documents: 'Documentos',
  brand: 'Marca e site',
  contract: 'Contrato',
  payment: 'Pagamento',
}

// ---------------------------------------------------------------------------
// Consulta de CNPJ (Receita via BrasilAPI, ou simulada)
// ---------------------------------------------------------------------------

export const cnpjLookupPartner = z.object({
  name: z.string(),
  /** Como a Receita devolve: CPF mascarado (`***456789**`) ou CNPJ do sócio PJ. */
  document: z.string().nullable(),
  qualification: z.string().nullable(),
  entryDate: dateOnly.nullable(),
})
export type CnpjLookupPartner = z.infer<typeof cnpjLookupPartner>

export const cnpjLookupResult = z.object({
  cnpj: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  /** 4 dígitos, ex.: `3999`. */
  legalNatureCode: z.string().nullable(),
  legalNatureName: z.string().nullable(),
  /** Optante pelo MEI (SIMEI). `null`/ausente = a fonte não informou. */
  mei: z.boolean().nullable().optional(),
  /** `ATIVA`, `BAIXADA`, `SUSPENSA`, `INAPTA`, `NULA`. */
  registrationStatus: z.string(),
  registrationStatusDate: dateOnly.nullable(),
  registrationStatusReason: z.string().nullable(),
  openingDate: dateOnly.nullable(),
  size: z.string().nullable(),
  shareCapital: z.number().nullable(),
  /** `code` com 7 dígitos, sem máscara. */
  mainCnae: z.object({ code: z.string(), description: z.string() }).nullable(),
  secondaryCnaes: z.array(z.object({ code: z.string(), description: z.string() })),
  address: z.object({
    cep: z.string().nullable(),
    street: z.string().nullable(),
    number: z.string().nullable(),
    complement: z.string().nullable(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
  }),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  partners: z.array(cnpjLookupPartner),
  provider: z.enum(['brasilapi', 'simulated']),
  cached: z.boolean(),
  fetchedAt: z.string().datetime(),
})
export type CnpjLookupResult = z.infer<typeof cnpjLookupResult>

/** `GET /api/v1/public/contratacao/cnpj/:cnpj`. Falha da Receita NÃO é erro: `unavailable` e o formulário segue manual. */
export const cnpjLookupResponse = z.object({
  found: z.boolean(),
  unavailable: z.boolean(),
  message: z.string().nullable(),
  result: cnpjLookupResult.nullable(),
})
export type CnpjLookupResponse = z.infer<typeof cnpjLookupResponse>

/**
 * `GET /api/v1/public/contratacao/cnpj/:cnpj` — a consulta mais
 * `demoToolsEnabled` (mesma regra de `onboardingApplicantView.demoToolsEnabled`):
 * é o 1º DTO da API que a tela inicial da contratação recebe.
 */
export const publicCnpjLookupResponse = cnpjLookupResponse.extend({ demoToolsEnabled: z.boolean() })
export type PublicCnpjLookupResponse = z.infer<typeof publicCnpjLookupResponse>

type SimulatedCnpj = Omit<CnpjLookupResult, 'provider' | 'cached' | 'fetchedAt'>

const simAddress = (
  street: string,
  number: string,
  neighborhood: string,
  city: string,
  state: string,
  cep: string,
): SimulatedCnpj['address'] => ({ cep, street, number, complement: null, neighborhood, city, state })

/**
 * CNPJs de DEMONSTRAÇÃO (dígitos válidos, dados fictícios). O provedor de CNPJ
 * responde estes de forma determinística e SEM rede, em qualquer modo — o
 * roteiro da demo não depende da BrasilAPI. `openingDate: null` + `recent` →
 * a API usa "hoje − 60 dias" (alerta de empresa nova).
 */
export const SIMULATED_CNPJ_DATA: Record<string, SimulatedCnpj & { scenario: string; recent?: boolean }> = {
  '11222333000181': {
    scenario: 'Entidade (associação) ativa, tudo em ordem — use na demo ao vivo',
    cnpj: '11222333000181',
    legalName: 'ASSOCIACAO DOS SERVIDORES DO VALE',
    tradeName: 'ASSERV',
    legalNatureCode: '3999',
    legalNatureName: 'Associação Privada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '2011-03-14',
    registrationStatusReason: null,
    openingDate: '2011-03-14',
    size: 'DEMAIS',
    shareCapital: 0,
    mainCnae: { code: '9430800', description: 'Atividades de associações de defesa de direitos sociais' },
    secondaryCnaes: [{ code: '9499500', description: 'Atividades associativas não especificadas anteriormente' }],
    address: simAddress('Rua das Palmeiras', '120', 'Centro', 'Volta Redonda', 'RJ', '27253000'),
    email: 'contato@asserv.org.br',
    phone: '2433451200',
    partners: [
      { name: 'MARIANA COSTA LIMA', document: '***444777**', qualification: 'Presidente', entryDate: '2022-01-10' },
      { name: 'RAFAEL SOUZA PINTO', document: '***555888**', qualification: 'Tesoureiro', entryDate: '2022-01-10' },
    ],
  },
  '45678901000175': {
    scenario: 'Empresa LTDA ativa com sócia PEP — gera alerta de pessoa politicamente exposta',
    cnpj: '45678901000175',
    legalName: 'VIDA MAIS BENEFICIOS LTDA',
    tradeName: 'VIDA MAIS',
    legalNatureCode: '2062',
    legalNatureName: 'Sociedade Empresária Limitada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '2018-06-01',
    registrationStatusReason: null,
    openingDate: '2018-06-01',
    size: 'EPP',
    shareCapital: 150000,
    mainCnae: { code: '8299799', description: 'Outras atividades de serviços prestados principalmente às empresas' },
    secondaryCnaes: [{ code: '6619399', description: 'Outras atividades auxiliares dos serviços financeiros' }],
    address: simAddress('Avenida Paulista', '1500', 'Bela Vista', 'São Paulo', 'SP', '01310200'),
    email: 'financeiro@vidamais.com.br',
    phone: '1132851100',
    partners: [
      { name: 'CARLOS EDUARDO NUNES', document: '***666999**', qualification: 'Sócio-Administrador', entryDate: '2018-06-01' },
      { name: 'PATRICIA ALVES NUNES', document: '***777000**', qualification: 'Sócio', entryDate: '2018-06-01' },
    ],
  },
  '33445566000186': {
    scenario: 'Sindicato ativo — caminho feliz de entidade sindical',
    cnpj: '33445566000186',
    legalName: 'SINDICATO DOS COMERCIARIOS DE NITEROI',
    tradeName: 'SINDCOM NITEROI',
    legalNatureCode: '3131',
    legalNatureName: 'Entidade Sindical',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '1998-09-20',
    registrationStatusReason: null,
    openingDate: '1998-09-20',
    size: 'DEMAIS',
    shareCapital: 0,
    mainCnae: { code: '9420100', description: 'Atividades de organizações sindicais' },
    secondaryCnaes: [],
    address: simAddress('Rua da Conceição', '45', 'Centro', 'Niterói', 'RJ', '24020085'),
    email: 'secretaria@sindcomniteroi.org.br',
    phone: '2127191300',
    partners: [{ name: 'JOSE AUGUSTO FERREIRA', document: '***982247**', qualification: 'Presidente', entryDate: '2023-03-01' }],
  },
  '77889900000166': {
    scenario: 'CNPJ BAIXADO — pré-checagem reprova (situação cadastral)',
    cnpj: '77889900000166',
    legalName: 'CLUBE ANTIGO DE VANTAGENS LTDA',
    tradeName: null,
    legalNatureCode: '2062',
    legalNatureName: 'Sociedade Empresária Limitada',
    registrationStatus: 'BAIXADA',
    registrationStatusDate: '2023-11-30',
    registrationStatusReason: 'Extinção por encerramento de liquidação voluntária',
    openingDate: '2012-02-15',
    size: 'ME',
    shareCapital: 20000,
    mainCnae: { code: '8299799', description: 'Outras atividades de serviços prestados principalmente às empresas' },
    secondaryCnaes: [],
    address: simAddress('Rua Voluntários da Pátria', '300', 'Botafogo', 'Rio de Janeiro', 'RJ', '22270010'),
    email: null,
    phone: null,
    partners: [{ name: 'ROBERTO DIAS MELO', document: '***456789**', qualification: 'Sócio-Administrador', entryDate: '2012-02-15' }],
  },
  '22334455000186': {
    scenario: 'ONG/OSCIP ativa — usada no pedido de pendência (ata de eleição)',
    cnpj: '22334455000186',
    legalName: 'INSTITUTO ESPERANCA SOLIDARIA',
    tradeName: 'ESPERANCA SOLIDARIA',
    legalNatureCode: '3999',
    legalNatureName: 'Associação Privada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '2015-08-10',
    registrationStatusReason: null,
    openingDate: '2015-08-10',
    size: 'DEMAIS',
    shareCapital: 0,
    mainCnae: { code: '9499500', description: 'Atividades associativas não especificadas anteriormente' },
    secondaryCnaes: [{ code: '8800600', description: 'Serviços de assistência social sem alojamento' }],
    address: simAddress('Rua Sete de Setembro', '88', 'Centro', 'Belo Horizonte', 'MG', '30160040'),
    email: 'contato@esperancasolidaria.org.br',
    phone: '3132224400',
    partners: [{ name: 'ANA PAULA REIS', document: '***533447**', qualification: 'Presidente', entryDate: '2021-05-05' }],
  },
  '66554433000105': {
    scenario: 'Instituição religiosa aberta há 2 meses — alerta de empresa nova',
    cnpj: '66554433000105',
    legalName: 'IGREJA COMUNIDADE BOAS NOVAS',
    tradeName: 'BOAS NOVAS',
    legalNatureCode: '3220',
    legalNatureName: 'Organização Religiosa',
    registrationStatus: 'ATIVA',
    registrationStatusDate: null,
    registrationStatusReason: null,
    openingDate: null,
    recent: true,
    size: 'DEMAIS',
    shareCapital: 0,
    mainCnae: { code: '9491000', description: 'Atividades de organizações religiosas ou filosóficas' },
    secondaryCnaes: [],
    address: simAddress('Rua Nova Esperança', '10', 'Jardim América', 'Curitiba', 'PR', '81520000'),
    email: 'secretaria@boasnovas.org',
    phone: '4130301010',
    partners: [{ name: 'LUCAS MOREIRA DA SILVA', document: '***456789**', qualification: 'Presidente', entryDate: null }],
  },
}

/** Pessoas FICTÍCIAS coerentes com `SIMULATED_CNPJ_DATA` (CPFs válidos) — seeds, testes e dica na tela da demo. */
export const DEMO_PEOPLE: Record<string, { name: string; cpf: string; isPep?: boolean; pepRole?: string }[]> = {
  '11222333000181': [
    { name: 'Mariana Costa Lima', cpf: '11144477735' },
    { name: 'Rafael Souza Pinto', cpf: '22255588846' },
  ],
  '45678901000175': [
    { name: 'Carlos Eduardo Nunes', cpf: '33366699957' },
    { name: 'Patricia Alves Nunes', cpf: '44477700083', isPep: true, pepRole: 'Vereadora do município de São Paulo' },
  ],
  '33445566000186': [{ name: 'Jose Augusto Ferreira', cpf: '52998224725' }],
  '77889900000166': [{ name: 'Roberto Dias Melo', cpf: '12345678909' }],
  '22334455000186': [{ name: 'Ana Paula Reis', cpf: '39053344705' }],
  '66554433000105': [{ name: 'Lucas Moreira da Silva', cpf: '98765432100' }],
}

/** Nome em caixa alta, sem acento e com espaços simples — comparação com o QSA. */
export function normalizePersonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A pessoa informada aparece no QSA? Nome normalizado igual, OU primeiro +
 * último nome iguais com os 6 dígitos visíveis do CPF mascarado batendo.
 */
export function matchPartnerInQsa(person: { name: string; cpf: string }, partners: CnpjLookupPartner[]): boolean {
  const name = normalizePersonName(person.name)
  const parts = name.split(' ')
  const cpfDigits = onlyDigits(person.cpf)
  return partners.some(partner => {
    const other = normalizePersonName(partner.name)
    if (other === name) return true
    const otherParts = other.split(' ')
    const sameEnds = otherParts[0] === parts[0] && otherParts[otherParts.length - 1] === parts[parts.length - 1]
    const visible = onlyDigits(partner.document)
    return sameEnds && visible.length === 6 && cpfDigits.length === 11 && cpfDigits.slice(3, 9) === visible
  })
}

// ---------------------------------------------------------------------------
// Dados cadastrais, pessoas, marca, contrato
// ---------------------------------------------------------------------------

/** Campo opcional de formulário chega como `''`; vira ausente antes de validar. */
const emptyAsUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

const fullName = z
  .string()
  .trim()
  .min(3, 'Informe o nome completo')
  .max(120, 'Nome longo demais')
  .refine(v => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome')

export const onboardingContact = z.object({
  name: fullName,
  email,
  phone: telefone,
  role: z.preprocess(emptyAsUndefined, z.string().trim().max(80).optional()),
})
export type OnboardingContact = z.infer<typeof onboardingContact>

export const onboardingApplicant = z.object({ name: fullName, email, phone: telefone })
export type OnboardingApplicant = z.infer<typeof onboardingApplicant>

/** `PUT .../empresa`. Campos da Receita chegam pré-preenchidos pela consulta; o candidato completa. */
export const onboardingCompanyInput = z.object({
  legalName: z.string().trim().min(3).max(200),
  tradeName: z.preprocess(emptyAsUndefined, z.string().trim().max(200).optional()),
  legalNatureCode: z.preprocess(emptyAsUndefined, z.string().regex(/^\d{4}$/, 'Natureza jurídica com 4 dígitos').optional()),
  legalNatureName: z.preprocess(emptyAsUndefined, z.string().max(200).optional()),
  mainCnae: z.object({ code: z.string().regex(/^\d{7}$/, 'CNAE com 7 dígitos'), description: z.string().max(300) }).optional(),
  secondaryCnaes: z.array(z.object({ code: z.string().regex(/^\d{7}$/), description: z.string().max(300) })).max(99).default([]),
  openingDate: z.preprocess(emptyAsUndefined, dateOnly.optional()),
  stateRegistration: z.preprocess(emptyAsUndefined, z.string().trim().max(30).optional()),
  municipalRegistration: z.preprocess(emptyAsUndefined, z.string().trim().max(30).optional()),
  website: z.preprocess(emptyAsUndefined, z.string().trim().url('Informe a URL completa (https://…)').max(200).optional()),
  /** E-mail e telefone institucionais (viram os do inquilino). */
  email,
  phone: telefone,
  address: tenantAddress,
  contacts: z.object({
    commercial: onboardingContact,
    financial: onboardingContact,
    technical: onboardingContact,
  }),
})
export type OnboardingCompanyInput = z.infer<typeof onboardingCompanyInput>

export const personPosition = z.enum([
  'socio_administrador',
  'socio',
  'administrador',
  'presidente',
  'vice_presidente',
  'diretor',
  'tesoureiro',
  'secretario',
  'procurador',
  'outro',
])
export type PersonPosition = z.infer<typeof personPosition>

export const PERSON_POSITION_LABELS: Record<PersonPosition, string> = {
  socio_administrador: 'Sócio-administrador',
  socio: 'Sócio',
  administrador: 'Administrador',
  presidente: 'Presidente',
  vice_presidente: 'Vice-presidente',
  diretor: 'Diretor',
  tesoureiro: 'Tesoureiro',
  secretario: 'Secretário',
  procurador: 'Procurador',
  outro: 'Outro',
}

export const pepRelationship = z.enum(['titular', 'familiar', 'colaborador_estreito'])
export type PepRelationship = z.infer<typeof pepRelationship>

export const PEP_RELATIONSHIP_LABELS: Record<PepRelationship, string> = {
  titular: 'É a própria pessoa exposta',
  familiar: 'Familiar de pessoa exposta',
  colaborador_estreito: 'Colaborador próximo de pessoa exposta',
}

/** Uma pessoa pode acumular papéis (sócio + representante + beneficiário final). */
export const onboardingPersonInput = z
  .object({
    /** Presente = atualiza a pessoa existente (mantém documentos vinculados). */
    id: uuid.optional(),
    name: fullName,
    cpf,
    birthDate: dateOnly.refine(v => {
      const age = ageOn(v)
      return age !== null && age >= 16 && age <= 120
    }, 'Data de nascimento inválida'),
    email: z.preprocess(emptyAsUndefined, email.optional()),
    phone: z.preprocess(emptyAsUndefined, telefone.optional()),
    position: personPosition,
    positionOther: z.preprocess(emptyAsUndefined, z.string().trim().max(80).optional()),
    isLegalRepresentative: z.boolean(),
    isPartner: z.boolean(),
    isBeneficialOwner: z.boolean(),
    /** % do capital (sócios). `null` em entidades sem capital. */
    ownershipPercent: z.number().gt(0).max(100).nullable().optional(),
    /** Representa por procuração (exige o documento `procuracao`). */
    actsByPowerOfAttorney: z.boolean().default(false),
    isPep: z.boolean(),
    pepRole: z.preprocess(emptyAsUndefined, z.string().trim().max(200).optional()),
    pepRelationship: pepRelationship.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.isPep && !p.pepRole) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pepRole'], message: 'Informe o cargo ou função pública' })
    }
    if (p.isPartner && (p.ownershipPercent === null || p.ownershipPercent === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownershipPercent'], message: 'Informe a participação do sócio' })
    }
    if (p.isLegalRepresentative && !p.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Representante legal precisa de e-mail' })
    }
    if (p.position === 'outro' && !p.positionOther) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['positionOther'], message: 'Informe o cargo' })
    }
  })
export type OnboardingPersonInput = z.infer<typeof onboardingPersonInput>

/** `PUT .../pessoas` — substitui a lista inteira (ids presentes são preservados). */
export const onboardingPeopleInput = z
  .object({ people: z.array(onboardingPersonInput).min(1, 'Informe ao menos uma pessoa').max(20) })
  .superRefine((input, ctx) => {
    if (!input.people.some(p => p.isLegalRepresentative)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['people'], message: 'Indique ao menos um representante legal' })
    }
    const cpfs = input.people.map(p => p.cpf)
    if (new Set(cpfs).size !== cpfs.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['people'], message: 'CPF repetido na lista' })
    }
    const total = input.people.reduce((acc, p) => acc + (p.ownershipPercent ?? 0), 0)
    if (total > 100.01) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['people'], message: 'A soma das participações passa de 100%' })
    }
  })
export type OnboardingPeopleInput = z.infer<typeof onboardingPeopleInput>

/**
 * Slugs que colidem com rotas estáticas da web (`app/*`) ou com nomes da
 * plataforma. `app/[tenant]` perde para a rota estática: um clube com esses
 * slugs nunca abriria.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  'admin', 'api', 'app', 'assets', 'auth', 'ajuda', 'annetec', 'blog', 'cadastro', 'cliente', 'contato',
  'contratar', 'dashboard', 'entidades', 'fatura-annetec', 'favicon', 'holding', 'login', 'logout',
  'materiais', 'planos', 'plataforma', 'privacidade', 'public', 'sobre', 'static', 'status', 'suporte',
  'termos', 'vendedor', 'webhooks', 'www',
]

export function isReservedSlug(value: string): boolean {
  return RESERVED_TENANT_SLUGS.includes(value.trim().toLowerCase())
}

/** Sugestão de slug a partir do nome: sem acento, minúsculo, hífens, até 40. */
export function suggestSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export const onboardingAdminInput = z.object({
  name: fullName,
  email,
  phone: z.preprocess(emptyAsUndefined, telefone.optional()),
})
export type OnboardingAdminInput = z.infer<typeof onboardingAdminInput>

/** `PUT .../marca` — marca, endereço do site e quem administra o painel. */
export const onboardingBrandInput = z.object({
  slug: slug.refine(v => !isReservedSlug(v), 'Este endereço é reservado'),
  clubName: z.string().trim().min(3, 'Informe o nome do clube').max(60),
  tagline: z.preprocess(emptyAsUndefined, z.string().trim().max(120).optional()),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  /** Arquivo enviado em `POST .../logo`; ausente = vitrine só com o nome. */
  logoFileId: uuid.nullable().optional(),
  admin: onboardingAdminInput,
})
export type OnboardingBrandInput = z.infer<typeof onboardingBrandInput>

/** `PUT .../plano`. */
export const onboardingPlanInput = z.object({
  planId: uuid,
  expectedLives: z.number().int().min(1).max(1_000_000),
})
export type OnboardingPlanInput = z.infer<typeof onboardingPlanInput>

/** `PUT .../pagamento` — forma da ativação E da recorrência. Cartão é digitado só na hora de pagar. */
export const onboardingPaymentInput = z.object({ paymentMethod: clubPaymentMethod })
export type OnboardingPaymentInput = z.infer<typeof onboardingPaymentInput>

/** Documento contratual versionado. O hash (sha256 do `contractDocumentText`) vai no aceite. */
export interface PlatformContractDocument {
  key: 'terms' | 'dpa'
  version: string
  title: string
  clauses: readonly string[]
}

export const PLATFORM_TERMS: PlatformContractDocument = {
  key: 'terms',
  version: '2026.09',
  title: 'Termo de Contratação da Plataforma ANNETEC (SaaS)',
  clauses: [
    'Objeto. Licença de uso, por assinatura, da plataforma ANNETEC para o CONTRATANTE operar um clube de benefícios com marca própria: vitrine em annetec/{endereço}, checkout, cobrança dos associados, carteirinhas digitais, painel de gestão e atendimento.',
    'Preço. Mensalidade do plano escolhido, que inclui até o limite de vidas do plano. Cada vida ativa acima do limite é cobrada pelo valor unitário do plano, apurado na geração da fatura. A adesão é cobrada uma única vez, junto da 1ª mensalidade.',
    'Participação na receita. Só se pactuada em aditivo: percentual sobre a receita recebida dos associados no período anterior. Sem aditivo, não se aplica.',
    'Faturamento. Fatura mensal no dia de vencimento definido na ativação, por Pix, boleto ou cartão de crédito. Após o vencimento incidem multa de 2% e juros de 1% ao mês.',
    'Inadimplência. Com 10 dias de atraso o painel do CONTRATANTE passa a somente leitura; com 30 dias o painel é bloqueado; com 90 dias a assinatura pode ser cancelada. Os associados do CONTRATANTE não são afetados: carteirinhas, portal e cobranças deles continuam funcionando.',
    'Obrigações do CONTRATANTE. Manter verdadeiros os dados cadastrais e documentos; manter o CNPJ regular; oferecer apenas benefícios lícitos; atender os seus associados; não apresentar o clube como plano de saúde (Lei 9.656/1998).',
    'Obrigações da ANNETEC. Manter a plataforma disponível (meta de 99,5% ao mês), prestar suporte em horário comercial, aplicar medidas de segurança da informação e manter cópias de segurança.',
    'Propriedade intelectual. A plataforma pertence à ANNETEC. Marca, logotipo e conteúdo do clube pertencem ao CONTRATANTE, que licencia seu uso para exibição na plataforma.',
    'Vigência e rescisão. Prazo indeterminado, com rescisão por qualquer das partes mediante aviso de 30 dias. Os dados ficam disponíveis para exportação por 90 dias após o término.',
    'Análise cadastral. A contratação depende de aprovação cadastral (conheça seu cliente e prevenção à lavagem de dinheiro). A ANNETEC pode pedir documentos complementares ou recusar a contratação.',
    'Foro. Fica eleito o foro da comarca da sede da ANNETEC.',
  ],
}

export const PLATFORM_DPA: PlatformContractDocument = {
  key: 'dpa',
  version: '2026.09',
  title: 'Acordo de Tratamento de Dados Pessoais (LGPD)',
  clauses: [
    'Papéis. O CONTRATANTE é o CONTROLADOR dos dados dos seus associados e dependentes; a ANNETEC é OPERADORA (Lei 13.709/2018, art. 5º, VII) e trata esses dados apenas conforme as instruções do CONTRATANTE e este acordo.',
    'Finalidades. Cadastro, cobrança, emissão de carteirinhas, atendimento, prevenção a fraudes e cumprimento de obrigações legais.',
    'Dados tratados. Identificação e contato (nome, CPF, e-mail, telefone, data de nascimento), dados de dependentes e dados de pagamento tokenizados. A ANNETEC não armazena número de cartão nem código de segurança.',
    'Suboperadores. Processadores de pagamento, hospedagem e envio de e-mail, sob obrigações equivalentes às deste acordo. A lista é fornecida mediante solicitação.',
    'Segurança. Criptografia em trânsito, controle de acesso por papel, trilha de auditoria e segregação lógica dos dados por contratante.',
    'Incidentes. A ANNETEC comunica ao CONTRATANTE, em até 48 horas da ciência, incidente de segurança que possa gerar risco aos titulares, com as informações do art. 48 da LGPD.',
    'Direitos dos titulares. A ANNETEC auxilia o CONTRATANTE a atender pedidos de acesso, correção, eliminação e portabilidade.',
    'Transferência internacional. Somente com as salvaguardas dos arts. 33 a 36 da LGPD.',
    'Término. Ao fim do contrato os dados são devolvidos ou eliminados em até 90 dias, salvo guarda exigida por lei.',
    'Dados do próprio CONTRATANTE. Dados de representantes e sócios são tratados pela ANNETEC como controladora, para análise cadastral, prevenção à lavagem de dinheiro e execução do contrato.',
  ],
}

/** Texto canônico (título + cláusulas numeradas) — o que é exibido e o que o sha256 do aceite cobre. */
export function contractDocumentText(doc: PlatformContractDocument): string {
  return [`${doc.title} — versão ${doc.version}`, ...doc.clauses.map((c, i) => `${i + 1}. ${c}`)].join('\n')
}

/** `POST .../aceite`. O signatário é um representante legal já cadastrado; o nome digitado precisa bater. */
export const onboardingContractAcceptanceInput = z.object({
  signerPersonId: uuid,
  signerName: fullName,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o termo de contratação' }) }),
  acceptDpa: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o acordo de tratamento de dados' }) }),
  termsVersion: z.literal(PLATFORM_TERMS.version),
  dpaVersion: z.literal(PLATFORM_DPA.version),
})
export type OnboardingContractAcceptanceInput = z.infer<typeof onboardingContractAcceptanceInput>

/** Registro do aceite eletrônico (gravado pela API; IP e user-agent vêm da requisição). */
export const contractAcceptance = z.object({
  termsVersion: z.string(),
  dpaVersion: z.string(),
  /** sha256 hex de `contractDocumentText(PLATFORM_TERMS)`. */
  termsHash: z.string(),
  dpaHash: z.string(),
  signerPersonId: uuid,
  signerName: z.string(),
  /** Só dígitos no banco; mascarado na visão do candidato. */
  signerCpf: z.string(),
  signerEmail: z.string().nullable(),
  acceptedAt: z.string().datetime(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
})
export type ContractAcceptance = z.infer<typeof contractAcceptance>

// ---------------------------------------------------------------------------
// Documentos (KYB) e arquivos
// ---------------------------------------------------------------------------

export const kybDocumentKind = z.enum([
  'contrato_social',
  'estatuto_social',
  'ata_eleicao',
  'requerimento_empresario',
  'cartao_cnpj',
  'comprovante_endereco',
  'documento_identidade',
  'procuracao',
  'registro_sindical',
  'ato_criacao_conselho',
  'qualificacao_oscip',
  'balanco_patrimonial',
  'certidao_negativa',
  'registro_ocb',
  'outro',
])
export type KybDocumentKind = z.infer<typeof kybDocumentKind>

export const KYB_DOCUMENT_KIND_LABELS: Record<KybDocumentKind, string> = {
  contrato_social: 'Contrato social consolidado',
  estatuto_social: 'Estatuto social',
  ata_eleicao: 'Ata de eleição da diretoria vigente',
  requerimento_empresario: 'Requerimento de empresário',
  cartao_cnpj: 'Cartão CNPJ',
  comprovante_endereco: 'Comprovante de endereço da sede',
  documento_identidade: 'Documento de identidade (RG ou CNH)',
  procuracao: 'Procuração',
  registro_sindical: 'Registro sindical (MTE)',
  ato_criacao_conselho: 'Lei ou ato de criação do conselho',
  qualificacao_oscip: 'Certificado de qualificação como OSCIP',
  balanco_patrimonial: 'Último balanço patrimonial',
  certidao_negativa: 'Certidão negativa de débitos federais',
  registro_ocb: 'Registro na OCB',
  outro: 'Outro documento',
}

export const KYB_DOCUMENT_KIND_HINTS: Partial<Record<KybDocumentKind, string>> = {
  contrato_social: 'Última alteração consolidada, registrada na Junta Comercial.',
  estatuto_social: 'Versão vigente, registrada em cartório.',
  ata_eleicao: 'Ata que elegeu a diretoria atual, registrada em cartório.',
  cartao_cnpj: 'Opcional: a situação cadastral já é consultada na Receita automaticamente.',
  comprovante_endereco: 'Conta de consumo ou equivalente, emitida há no máximo 90 dias.',
  documento_identidade: 'Frente e verso, legível.',
  procuracao: 'Com poderes para contratar em nome da instituição.',
}

export interface KybDocumentRequirement {
  kind: KybDocumentKind
  required: boolean
  /** `person`: um documento por pessoa filtrada. */
  scope: 'company' | 'person'
  personFilter?: 'legal_representatives' | 'attorneys'
  note?: string
}

const REQ = {
  enderecoSede: { kind: 'comprovante_endereco', required: true, scope: 'company' },
  cartaoCnpj: { kind: 'cartao_cnpj', required: false, scope: 'company', note: 'Consultado automaticamente na Receita' },
  identidade: { kind: 'documento_identidade', required: true, scope: 'person', personFilter: 'legal_representatives' },
  procuracao: { kind: 'procuracao', required: true, scope: 'person', personFilter: 'attorneys' },
  certidao: { kind: 'certidao_negativa', required: false, scope: 'company' },
  estatuto: { kind: 'estatuto_social', required: true, scope: 'company' },
  ata: { kind: 'ata_eleicao', required: true, scope: 'company' },
} as const satisfies Record<string, KybDocumentRequirement>

/** Documentos por forma jurídica — a lista que o wizard exibe e que a pré-checagem cobra. */
export const KYB_DOCUMENT_REQUIREMENTS: Record<LegalForm, KybDocumentRequirement[]> = {
  ltda: [
    { kind: 'contrato_social', required: true, scope: 'company' },
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    { kind: 'balanco_patrimonial', required: false, scope: 'company' },
    REQ.certidao,
    REQ.cartaoCnpj,
  ],
  sa: [
    REQ.estatuto,
    REQ.ata,
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    { kind: 'balanco_patrimonial', required: true, scope: 'company' },
    REQ.certidao,
    REQ.cartaoCnpj,
  ],
  slu: [{ kind: 'contrato_social', required: true, scope: 'company' }, REQ.enderecoSede, REQ.identidade, REQ.procuracao, REQ.certidao, REQ.cartaoCnpj],
  ei: [{ kind: 'requerimento_empresario', required: true, scope: 'company' }, REQ.enderecoSede, REQ.identidade, REQ.procuracao, REQ.cartaoCnpj],
  associacao: [REQ.estatuto, REQ.ata, REQ.enderecoSede, REQ.identidade, REQ.procuracao, REQ.certidao, REQ.cartaoCnpj],
  sindicato: [
    REQ.estatuto,
    REQ.ata,
    { kind: 'registro_sindical', required: true, scope: 'company' },
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    REQ.cartaoCnpj,
  ],
  cooperativa: [
    REQ.estatuto,
    REQ.ata,
    { kind: 'registro_ocb', required: false, scope: 'company' },
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    REQ.certidao,
    REQ.cartaoCnpj,
  ],
  conselho_classe: [
    { kind: 'ato_criacao_conselho', required: true, scope: 'company' },
    REQ.ata,
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    REQ.cartaoCnpj,
  ],
  ong_oscip: [
    REQ.estatuto,
    REQ.ata,
    { kind: 'qualificacao_oscip', required: false, scope: 'company', note: 'Se a organização for qualificada como OSCIP' },
    REQ.enderecoSede,
    REQ.identidade,
    REQ.procuracao,
    REQ.certidao,
    REQ.cartaoCnpj,
  ],
  fundacao: [REQ.estatuto, REQ.ata, REQ.enderecoSede, REQ.identidade, REQ.procuracao, REQ.certidao, REQ.cartaoCnpj],
  instituicao_religiosa: [REQ.estatuto, REQ.ata, REQ.enderecoSede, REQ.identidade, REQ.procuracao, REQ.cartaoCnpj],
}

export interface KybRequirementItem {
  /** `kind` ou `kind:personId` — chave estável do item no checklist. */
  key: string
  kind: KybDocumentKind
  required: boolean
  personId: string | null
  personName: string | null
  label: string
  note: string | null
}

/** Expande a lista da forma jurídica com uma linha por pessoa nos documentos pessoais. */
export function kybRequirementsFor(
  form: LegalForm,
  people: { id: string; name: string; isLegalRepresentative: boolean; actsByPowerOfAttorney: boolean }[],
): KybRequirementItem[] {
  const items: KybRequirementItem[] = []
  for (const req of KYB_DOCUMENT_REQUIREMENTS[form]) {
    if (req.scope === 'company') {
      items.push({
        key: req.kind,
        kind: req.kind,
        required: req.required,
        personId: null,
        personName: null,
        label: KYB_DOCUMENT_KIND_LABELS[req.kind],
        note: req.note ?? KYB_DOCUMENT_KIND_HINTS[req.kind] ?? null,
      })
      continue
    }
    const filtered = people.filter(p =>
      req.personFilter === 'attorneys' ? p.actsByPowerOfAttorney : p.isLegalRepresentative,
    )
    for (const person of filtered) {
      items.push({
        key: `${req.kind}:${person.id}`,
        kind: req.kind,
        required: req.required,
        personId: person.id,
        personName: person.name,
        label: `${KYB_DOCUMENT_KIND_LABELS[req.kind]} — ${person.name}`,
        note: req.note ?? KYB_DOCUMENT_KIND_HINTS[req.kind] ?? null,
      })
    }
  }
  return items
}

export const kybDocumentStatus = z.enum(['uploaded', 'approved', 'rejected', 'replaced'])
export type KybDocumentStatus = z.infer<typeof kybDocumentStatus>

export const KYB_DOCUMENT_STATUS_LABELS: Record<KybDocumentStatus, string> = {
  uploaded: 'Enviado — aguardando análise',
  approved: 'Aprovado',
  rejected: 'Recusado',
  replaced: 'Substituído',
}

/** Estado de um item do checklist de documentos. */
export const kybChecklistState = z.enum(['missing', 'uploaded', 'approved', 'rejected'])
export type KybChecklistState = z.infer<typeof kybChecklistState>

/** Cruza exigências × documentos (ignora `replaced`; vale o mais recente por chave). */
export function kybChecklist(
  requirements: KybRequirementItem[],
  documents: { id: string; kind: KybDocumentKind; personId: string | null; status: KybDocumentStatus; uploadedAt: string }[],
): (KybRequirementItem & { state: KybChecklistState; documentId: string | null })[] {
  return requirements.map(req => {
    const latest = documents
      .filter(d => d.status !== 'replaced' && d.kind === req.kind && (req.personId === null || d.personId === req.personId))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
    return { ...req, state: latest ? (latest.status as KybChecklistState) : 'missing', documentId: latest?.id ?? null }
  })
}

/** 4 MB: cabe no limite de corpo das funções da Vercel (4,5 MB). */
export const KYB_MAX_FILE_BYTES = 4 * 1024 * 1024
export const KYB_ACCEPTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const KYB_MAX_DOCUMENTS_PER_PROPOSAL = 40
/** Logo: PNG/JPEG até 1 MB (SVG fica de fora — pode carregar script). */
export const BRAND_LOGO_MAX_BYTES = 1024 * 1024
export const BRAND_LOGO_MIME_TYPES = ['image/png', 'image/jpeg'] as const

export const storageDriver = z.enum(['local', 'supabase', 's3'])
export type StorageDriver = z.infer<typeof storageDriver>
export const fileVisibility = z.enum(['private', 'public'])
export type FileVisibility = z.infer<typeof fileVisibility>
export const filePurpose = z.enum(['kyb_document', 'brand_logo'])
export type FilePurpose = z.infer<typeof filePurpose>

export const kybDocument = z.object({
  id: uuid,
  kind: kybDocumentKind,
  personId: uuid.nullable(),
  personName: z.string().nullable(),
  status: kybDocumentStatus,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  reviewNote: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime(),
})
export type KybDocument = z.infer<typeof kybDocument>

/** Campos do multipart de `POST .../documentos` (além do arquivo `file`). */
export const uploadKybDocumentFields = z.object({
  kind: kybDocumentKind,
  personId: z.preprocess(emptyAsUndefined, uuid.optional()),
})
export type UploadKybDocumentFields = z.infer<typeof uploadKybDocumentFields>

export const reviewKybDocumentInput = z
  .object({
    status: z.enum(['approved', 'rejected']),
    note: z.preprocess(emptyAsUndefined, z.string().trim().max(500).optional()),
  })
  .refine(v => v.status !== 'rejected' || (v.note?.length ?? 0) >= 3, {
    message: 'Explique o motivo da recusa',
    path: ['note'],
  })
export type ReviewKybDocumentInput = z.infer<typeof reviewKybDocumentInput>

/** `POST .../logo` → arquivo público servido em `GET /api/v1/public/arquivos/:fileId`. */
export const uploadedFile = z.object({ fileId: uuid, url: z.string().url(), fileName: z.string(), sizeBytes: z.number().int() })
export type UploadedFile = z.infer<typeof uploadedFile>

// ---------------------------------------------------------------------------
// Pré-checagens automáticas
// ---------------------------------------------------------------------------

export const precheckCode = z.enum([
  'cnpj_valid',
  'cnpj_active',
  'company_age',
  'legal_nature_compatible',
  'cnae_compatible',
  'representatives_in_qsa',
  'beneficial_owners_declared',
  'pep_alert',
  'required_documents',
  'document_unique',
  'slug_available',
  'admin_email_available',
])
export type PrecheckCode = z.infer<typeof precheckCode>

export const PRECHECK_LABELS: Record<PrecheckCode, string> = {
  cnpj_valid: 'CNPJ válido',
  cnpj_active: 'Situação cadastral ativa na Receita',
  company_age: 'Tempo de abertura',
  legal_nature_compatible: 'Natureza jurídica compatível com o tipo',
  cnae_compatible: 'Atividade (CNAE) compatível',
  representatives_in_qsa: 'Representantes no quadro societário',
  beneficial_owners_declared: 'Beneficiários finais declarados',
  pep_alert: 'Pessoa politicamente exposta',
  required_documents: 'Documentos obrigatórios',
  document_unique: 'CNPJ ainda não contratante',
  slug_available: 'Endereço do site disponível',
  admin_email_available: 'E-mail do administrador disponível',
}

/** `fail` destes impede aprovar sem override justificado (os demais só alertam). */
export const PRECHECK_BLOCKING: Record<PrecheckCode, boolean> = {
  cnpj_valid: true,
  cnpj_active: true,
  company_age: false,
  legal_nature_compatible: false,
  cnae_compatible: false,
  representatives_in_qsa: false,
  beneficial_owners_declared: false,
  pep_alert: false,
  required_documents: true,
  document_unique: true,
  slug_available: true,
  admin_email_available: true,
}

/** Empresa aberta há menos que isto → alerta `company_age`. */
export const MIN_COMPANY_AGE_DAYS = 180

export const precheckOutcome = z.enum(['pass', 'warn', 'fail', 'skipped'])
export type PrecheckOutcome = z.infer<typeof precheckOutcome>

export const precheckResult = z.object({
  code: precheckCode,
  outcome: precheckOutcome,
  /** Frase pronta, pt-BR. */
  message: z.string(),
  details: z.record(z.unknown()).nullable(),
  checkedAt: z.string().datetime(),
})
export type PrecheckResult = z.infer<typeof precheckResult>

export const precheckSummary = z.enum(['pass', 'warn', 'fail'])
export type PrecheckSummary = z.infer<typeof precheckSummary>

export function summarizePrechecks(results: Pick<PrecheckResult, 'outcome'>[]): PrecheckSummary {
  if (results.some(r => r.outcome === 'fail')) return 'fail'
  if (results.some(r => r.outcome === 'warn')) return 'warn'
  return 'pass'
}

export function blockingPrecheckFailures<T extends Pick<PrecheckResult, 'code' | 'outcome'>>(results: T[]): T[] {
  return results.filter(r => r.outcome === 'fail' && PRECHECK_BLOCKING[r.code])
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export const complianceChecklistItem = z.enum([
  'documents_verified',
  'representation_powers',
  'beneficial_owners',
  'pep_due_diligence',
  'address_confirmed',
  'activity_compatible',
  'brand_reviewed',
  'commercial_terms',
])
export type ComplianceChecklistItem = z.infer<typeof complianceChecklistItem>

export const COMPLIANCE_CHECKLIST_LABELS: Record<ComplianceChecklistItem, string> = {
  documents_verified: 'Documentos conferidos, legíveis e vigentes',
  representation_powers: 'Poderes de representação conferidos no ato constitutivo ou procuração',
  beneficial_owners: 'Beneficiários finais identificados',
  pep_due_diligence: 'Diligência reforçada de pessoa politicamente exposta',
  address_confirmed: 'Endereço da sede confirmado',
  activity_compatible: 'Atividade compatível com clube de benefícios',
  brand_reviewed: 'Nome, marca e endereço do site adequados (sem marca de terceiros)',
  commercial_terms: 'Plano, preço e forma de pagamento conferidos',
}

export const complianceChecklistEntry = z.object({
  checked: z.boolean(),
  note: z.string().nullable(),
  checkedBy: z.string().nullable(),
  checkedAt: z.string().datetime().nullable(),
})
export type ComplianceChecklistEntry = z.infer<typeof complianceChecklistEntry>

export const complianceChecklist = z.record(complianceChecklistItem, complianceChecklistEntry)
export type ComplianceChecklist = z.infer<typeof complianceChecklist>

export const updateComplianceChecklistInput = z.object({
  items: z
    .array(
      z.object({
        item: complianceChecklistItem,
        checked: z.boolean(),
        note: z.preprocess(emptyAsUndefined, z.string().trim().max(500).optional()),
      }),
    )
    .min(1),
})
export type UpdateComplianceChecklistInput = z.infer<typeof updateComplianceChecklistInput>

/** Completo = todos marcados; `pep_due_diligence` só conta quando há PEP. */
export function isComplianceChecklistComplete(checklist: ComplianceChecklist, hasPep: boolean): boolean {
  return complianceChecklistItem.options.every(item =>
    item === 'pep_due_diligence' && !hasPep ? true : checklist[item]?.checked === true,
  )
}

export const pendingRequestItem = z.object({
  section: onboardingSection,
  documentKind: kybDocumentKind.optional(),
  personId: uuid.optional(),
  note: z.string().trim().min(3).max(500),
})
export type PendingRequestItem = z.infer<typeof pendingRequestItem>

/** `POST /platform/onboarding/propostas/:id/pendencias`. */
export const requestOnboardingInfoInput = z.object({
  message: z.string().trim().min(10, 'Explique o que falta').max(2000),
  items: z.array(pendingRequestItem).min(1).max(30),
})
export type RequestOnboardingInfoInput = z.infer<typeof requestOnboardingInfoInput>

export const onboardingPendingRequest = requestOnboardingInfoInput.extend({
  requestedAt: z.string().datetime(),
  requestedBy: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
})
export type OnboardingPendingRequest = z.infer<typeof onboardingPendingRequest>

export const approveOnboardingInput = z
  .object({
    note: z.preprocess(emptyAsUndefined, z.string().trim().max(2000).optional()),
    /** Aprova apesar de pré-checagem bloqueante ou checklist incompleto. Exige motivo. */
    override: z.boolean().default(false),
    overrideReason: z.preprocess(emptyAsUndefined, z.string().trim().min(10).max(2000).optional()),
  })
  .refine(v => !v.override || !!v.overrideReason, { message: 'Justifique a aprovação com ressalva', path: ['overrideReason'] })
export type ApproveOnboardingInput = z.infer<typeof approveOnboardingInput>

export const rejectOnboardingInput = z.object({ reason: z.string().trim().min(10, 'Explique o motivo').max(2000) })
export type RejectOnboardingInput = z.infer<typeof rejectOnboardingInput>

export const cancelOnboardingInput = z.object({ reason: z.string().trim().min(3).max(500) })
export type CancelOnboardingInput = z.infer<typeof cancelOnboardingInput>

export const onboardingNoteInput = z.object({ text: z.string().trim().min(2).max(4000) })
export type OnboardingNoteInput = z.infer<typeof onboardingNoteInput>

/** Provisionamento manual (superadmin): retentativa após falha, ou ativação isenta (`waiveActivation`). */
export const provisionOnboardingInput = z
  .object({
    waiveActivation: z.boolean().default(false),
    reason: z.preprocess(emptyAsUndefined, z.string().trim().min(10).max(500).optional()),
  })
  .refine(v => !v.waiveActivation || !!v.reason, { message: 'Justifique a isenção da ativação', path: ['reason'] })
export type ProvisionOnboardingInput = z.infer<typeof provisionOnboardingInput>

// ---------------------------------------------------------------------------
// Início, acompanhamento e fila
// ---------------------------------------------------------------------------

/**
 * Código de indicação do vendedor ANNETEC (slug curto, ex.: `joao-silva`).
 * Vem do link do vendedor (`/contratar?ref=joao-silva`).
 */
export const sellerReferralCode = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Código de indicação com ao menos 3 caracteres')
  .max(40, 'Código de indicação longo demais')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use só letras minúsculas, números e hífens')

/** `POST /api/v1/public/contratacao/propostas`. */
export const startOnboardingInput = z
  .object({
    contractorType,
    legalForm,
    cnpj,
    planId: uuid,
    expectedLives: z.number().int().min(1).max(1_000_000),
    applicant: onboardingApplicant,
    acceptPrivacy: z.literal(true, {
      errorMap: () => ({ message: 'Autorize o uso dos dados para a análise da proposta' }),
    }),
    /**
     * Código do vendedor que indicou (opcional). Código de vendedor ATIVO
     * vincula a proposta a ele; desconhecido/inativo é ignorado em silêncio
     * (a contratação nunca falha por causa dele).
     */
    referralCode: z.preprocess(
      value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().toLowerCase().max(60).optional(),
    ),
  })
  .refine(v => LEGAL_FORMS_BY_CONTRACTOR_TYPE[v.contractorType].includes(v.legalForm), {
    message: 'Forma jurídica não corresponde ao tipo de contratante',
    path: ['legalForm'],
  })
export type StartOnboardingInput = z.infer<typeof startOnboardingInput>

export const recoverOnboardingAccessInput = z.object({ email, cnpj })
export type RecoverOnboardingAccessInput = z.infer<typeof recoverOnboardingAccessInput>

export const ONBOARDING_EVENT_TYPES = [
  'PROPOSAL_CREATED',
  'SECTION_SAVED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_REMOVED',
  'DOCUMENT_APPROVED',
  'DOCUMENT_REJECTED',
  'CONTRACT_ACCEPTED',
  'SUBMITTED',
  'RESUBMITTED',
  'PRECHECKS_RAN',
  'CLAIMED',
  'CHECKLIST_UPDATED',
  'INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
  'ACTIVATION_CHARGE_CREATED',
  'PAYMENT_CONFIRMED',
  'PROVISIONING_STARTED',
  'PROVISIONED',
  'PROVISIONING_FAILED',
  'CANCELED',
  'EXPIRED',
  'NOTE_ADDED',
  'EMAIL_SENT',
  'ACCESS_RECOVERED',
] as const
export type OnboardingEventType = (typeof ONBOARDING_EVENT_TYPES)[number]

export const ONBOARDING_EVENT_LABELS: Record<OnboardingEventType, string> = {
  PROPOSAL_CREATED: 'Proposta iniciada',
  SECTION_SAVED: 'Etapa salva',
  DOCUMENT_UPLOADED: 'Documento enviado',
  DOCUMENT_REMOVED: 'Documento removido',
  DOCUMENT_APPROVED: 'Documento aprovado',
  DOCUMENT_REJECTED: 'Documento recusado',
  CONTRACT_ACCEPTED: 'Contrato aceito',
  SUBMITTED: 'Enviada para análise',
  RESUBMITTED: 'Reenviada após pendência',
  PRECHECKS_RAN: 'Pré-checagens executadas',
  CLAIMED: 'Análise assumida',
  CHECKLIST_UPDATED: 'Checklist atualizado',
  INFO_REQUESTED: 'Pendência solicitada',
  APPROVED: 'Proposta aprovada',
  REJECTED: 'Proposta reprovada',
  ACTIVATION_CHARGE_CREATED: 'Cobrança de ativação emitida',
  PAYMENT_CONFIRMED: 'Pagamento da ativação confirmado',
  PROVISIONING_STARTED: 'Provisionamento iniciado',
  PROVISIONED: 'Clube no ar',
  PROVISIONING_FAILED: 'Falha no provisionamento',
  CANCELED: 'Proposta cancelada',
  EXPIRED: 'Proposta expirada',
  NOTE_ADDED: 'Nota interna',
  EMAIL_SENT: 'E-mail enviado',
  ACCESS_RECOVERED: 'Link de acompanhamento reenviado',
}

export const onboardingEventVisibility = z.enum(['public', 'internal'])
export type OnboardingEventVisibility = z.infer<typeof onboardingEventVisibility>

export const onboardingEvent = z.object({
  id: uuid,
  type: z.string(),
  visibility: onboardingEventVisibility,
  message: z.string(),
  actorName: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type OnboardingEvent = z.infer<typeof onboardingEvent>

export const onboardingPerson = z.object({
  id: uuid,
  name: z.string(),
  /** Só dígitos no console; mascarado (`***.456.789-**`) na visão do candidato. */
  cpf: z.string(),
  birthDate: dateOnly.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  position: personPosition,
  positionOther: z.string().nullable(),
  isLegalRepresentative: z.boolean(),
  isPartner: z.boolean(),
  isBeneficialOwner: z.boolean(),
  ownershipPercent: z.number().nullable(),
  actsByPowerOfAttorney: z.boolean(),
  isPep: z.boolean(),
  pepRole: z.string().nullable(),
  pepRelationship: pepRelationship.nullable(),
  /** Resultado da última pré-checagem de QSA. */
  qsaMatch: z.enum(['matched', 'not_found', 'not_applicable']).nullable(),
})
export type OnboardingPerson = z.infer<typeof onboardingPerson>

export const onboardingBrand = onboardingBrandInput.extend({
  logoUrl: z.string().nullable(),
  /** `https://<web>/{slug}` — prévia do endereço. */
  siteUrl: z.string(),
})
export type OnboardingBrand = z.infer<typeof onboardingBrand>

export const onboardingCompletenessItem = z.object({
  section: onboardingSection,
  complete: z.boolean(),
  /** Frases do que falta, pt-BR. */
  missing: z.array(z.string()),
})
export type OnboardingCompletenessItem = z.infer<typeof onboardingCompletenessItem>

export const kybChecklistRow = z.object({
  key: z.string(),
  kind: kybDocumentKind,
  required: z.boolean(),
  personId: uuid.nullable(),
  personName: z.string().nullable(),
  label: z.string(),
  note: z.string().nullable(),
  state: kybChecklistState,
  documentId: uuid.nullable(),
})
export type KybChecklistRow = z.infer<typeof kybChecklistRow>

/**
 * Desconto APROVADO pelo superadmin para a proposta (pedido do vendedor):
 * `setupFeePercent` 0–100 (100 = isenção da adesão), `monthlyPercent` 0–50 na
 * mensalidade do plano por `monthlyMonths` mensalidades (contando a 1ª, que vai
 * na ativação; `null` = permanente). Já está aplicado em `plan.quote`.
 */
export const proposalDiscount = z.object({
  setupFeePercent: z.number().min(0).max(100),
  monthlyPercent: z.number().min(0).max(50),
  monthlyMonths: z.number().int().min(1).nullable(),
})
export type ProposalDiscount = z.infer<typeof proposalDiscount>

/** O que a proposta guarda do desconto aprovado (`platform_onboarding_proposals.discount`). */
export interface ProposalDiscountRecord extends ProposalDiscount {
  requestId: string
  approvedAt: string
  approvedByUserId: string | null
  approvedByName: string | null
}

/** Vendedor ANNETEC a quem a proposta está atribuída (link do vendedor ou código no site). */
export const proposalSellerRef = z.object({
  userId: z.string(),
  name: z.string(),
  referralCode: z.string().nullable(),
})
export type ProposalSellerRef = z.infer<typeof proposalSellerRef>

/** `GET /api/v1/public/contratacao/propostas/:id?chave=` — o que o candidato vê (wizard e acompanhamento). */
export const onboardingApplicantView = z.object({
  id: uuid,
  code: z.string(),
  status: onboardingStatus,
  contractorType,
  legalForm,
  cnpj: z.string(),
  applicant: onboardingApplicant,
  plan: z.object({
    planId: uuid.nullable(),
    expectedLives: z.number().int(),
    offer: platformPlanOffer.nullable(),
    /** Já com o desconto aprovado (`discount`), quando houver. */
    quote: platformPlanQuote.nullable(),
    /** Desconto aprovado pelo superadmin; `null` sem desconto. */
    discount: proposalDiscount.nullable(),
  }),
  paymentMethod: clubPaymentMethod.nullable(),
  company: onboardingCompanyInput.nullable(),
  receita: cnpjLookupResult.nullable(),
  people: z.array(onboardingPerson),
  documents: z.array(kybDocument),
  requirements: z.array(kybChecklistRow),
  brand: onboardingBrand.nullable(),
  contract: contractAcceptance.nullable(),
  completeness: z.array(onboardingCompletenessItem),
  canEdit: z.boolean(),
  canSubmit: z.boolean(),
  pendingRequest: onboardingPendingRequest.nullable(),
  rejectionReason: z.string().nullable(),
  /** Presente de `approved` em diante (com `publicUrl` para pagar). */
  activationCharge: platformCharge.nullable(),
  canSimulatePayment: z.boolean(),
  /**
   * Ambiente com ferramentas de demonstração da plataforma (API fora de
   * produção ou `PLATFORM_DEMO_TOOLS_ENABLED`). Única fonte do "modo demo" da
   * contratação na web — nunca `NODE_ENV` do build.
   */
  demoToolsEnabled: z.boolean(),
  /** Preenchido quando `active`. */
  tenant: z
    .object({ organizationId: z.string(), slug: z.string(), name: z.string(), siteUrl: z.string(), loginUrl: z.string() })
    .nullable(),
  /** Só eventos `public`, mais recente primeiro. */
  events: z.array(onboardingEvent),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  submittedAt: z.string().datetime().nullable(),
})
export type OnboardingApplicantView = z.infer<typeof onboardingApplicantView>

export const startOnboardingResult = z.object({
  proposalId: uuid,
  code: z.string(),
  /** HMAC da proposta — guarde na URL (`?chave=`). */
  accessKey: z.string(),
  /** Caminho da web: `/contratar/<id>?chave=<accessKey>`. */
  trackingPath: z.string(),
  proposal: onboardingApplicantView,
})
export type StartOnboardingResult = z.infer<typeof startOnboardingResult>

/** `GET /api/v1/public/contratacao/slug-disponivel?slug=`. */
export const slugAvailability = z.object({
  slug: z.string(),
  available: z.boolean(),
  reason: z.enum(['invalid', 'reserved', 'taken', 'pending_proposal']).nullable(),
  message: z.string().nullable(),
  suggestions: z.array(z.string()),
})
export type SlugAvailability = z.infer<typeof slugAvailability>

export const onboardingAssignee = z.object({ userId: z.string(), name: z.string() })

export const onboardingProposalListItem = z.object({
  id: uuid,
  code: z.string(),
  status: onboardingStatus,
  contractorType,
  legalForm,
  cnpj: z.string(),
  legalName: z.string().nullable(),
  tradeName: z.string().nullable(),
  clubName: z.string().nullable(),
  planName: z.string().nullable(),
  expectedLives: z.number().int(),
  precheckSummary: precheckSummary.nullable(),
  hasPep: z.boolean(),
  /** Documentos enviados ainda sem revisão. */
  documentsToReview: z.number().int(),
  /** Exigências obrigatórias sem documento. */
  documentsMissing: z.number().int(),
  assignedTo: onboardingAssignee.nullable(),
  /** Vendedor ANNETEC atribuído (link do vendedor ou código de indicação). */
  seller: proposalSellerRef.nullable(),
  submittedAt: z.string().datetime().nullable(),
  /** submittedAt + ONBOARDING_REVIEW_SLA_HOURS (só na fila). */
  slaDueAt: z.string().datetime().nullable(),
  slaBreached: z.boolean(),
  organizationId: z.string().nullable(),
  updatedAt: z.string().datetime(),
})
export type OnboardingProposalListItem = z.infer<typeof onboardingProposalListItem>

/** Grupos da fila: `queue` = submitted+in_review; `awaiting_applicant` = draft+pending_info. */
export const onboardingStatusGroup = z.enum(['queue', 'awaiting_applicant', 'awaiting_payment', 'done', 'all'])
export type OnboardingStatusGroup = z.infer<typeof onboardingStatusGroup>

export const listOnboardingProposalsQuery = paginationQuery.extend({
  status: onboardingStatus.optional(),
  group: onboardingStatusGroup.optional(),
  precheck: precheckSummary.optional(),
  assigned: z.enum(['me', 'unassigned', 'any']).optional(),
  contractorType: contractorType.optional(),
  /** Só as propostas atribuídas a este vendedor. */
  sellerUserId: z.string().trim().min(1).max(100).optional(),
})
export type ListOnboardingProposalsQuery = z.infer<typeof listOnboardingProposalsQuery>

export const onboardingQueueSummary = z.object({
  byStatus: z.record(onboardingStatus, z.number().int()),
  queue: z.number().int(),
  unassigned: z.number().int(),
  slaBreached: z.number().int(),
  awaitingApplicant: z.number().int(),
  awaitingPayment: z.number().int(),
  provisionedThisMonth: z.number().int(),
  /** Horas médias de envio → decisão nas propostas decididas em 90 dias. */
  avgDecisionHours: z.number().nullable(),
})
export type OnboardingQueueSummary = z.infer<typeof onboardingQueueSummary>

// ---------------------------------------------------------------------------
// Caixa de saída (e-mail transacional)
// ---------------------------------------------------------------------------

export const emailProvider = z.enum(['outbox', 'resend', 'sendgrid'])
export type EmailProvider = z.infer<typeof emailProvider>

/** `simulated` = só gravado na caixa de saída (modo demo, sem provedor). */
export const emailStatus = z.enum(['simulated', 'queued', 'sent', 'failed'])
export type EmailStatus = z.infer<typeof emailStatus>

export const EMAIL_TEMPLATES = [
  'onboarding_started',
  'onboarding_access_recovered',
  'onboarding_submitted',
  'onboarding_pending_info',
  'onboarding_approved',
  'onboarding_rejected',
  'onboarding_canceled',
  'tenant_welcome',
  'platform_invoice_created',
  'platform_invoice_reminder',
  'platform_invoice_overdue',
  'platform_invoice_paid',
  'platform_access_restricted',
  'platform_access_suspended',
  'platform_access_reactivated',
  'platform_subscription_canceled',
] as const
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number]

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  onboarding_started: 'Contratação iniciada (link de acompanhamento)',
  onboarding_access_recovered: 'Link de acompanhamento reenviado',
  onboarding_submitted: 'Proposta recebida',
  onboarding_pending_info: 'Pendência na proposta',
  onboarding_approved: 'Proposta aprovada — pague a ativação',
  onboarding_rejected: 'Proposta reprovada',
  onboarding_canceled: 'Proposta cancelada',
  tenant_welcome: 'Boas-vindas e acesso ao painel',
  platform_invoice_created: 'Fatura ANNETEC emitida',
  platform_invoice_reminder: 'Lembrete de vencimento',
  platform_invoice_overdue: 'Fatura vencida',
  platform_invoice_paid: 'Pagamento confirmado',
  platform_access_restricted: 'Painel em somente leitura',
  platform_access_suspended: 'Painel suspenso',
  platform_access_reactivated: 'Painel reativado',
  platform_subscription_canceled: 'Assinatura cancelada',
}

export const platformEmail = z.object({
  id: uuid,
  template: z.string(),
  toEmail: z.string(),
  toName: z.string().nullable(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable(),
  provider: emailProvider,
  status: emailStatus,
  error: z.string().nullable(),
  organizationId: z.string().nullable(),
  proposalId: uuid.nullable(),
  relatedType: z.string().nullable(),
  relatedId: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type PlatformEmail = z.infer<typeof platformEmail>

export const platformEmailListItem = platformEmail.omit({ bodyText: true, bodyHtml: true }).extend({
  /** 160 primeiros caracteres do texto. */
  preview: z.string(),
})
export type PlatformEmailListItem = z.infer<typeof platformEmailListItem>

/** `q` busca em destinatário e assunto. */
export const listPlatformEmailsQuery = paginationQuery.extend({
  template: z.enum(EMAIL_TEMPLATES).optional(),
  status: emailStatus.optional(),
  proposalId: uuid.optional(),
  organizationId: z.string().min(1).optional(),
})
export type ListPlatformEmailsQuery = z.infer<typeof listPlatformEmailsQuery>

/** Console: detalhe completo da proposta (inclui eventos internos, pré-checagens, checklist e e-mails). */
export const onboardingProposalDetail = onboardingApplicantView.extend({
  prechecks: z.array(precheckResult),
  precheckSummary: precheckSummary.nullable(),
  precheckRanAt: z.string().datetime().nullable(),
  hasPep: z.boolean(),
  checklist: complianceChecklist,
  checklistComplete: z.boolean(),
  assignedTo: onboardingAssignee.nullable(),
  decision: z
    .object({
      note: z.string().nullable(),
      overrideReason: z.string().nullable(),
      decidedBy: z.string().nullable(),
      decidedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  provisioning: z.object({
    attempts: z.number().int(),
    error: z.string().nullable(),
    provisionedAt: z.string().datetime().nullable(),
    activationWaived: z.boolean(),
  }),
  source: z.enum(['site', 'console', 'seed']),
  applicantIp: z.string().nullable(),
  emails: z.array(platformEmailListItem),
  /** Vendedor ANNETEC atribuído; `null` = venda direta. */
  seller: proposalSellerRef.nullable(),
  /** Pedido de desconto aguardando o superadmin (a aprovação da proposta espera por ele). */
  discountPending: z.boolean(),
})
export type OnboardingProposalDetail = z.infer<typeof onboardingProposalDetail>

/** Resultado de `provisionTenantFromProposal`. */
export const provisioningResult = z.object({
  organizationId: z.string(),
  slug: z.string(),
  siteUrl: z.string(),
  adminEmail: z.string(),
  clubPlansCreated: z.number().int(),
  subscriptionId: uuid,
})
export type ProvisioningResult = z.infer<typeof provisioningResult>
