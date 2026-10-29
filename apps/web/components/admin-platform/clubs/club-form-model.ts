import { createTenantInput, type CreateTenantInput } from '@annetec/contracts'

/**
 * Modelo PURO do "Cadastrar clube": valores do formulário, a validação com o
 * MESMO schema que a API usa (`createTenantInput` de @annetec/contracts: CNPJ
 * com dígitos verificadores, telefone com DDD, endereço completo, cores em
 * hexadecimal…) e a tradução das mensagens para o português do console.
 */

export interface ClubFormValues {
  name: string
  slug: string
  legalName: string
  document: string
  email: string
  phone: string
  cep: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string
  planId: string
  ownerName: string
  ownerEmail: string
}

export type ClubFieldKey = keyof ClubFormValues
export type ClubFormErrors = Partial<Record<ClubFieldKey, string>>

export const DEFAULT_PRIMARY_COLOR = '#e84364'
export const DEFAULT_SECONDARY_COLOR = '#26365F'

export const EMPTY_CLUB_FORM: ClubFormValues = {
  name: '',
  slug: '',
  legalName: '',
  document: '',
  email: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  secondaryColor: DEFAULT_SECONDARY_COLOR,
  logoUrl: '',
  planId: '',
  ownerName: '',
  ownerEmail: '',
}

/** Ordem em que os campos aparecem na tela — para levar o foco ao primeiro erro. */
export const CLUB_FIELD_ORDER: ClubFieldKey[] = [
  'name',
  'slug',
  'legalName',
  'document',
  'email',
  'phone',
  'cep',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'primaryColor',
  'secondaryColor',
  'logoUrl',
  'planId',
  'ownerName',
  'ownerEmail',
]

/** Campos opcionais: o resto é exigido pela API. */
export const CLUB_OPTIONAL_FIELDS: ReadonlySet<ClubFieldKey> = new Set([
  'complement',
  'primaryColor',
  'secondaryColor',
  'logoUrl',
])

// ---------------------------------------------------------------------------
// Endereço do site (slug)
// ---------------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Sugestão feita a partir do nome: "Clínica Vida" → "clinica-vida". */
export function slugify(value: string): string {
  return stripAccents(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Enquanto a pessoa digita: limpa o que não vale, mas deixa o hífen do fim —
 * senão não dá para escrever "meu-clube" letra por letra. O hífen sobrando é
 * tirado quando o campo perde o foco (`trimSlug`).
 */
export function sanitizeSlugInput(value: string): string {
  return stripAccents(value)
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
}

export function trimSlug(value: string): string {
  return value.replace(/-+$/, '')
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/** Cor `#rgb` → `#rrggbb` (o seletor de cor do navegador só aceita a forma longa). */
export function toLongHex(value: string, fallback: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return fallback
}

const REQUIRED: Record<ClubFieldKey, string> = {
  name: 'Informe o nome do clube.',
  slug: 'Informe o endereço do site.',
  legalName: 'Informe a razão social.',
  document: 'Informe o CNPJ.',
  email: 'Informe o e-mail do clube.',
  phone: 'Informe o telefone com DDD.',
  cep: 'Informe o CEP.',
  street: 'Informe a rua.',
  number: 'Informe o número.',
  complement: 'Informe o complemento.',
  neighborhood: 'Informe o bairro.',
  city: 'Informe a cidade.',
  state: 'Escolha o estado.',
  primaryColor: 'Informe a cor principal.',
  secondaryColor: 'Informe a cor secundária.',
  logoUrl: 'Informe o link da logo.',
  planId: 'Escolha um plano.',
  ownerName: 'Informe o nome do responsável.',
  ownerEmail: 'Informe o e-mail do responsável.',
}

/** Mensagens do schema que estão em inglês (padrão do zod) ganham texto próprio. */
const FALLBACK: Partial<Record<ClubFieldKey, string>> = {
  slug: 'Use de 2 a 40 letras minúsculas, números ou hífens, sem hífen no início ou no fim.',
  state: 'Escolha o estado.',
  logoUrl: 'Informe o link completo da imagem, começando com https://',
  planId: 'Escolha um plano.',
}

/** `address.cep` → `cep`, `branding.logoUrl` → `logoUrl`; `null` se o campo não existe na tela. */
export function fieldKeyOf(path: Array<string | number>): ClubFieldKey | null {
  const last = String(path[path.length - 1] ?? '')
  const known = (CLUB_FIELD_ORDER as string[]).includes(last)
  return known ? (last as ClubFieldKey) : null
}

function messageFor(key: ClubFieldKey, message: string, value: string): string {
  if (value.trim() === '') return REQUIRED[key]
  const text = FALLBACK[key] ?? message
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** Monta o corpo que a API recebe. Texto vazio de campo opcional some. */
function toPayload(values: ClubFormValues) {
  return {
    name: values.name.trim(),
    legalName: values.legalName.trim(),
    slug: trimSlug(values.slug),
    document: values.document,
    email: values.email,
    phone: values.phone,
    address: {
      cep: values.cep,
      street: values.street.trim(),
      number: values.number.trim(),
      complement: values.complement.trim() || undefined,
      neighborhood: values.neighborhood.trim(),
      city: values.city.trim(),
      state: values.state,
    },
    branding: {
      primaryColor: values.primaryColor.trim() || DEFAULT_PRIMARY_COLOR,
      secondaryColor: values.secondaryColor.trim() || DEFAULT_SECONDARY_COLOR,
      logoUrl: values.logoUrl.trim() || undefined,
    },
    planId: values.planId,
    status: 'trial' as const,
    ownerName: values.ownerName.trim(),
    ownerEmail: values.ownerEmail,
  }
}

export type ClubFormValidation =
  | { ok: true; data: CreateTenantInput; errors: ClubFormErrors }
  | { ok: false; errors: ClubFormErrors }

export function validateClubForm(values: ClubFormValues): ClubFormValidation {
  const parsed = createTenantInput.safeParse(toPayload(values))
  if (parsed.success) return { ok: true, data: parsed.data, errors: {} }

  const errors: ClubFormErrors = {}
  for (const issue of parsed.error.issues) {
    const key = fieldKeyOf(issue.path)
    if (!key || errors[key]) continue // a primeira mensagem de cada campo basta
    errors[key] = messageFor(key, issue.message, values[key])
  }
  return { ok: false, errors }
}

/**
 * A API ainda fala "inquilino" nas mensagens de conflito. Aqui vira "clube" e,
 * quando dá, a mensagem vai para o campo certo.
 */
export function explainApiError(message: string): { field: ClubFieldKey | null; text: string } {
  if (/já existe.*slug/i.test(message)) {
    return { field: 'slug', text: 'Já existe um clube com este endereço do site. Escolha outro.' }
  }
  if (/já existe.*cnpj/i.test(message)) {
    return { field: 'document', text: 'Já existe um clube com este CNPJ. Confira o número digitado.' }
  }
  return { field: null, text: message.replace(/inquilinos?/gi, match => (match.toLowerCase().endsWith('s') ? 'clubes' : 'clube')) }
}
