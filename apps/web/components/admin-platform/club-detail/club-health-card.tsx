'use client'

import { Check, HeartPulse, TriangleAlert } from 'lucide-react'
import type { HoldingTenantRow } from '@annetec/contracts'
import {
  HEALTH_BAND_COLORS,
  HEALTH_BAND_LABEL,
  HEALTH_BAND_WHY,
  healthReasons,
} from '@/components/admin-platform/club-detail/club-model'

/**
 * "Saúde do clube": a faixa em palavras (Boa / Atenção / Crítica), a nota
 * pequena e os motivos em frases simples. Os motivos vêm dos mesmos fatores
 * que a holding usa para calcular a nota — sem a conta de pontos.
 */
export function ClubHealthCard({ row }: { row: HoldingTenantRow }) {
  const colors = HEALTH_BAND_COLORS[row.healthBand]
  const reasons = healthReasons(row)

  return (
    <section
      aria-labelledby="club-health"
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-white p-6"
    >
      <h2 id="club-health" className="m-0 text-base font-bold text-foreground">
        Saúde do clube
      </h2>

      <div className="flex items-center gap-4">
        <span
          className="flex size-16 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.bg, color: colors.fg }}
          aria-hidden="true"
        >
          <HeartPulse className="size-7" />
        </span>
        <div className="flex flex-col gap-0.5">
          <strong className="text-2xl font-bold leading-tight" style={{ color: colors.fg }}>
            {HEALTH_BAND_LABEL[row.healthBand]}
          </strong>
          <span className="text-[13px] text-muted-foreground">{row.healthScore} de 100 pontos</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-[13px] font-medium text-muted-foreground">{HEALTH_BAND_WHY[row.healthBand]}</p>
        {reasons.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Nenhum ponto de atenção.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {reasons.map(reason => (
              <li key={reason.text} className="flex gap-2.5 text-sm text-foreground">
                {reason.good ? (
                  <Check className="mt-0.5 size-[18px] shrink-0 text-[#067647]" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-[#B54708]" strokeWidth={2.2} aria-hidden="true" />
                )}
                <span>
                  <span className="sr-only">{reason.good ? 'Ponto a favor: ' : 'Ponto de atenção: '}</span>
                  {reason.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
