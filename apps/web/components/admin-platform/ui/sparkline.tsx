'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Mini-gráfico (sparkline) do console: só a forma da série, sem eixos. É
 * decorativo (`aria-hidden`) — o número e a dica do cartão já dizem o que
 * importa; o gráfico completo fica na tela de origem.
 *
 * - `variant="bars"` (padrão): uma coluna por período (ex.: os 6 meses), a
 *   última — o período atual — na cor cheia e as anteriores no mesmo tom,
 *   claro. Bom para séries mensais curtas.
 * - `variant="line"`: curva monotônica (não "passa do ponto" entre dois
 *   meses), área no próprio tom bem claro e um ponto no último valor.
 * Com menos de 2 pontos, ou com a série toda zerada, não desenha.
 */
export function Sparkline({
  values,
  color = '#1E2A4A',
  height = 40,
  variant = 'bars',
  className,
}: {
  values: number[]
  color?: string
  height?: number
  variant?: 'bars' | 'line'
  className?: string
}) {
  const gradientId = useId().replace(/:/g, '')
  const points = values.filter(value => Number.isFinite(value))
  // Série vazia ou toda zerada: uma linha reta no zero não diz nada.
  if (points.length < 2 || points.every(value => value === 0)) return null

  if (variant === 'bars') {
    const top = Math.max(...points.map(value => Math.max(0, value)))
    return (
      <div className={cn('flex w-full items-end gap-[3px]', className)} style={{ height }} aria-hidden="true">
        {points.map((value, index) => {
          const last = index === points.length - 1
          const ratio = top > 0 ? Math.max(0, value) / top : 0
          return (
            <span
              key={index}
              className="min-w-0 flex-1 rounded-t-[3px] rounded-b-[1px]"
              style={{
                height: value > 0 ? `${Math.max(8, ratio * 100)}%` : 2,
                backgroundColor: value > 0 ? color : '#E4E7EC',
                opacity: value > 0 && !last ? 0.3 : 1,
              }}
            />
          )
        })}
      </div>
    )
  }

  const W = 100
  const H = height
  const pad = 3
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const xs = points.map((_, index) => (index / (points.length - 1)) * W)
  // Série toda igual: linha no meio, não colada no chão.
  const ys = points.map(value => (max === min ? H / 2 : pad + (1 - (value - min) / span) * (H - pad * 2)))

  const line = monotonePath(xs, ys)
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  const lastX = xs[xs.length - 1]
  const lastY = ys[ys.length - 1]

  return (
    <div className={cn('relative w-full', className)} style={{ height }} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.16} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* O ponto fica fora do SVG esticado para continuar redondo. */}
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
        style={{ left: `${(lastX / W) * 100}%`, top: `${(lastY / H) * 100}%`, backgroundColor: color }}
      />
    </div>
  )
}

/** Caminho SVG de uma curva cúbica monotônica (Fritsch–Carlson) pelos pontos. */
function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n === 2) return `M ${xs[0]} ${ys[0]} L ${xs[1]} ${ys[1]}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i])
    slope.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  }
  const tangent: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) tangent.push(0)
    else {
      const common = dx[i - 1] + dx[i]
      tangent.push((3 * common) / ((common + dx[i]) / slope[i - 1] + (common + dx[i - 1]) / slope[i]))
    }
  }
  tangent.push(slope[n - 2])

  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${xs[i] + h} ${ys[i] + tangent[i] * h} ${xs[i + 1] - h} ${ys[i + 1] - tangent[i + 1] * h} ${xs[i + 1]} ${ys[i + 1]}`
  }
  return d
}
