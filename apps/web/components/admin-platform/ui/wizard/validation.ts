import type { ZodIssue, ZodTypeAny } from 'zod'

/**
 * Validação do assistente a partir dos schemas zod de @annetec/contracts.
 *
 * A regra é a da API: cada etapa monta o seu pedaço do schema com `.pick()` /
 * `.shape` / `.merge()` do schema de entrada da rota e `zodFields` transforma
 * o resultado em "uma mensagem por campo", em português. Só a forma de dizer o
 * erro é do console — o que vale ou não vale continua sendo o contrato.
 */

export type FieldKey<V> = Extract<keyof V, string>
export type FieldErrors<V> = Partial<Record<FieldKey<V>, string>>

/** Mensagem própria de um campo: texto único, ou separada entre "vazio" e "inválido". */
export type FieldMessage = string | { required?: string; invalid?: string }
export type FieldMessages<V> = Partial<Record<FieldKey<V>, FieldMessage>>

/** Vazio para efeito de "campo obrigatório": texto em branco, lista vazia, nulo. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Mensagens que os schemas de @annetec/contracts escrevem — reescritas dizendo o que corrigir. */
const CONTRACT_MESSAGES: Record<string, string> = {
  'E-mail inválido': 'Informe um e-mail válido, como nome@exemplo.com.br.',
  'CNPJ deve conter 14 dígitos': 'Informe um CNPJ válido, com 14 números.',
  'CNPJ inválido': 'Este CNPJ não existe. Confira os números digitados.',
  'CPF deve conter 11 dígitos': 'Informe um CPF válido, com 11 números.',
  'CPF inválido': 'Este CPF não existe. Confira os números digitados.',
  'CEP deve conter 8 dígitos': 'Informe o CEP com 8 números.',
  'Telefone deve conter DDD + número': 'Informe o telefone com DDD, como (21) 99999-9999.',
  'Cor deve estar em hexadecimal': 'Use uma cor no formato #RRGGBB, como #26365F.',
  'Slug deve conter apenas letras minúsculas, números e hífens':
    'Use só letras minúsculas, números e hífens, sem hífen no início ou no fim.',
  'Data deve estar no formato yyyy-MM-dd': 'Informe uma data válida.',
  'Documento deve ser um CPF ou CNPJ': 'Informe um CPF (11 números) ou um CNPJ (14 números).',
  'Documento inválido': 'Este CPF ou CNPJ não existe. Confira os números digitados.',
}

/** Mensagens padrão do zod (em inglês) — essas nunca chegam à tela. */
const ZOD_DEFAULT = /^(Required|Invalid|Expected|String must|Number must|Array must|Too small|Too big|Should be|Unrecognized)/

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

function sentence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

/** Tradução genérica de uma regra do zod, para quando o schema não traz mensagem própria. */
function translateIssue(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') return 'Preencha este campo.'
      return issue.expected === 'number' ? 'Informe um número.' : 'Confira este campo.'
    case 'too_small': {
      const min = Number(issue.minimum)
      if (issue.type === 'string') return min <= 1 ? 'Preencha este campo.' : `Use pelo menos ${min} caracteres.`
      if (issue.type === 'array') return `Adicione pelo menos ${min} ${min === 1 ? 'item' : 'itens'}.`
      if (issue.type === 'number') {
        return issue.inclusive ? `Use um valor a partir de ${NUMBER.format(min)}.` : `Use um valor maior que ${NUMBER.format(min)}.`
      }
      return 'Confira este campo.'
    }
    case 'too_big': {
      const max = Number(issue.maximum)
      if (issue.type === 'string') return `Use no máximo ${NUMBER.format(max)} caracteres.`
      if (issue.type === 'array') return `Use no máximo ${max} ${max === 1 ? 'item' : 'itens'}.`
      if (issue.type === 'number') return issue.inclusive ? `Use um valor até ${NUMBER.format(max)}.` : `Use um valor menor que ${NUMBER.format(max)}.`
      return 'Confira este campo.'
    }
    case 'invalid_string':
      if (issue.validation === 'email') return 'Informe um e-mail válido, como nome@exemplo.com.br.'
      if (issue.validation === 'url') return 'Informe um link completo, começando com https://'
      if (issue.validation === 'uuid') return 'Escolha uma opção.'
      return 'Confira o formato deste campo.'
    case 'invalid_enum_value':
    case 'invalid_literal':
    case 'invalid_union':
      return 'Escolha uma opção.'
    case 'not_multiple_of':
      return 'Use um número inteiro.'
    default:
      return 'Confira este campo.'
  }
}

