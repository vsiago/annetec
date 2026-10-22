/**
 * Número de carteirinha do clube (blueprint §0.8):
 *   titular     `<PREFIXO>-<AAAA>-<NNNNN>`     ex.: `MAP-2026-00042`
 *   dependente  `<titular>-<posição 2 díg.>`   ex.: `MAP-2026-00042-01`
 *
 * PREFIXO = 3 primeiras letras A–Z do slug em maiúsculas (`mapcard2` → `MAP`;
 * sem letras → `CLB`). O sequencial é por inquilino/prefixo/ano, calculado
 * dentro da transação da ativação com `pg_advisory_xact_lock` (ver
 * events.service) — compatível com o mock `MEP-2024-88901`.
 */

export function cardPrefixFromSlug(slug: string): string {
  const letters = slug.toUpperCase().replace(/[^A-Z]/g, '')
  return letters.slice(0, 3) || 'CLB'
}

export function holderCardNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`
}

export function dependentCardNumber(holderCard: string, position: number): string {
  return `${holderCard}-${String(position).padStart(2, '0')}`
}

/** Padrão do titular, para a busca do maior sequencial (`^MAP-2026-[0-9]+$`). */
export function holderCardPattern(prefix: string, year: number): string {
  return `^${prefix}-${year}-[0-9]+$`
}
