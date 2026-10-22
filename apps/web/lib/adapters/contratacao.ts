import { z } from 'zod'
import {
  LEGAL_FORMS_BY_CONTRACTOR_TYPE,
  ONBOARDING_SECTION_LABELS,
  onboardingSection,
  onlyDigits,
  type ContractorType,
  type KybDocumentKind,
  type LegalForm,
  type OnboardingApplicantView,
  type OnboardingSection,
  type OnboardingStatus,
  type PageMeta,
  type PersonPosition,
} from '@annetec/contracts'

/**
 * Apoio da jornada B2B da ANNETEC (contratação da plataforma, acompanhamento,
 * fatura pública e "Minha assinatura") — blueprint da plataforma §Q3.
 *
 * Fica fora dos arquivos `'use server'` (que só podem exportar função async):
 * tipos, máscaras, validação com mensagens em pt-BR e etapas do wizard. Os
 * atalhos do modo demonstração ficam em `components/contratar/demo/` e só são
 * carregados por `import()` quando a API diz `demoToolsEnabled`. Tudo aqui é
 * puro e roda no browser.
 */

// ---------------------------------------------------------------------------
// Resultado das server actions (mesmo formato do `ActionResult` de `_api-result`)
// ---------------------------------------------------------------------------

export type Outcome<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/** Página de uma coleção paginada da API (`data` + `meta`). */
export interface Paged<T> {
  items: T[]
  meta: PageMeta | null
}

// ---------------------------------------------------------------------------
// Máscaras e formatação
// ---------------------------------------------------------------------------

/** Progressiva: `"112223330001"` → `"11.222.333/0001"`. */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** `"11222333000181"` → `"11.222.333/0001-81"`; incompleto volta como veio. */
export function formatCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value)
  return d.length === 14 ? maskCnpj(d) : (value ?? '')
}

const livesFormatter = new Intl.NumberFormat('pt-BR')

export function formatNumber(value: number): string {
  return livesFormatter.format(Number.isFinite(value) ? value : 0)
}

export function formatLives(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? 'vida' : 'vidas'}`
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024)} KB`
  return `${formatDecimal(bytes / (1024 * 1024))} MB`
}

function formatDecimal(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 })
}

/** Instante ISO → `27/09/2026 14:32` no fuso de São Paulo. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Hoje (`yyyy-MM-dd`) em São Paulo — comparação de vencimento sem fuso errado. */
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// ---------------------------------------------------------------------------
// Validação com mensagens em pt-BR
// ---------------------------------------------------------------------------

/**
 * As mensagens próprias dos contratos (ex.: "Informe nome e sobrenome") já
 * vêm prontas e passam direto; este mapa só traduz as padrão do zod, que
 * sairiam em inglês ("String must contain at least 3 character(s)").
 */
export const ptBrErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Campo obrigatório' }
      return { message: 'Valor inválido' }
    case 'too_small':
      if (issue.type === 'string') {
        return { message: Number(issue.minimum) <= 1 ? 'Campo obrigatório' : `Use ao menos ${issue.minimum} caracteres` }
      }
      if (issue.type === 'array') return { message: `Informe ao menos ${issue.minimum}` }
      if (issue.type === 'number') {
        return { message: issue.inclusive ? `Use um valor a partir de ${issue.minimum}` : `Use um valor maior que ${issue.minimum}` }
      }
      return { message: 'Valor muito pequeno' }
    case 'too_big':
      if (issue.type === 'string') return { message: `Use no máximo ${issue.maximum} caracteres` }
      if (issue.type === 'array') return { message: `No máximo ${issue.maximum} itens` }
      if (issue.type === 'number') return { message: `Use um valor até ${issue.maximum}` }
      return { message: 'Valor muito grande' }
    case 'invalid_string':
      if (issue.validation === 'email') return { message: 'E-mail inválido' }
      if (issue.validation === 'url') return { message: 'Informe a URL completa (https://…)' }
      if (issue.validation === 'uuid') return { message: 'Selecione uma opção' }
      return { message: 'Formato inválido' }
    case 'invalid_enum_value':
      return { message: 'Selecione uma opção' }
    case 'invalid_date':
      return { message: 'Data inválida' }
    default:
      return { message: ctx.defaultError }
  }
}

