import {
  createContractInput,
  onlyDigits,
  type Convenio,
  type CreateContractInput,
  type PriceTable,
  type PriceTableEntry,
} from '@annetec/contracts'
import {
  apiFieldErrors,
  readableMessage,
  zodFields,
  type FieldErrors,
  type FieldKey,
} from '@/components/admin-platform/ui/wizard/validation'

/**
 * Modelo PURO da "Nova adesão" (contrato na Digital Saúde), sem React:
 * valores do formulário, validação de cada etapa derivada do MESMO schema que
 * a API usa (`createContractInput` de @annetec/contracts), o corpo do
 * `POST /t/:slug/contratos` (igual ao da tela antiga) e o cálculo do valor da
 * adesão por faixa etária.
 */

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

export type DependentKind = 'dependente' | 'agregado'

export interface DependentValues {
  /** Identificador estável na tela (chave do React e ids dos campos). Não vai para a API. */
  uid: string
  name: string
  cpf: string
  birthDate: string
  relationshipId: string
  kind: DependentKind
  motherName: string
  /** Sem campo na tela (como antes); fica para o corpo seguir igual ao antigo. */
  genderId: string
}

export type DependentField = FieldKey<DependentValues>

export interface EnrollmentValues {
  // Plano
  convenioCodigo: string
  planCodigo: string
  sellerId: string
  proposalNumber: string
  signedAt: string
  dueDay: string
  notes: string
  // Titular
  holderName: string
  holderCpf: string
  holderBirthDate: string
  holderEmail: string
  holderPhone: string
  holderMotherName: string
  holderGenderId: string
  holderMaritalStatusId: string
  // Endereço do titular
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  // Dependentes (um valor só: o assistente liga campos de primeiro nível)
  dependents: DependentValues[]
}

export type EnrollmentField = FieldKey<EnrollmentValues>

export const EMPTY_ENROLLMENT: EnrollmentValues = {
  convenioCodigo: '',
  planCodigo: '',
  sellerId: '',
  proposalNumber: '',
  signedAt: '',
  dueDay: '10',
  notes: '',
  holderName: '',
  holderCpf: '',
  holderBirthDate: '',
  holderEmail: '',
  holderPhone: '',
  holderMotherName: '',
  holderGenderId: '',
  holderMaritalStatusId: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  dependents: [],
}

export function emptyDependent(uid: string): DependentValues {
  return { uid, name: '', cpf: '', birthDate: '', relationshipId: '', kind: 'dependente', motherName: '', genderId: '' }
}

/**
 * Troca de vínculo, como na tela antiga.
 *
 * "Agregado" é o único código de parentesco que confirmamos com contratos
 * reais (id 2) — pré-preenche pra evitar erro de digitação. "Dependente" cobre
 * cônjuge/filho/etc, cujos códigos a Digital Saúde não documenta em lugar
 * nenhum; fica em aberto pro vendedor confirmar.
 */
export function withKind(dependent: DependentValues, kind: DependentKind): DependentValues {
  return { ...dependent, kind, relationshipId: kind === 'agregado' ? '2' : '' }
}

export const ENROLLMENT_STEP_FIELDS = {
  plano: ['convenioCodigo', 'planCodigo', 'sellerId', 'proposalNumber', 'signedAt', 'dueDay', 'notes'],
  titular: [
    'holderName',
    'holderCpf',
    'holderBirthDate',
    'holderEmail',
    'holderPhone',
    'holderMotherName',
    'holderGenderId',
    'holderMaritalStatusId',
  ],
  endereco: ['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'],
  dependentes: ['dependents'],
} as const satisfies Record<string, readonly EnrollmentField[]>

export const ENROLLMENT_FIELDS = Object.values(ENROLLMENT_STEP_FIELDS).flat() as EnrollmentField[]

export const DEPENDENT_FIELDS: readonly DependentField[] = ['name', 'cpf', 'birthDate', 'kind', 'relationshipId', 'motherName']

// ---------------------------------------------------------------------------
// Validação por etapa (regras da API)
// ---------------------------------------------------------------------------

const trim = (value: string) => value.trim()
const optionalText = (value: string) => value.trim() || undefined
const optionalCode = (value: string) => (value.trim() ? Number(value) : undefined)

const holderSchema = createContractInput.shape.holder
const addressSchema = holderSchema.shape.address
const dependentSchema = createContractInput.shape.dependents.removeDefault().element

/** Campo da API no titular → campo do formulário. */
const HOLDER_FIELD: Record<string, EnrollmentField> = {
  name: 'holderName',
  cpf: 'holderCpf',
  birthDate: 'holderBirthDate',
  email: 'holderEmail',
  phone: 'holderPhone',
  motherName: 'holderMotherName',
  genderId: 'holderGenderId',
  maritalStatusId: 'holderMaritalStatusId',
}

