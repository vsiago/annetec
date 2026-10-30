import { createTenantInput, tenantAddress, tenantBranding, type CreateTenantInput } from '@annetec/contracts'
import {
  apiFieldErrors,
  readableMessage,
  zodFields,
  type FieldErrors,
  type FieldKey,
} from '@/components/admin-platform/ui/wizard/validation'

/**
 * Modelo PURO do "Cadastrar clube" (sem React): valores do formulário, a
 * validação de cada etapa derivada do MESMO schema que a API usa
 * (`createTenantInput` e as partes `tenantAddress`/`tenantBranding` de
 * @annetec/contracts) e a montagem do corpo do `POST /platform/tenants`.
 */

export interface ClubValues {
  name: string
  slug: string
  document: string
  legalName: string
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

export type ClubField = FieldKey<ClubValues>

export const DEFAULT_PRIMARY_COLOR = '#E84364'
export const DEFAULT_SECONDARY_COLOR = '#26365F'

export const EMPTY_CLUB: ClubValues = {
  name: '',
  slug: '',
  document: '',
  legalName: '',
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

export const CLUB_STEP_FIELDS = {
  clube: ['name', 'slug', 'document', 'legalName'],
  contato: ['email', 'phone', 'cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'],
  aparencia: ['primaryColor', 'secondaryColor', 'logoUrl'],
  plano: ['planId'],
  responsavel: ['ownerName', 'ownerEmail'],
} as const satisfies Record<string, readonly ClubField[]>

export const CLUB_FIELDS = Object.values(CLUB_STEP_FIELDS).flat() as ClubField[]

// ---------------------------------------------------------------------------
// Endereço do site (slug)
// ---------------------------------------------------------------------------

function stripAccents(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Sugestão feita a partir do nome: "Clínica Vida" → "clinica-vida" (até 40 caracteres). */
export function slugify(value: string): string {
  return stripAccents(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
    .replace(/-$/, '')
}

/**
 * Enquanto a pessoa digita: limpa o que não vale, mas deixa o hífen do fim —
 * senão não dá para escrever "meu-clube" letra por letra.
 */
export function sanitizeSlugInput(value: string): string {
  return stripAccents(value)
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
    .slice(0, 40)
}

export function trimSlug(value: string): string {
  return value.replace(/-+$/, '')
}

/** O endereço vale no formato da API (2 a 40, letras minúsculas, números, hífen no meio). */
export function isSlugFormatValid(value: string): boolean {
  return createTenantInput.shape.slug.safeParse(trimSlug(value)).success
}

// ---------------------------------------------------------------------------
// Validação por etapa (regras da API)
// ---------------------------------------------------------------------------

const trim = (value: string) => value.trim()

export const validateClubStep = zodFields<ClubValues>(
  createTenantInput.pick({ name: true, slug: true, document: true, legalName: true }),
  {
    input: v => ({ name: trim(v.name), slug: trimSlug(v.slug), document: v.document, legalName: trim(v.legalName) }),
    messages: {
      name: { required: 'Informe o nome do clube.' },
      slug: {
        required: 'Informe o endereço do site.',
        invalid: 'Use de 2 a 40 letras minúsculas, números ou hífens, sem hífen no início ou no fim.',
      },
      document: { required: 'Informe o CNPJ do clube.' },
      legalName: { required: 'Informe a razão social, como está no cartão CNPJ.' },
    },
  },
)

export const validateContactStep = zodFields<ClubValues>(createTenantInput.pick({ email: true, phone: true }).merge(tenantAddress), {
  input: v => ({
    email: v.email,
    phone: v.phone,
    cep: v.cep,
    street: trim(v.street),
    number: trim(v.number),
    complement: trim(v.complement) || undefined,
    neighborhood: trim(v.neighborhood),
    city: trim(v.city),
    state: v.state,
  }),
  messages: {
    email: { required: 'Informe o e-mail do clube.' },
    phone: { required: 'Informe o telefone com DDD.' },
    cep: { required: 'Informe o CEP.' },
    street: { required: 'Informe a rua.' },
    number: { required: 'Informe o número (use "s/n" se não houver).' },
    neighborhood: { required: 'Informe o bairro.' },
    city: { required: 'Informe a cidade.' },
    state: 'Escolha o estado.',
  },
})

export const validateBrandStep = zodFields<ClubValues>(
  tenantBranding.pick({ primaryColor: true, secondaryColor: true, logoUrl: true }),
  {
    input: v => ({
      primaryColor: trim(v.primaryColor) || DEFAULT_PRIMARY_COLOR,
      secondaryColor: trim(v.secondaryColor) || DEFAULT_SECONDARY_COLOR,
      logoUrl: trim(v.logoUrl) || undefined,
    }),
    messages: {
      logoUrl: { invalid: 'Informe o link completo da imagem, começando com https://' },
    },
  },
)

export const validatePlanStep = zodFields<ClubValues>(createTenantInput.pick({ planId: true }), {
  messages: { planId: 'Escolha o plano do clube.' },
})

export const validateOwnerStep = zodFields<ClubValues>(createTenantInput.pick({ ownerName: true, ownerEmail: true }), {
  input: v => ({ ownerName: trim(v.ownerName), ownerEmail: v.ownerEmail }),
  messages: {
    ownerName: { required: 'Informe o nome de quem vai administrar o clube.' },
    ownerEmail: { required: 'Informe o e-mail do responsável — é o login do painel.' },
  },
})

/** Corpo que a API recebe. Texto vazio de campo opcional some. */
export function toClubPayload(values: ClubValues) {
  return {
    name: trim(values.name),
    legalName: trim(values.legalName),
    slug: trimSlug(values.slug),
    document: values.document,
    email: values.email,
    phone: values.phone,
    address: {
      cep: values.cep,
      street: trim(values.street),
      number: trim(values.number),
      complement: trim(values.complement) || undefined,
      neighborhood: trim(values.neighborhood),
      city: trim(values.city),
      state: values.state,
    },
    branding: {
      primaryColor: trim(values.primaryColor) || DEFAULT_PRIMARY_COLOR,
      secondaryColor: trim(values.secondaryColor) || DEFAULT_SECONDARY_COLOR,
      logoUrl: trim(values.logoUrl) || undefined,
    },
    planId: values.planId,
    status: 'trial' as const,
    ownerName: trim(values.ownerName),
    ownerEmail: values.ownerEmail,
  }
}

/** Validação final com o schema inteiro da API (rede de segurança antes do envio). */
export function parseClubPayload(values: ClubValues): { ok: true; data: CreateTenantInput } | { ok: false } {
  const parsed = createTenantInput.safeParse(toClubPayload(values))
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false }
}

/**
 * Erro da API → campo + texto. A API ainda fala "inquilino" nas mensagens de
 * conflito; aqui vira "clube" e vai para o campo certo.
 */
export function explainClubApiError(
  message: string,
  fieldErrors: Record<string, string> | undefined,
): { message: string; fieldErrors: FieldErrors<ClubValues> } {
  const fields = apiFieldErrors<ClubValues>(fieldErrors, CLUB_FIELDS)
  if (/já existe.*slug/i.test(message)) {
    fields.slug = 'Já existe um clube com este endereço do site. Escolha outro.'
    return { message: 'Este endereço do site já é de outro clube. Escolha outro e tente de novo.', fieldErrors: fields }
  }
  if (/já existe.*cnpj/i.test(message)) {
    fields.document = 'Já existe um clube com este CNPJ. Confira o número digitado.'
    return { message: 'Este CNPJ já está cadastrado em outro clube.', fieldErrors: fields }
  }
  const text = readableMessage(message).replace(/inquilinos?/gi, match =>
    match.toLowerCase().endsWith('s') ? 'clubes' : 'clube',
  )
  return {
    message: Object.keys(fields).length > 0 ? 'Confira o campo destacado e tente de novo.' : text,
    fieldErrors: fields,
  }
}

// ---------------------------------------------------------------------------
// Aparência
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contraste WCAG entre duas cores (1 a 21); `null` se alguma não for cor completa. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return null
  const la = luminance(ra)
  const lb = luminance(rb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Cor completa (`#rgb` ou `#rrggbb`) ou o padrão. */
export function colorOr(value: string, fallback: string): string {
  return hexToRgb(value) ? value : fallback
}
