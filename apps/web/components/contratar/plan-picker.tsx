'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw, Sparkles, Target, Users } from 'lucide-react'
import {
  formatBRL,
  onlyDigits,
  quotePlatformPlan,
  recommendPlatformPlan,
  type PlatformPlanOffer,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { formatLives, formatNumber } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { Notice, Pill } from './ui'

/** Paradas do simulador (escala "logarítmica" amigável). */
const LIFE_STOPS = [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1200, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 100000]

function nearestStop(value: number): number {
  let best = 0
  for (let i = 0; i < LIFE_STOPS.length; i++) {
    if (Math.abs((LIFE_STOPS[i] as number) - value) < Math.abs((LIFE_STOPS[best] as number) - value)) best = i
  }
  return best
}

export const MAX_LIVES = 1_000_000

interface PlanPickerProps {
  offers: PlatformPlanOffer[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  lives: number
  onLivesChange: (value: number) => void
  planId: string | null
  /** Escolha feita pela pessoa (clique no card). */
  onPlanChange: (id: string) => void
  errors?: { planId?: string; expectedLives?: string }
}

/**
 * Plano recomendado para N vidas — a tela seleciona sozinha enquanto a pessoa
 * não escolher outro (quem usa decide; este componente só avisa qual é).
 */
export function recommendedPlanId(offers: PlatformPlanOffer[] | null, lives: number): string | null {
  const visible = (offers ?? []).filter(offer => offer.pricing.publicVisible)
  return visible.length ? recommendPlatformPlan(visible, lives) : null
}

/**
 * Simulador de vidas + planos com a cotação do contrato (`quotePlatformPlan`,
 * a MESMA função que a API usa para faturar) e o selo do plano recomendado
 * (`recommendPlatformPlan`).
 */
export function PlanPicker({
  offers,
  loading,
  error,
  onRetry,
  lives,
  onLivesChange,
  planId,
  onPlanChange,
  errors,
}: PlanPickerProps) {
  const [draft, setDraft] = useState(() => formatNumber(lives))
  const visible = useMemo(() => (offers ?? []).filter(offer => offer.pricing.publicVisible), [offers])
  const recommended = useMemo(() => recommendedPlanId(offers, lives), [offers, lives])

  useEffect(() => {
    setDraft(current => (Number(onlyDigits(current)) === lives ? current : formatNumber(lives)))
  }, [lives])

  function commitDraft(value: string) {
    const digits = onlyDigits(value).slice(0, 7)
    setDraft(digits ? formatNumber(Number(digits)) : '')
    const parsed = Number(digits)
    if (parsed >= 1) onLivesChange(Math.min(MAX_LIVES, parsed))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-br from-[#1e2a4a] to-[#2d3f6a] p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
              <Users className="size-4" aria-hidden />
              Simulador de vidas
            </p>
            <p className="max-w-md text-sm text-white/80">
              Quantas vidas (titulares + dependentes) você espera ter no clube nos próximos meses?
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Número de vidas</span>
            <input
              inputMode="numeric"
              value={draft}
              onChange={event => commitDraft(event.target.value)}
              aria-invalid={errors?.expectedLives ? true : undefined}
              className="h-12 w-36 rounded-xl border border-white/25 bg-white/10 px-3 text-right font-display text-2xl font-bold tabular-nums text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/60"
            />
            <span className="text-sm text-white/80">vidas</span>
          </label>
        </div>
        <Slider
          className="mt-5 [&_[data-slot=slider-range]]:bg-[#e84364] [&_[data-slot=slider-thumb]]:border-[#e84364] [&_[data-slot=slider-track]]:bg-white/20"
          min={0}
          max={LIFE_STOPS.length - 1}
          step={1}
          value={[nearestStop(lives)]}
          onValueChange={([index]) => onLivesChange(LIFE_STOPS[index ?? 0] as number)}
          aria-label="Ajustar número de vidas"
        />
        <div className="mt-2 flex justify-between text-[11px] text-white/60" aria-hidden>
          <span>10</span>
          <span>1.000</span>
          <span>10.000</span>
          <span>100.000</span>
        </div>
        {errors?.expectedLives ? <p className="mt-2 text-[13px] text-rose-200">{errors.expectedLives}</p> : null}
      </div>

      {error && !offers ? (
        <Notice
          tone="error"
          title="Não foi possível carregar os planos."
          action={
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1.5 bg-background text-foreground">
              <RefreshCw className="size-3.5" aria-hidden />
              Tentar de novo
            </Button>
          }
        >
          {error}
        </Notice>
      ) : null}

      {loading && !offers ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando planos">
          {[0, 1, 2].map(key => (
            <Skeleton key={key} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {offers && visible.length === 0 ? (
        <Notice tone="info" title="Nenhum plano disponível para contratação online no momento.">
          Fale com a nossa equipe comercial pelo contato@annetec.com.br que montamos a proposta com você.
        </Notice>
      ) : null}

      {visible.length ? (
        <div role="radiogroup" aria-label="Planos da plataforma" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(offer => {
            const quote = quotePlatformPlan(offer, offer.pricing, lives)
            const selected = offer.id === planId
            const isRecommended = offer.id === recommended
            return (
              <button
                key={offer.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPlanChange(offer.id)}
                className={cn(
                  'group relative flex h-full flex-col rounded-2xl border-2 bg-card p-5 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  selected
                    ? 'border-primary shadow-[0_12px_30px_-14px_rgba(232,67,100,0.55)]'
                    : 'border-border hover:border-primary/40 hover:shadow-md',
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {isRecommended ? (
                    <Pill tone="brand">
                      <Target className="size-3" aria-hidden />
                      Recomendado para {formatLives(lives)}
                    </Pill>
                  ) : null}
                  {offer.pricing.highlight ? (
                    <Pill tone="info">
                      <Sparkles className="size-3" aria-hidden />
                      Mais escolhido
                    </Pill>
                  ) : null}
                </div>
                <p className="mt-2 font-display text-lg font-bold text-foreground">{offer.name}</p>
                {offer.pricing.tagline ? <p className="text-[13px] text-muted-foreground">{offer.pricing.tagline}</p> : null}

                <p className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-extrabold tracking-tight text-foreground">
                    {formatBRL(quote.monthlyTotal)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Inclui até {formatNumber(offer.memberLimit)} vidas
                  {quote.extraLives > 0 ? (
                    <>
                      {' '}
                      + {formatNumber(quote.extraLives)} excedentes × {formatBRL(quote.pricePerExtraLife)}
                    </>
                  ) : null}
                </p>

                <dl className="mt-4 space-y-1 border-t pt-3 text-[13px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Mensalidade base</dt>
                    <dd className="tabular-nums text-foreground">{formatBRL(quote.planFee)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Vida extra</dt>
                    <dd className="tabular-nums text-foreground">
                      {quote.pricePerExtraLife > 0 ? formatBRL(quote.pricePerExtraLife) : 'sem excedente'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Ativação</dt>
                    <dd className="tabular-nums text-foreground">{formatBRL(quote.activationTotal)}</dd>
                  </div>
                </dl>

                {offer.features.length ? (
                  <ul className="mt-4 space-y-1.5 text-[13px] text-foreground/85">
                    {offer.features.slice(0, 5).map(feature => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <span
                  className={cn(
                    'mt-auto flex h-10 items-center justify-center rounded-xl pt-0 text-sm font-semibold transition-colors',
                    'mt-5',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary',
                  )}
                  aria-hidden
                >
                  {selected ? 'Plano selecionado' : 'Escolher este plano'}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
      {errors?.planId ? (
        <p className="text-[13px] text-destructive" role="alert">
          {errors.planId}
        </p>
      ) : null}
    </div>
  )
}
