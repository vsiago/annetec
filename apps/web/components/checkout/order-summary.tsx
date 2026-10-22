'use client'

import { useState } from 'react'
import { ArrowRight, BadgeCheck, CalendarCheck2, ChevronDown, Loader2, Lock, ShieldCheck } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  describeLoyalty,
  formatBRL,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanQuote,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PriceLines, PriceTotals } from './price-breakdown'

interface SummaryProps {
  plan: ClubPlan | null
  quote: ClubPlanQuote | null
  method: ClubPaymentMethod | null
  showMethod: boolean
}

function SummaryLines({ plan, quote, method, showMethod }: SummaryProps) {
  if (!plan || !quote) {
    return <p className="text-sm text-muted-foreground">Escolha um plano para ver o valor.</p>
  }
  return (
    <div className="space-y-2.5">
      <PriceLines quote={quote} />
      {showMethod && method ? (
        <dl className="text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Pagamento</dt>
            <dd className="text-foreground">{CLUB_PAYMENT_METHOD_LABELS[method]}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}

function ChangePlanButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-md text-[13px] font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      Trocar plano
    </button>
  )
}

/** Coluna fixa do desktop: resumo sempre à vista, 1ª cobrança e mensalidade em tempo real. */
export function OrderSummaryCard(props: SummaryProps & { tenantName: string; onChangePlan?: () => void }) {
  const { plan, quote, tenantName, onChangePlan } = props
  return (
    <aside className="sticky top-6 space-y-4" aria-label="Resumo do pedido">
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Resumo do pedido · {tenantName}</p>
            <p className="mt-0.5 text-base font-semibold text-foreground">{plan?.name ?? 'Seu plano'}</p>
          </div>
          {onChangePlan ? <ChangePlanButton onClick={onChangePlan} className="mt-0.5" /> : null}
        </div>
        <div className="space-y-4 p-5">
          <SummaryLines {...props} />
          {quote ? <PriceTotals quote={quote} className="border-t pt-4" /> : null}
          {plan ? (
            <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
              <CalendarCheck2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {describeLoyalty(plan.loyaltyMonths)}
            </p>
          ) : null}
        </div>
      </div>
      <TrustList />
    </aside>
  )
}

export function TrustList({ className }: { className?: string }) {
  return (
    <ul className={cn('space-y-2 px-1 text-[13px] text-muted-foreground', className)}>
      <li className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-emerald-600" aria-hidden />
        Pagamento processado com criptografia
      </li>
      <li className="flex items-center gap-2">
        <BadgeCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
        Carteirinha digital emitida na confirmação
      </li>
      <li className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
        Dados protegidos conforme a LGPD
      </li>
    </ul>
  )
}

/** Selos curtos ao lado do botão final: pagamento seguro e dados protegidos. */
export function TrustSeals({ className }: { className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5">
        <Lock className="size-3.5 text-emerald-600" aria-hidden />
        Pagamento seguro
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
        Dados protegidos (LGPD)
      </span>
    </p>
  )
}

/** Mobile: resumo recolhível no topo — plano e 1ª cobrança à vista; toque para ver a conta. */
export function OrderSummaryMobileTop({ onChangePlan, ...props }: SummaryProps & { onChangePlan?: () => void }) {
  const [open, setOpen] = useState(false)
  const { plan, quote } = props

  return (
    <section className="rounded-xl border bg-card lg:hidden" aria-label="Resumo do pedido">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls="mobile-order-summary"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{plan?.name ?? 'Seu plano'}</span>
            <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
              {open ? 'Ocultar resumo' : 'Ver resumo'}
              <ChevronDown className={cn('size-3.5 transition-transform duration-150', open && 'rotate-180')} aria-hidden />
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-base font-bold text-foreground" aria-live="polite">
              {formatBRL(quote?.firstChargeTotal ?? 0)}
            </span>
            {quote && quote.firstChargeTotal !== quote.total ? (
              <span className="block text-[12px] text-muted-foreground">depois {formatBRL(quote.total)}/mês</span>
            ) : (
              <span className="block text-[12px] text-muted-foreground">por mês</span>
            )}
          </span>
        </button>
      </div>
      {open ? (
        <div
          id="mobile-order-summary"
          className="space-y-3 border-t px-4 pb-4 pt-3 duration-150 animate-in fade-in motion-reduce:animate-none"
        >
          <SummaryLines {...props} />
          {quote ? <PriceTotals quote={quote} className="border-t pt-3" /> : null}
          {onChangePlan ? <ChangePlanButton onClick={onChangePlan} /> : null}
        </div>
      ) : null}
    </section>
  )
}

interface MobileBarProps {
  quote: ClubPlanQuote | null
  ctaLabel: string
  busyLabel: string
  onCta: () => void
  busy: boolean
  /** Passo final: botão em largura total (o valor já está no texto) e selos de confiança. */
  final: boolean
  disabled?: boolean
}

/** Barra fixa do mobile: uma ação principal por passo, com o total sempre à vista. */
export function CheckoutMobileBar({ quote, ctaLabel, busyLabel, onCta, busy, final, disabled }: MobileBarProps) {
  return (
    <div
      data-checkout-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.2)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden print:hidden"
    >
      <div className="flex items-center gap-3">
        {!final ? (
          <div className="min-w-0">
            <p className="text-[12px] text-muted-foreground">1ª cobrança</p>
            <p className="text-base font-bold text-foreground" aria-live="polite">
              {formatBRL(quote?.firstChargeTotal ?? 0)}
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          onClick={onCta}
          disabled={busy || disabled}
          aria-busy={busy || undefined}
          className={cn('h-12 min-w-0 flex-1 rounded-xl text-base font-semibold shadow-sm', !final && 'ml-auto')}
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : final ? <Lock className="size-4" aria-hidden /> : null}
          <span className="truncate">{busy ? busyLabel : ctaLabel}</span>
          {!busy && !final ? <ArrowRight className="size-5" aria-hidden /> : null}
        </Button>
      </div>
      {final ? <TrustSeals className="mt-2" /> : null}
    </div>
  )
}
