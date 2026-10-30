import type { HoldingTenantRow, TenantStatus } from '@annetec/contracts'

/**
 * Modelo PURO da lista de Clubes (/admin/inquilinos): tipos da linha, regra de
 * "pede atenção", filtros, busca e ordenação. Sem I/O e sem React, para rodar
 * igual no servidor (a action monta as linhas) e no browser (a tela filtra).
 */

/**
 * O que a lista usa do ranking da holding (`GET /platform/holding/inquilinos`).
 * Os dados cadastrais (e-mail, CNPJ, fim do teste) vêm de `/platform/tenants`.
 */
export type ClubMetrics = Pick<
  HoldingTenantRow,
  | 'activeLives'
  | 'activeMembersDelta30'
  | 'receivingIssue'
  | 'managed'
  | 'platformStatus'
  | 'platformDaysLate'
  | 'healthBand'
  | 'healthScore'
  | 'seller'
>

export interface ClubListRow {
  /** Mesmo id da organização no ranking da holding (`organizationId`). */
  id: string
  slug: string
  name: string
  email: string
  /** Só dígitos. */
  document: string
  status: TenantStatus
  trialEndsAt: string | null
  createdAt: string
  /** `null` = o ranking ainda não tem este clube (acabou de ser cadastrado). */
  metrics: ClubMetrics | null
}

export type ClubFilter = 'todos' | 'atencao' | 'ativos' | 'teste' | 'suspensos' | 'encerrados'
export type ClubSort = 'atencao' | 'vidas' | 'recentes' | 'nome'

export const CLUB_FILTERS: { value: ClubFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'atencao', label: 'Pedem atenção' },
  { value: 'ativos', label: 'Ativos' },
  { value: 'teste', label: 'Em teste' },
  { value: 'suspensos', label: 'Suspensos' },
  { value: 'encerrados', label: 'Encerrados' },
]

export const CLUB_SORTS: { value: ClubSort; label: string }[] = [
  { value: 'atencao', label: 'Precisa de atenção primeiro' },
  { value: 'vidas', label: 'Mais vidas' },
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'nome', label: 'Nome (A–Z)' },
]

export const CLUBS_PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Atenção
// ---------------------------------------------------------------------------

export type AttentionReason = 'saude' | 'recebimento' | 'mensalidade'

/** Clube em operação: é só nele que "pedir atenção" faz sentido. */
function isOperating(status: TenantStatus): boolean {
  return status === 'active' || status === 'trial'
}

/**
 * Motivos pelos quais o clube pede atenção.
 *
 * REGRA ("Pedem atenção"): clube ativo ou em teste, com dados da holding, em que
 *   - a saúde está em Atenção ou Crítica (`healthBand` ≠ `healthy`), OU
 *   - o recebimento tem problema (`receivingIssue` ≠ null), OU
 *   - a mensalidade da ANNETEC está atrasada (`platformDaysLate` > 0).
 * Clubes suspensos ou encerrados ficam de fora: já foram tratados (a saúde nem
 * se aplica a eles) e não devem encher o topo da lista.
 */
export function attentionReasons(row: ClubListRow): AttentionReason[] {
  const m = row.metrics
  if (!m || !isOperating(row.status)) return []
  const reasons: AttentionReason[] = []
  if (m.healthBand !== 'healthy') reasons.push('saude')
  if (m.receivingIssue !== null) reasons.push('recebimento')
  if (m.platformDaysLate > 0) reasons.push('mensalidade')
  return reasons
}

export function needsAttention(row: ClubListRow): boolean {
  return attentionReasons(row).length > 0
}

// ---------------------------------------------------------------------------
// Filtro, busca e contagens
// ---------------------------------------------------------------------------

export function matchesFilter(row: ClubListRow, filter: ClubFilter): boolean {
  switch (filter) {
    case 'todos':
      return true
    case 'atencao':
      return needsAttention(row)
    case 'ativos':
      return row.status === 'active'
    case 'teste':
      return row.status === 'trial'
    case 'suspensos':
      return row.status === 'suspended'
    case 'encerrados':
      return row.status === 'cancelled'
  }
}

