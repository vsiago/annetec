import { cn } from '@/lib/utils'
import { formatarMoeda, formatarMoedaCompacta } from './mascaras'

/**
 * Valor em reais que nunca quebra de linha nem vaza do cartão.
 *
 * - `compacto="estreito"` (padrão): mostra o valor completo e troca por "R$ 3,2 mil"
 *   quando o contêiner pai (`@container`) fica mais estreito que `limite`. Precisa de
 *   um ancestral com `@container`; sem ele, fica sempre completo.
 * - `compacto="sempre"`: só a versão compacta. `"nunca"`: só a completa.
 * Quando há versão compacta, o valor completo vai no `title` e num texto só para leitor
 * de tela (as duas versões visuais ficam `aria-hidden`).
 *
 * Os limites são classes fixas (o Tailwind precisa vê-las inteiras): `xs` ~160 px,
 * `sm` ~224 px de largura útil do contêiner.
 */
const LIMITES = {
  xs: { completo: '@max-[10rem]:hidden', curto: 'hidden @max-[10rem]:inline' },
  sm: { completo: '@max-[14rem]:hidden', curto: 'hidden @max-[14rem]:inline' },
} as const

export function ValorMoeda({
  valor,
  compacto = 'estreito',
  limite = 'xs',
  inteiro,
  className,
}: {
  valor: number | null | undefined
  compacto?: 'estreito' | 'sempre' | 'nunca'
  limite?: keyof typeof LIMITES
  /** Sem centavos (ex.: "R$ 12.350"). */
  inteiro?: boolean
  className?: string
}) {
  const completo = formatarMoeda(valor, { inteiro })
  const curto = formatarMoedaCompacta(valor)
  const base = cn('whitespace-nowrap tabular-nums', className)

  if (compacto === 'nunca' || curto === completo) return <span className={base}>{completo}</span>

  return (
    <span className={base} title={completo}>
      <span className="sr-only">{completo}</span>
      {compacto === 'sempre' ? (
        <span aria-hidden="true">{curto}</span>
      ) : (
        <>
          <span aria-hidden="true" className={LIMITES[limite].completo}>
            {completo}
          </span>
          <span aria-hidden="true" className={LIMITES[limite].curto}>
            {curto}
          </span>
        </>
      )}
    </span>
  )
}
