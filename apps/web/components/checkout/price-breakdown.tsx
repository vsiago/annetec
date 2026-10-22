'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { formatBRL, formatDateBR, type ClubPlanQuote } from '@annetec/contracts'
import { enrollmentFeeView, estimateNextChargeDate } from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'

/**
 * Conta do pedido, lida só do `quoteClubPlan` (a mesma da API): titular,
 * dependentes inclusos × extras, adesão e, separados, a 1ª cobrança e a
 * mensalidade que vale depois. Usado no resumo lateral, na barra do mobile e
 * na revisão.
 */

function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="shrink-0 text-right text-foreground">{value}</dd>
    </div>
  )
}

const plural = (n: number, singular: string, pluralForm: string) => (n === 1 ? singular : pluralForm)

export function PriceLines({ quote, className }: { quote: ClubPlanQuote; className?: string }) {
  const count = quote.dependentsCount
  const unit = quote.dependentUnitPrice
  // Sem preço por dependente, todos entram na mensalidade (Família, planos antigos "inclusos").
  const included = unit === 0 ? count : Math.min(count, quote.includedDependents)
  const charged = count - included
  const fee = enrollmentFeeView(quote)

  return (
    <dl className={cn('space-y-2.5 text-sm', className)}>
      <Row label="Mensalidade do titular" value={formatBRL(quote.basePrice)} />
      {count === 0 ? <Row label="Dependentes" value="—" /> : null}
      {included > 0 ? (
        <Row
          label={`${included} ${plural(included, 'dependente incluso', 'dependentes inclusos')} no plano`}
          value={<span className="font-medium text-emerald-700 dark:text-emerald-400">Incluso</span>}
        />
      ) : null}
      {charged > 0 ? (
        <Row
          label={`${charged} ${plural(charged, 'dependente', 'dependentes')}${
            quote.includedDependents > 0 ? ` ${plural(charged, 'extra', 'extras')}` : ''
          } × ${formatBRL(unit)}`}
          value={formatBRL(quote.dependentsTotal)}
        />
      ) : null}
      {fee.kind === 'none' ? (
        <Row label="Adesão" value={<span className="text-muted-foreground">Sem adesão</span>} />
      ) : fee.kind === 'waived' ? (
        <Row
          label="Adesão"
          value={
            <span className="inline-flex items-baseline gap-1.5">
              <s className="text-muted-foreground" aria-label={`de ${formatBRL(fee.listPrice)}`}>
                {formatBRL(fee.listPrice)}
              </s>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Isenta</span>
            </span>
          }
        />
      ) : (
        <Row label="Adesão (só na 1ª cobrança)" value={formatBRL(fee.amount)} />
      )}
    </dl>
  )
}

/** Total da 1ª cobrança (com a adesão) em destaque e, abaixo, a mensalidade que vale depois. */
export function PriceTotals({
  quote,
  size = 'md',
  showNextCharge = true,
  className,
}: {
  quote: ClubPlanQuote
  size?: 'md' | 'lg'
  showNextCharge?: boolean
  className?: string
}) {
  return (
    <dl className={cn('space-y-1.5', className)}>
      <div className="flex items-end justify-between gap-3">
        <dt className={cn('font-semibold text-foreground', size === 'lg' ? 'text-base' : 'text-sm')}>
          Total da 1ª cobrança
        </dt>
        <motion.dd
          key={quote.firstChargeTotal}
          initial={{ opacity: 0.4, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'font-display font-extrabold tracking-tight text-foreground',
            size === 'lg' ? 'text-3xl' : 'text-[1.75rem] leading-tight',
          )}
          aria-live="polite"
        >
          {formatBRL(quote.firstChargeTotal)}
        </motion.dd>
      </div>
      <div className="flex justify-between gap-3 text-[13px]">
        <dt className="text-muted-foreground">Depois</dt>
        <dd className="font-semibold text-foreground">{formatBRL(quote.total)}/mês</dd>
      </div>
      {showNextCharge ? (
        <div className="flex justify-between gap-3 text-[13px]">
          <dt className="text-muted-foreground">Próxima mensalidade</dt>
          <dd className="font-medium text-foreground">{formatDateBR(estimateNextChargeDate())}</dd>
        </div>
      ) : null}
    </dl>
  )
}