/** Texto de uma mensagem que veio do schema ou da API, já no tom do console. */
export function readableMessage(message: string, issue?: ZodIssue): string {
  const known = CONTRACT_MESSAGES[message.trim()]
  if (known) return known
  if (ZOD_DEFAULT.test(message)) return issue ? translateIssue(issue) : 'Confira este campo.'
  return sentence(message)
}

function pickMessage(custom: FieldMessage | undefined, empty: boolean): string | undefined {
  if (!custom) return undefined
  if (typeof custom === 'string') return custom
  return empty ? custom.required ?? custom.invalid : custom.invalid
}

export interface ZodFieldsOptions<V> {
  /** Monta o objeto que o schema recebe (padrão: os próprios valores do formulário). */
  input?: (values: V) => unknown
  /** Caminho do erro → campo do formulário (padrão: último pedaço do caminho, se for um campo). */
  fieldOf?: (path: Array<string | number>) => FieldKey<V> | null
  /** Mensagens próprias por campo (a de "vazio" e a de "inválido"). */
  messages?: FieldMessages<V>
}

/**
 * Validador de etapa a partir de um schema zod. Uma mensagem por campo (a
 * primeira regra quebrada), em português, com a de "vazio" quando o campo
 * está em branco.
 *
 * @example
 *   validate: zodFields(createTenantInput.pick({ name: true, slug: true }), {
 *     messages: { name: { required: 'Informe o nome do clube.' } },
 *   })
 */
export function zodFields<V extends object>(schema: ZodTypeAny, options: ZodFieldsOptions<V> = {}) {
  return (values: V): FieldErrors<V> => {
    const parsed = schema.safeParse(options.input ? options.input(values) : values)
    if (parsed.success) return {}
    const errors: FieldErrors<V> = {}
    for (const issue of parsed.error.issues) {
      const key = options.fieldOf ? options.fieldOf(issue.path) : defaultFieldOf<V>(issue.path, values)
      if (!key || errors[key]) continue
      const empty = isEmptyValue((values as Record<string, unknown>)[key])
      errors[key] =
        pickMessage(options.messages?.[key], empty) ?? (empty ? 'Preencha este campo.' : readableMessage(issue.message, issue))
    }
    return errors
  }
}

function defaultFieldOf<V extends object>(path: Array<string | number>, values: V): FieldKey<V> | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const segment = path[i]
    if (typeof segment === 'string' && segment in values) return segment as FieldKey<V>
  }
  return null
}

/**
 * `fieldErrors` da API (`{ 'address.cep': 'CEP deve conter 8 dígitos' }`) →
 * erros nos campos do formulário. Caminho que não é campo da tela fica de fora
 * (a mensagem geral da API aparece no topo da etapa).
 *
 * @param aliases nome do campo na API → campo do formulário, quando diferem
 *   (`{ zipCode: 'cep' }`).
 */
export function apiFieldErrors<V extends object>(
  fieldErrors: Record<string, string> | undefined,
  fields: readonly FieldKey<V>[],
  aliases: Record<string, FieldKey<V>> = {},
): FieldErrors<V> {
  const out: FieldErrors<V> = {}
  for (const [path, message] of Object.entries(fieldErrors ?? {})) {
    const segments = path.split('.')
    let key: FieldKey<V> | null = null
    for (let i = segments.length - 1; i >= 0 && !key; i--) {
      const segment = segments[i] as string
      if (aliases[segment]) key = aliases[segment]
      else if ((fields as readonly string[]).includes(segment)) key = segment as FieldKey<V>
    }
    if (key && !out[key]) out[key] = readableMessage(message)
  }
  return out
}

/** Junta validadores de uma etapa (schema + regras de tela). O primeiro erro de cada campo vale. */
export function combineValidators<V>(...validators: Array<((values: V) => FieldErrors<V>) | undefined>) {
  return (values: V): FieldErrors<V> => {
    const out: FieldErrors<V> = {}
    for (const validate of validators) {
      if (!validate) continue
      const errors = validate(values)
      for (const key of Object.keys(errors) as FieldKey<V>[]) {
        if (!out[key] && errors[key]) out[key] = errors[key]
      }
    }
    return out
  }
}
