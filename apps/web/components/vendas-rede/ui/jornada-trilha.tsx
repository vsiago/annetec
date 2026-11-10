import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EstadoPasso, PassoJornada } from './tipos'

const TEXTO_ESTADO: Record<EstadoPasso, string> = {
  feito: 'feito',
  agora: 'etapa atual',
  falta: 'ainda não',
  pulado: 'pulado',
}

function Bolinha({ estado, grande }: { estado: EstadoPasso; grande: boolean }) {
  const lado = grande ? 'size-6' : 'size-4'
  const icone = grande ? 'size-3.5' : 'size-2.5'
  if (estado === 'feito') {
    return (
      <span className={cn('inline-flex items-center justify-center rounded-full bg-[#1E2A4A] text-white', lado)}>
        <Check className={icone} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  }
  if (estado === 'agora') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border-2 border-[var(--vr-accent,#1E2A4A)] bg-white',
          lado,
        )}
      >
        <span className={cn('rounded-full bg-[var(--vr-accent,#1E2A4A)]', grande ? 'size-2.5' : 'size-1.5')} />
      </span>
    )
  }
  if (estado === 'pulado') {
    return (
      <span className={cn('inline-flex items-center justify-center rounded-full border border-dashed border-[#98A2B3] bg-white text-[#98A2B3]', lado)}>
        <Minus className={icone} aria-hidden="true" />
      </span>
    )
  }
  return <span className={cn('inline-flex rounded-full border-2 border-[#D0D5DD] bg-white', lado)} />
}

/**
 * Trilha da jornada do lead: 6 bolinhas ligadas por uma linha.
 *  - feito: marinho com check · agora: anel na cor de ação · falta: vazia · pulado: tracejada.
 * Cada estado tem forma própria (não depende só da cor) e texto para leitor de tela.
 *
 * `variante="compacta"` (padrão): só as bolinhas, para o cartão do lead, com o
 * rótulo do passo atual embaixo. `"completa"`: rótulo em cada passo (ficha do lead).
 */
export function JornadaTrilha({
  passos,
  variante = 'compacta',
  className,
}: {
  passos: PassoJornada[]
  variante?: 'compacta' | 'completa'
  className?: string
}) {
  const completa = variante === 'completa'
  const atual = passos.find(p => p.estado === 'agora')
  return (
    <div className={cn('min-w-0', className)}>
      <ol className="flex items-center" aria-label="Jornada do lead">
        {passos.map((p, i) => (
          <li
            key={p.id}
            className={cn('flex items-center', i < passos.length - 1 && 'flex-1')}
            aria-current={p.estado === 'agora' ? 'step' : undefined}
          >
            <span className="flex flex-col items-center gap-1">
              <Bolinha estado={p.estado} grande={completa} />
              {completa ? (
                <span
                  className={cn(
                    'text-[11px] leading-tight',
                    p.estado === 'agora' ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {p.rotulo}
                </span>
              ) : null}
              <span className="sr-only">
                {p.rotulo}: {TEXTO_ESTADO[p.estado]}
              </span>
            </span>
            {i < passos.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mx-1 h-0.5 flex-1 rounded-full',
                  completa && '-mt-4',
                  p.estado === 'feito' ? 'bg-[#1E2A4A]' : 'bg-[#E4E7EC]',
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {!completa && atual ? (
        <p className="m-0 mt-1.5 text-[11px] font-medium text-muted-foreground" aria-hidden="true">
          {atual.rotulo}
        </p>
      ) : null}
    </div>
  )
}
