'use client'

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, BadgePercent, CalendarClock, ChevronUp, Loader2, ShieldCheck, Sparkles, Users } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  type ClubPaymentMethod,
  type PlatformPlanOffer,
  type PlatformPlanQuote,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { formatLives, formatNumber } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { TrustList } from './shell'

interface SummaryProps {
  offer: PlatformPlanOffer | null
  quote: PlatformPlanQuote | null
  method?: ClubPaymentMethod | null
  /** Linhas extras no topo (contratante, CNPJ…). */
  facts?: { label: string; value: ReactNode }[]
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-muted-foreground', strong && 'font-medium text-foreground')}>{label}</dt>
      <dd className={cn('text-right tabular-nums text-foreground', strong && 'font-semibold')}>{value}</dd>
    </div>
  )
}

/** Linhas do resumo (fatos + cotação + ativação), sem a moldura — reuso no mobile. */
export function QuoteLines({ offer, quote, method, facts }: SummaryProps) {
  return (
    <div className="space-y-4">
      {facts?.length ? (
        <dl className="space-y-1.5 text-sm">
          {facts.map(fact => (
            <Row key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </dl>
      ) : null}
      {offer && quote ? (
        <>
          {quote.setupFeeDiscount > 0 || quote.planFeeDiscount > 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">
              <BadgePercent className="size-4 shrink-0" aria-hidden />
              Condição especial aprovada
            </p>
          ) : null}
          <dl className="space-y-1.5 border-t pt-4 text-sm">
            <Row label={`Mensalidade (até ${formatNumber(quote.memberLimit)} vidas)`} value={formatBRL(quote.planFee)} />
            {quote.planFeeDiscount > 0 ? (
              <Row
                label={`Desconto de ${quote.planFeeDiscountPercent.toLocaleString('pt-BR')}% na mensalidade`}
                value={<span className="text-emerald-700">−{formatBRL(quote.planFeeDiscount)}</span>}
              />
            ) : null}
            {quote.extraLives > 0 ? (
              <Row
                label={`${formatNumber(quote.extraLives)} vidas excedentes × ${formatBRL(quote.pricePerExtraLife)}`}
                value={formatBRL(quote.overageTotal)}
              />
            ) : null}
            <Row label="Mensal estimado" value={formatBRL(quote.monthlyTotal)} strong />
          </dl>
          <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
            {quote.setupFee > 0 ? <Row label="Adesão (única)" value={formatBRL(quote.setupFee)} /> : null}
            {quote.setupFeeDiscount > 0 ? (
              <Row
                label={
                  quote.setupFeeDiscountPercent >= 100
                    ? 'Isenção da adesão'
                    : `Desconto de ${quote.setupFeeDiscountPercent.toLocaleString('pt-BR')}% na adesão`
                }
                value={<span className="text-emerald-700">−{formatBRL(quote.setupFeeDiscount)}</span>}
              />
            ) : null}
            <Row label="1ª mensalidade" value={formatBRL(quote.planFee - quote.planFeeDiscount)} />
            <Row label="Ativação" value={formatBRL(quote.activationTotal)} strong />
            {method ? <Row label="Forma de pagamento" value={CLUB_PAYMENT_METHOD_LABELS[method]} /> : null}
          </dl>
          <p className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
            <CalendarClock className="mt-px size-4 shrink-0 text-primary" aria-hidden />
            A ativação só é cobrada depois da aprovação cadastral. O excedente de vidas entra a partir da 2ª fatura.
          </p>
        </>
      ) : (
        <p className="border-t pt-4 text-sm text-muted-foreground">Simule as vidas e escolha um plano para ver o valor.</p>
      )}
    </div>
  )
}

/** Coluna fixa do desktop: plano, cotação e ativação sempre à vista. */
export function QuoteSummaryCard(props: SummaryProps & { footer?: ReactNode; title?: string }) {
  const { offer, quote, footer, title = 'Resumo da contratação' } = props
  return (
    <aside className="sticky top-24 space-y-4" aria-label={title}>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="bg-gradient-to-br from-[#1e2a4a] to-[#33446f] px-5 py-4 text-white">
          <p className="text-xs font-medium uppercase tracking-wider text-white/70">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 font-display text-xl font-bold">
            {offer ? `Plano ${offer.name}` : 'Plataforma ANNETEC'}
            {offer?.pricing.highlight ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                <Sparkles className="size-3" aria-hidden />
                Mais escolhido
              </span>
            ) : null}
          </p>
          {quote ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/75">
              <Users className="size-3.5" aria-hidden />
              {formatLives(quote.lives)} simuladas · uso de {quote.usagePct.toLocaleString('pt-BR')}% do limite
            </p>
          ) : null}
        </div>
        <div className="p-5">
          <QuoteLines {...props} />
          {footer ? <div className="mt-4 border-t pt-4">{footer}</div> : null}
        </div>
      </div>
      <TrustList />
    </aside>
  )
}

interface MobileBarProps extends SummaryProps {
  ctaLabel: string
  onCta: () => void
  busy?: boolean
  disabled?: boolean
}

/** Barra inferior do mobile: valor da ativação + botão da etapa; toque abre o resumo. */
export function QuoteMobileBar({ ctaLabel, onCta, busy, disabled, ...props }: MobileBarProps) {
  const [open, setOpen] = useState(false)
  const { quote } = props
  return (
    <div
      data-contratar-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden print:hidden"
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="contratar-mobile-summary"
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="max-h-[60vh] overflow-y-auto"
          >
            <div className="border-b px-4 pb-4 pt-4">
              <QuoteLines {...props} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls="contratar-mobile-summary"
          className="flex min-w-0 flex-col items-start rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Mensal estimado
            <ChevronUp className={cn('size-3.5 transition-transform', open ? 'rotate-0' : 'rotate-180')} aria-hidden />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-foreground" aria-live="polite">
            {quote ? formatBRL(quote.monthlyTotal) : '—'}
          </span>
          {quote ? (
            <span className="text-[11px] text-muted-foreground">ativação {formatBRL(quote.activationTotal)} após aprovação</span>
          ) : null}
        </button>
        <Button
          type="button"
          onClick={onCta}
          disabled={busy || disabled}
          className="ml-auto h-12 min-w-0 flex-1 rounded-xl text-base font-semibold shadow-md"
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          <span className="truncate">{busy ? 'Salvando…' : ctaLabel}</span>
          {!busy ? <ArrowRight className="size-5" aria-hidden /> : null}
        </Button>
      </div>
    </div>
  )
}

/** Selo curto de "cobrança só após aprovação" para as etapas. */
export function ApprovalFirstBadge({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-2 text-[13px] text-muted-foreground', className)}>
      <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
      Sem cobrança agora: você só paga a ativação depois que a proposta for aprovada.
    </p>
  )
}