export type FieldErrors = Record<string, string>

export type Validation<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors }

/**
 * Valida com o schema do contrato e devolve os erros no MESMO formato da API
 * (caminho com ponto: `contacts.commercial.email`, `people.0.cpf`) — o erro
 * local e o do servidor caem no mesmo campo.
 */
export function validate<S extends z.ZodTypeAny>(schema: S, data: unknown): Validation<z.output<S>> {
  const result = schema.safeParse(data, { errorMap: ptBrErrorMap })
  if (result.success) return { ok: true, data: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '(raiz)'
    // A mensagem do `dateOnly` fala do formato técnico; na tela o campo é um seletor de data.
    const message = issue.message.startsWith('Data deve estar no formato') ? 'Informe uma data válida' : issue.message
    if (!(key in errors)) errors[key] = message
  }
  return { ok: false, errors }
}

/** Erros sob um prefixo, sem o prefixo (`contacts.financial.` → `name`, `email`…). */
export function errorsUnder(errors: FieldErrors | undefined, prefix: string): FieldErrors {
  const out: FieldErrors = {}
  if (!errors) return out
  for (const [key, message] of Object.entries(errors)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = message
  }
  return out
}

/** Primeiro erro que NÃO é de nenhum campo exibido (vai para o alerta geral). */
export function orphanErrors(errors: FieldErrors | undefined, shown: string[]): string[] {
  if (!errors) return []
  return Object.entries(errors)
    .filter(([key]) => !shown.some(field => key === field || key.startsWith(`${field}.`)))
    .map(([, message]) => message)
}

// ---------------------------------------------------------------------------
// Etapas do wizard e do acompanhamento
// ---------------------------------------------------------------------------

export type WizardStep = OnboardingSection | 'review'

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  ...onboardingSection.options.map(id => ({ id, label: ONBOARDING_SECTION_LABELS[id] })),
  { id: 'review', label: 'Revisão e envio' },
]

export function parseWizardStep(value: string | null | undefined): WizardStep | null {
  return WIZARD_STEPS.some(step => step.id === value) ? (value as WizardStep) : null
}

/** Primeira etapa incompleta (ou a revisão, quando está tudo pronto). */
export function firstIncompleteStep(view: Pick<OnboardingApplicantView, 'completeness'>): WizardStep {
  for (const section of onboardingSection.options) {
    const item = view.completeness.find(entry => entry.section === section)
    if (item && !item.complete) return section
  }
  return 'review'
}

export function isSectionComplete(view: Pick<OnboardingApplicantView, 'completeness'>, section: OnboardingSection): boolean {
  return view.completeness.find(entry => entry.section === section)?.complete === true
}

/** Macroetapas do acompanhamento público (a timeline fina vem de `events`). */
export const TRACKING_STAGES = [
  { id: 'submitted', label: 'Proposta enviada' },
  { id: 'review', label: 'Análise cadastral' },
  { id: 'approved', label: 'Aprovação' },
  { id: 'payment', label: 'Pagamento da ativação' },
  { id: 'provisioning', label: 'Criação do clube' },
  { id: 'active', label: 'Clube no ar' },
] as const

/** Índice da macroetapa EM ANDAMENTO (as anteriores estão concluídas). */
export function trackingStageIndex(status: OnboardingStatus): number {
  switch (status) {
    case 'draft':
      return 0
    case 'submitted':
    case 'in_review':
    case 'pending_info':
      return 1
    case 'approved':
      return 2
    case 'awaiting_payment':
      return 3
    case 'provisioning':
      return 4
    case 'active':
      return TRACKING_STAGES.length
    default:
      return -1
  }
}