/** Campo da API no endereço do titular → campo do formulário. */
const ADDRESS_FIELD: Record<string, EnrollmentField> = {
  street: 'street',
  number: 'number',
  complement: 'complement',
  neighborhood: 'neighborhood',
  city: 'city',
  state: 'state',
  zipCode: 'cep',
}

/**
 * Plano: `proposalNumber`, `signedAt`, `dueDay`, `planCodigo`, `notes` como a
 * API exige. Convênio e vendedor são opcionais na API (caem no padrão do
 * clube), mas a tela antiga já os exigia — `.required()` mantém essa regra.
 */
export const validatePlanStep = zodFields<EnrollmentValues>(
  createContractInput
    .pick({
      convenioCodigo: true,
      planCodigo: true,
      sellerId: true,
      proposalNumber: true,
      signedAt: true,
      dueDay: true,
      notes: true,
    })
    .required({ convenioCodigo: true, sellerId: true }),
  {
    input: v => ({
      convenioCodigo: v.convenioCodigo || undefined,
      planCodigo: v.planCodigo,
      sellerId: v.sellerId || undefined,
      proposalNumber: trim(v.proposalNumber),
      signedAt: v.signedAt,
      dueDay: v.dueDay.trim() ? Number(v.dueDay) : undefined,
      notes: optionalText(v.notes),
    }),
    messages: {
      convenioCodigo: 'Escolha o convênio.',
      planCodigo: 'Escolha o plano.',
      sellerId: 'Escolha o vendedor da adesão.',
      proposalNumber: { required: 'Informe o número da proposta.' },
      signedAt: { required: 'Informe a data de assinatura.', invalid: 'Informe uma data válida.' },
      dueDay: 'Informe um dia de vencimento de 1 a 31.',
    },
  },
)

export const validateHolderStep = zodFields<EnrollmentValues>(holderSchema.omit({ address: true }), {
  input: v => ({
    name: trim(v.holderName),
    cpf: v.holderCpf,
    birthDate: v.holderBirthDate,
    email: v.holderEmail,
    phone: v.holderPhone,
    motherName: optionalText(v.holderMotherName),
    genderId: optionalCode(v.holderGenderId),
    maritalStatusId: optionalCode(v.holderMaritalStatusId),
  }),
  fieldOf: path => HOLDER_FIELD[String(path[0])] ?? null,
  messages: {
    holderName: { required: 'Informe o nome completo do titular.' },
    holderCpf: { required: 'Informe o CPF do titular.' },
    holderBirthDate: { required: 'Informe a data de nascimento do titular.', invalid: 'Informe uma data válida.' },
    holderEmail: { required: 'Informe o e-mail do titular.' },
    holderPhone: { required: 'Informe o celular com DDD.' },
    holderGenderId: { invalid: 'Use só números.' },
    holderMaritalStatusId: { invalid: 'Use só números.' },
  },
})

export const validateAddressStep = zodFields<EnrollmentValues>(addressSchema, {
  input: v => ({
    street: trim(v.street),
    number: trim(v.number),
    complement: optionalText(v.complement),
    neighborhood: trim(v.neighborhood),
    city: trim(v.city),
    state: v.state || undefined,
    // A API só confere o tamanho e repassa o CEP à Digital Saúde: vão só os números.
    zipCode: onlyDigits(v.cep),
  }),
  fieldOf: path => ADDRESS_FIELD[String(path[0])] ?? null,
  messages: {
    cep: { required: 'Informe o CEP.', invalid: 'Informe o CEP com 8 números.' },
    street: { required: 'Informe a rua.' },
    number: { required: 'Informe o número (use "s/n" se não houver).' },
    neighborhood: { required: 'Informe o bairro.' },
    city: { required: 'Informe o município.' },
    state: 'Escolha a UF.',
  },
})

/** Erros de UM dependente, campo a campo (mesmo item do schema da API). */
export const validateDependent = zodFields<DependentValues>(dependentSchema, {
  input: d => ({
    name: trim(d.name),
    cpf: d.cpf.trim() ? d.cpf : undefined,
    birthDate: d.birthDate,
    relationshipId: optionalCode(d.relationshipId),
    kind: d.kind,
    motherName: optionalText(d.motherName),
    genderId: optionalCode(d.genderId),
  }),
  messages: {
    name: { required: 'Informe o nome do dependente.' },
    birthDate: { required: 'Informe a data de nascimento.', invalid: 'Informe uma data válida.' },
    relationshipId: { required: 'Informe o código de parentesco.', invalid: 'Use só números.' },
    kind: 'Escolha o vínculo.',
  },
})

