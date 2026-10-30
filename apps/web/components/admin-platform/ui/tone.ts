/**
 * Vocabulário visual do console (/admin) num lugar só: a superfície dos
 * cartões e as cores "por assunto" dos selos de ícone, KPIs e mini-gráficos.
 *
 * Cor por assunto (sempre acompanhada de texto — a cor nunca é o único sinal):
 *  - `green`  receita, recebido, tudo em dia
 *  - `blue`   a receber, previsto, informação
 *  - `red`    atraso, erro
 *  - `amber`  atenção, pendência
 *  - `navy`   clubes, cadastro, padrão (marinho da marca)
 *  - `coral`  vidas/associados, destaque da marca (nunca com texto pequeno branco)
 *  - `violet` planos e catálogo
 *  - `neutral` o resto
 */
export type ConsoleTone = 'navy' | 'coral' | 'green' | 'blue' | 'red' | 'amber' | 'violet' | 'neutral'

export const TONES: Record<ConsoleTone, { chip: string; stroke: string; soft: string }> = {
  navy: { chip: 'bg-[#E5EDF5] text-[#1E2A4A]', stroke: '#1E2A4A', soft: '#E5EDF5' },
  coral: { chip: 'bg-[#FDECEF] text-[#C4234A]', stroke: '#E84364', soft: '#FDECEF' },
  green: { chip: 'bg-[#E3F6EA] text-[#067647]', stroke: '#079455', soft: '#E3F6EA' },
  blue: { chip: 'bg-[#E8F1FD] text-[#175CD3]', stroke: '#1570EF', soft: '#E8F1FD' },
  red: { chip: 'bg-[#FDEDEC] text-[#B42318]', stroke: '#D92D20', soft: '#FDEDEC' },
  amber: { chip: 'bg-[#FEF3DC] text-[#B54708]', stroke: '#DC6803', soft: '#FEF3DC' },
  violet: { chip: 'bg-[#EFEBFD] text-[#5925DC]', stroke: '#7A5AF8', soft: '#EFEBFD' },
  neutral: { chip: 'bg-[#F2F4F7] text-[#344054]', stroke: '#667085', soft: '#F2F4F7' },
}

/** Sombra em camadas, bem leve, de todo cartão do console. */
export const CARD_SHADOW = 'shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'

/** Sombra do cartão clicável ao passar o mouse. */
export const CARD_SHADOW_HOVER =
  'hover:shadow-[0_2px_4px_-1px_rgba(16,24,40,0.05),0_8px_20px_-4px_rgba(16,24,40,0.10)]'

/** Superfície padrão de cartão: cantos `rounded-2xl`, borda suave, fundo branco e sombra leve. */
export const CARD_SURFACE = `rounded-2xl border border-border bg-card ${CARD_SHADOW}`