// ---------------------------------------------------------------------------
// Links (fatura pública, acompanhamento)
// ---------------------------------------------------------------------------

/**
 * `publicUrl` vem absoluto da API (`https://<web>/fatura-annetec/<id>?chave=`).
 * Na tela usamos só caminho + query: a pessoa continua no host em que está.
 */
export function invoiceHref(publicUrl: string, extra: Record<string, string | null | undefined> = {}): string {
  let url: URL
  try {
    url = new URL(publicUrl, 'http://local.invalid')
  } catch {
    return publicUrl
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}

/** Chave HMAC da fatura, lida do `publicUrl` (`?chave=`). */
export function invoiceKeyFrom(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null
  try {
    return new URL(publicUrl, 'http://local.invalid').searchParams.get('chave')
  } catch {
    return null
  }
}

export function trackingPath(id: string, chave: string, step?: WizardStep | null): string {
  const params = new URLSearchParams({ chave })
  if (step) params.set('etapa', step)
  return `/contratar/${encodeURIComponent(id)}?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Upload (tipo e tamanho validados ANTES de enviar)
// ---------------------------------------------------------------------------

export type UploadTarget = 'documento' | 'logo'

// ---------------------------------------------------------------------------
// Pessoas: cargo sugerido a partir do QSA da Receita
// ---------------------------------------------------------------------------

export function positionFromQualification(qualification: string | null | undefined): PersonPosition {
  const q = (qualification ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  if (q.includes('socio') && q.includes('admin')) return 'socio_administrador'
  if (q.includes('vice')) return 'vice_presidente'
  if (q.includes('presidente')) return 'presidente'
  if (q.includes('tesoureir')) return 'tesoureiro'
  if (q.includes('secretari')) return 'secretario'
  if (q.includes('diretor')) return 'diretor'
  if (q.includes('procurador')) return 'procurador'
  if (q.includes('administrador')) return 'administrador'
  if (q.includes('socio')) return 'socio'
  return 'outro'
}

/** "JOANA DA COSTA LIMA" → "Joana da Costa Lima" (preposições em minúsculo). */
export function titleCaseName(name: string): string {
  const lower = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => (index > 0 && lower.has(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
}

/** Formas jurídicas do tipo, na ordem do contrato. */
export function legalFormsOf(type: ContractorType | null): LegalForm[] {
  return type ? LEGAL_FORMS_BY_CONTRACTOR_TYPE[type] : []
}

/** Rótulo curto de um documento pedido numa pendência. */
export function pendingItemTarget(item: { section: OnboardingSection; documentKind?: KybDocumentKind }): WizardStep {
  return item.documentKind ? 'documents' : item.section
}

// ---------------------------------------------------------------------------
// Proposta em andamento neste navegador (retomar sem o e-mail)
// ---------------------------------------------------------------------------

const RESUME_KEY = 'annetec.contratacao.proposta'

export interface ResumeInfo {
  id: string
  code: string
  path: string
  savedAt: string
}

export function rememberProposal(info: Omit<ResumeInfo, 'savedAt'>): void {
  try {
    window.localStorage.setItem(RESUME_KEY, JSON.stringify({ ...info, savedAt: new Date().toISOString() }))
  } catch {
    // Navegação privada ou armazenamento bloqueado: só perde o atalho.
  }
}

export function readRememberedProposal(): ResumeInfo | null {
  try {
    const raw = window.localStorage.getItem(RESUME_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ResumeInfo>
    if (!parsed.id || !parsed.path || !parsed.code || !parsed.path.startsWith('/contratar/')) return null
    return { id: parsed.id, code: parsed.code, path: parsed.path, savedAt: parsed.savedAt ?? '' }
  } catch {
    return null
  }
}

export function forgetProposal(): void {
  try {
    window.localStorage.removeItem(RESUME_KEY)
  } catch {
    // idem
  }
}
