/**
 * Origem do lead — lista única do painel (admin e vendedor).
 *
 * A API guarda `source` como texto livre (`string | null`, sem enum nos
 * contracts), então o valor gravado é o próprio rótulo. Registros antigos
 * podem ter valores de outras telas ('Website', 'instagram', 'indicacao'…):
 * `leadSourceLabel` os mostra com o rótulo atual, sem migrar dados.
 */
export const LEAD_SOURCES = ['Site', 'Indicação', 'Campanha', 'Evento', 'Redes Sociais', 'Parceiro'] as const

export const DEFAULT_LEAD_SOURCE = LEAD_SOURCES[0]

export const leadSourceOptions = LEAD_SOURCES.map(item => ({ value: item, label: item }))

const LEGACY: Record<string, (typeof LEAD_SOURCES)[number]> = {
  site: 'Site',
  website: 'Site',
  indicacao: 'Indicação',
  campanha: 'Campanha',
  evento: 'Evento',
  'redes sociais': 'Redes Sociais',
  instagram: 'Redes Sociais',
  linkedin: 'Redes Sociais',
  parceiro: 'Parceiro',
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Rótulo atual da origem; valores desconhecidos aparecem como foram gravados. */
export function leadSourceLabel(value: string | null | undefined): string {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const key = fold(raw)
  if (key === 'outro' || key === 'outros') return 'Outro'
  return LEGACY[key] ?? raw
}
