'use client'

import Link from 'next/link'
import { ArrowRight, CircleCheck, CircleX, ClipboardCheck, MessageSquareQuote } from 'lucide-react'
import type { DiscountRequest, PlatformPlanQuote } from '@annetec/contracts'
import { SuperadminOnly } from '@/components/admin-platform/billing/console-kit'
import { SUPERADMIN_ONLY } from '@/components/admin-platform/comercial/comercial-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { applyDiscountToQuote } from '@/components/sales/discount-fields'
import {
  DiscountStatusPill,
  InfoRow,
  SellerProposalStatusPill,
  discountSummary,
  formatDateTime,
  formatMoney,
  formatPct,
  formatRelativeShort,
} from '@/components/sales/sales-ui'
import { cn } from '@/lib/utils'

/**
 * Detalhe de um pedido de desconto de vendedor (Aprovações › Descontos de
 * vendedores): a cotação cheia ao lado da pedida, a justificativa e as ações
 * do superadmin (aprovar com ajuste opcional, recusar com motivo).
 */

/** Coluna de valores da comparação lado a lado. */
function QuoteColumn({ title, quote, base, tone }: { title: string; quote: PlatformPlanQuote; base?: PlatformPlanQuote; tone: 'base' | 'discount' }) {
  const rows: { label: string; value: number; from?: number }[] = [
    { label: 'Mensalidade do plano', value: quote.planFee - quote.planFeeDiscount, from: base?.planFee },
    { label: 'Adesão', value: quote.setupFee - quote.setupFeeDiscount, from: base?.setupFee },
    { label: 'Ativação', value: quote.activationTotal, from: base?.activationTotal },
    { label: 'Mensal estimado', value: quote.monthlyTotal, from: base?.monthlyTotal },
  ]
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border p-4',
        tone === 'discount' ? 'border-[#ABEFC6] bg-[#F6FEF9]' : 'border-border bg-[#FCFCFD]',
      )}
    >
      <p className={cn('m-0 text-sm font-semibold', tone === 'discount' ? 'text-[#067647]' : 'text-foreground')}>{title}</p>
      <dl className="m-0 mt-3 flex flex-col gap-2">
        {rows.map(row => {
          const changed = row.from !== undefined && Math.abs(row.from - row.value) > 0.004
          return (
            <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={cn('m-0 tabular-nums', changed ? 'font-semibold text-[#067647]' : 'text-foreground')}>
                {formatMoney(row.value)}
                {changed && row.from ? (
                  <span className="ml-1 text-xs font-medium">(−{formatPct(((row.from - row.value) / row.from) * 100)})</span>
                ) : null}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

export function DiscountRequestDetail({
  request,
  isSuperadmin,
  onApprove,
  onReject,
}: {
  request: DiscountRequest
  isSuperadmin: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const pending = request.status === 'pending'
  const effective = request.approved ?? request.requested
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>
            Proposta <span className="font-mono">{request.proposalCode}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>Plano {request.planName ?? '—'}</span>
          <span aria-hidden="true">·</span>
          <span>Pedido {formatRelativeShort(request.createdAt)}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DiscountStatusPill status={request.status} />
          <SellerProposalStatusPill status={request.proposalStatus} />
        </div>
      </div>

      <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InfoRow label="Vendedor">{request.sellerName ?? '—'}</InfoRow>
        <InfoRow label="Pedido">{discountSummary(request.requested)}</InfoRow>
        {request.approved ? <InfoRow label="Aprovado">{discountSummary(request.approved)}</InfoRow> : null}
      </dl>

      {request.quote ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <QuoteColumn title="Cotação cheia" quote={request.quote} tone="base" />
          <ArrowRight className="mx-auto hidden size-5 text-muted-foreground md:block" aria-hidden="true" />
          {request.status === 'approved' && request.approved ? (
            <QuoteColumn
              title="Com o desconto aprovado"
              quote={applyDiscountToQuote(request.quote, request.approved)}
              base={request.quote}
              tone="discount"
            />
          ) : request.quoteWithDiscount ? (
            <QuoteColumn title="Com o desconto pedido" quote={request.quoteWithDiscount} base={request.quote} tone="discount" />
          ) : null}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Sem plano na proposta: a comparação de preço não está disponível.</p>
      )}
      {effective.monthlyPercent > 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">
          Desconto na mensalidade{' '}
          {effective.monthlyMonths === null ? 'permanente' : `nas ${effective.monthlyMonths} primeiras mensalidades (a 1ª vai na ativação)`}.
        </p>
      ) : null}

      <section aria-labelledby="justificativa" className="rounded-2xl border border-border bg-white p-4">
        <h3 id="justificativa" className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquareQuote className="size-4 text-secondary" aria-hidden="true" />
          Justificativa do vendedor
        </h3>
        <p className="m-0 mt-2 whitespace-pre-line break-words text-sm text-[#344054]">{request.justification}</p>
      </section>

      {request.status !== 'pending' ? (
        <div className="rounded-2xl bg-[#F6F8FB] p-4 text-sm">
          <p className="m-0 text-foreground">
            {request.status === 'approved' ? 'Aprovado' : request.status === 'rejected' ? 'Recusado' : 'Cancelado'}
            {request.decidedByName ? ` por ${request.decidedByName}` : ''}
            {request.decidedAt ? ` em ${formatDateTime(request.decidedAt)}` : ''}.
          </p>
          {request.rejectionReason ? <p className="m-0 mt-1 text-[#B42318]">Motivo: {request.rejectionReason}</p> : null}
          {request.decisionNote ? <p className="m-0 mt-1 text-muted-foreground">Observação: {request.decisionNote}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {pending ? (
          <>
            <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
              <Button className="h-11 gap-2 rounded-[10px] bg-[#067647] px-4 font-semibold text-white hover:bg-[#05603B]" onClick={onApprove}>
                <CircleCheck aria-hidden="true" />
                Aprovar desconto
              </Button>
            </SuperadminOnly>
            <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
              <Button
                variant="outline"
                className="h-11 gap-2 rounded-[10px] border-[#FDA29B] px-4 font-semibold text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                onClick={onReject}
              >
                <CircleX aria-hidden="true" />
                Recusar desconto
              </Button>
            </SuperadminOnly>
          </>
        ) : null}
        <Button asChild variant="outline" className="h-11 rounded-[10px] px-4 font-semibold">
          <Link href={`/admin/compliance/${request.proposalId}`}>
            <ClipboardCheck aria-hidden="true" />
            Abrir a proposta
          </Link>
        </Button>
      </div>
    </div>
  )
}
