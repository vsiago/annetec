/**
 * Central de Aprovações do console (`/admin/compliance`): tudo o que espera a
 * decisão da equipe ANNETEC numa tela só, em três tipos de pedido —
 *
 *  - `clubes`: novos clubes (propostas de contratação) para analisar;
 *  - `contas-gerenciadas`: clubes que pediram a conta de recebimento gerenciada;
 *  - `descontos`: descontos pedidos pelos vendedores ANNETEC.
 *
 * A aba vai na URL (`?tipo=…&situacao=…`) com o foco do detalhe: `clube=<orgId>`
 * (conta gerenciada), `pedido=<id>` (desconto) ou `proposta=<id>` (o pedido de
 * desconto daquela proposta). Os links das notificações saem daqui (API e web),
 * e os caminhos antigos (`/admin/financeiro/contas-gerenciadas`,
 * `/admin/comercial/descontos`) são traduzidos por `approvalsHrefFromLegacy`.
 */

export const APPROVAL_KINDS = ['clubes', 'contas-gerenciadas', 'descontos'] as const
export type ApprovalKind = (typeof APPROVAL_KINDS)[number]

/** Rótulos únicos — abas, menu lateral, notificações e redirecionamentos. */
export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  clubes: 'Novos clubes',
  'contas-gerenciadas': 'Contas gerenciadas',
  descontos: 'Descontos de vendedores',
}

export const APPROVALS_PATH = '/admin/compliance'

export function isApprovalKind(value: unknown): value is ApprovalKind {
  return typeof value === 'string' && (APPROVAL_KINDS as readonly string[]).includes(value)
}

/** Foco do detalhe que abre sozinho na aba. */
export interface ApprovalsFocus {
  /** Situação (aba da esquerda) — cada tipo tem as suas. */
  situacao?: string | null
  /** Conta gerenciada: `organizationId` do clube. */
  clube?: string | null
  /** Desconto: id do pedido. */
  pedido?: string | null
  /** Desconto: abre o pedido aguardando desta proposta. */
  proposta?: string | null
}

const FOCUS_KEYS = ['situacao', 'clube', 'pedido', 'proposta'] as const

/** Monta a query (sem `URLSearchParams`: o pacote compila sem DOM nem tipos do Node). */
function buildQuery(entries: [string, string][]): string {
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
}

function decodePart(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

function parseQuery(query: string): [string, string][] {
  const entries: [string, string][] = []
  for (const part of query.split('&')) {
    if (!part) continue
    const index = part.indexOf('=')
    const key = decodePart(index < 0 ? part : part.slice(0, index))
    const value = index < 0 ? '' : decodePart(part.slice(index + 1))
    entries.push([key, value])
  }
  return entries
}

/** `/admin/compliance?tipo=<kind>&…` com o foco (sem chaves vazias). */
export function approvalsHref(kind: ApprovalKind, focus: ApprovalsFocus = {}): string {
  const entries: [string, string][] = [['tipo', kind]]
  for (const key of FOCUS_KEYS) {
    const value = focus[key]
    if (value) entries.push([key, value])
  }
  return `${APPROVALS_PATH}?${buildQuery(entries)}`
}

/** Caminhos antigos das filas que mudaram para Aprovações. */
const LEGACY_PATHS: Record<string, ApprovalKind> = {
  '/admin/financeiro/contas-gerenciadas': 'contas-gerenciadas',
  '/admin/comercial/descontos': 'descontos',
}

/**
 * Link antigo (gravado em notificações antes da mudança) → o novo, preservando
 * os parâmetros. Qualquer outro link volta igual (inclusive `null`).
 */
export function approvalsHrefFromLegacy(link: string | null): string | null {
  if (!link) return link
  const [pathname = '', query = ''] = link.split('?', 2)
  const kind = LEGACY_PATHS[pathname.replace(/\/+$/, '')]
  if (!kind) return link
  const entries: [string, string][] = [['tipo', kind]]
  for (const [key, value] of parseQuery(query)) {
    if (key && key !== 'tipo' && value && !entries.some(([seen]) => seen === key)) entries.push([key, value])
  }
  return `${APPROVALS_PATH}?${buildQuery(entries)}`
}

/** `GET /api/v1/platform/aprovacoes/resumo`: quantos pedidos esperam a equipe, por tipo. */
export interface ApprovalsSummary {
  /** Propostas enviadas ou em análise (fila "Para analisar"). */
  clubs: number
  /** Pedidos de conta gerenciada em aberto (pendente, criando a conta ou com falha). */
  managedAccounts: number
  /** Pedidos de desconto aguardando o superadmin. */
  discounts: number
  total: number
}