function listNumbers(numbers: number[]): string {
  if (numbers.length <= 1) return String(numbers[0] ?? '')
  return `${numbers.slice(0, -1).join(', ')} e ${numbers[numbers.length - 1]}`
}

/** Texto do erro da lista inteira, a partir das posições (base 0) com problema. */
export function dependentsSummary(invalidIndexes: number[]): string {
  const numbers = invalidIndexes.map(i => i + 1)
  return numbers.length === 1
    ? `Corrija os campos destacados do dependente ${numbers[0]}.`
    : `Corrija os campos destacados dos dependentes ${listNumbers(numbers)}.`
}

/**
 * Dependentes: a lista é opcional; cada item vale pelo schema da API. O
 * assistente só enxerga a chave `dependents`, então o erro vai nela — o
 * detalhe por campo a tela calcula com `validateDependent`.
 */
export function validateDependentsStep(values: EnrollmentValues): FieldErrors<EnrollmentValues> {
  const invalid = values.dependents.flatMap((dependent, i) =>
    Object.keys(validateDependent(dependent)).length > 0 ? [i] : [],
  )
  return invalid.length > 0 ? { dependents: dependentsSummary(invalid) } : {}
}

// ---------------------------------------------------------------------------
// Corpo da API
// ---------------------------------------------------------------------------

/**
 * Mesmo corpo do `handleSubmit` da tela antiga. Diferenças só de forma: texto
 * sem espaços nas pontas e CPF, celular e CEP só com números (os campos agora
 * têm máscara; a API limpa CPF e celular, mas repassa o CEP como veio).
 */
export function toContractPayload(values: EnrollmentValues) {
  return {
    proposalNumber: trim(values.proposalNumber),
    signedAt: values.signedAt,
    dueDay: Number(values.dueDay),
    planCodigo: values.planCodigo,
    convenioCodigo: values.convenioCodigo,
    sellerId: values.sellerId,
    notes: optionalText(values.notes),
    holder: {
      name: trim(values.holderName),
      cpf: onlyDigits(values.holderCpf),
      birthDate: values.holderBirthDate,
      email: trim(values.holderEmail),
      phone: onlyDigits(values.holderPhone),
      motherName: optionalText(values.holderMotherName),
      genderId: optionalCode(values.holderGenderId),
      maritalStatusId: optionalCode(values.holderMaritalStatusId),
      address: {
        street: trim(values.street),
        number: trim(values.number),
        complement: optionalText(values.complement),
        neighborhood: trim(values.neighborhood),
        city: trim(values.city),
        state: values.state,
        zipCode: onlyDigits(values.cep),
      },
    },
    dependents: values.dependents.map(dep => ({
      name: trim(dep.name),
      cpf: onlyDigits(dep.cpf) || undefined,
      birthDate: dep.birthDate,
      relationshipId: Number(dep.relationshipId),
      kind: dep.kind,
      motherName: optionalText(dep.motherName),
      genderId: optionalCode(dep.genderId),
    })),
  }
}

/** Validação final com o schema inteiro da API (rede de segurança antes do envio). */
export function parseContractPayload(values: EnrollmentValues): { ok: true; data: CreateContractInput } | { ok: false } {
  const parsed = createContractInput.safeParse(toContractPayload(values))
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false }
}

/** Erros da API por dependente: posição na lista → campo → mensagem. */
export type DependentApiErrors = Record<number, Partial<Record<DependentField, string>>>

/**
 * `fieldErrors` da API → campos do formulário. Caminhos de dependente
 * (`dependents.0.cpf`) vão para a chave `dependents` (o assistente leva à
 * etapa) e para o detalhe por item; os do titular (`holder.cpf`,
 * `holder.address.zipCode`) vão pelos apelidos para os campos `holder*`/`cep`.
 */
export function explainEnrollmentApiError(
  message: string,
  fieldErrors: Record<string, string> | undefined,
): { message: string; fieldErrors: FieldErrors<EnrollmentValues>; dependents: DependentApiErrors } {
  const rest: Record<string, string> = {}
  const dependents: DependentApiErrors = {}
  let listMessage: string | null = null

  for (const [path, text] of Object.entries(fieldErrors ?? {})) {
    const segments = path.split('.')
    if (segments[0] !== 'dependents') {
      rest[path] = text
      continue
    }
    const index = Number(segments[1])
    const field = segments[2] as DependentField | undefined
    if (Number.isInteger(index) && field && (DEPENDENT_FIELDS as readonly string[]).includes(field)) {
      const item = (dependents[index] ??= {})
      if (!item[field]) item[field] = readableMessage(text)
    } else if (!listMessage) {
      listMessage = readableMessage(text)
    }
  }

  const fields = apiFieldErrors<EnrollmentValues>(rest, ENROLLMENT_FIELDS, { ...HOLDER_FIELD, zipCode: 'cep' })
  const indexes = Object.keys(dependents)
    .map(Number)
    .sort((a, b) => a - b)
  if (indexes.length > 0) fields.dependents = dependentsSummary(indexes)
  else if (listMessage) fields.dependents = listMessage

  // A API ainda fala "inquilino" em algumas mensagens; na tela é sempre "clube".
  const text = readableMessage(message).replace(/inquilinos?/gi, match =>
    match.toLowerCase().endsWith('s') ? 'clubes' : 'clube',
  )
  return {
    message: Object.keys(fields).length > 0 ? 'Confira o campo destacado e tente de novo.' : text,
    fieldErrors: fields,
    dependents,
  }
}

