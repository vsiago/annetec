import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CARD_SURFACE } from './tokens'

export type IlustracaoVazio = 'pool' | 'funil' | 'carteira' | 'equipe' | 'resultados' | 'comissoes' | 'busca' | 'historico'

/** Ilustração de traço simples, no marinho e num toque do tom de apoio. Decorativa. */
function Ilustracao({ tipo }: { tipo: IlustracaoVazio }) {
  const id = 'vr-vazio'
  const base = { fill: 'none', stroke: '#1E2A4A', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-[120px]" role="presentation" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-halo`} cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#E5EDF5" />
          <stop offset="100%" stopColor="#E5EDF5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="52" rx="56" ry="40" fill={`url(#${id}-halo)`} />
      {tipo === 'pool' && (
        <g {...base}>
          <path d="M24 44h72l-8 30a6 6 0 0 1-6 4H38a6 6 0 0 1-6-4z" fill="#FFFFFF" />
          <path d="M34 44c0-12 12-20 26-20s26 8 26 20" />
          <circle cx="60" cy="14" r="3" fill="#E84364" stroke="none" />
          <path d="M60 52v14M53 59h14" />
        </g>
      )}
      {tipo === 'funil' && (
        <g {...base}>
          <path d="M22 24h76L70 54v22l-20-8V54z" fill="#FFFFFF" />
          <circle cx="60" cy="38" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'carteira' && (
        <g {...base}>
          <rect x="22" y="26" width="76" height="52" rx="8" fill="#FFFFFF" />
          <path d="M22 40h76" />
          <circle cx="82" cy="58" r="4" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'equipe' && (
        <g {...base}>
          <circle cx="60" cy="34" r="10" fill="#FFFFFF" />
          <circle cx="34" cy="44" r="7" fill="#FFFFFF" />
          <circle cx="86" cy="44" r="7" fill="#FFFFFF" />
          <path d="M42 76c0-10 8-18 18-18s18 8 18 18zM20 72c0-7 6-12 14-12M100 72c0-7-6-12-14-12" />
          <circle cx="60" cy="34" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'resultados' && (
        <g {...base}>
          <path d="M24 74h72M30 70V50M50 70V38M70 70V56M90 70V30" />
          <circle cx="90" cy="26" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'comissoes' && (
        <g {...base}>
          <circle cx="60" cy="50" r="26" fill="#FFFFFF" />
          <path d="M66 40c-2-3-12-3-12 3 0 8 14 4 14 12 0 6-11 6-14 2M60 34v32" />
          <circle cx="92" cy="24" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'busca' && (
        <g {...base}>
          <circle cx="54" cy="44" r="20" fill="#FFFFFF" />
          <path d="M69 59l18 18" />
          <circle cx="54" cy="44" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
      {tipo === 'historico' && (
        <g {...base}>
          <circle cx="60" cy="48" r="28" fill="#FFFFFF" />
          <path d="M60 32v16l10 8" />
          <circle cx="60" cy="48" r="3" fill="#E84364" stroke="none" />
        </g>
      )}
    </svg>
  )
}

/**
 * Estado vazio que ORIENTA: diz o que está acontecendo e o que fazer, nunca
 * só "nada aqui". Ex.: "Nenhum lead no pool agora. Quando alguém pedir
 * contato no site, ele aparece aqui."
 *
 * - `ilustracao`: desenho simples em SVG (decorativo).
 * - `acao`: no máximo uma `AcaoPrincipal`.
 * - `moldura`: desenha o próprio cartão.
 */
export function EstadoVazio({
  ilustracao = 'funil',
  titulo,
  descricao,
  acao,
  moldura = false,
  className,
}: {
  ilustracao?: IlustracaoVazio
  titulo: ReactNode
  descricao?: ReactNode
  acao?: ReactNode
  moldura?: boolean
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-w-0 flex-col items-center justify-center gap-1.5 px-6 py-10 text-center',
        moldura && CARD_SURFACE,
        className,
      )}
    >
      <Ilustracao tipo={ilustracao} />
      <p className="m-0 mt-2 text-[17px] font-semibold leading-snug text-foreground">{titulo}</p>
      {descricao ? <p className="m-0 max-w-sm text-sm leading-relaxed text-muted-foreground">{descricao}</p> : null}
      {acao ? <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{acao}</div> : null}
    </div>
  )
}