/** Minúsculas e sem acento: "Saúde" casa com "saude". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Busca por nome, endereço do site, e-mail ou CNPJ. Quando o que foi digitado
 * parece CNPJ (só dígitos e pontuação), compara só os dígitos — assim
 * "12.345.678" acha o clube mesmo com o CNPJ guardado sem máscara.
 */
export function matchesSearch(row: ClubListRow, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  if (normalize(row.name).includes(q) || normalize(row.slug).includes(q) || normalize(row.email).includes(q)) {
    return true
  }
  if (/^[\d.\-/\s]+$/.test(q)) {
    const digits = q.replace(/\D/g, '')
    return digits.length > 0 && row.document.includes(digits)
  }
  return false
}

export function countByFilter(rows: ClubListRow[]): Record<ClubFilter, number> {
  const counts: Record<ClubFilter, number> = { todos: 0, atencao: 0, ativos: 0, teste: 0, suspensos: 0, encerrados: 0 }
  for (const row of rows) {
    counts.todos += 1
    if (needsAttention(row)) counts.atencao += 1
    if (row.status === 'active') counts.ativos += 1
    else if (row.status === 'trial') counts.teste += 1
    else if (row.status === 'suspended') counts.suspensos += 1
    else if (row.status === 'cancelled') counts.encerrados += 1
  }
  return counts
}

// ---------------------------------------------------------------------------
// Ordenação
// ---------------------------------------------------------------------------

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

const byName = (a: ClubListRow, b: ClubListRow) => collator.compare(a.name, b.name)
const livesOf = (row: ClubListRow) => row.metrics?.activeLives ?? 0

/** 0 = pede atenção · 1 = em operação e em ordem · 2 = suspenso · 3 = encerrado. */
function attentionGroup(row: ClubListRow): number {
  if (needsAttention(row)) return 0
  if (row.status === 'suspended') return 2
  if (row.status === 'cancelled') return 3
  return 1
}

function compareByAttention(a: ClubListRow, b: ClubListRow): number {
  const group = attentionGroup(a) - attentionGroup(b)
  if (group !== 0) return group
  if (attentionGroup(a) === 0) {
    // Dentro de "pedem atenção": mais motivos primeiro, depois a pior nota.
    const reasons = attentionReasons(b).length - attentionReasons(a).length
    if (reasons !== 0) return reasons
    const score = (a.metrics?.healthScore ?? 100) - (b.metrics?.healthScore ?? 100)
    if (score !== 0) return score
  }
  return livesOf(b) - livesOf(a) || byName(a, b)
}

export function sortClubs(rows: ClubListRow[], sort: ClubSort): ClubListRow[] {
  const copy = [...rows]
  switch (sort) {
    case 'atencao':
      return copy.sort(compareByAttention)
    case 'vidas':
      return copy.sort((a, b) => livesOf(b) - livesOf(a) || byName(a, b))
    case 'recentes':
      return copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || byName(a, b))
    case 'nome':
      return copy.sort(byName)
  }
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "18 clubes cadastrados. 4 pedem atenção e aparecem primeiro." */
export function clubsSummary(total: number, attention: number): string {
  if (total === 0) return 'Nenhum clube cadastrado ainda.'
  const cadastrados = `${total} ${plural(total, 'clube cadastrado', 'clubes cadastrados')}.`
  if (attention === 0) return `${cadastrados} Nenhum pede atenção agora.`
  return `${cadastrados} ${attention} ${plural(attention, 'pede atenção e aparece', 'pedem atenção e aparecem')} primeiro.`
}

export type HealthLabel = { label: 'Boa' | 'Atenção' | 'Crítica'; dot: string }

/** Faixa de saúde na linguagem do console (o contrato chama de Saudável/Atenção/Risco). */
export const HEALTH_DISPLAY: Record<ClubMetrics['healthBand'], HealthLabel> = {
  healthy: { label: 'Boa', dot: '#12B76A' },
  attention: { label: 'Atenção', dot: '#FEC84B' },
  risk: { label: 'Crítica', dot: '#B42318' },
}

/** `dd/mm` de um instante ISO, no fuso de São Paulo. */
export function shortDateBR(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}