// ---------------------------------------------------------------------------
// Valor da adesão (tabela de preço do convênio, por faixa etária)
// ---------------------------------------------------------------------------

/**
 * `yyyy-MM-dd` → data local. A tela antiga usava `new Date(texto)`, que lê
 * como meia-noite UTC (o dia anterior no Brasil); por texto não há esse desvio.
 */
function localDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Idade completa na data de referência — é assim que a faixa etária é lida. */
export function idadeEm(nascimento: string, referencia: Date): number | null {
  if (!nascimento) return null
  const data = localDate(nascimento)
  if (!data) return null
  let idade = referencia.getFullYear() - data.getFullYear()
  const aniversarioPassou =
    referencia.getMonth() > data.getMonth() ||
    (referencia.getMonth() === data.getMonth() && referencia.getDate() >= data.getDate())
  if (!aniversarioPassou) idade -= 1
  return idade < 0 ? null : idade
}

export function moeda(valor: number | null) {
  if (valor === null) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Faixas do plano escolhido, ordenadas por idade — o que a tela mostra. */
export function faixasDoPlano(priceTables: readonly PriceTable[], planCodigo: string): PriceTableEntry[] {
  const entradas = priceTables
    .flatMap(tabela => tabela.entries)
    .filter(entrada => !planCodigo || entrada.planCodigo === planCodigo)
  return [...entradas].sort((a, b) => (a.ageFrom ?? 0) - (b.ageFrom ?? 0))
}

export interface LinhaOrcamento {
  rotulo: string
  nascimento: string
  papel: string
  idade: number | null
  faixa: PriceTableEntry | null
}

export interface Orcamento {
  linhas: LinhaOrcamento[]
  total: number
  completo: boolean
}

/**
 * Preço de cada vida pela idade na data de assinatura, e o total. Sem data
 * de nascimento não há faixa: a linha aparece como pendente em vez de somar
 * um valor errado silenciosamente.
 */
export function calcularOrcamento(
  values: Pick<EnrollmentValues, 'holderName' | 'holderBirthDate' | 'dependents' | 'signedAt'>,
  faixas: readonly PriceTableEntry[],
  hoje: Date = new Date(),
): Orcamento {
  const referencia = (values.signedAt ? localDate(values.signedAt) : null) ?? hoje

  const vidas = [
    { rotulo: values.holderName.trim() || 'Titular', nascimento: values.holderBirthDate, papel: 'Titular' },
    ...values.dependents.map((dep, index) => ({
      rotulo: dep.name.trim() || `Dependente ${index + 1}`,
      nascimento: dep.birthDate,
      papel: dep.kind === 'agregado' ? 'Agregado' : 'Dependente',
    })),
  ]

  const linhas = vidas.map(vida => {
    const idade = idadeEm(vida.nascimento, referencia)
    const faixa =
      idade === null ? null : faixas.find(f => idade >= (f.ageFrom ?? 0) && idade <= (f.ageTo ?? 200)) ?? null
    return { ...vida, idade, faixa }
  })

  const total = linhas.reduce((soma, linha) => soma + (linha.faixa?.chargeValue ?? 0), 0)
  const completo = linhas.every(linha => linha.faixa !== null)
  return { linhas, total, completo }
}

/** Menor e maior mensalidade por vida do plano (dica de preço da etapa Plano). */
export function faixaDePreco(faixas: readonly PriceTableEntry[]): { min: number; max: number } | null {
  const valores = faixas.map(f => f.chargeValue).filter((v): v is number => typeof v === 'number')
  if (valores.length === 0) return null
  return { min: Math.min(...valores), max: Math.max(...valores) }
}

/** " · taxa de cadastro R$ 50,00 por vida" — o mesmo texto da tela antiga (vazio sem taxa). */
export function notaTaxaCadastro(convenio: Pick<Convenio, 'registrationFee' | 'registrationFeeKind'> | null | undefined): string {
  if (!convenio?.registrationFee) return ''
  return ` · taxa de cadastro ${moeda(convenio.registrationFee)}${convenio.registrationFeeKind === 'por_vida' ? ' por vida' : ''}`
}
