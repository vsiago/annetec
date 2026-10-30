'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, BadgePercent, CircleCheck, CircleX, ClipboardCheck, MessageSquareQuote } from 'lucide-react'
import { toast } from 'sonner'
import type { DiscountRequest, DiscountRequestStatus, PlatformPlanQuote } from '@annetec/contracts'
import {
  ConfirmDialog,
  RefreshButton,
  SuperadminOnly,
  TableSkeleton,
  runCommand,
  useConsoleData,
  usePlatformRole,
} from '@/components/admin-platform/billing/console-kit'
import { ComercialNav, SUPERADMIN_ONLY, useSellers } from '@/components/admin-platform/comercial/comercial-kit'
import { ApproveDiscountWizard } from '@/components/admin-platform/comercial/discount-decision'
import { applyDiscountToQuote } from '@/components/sales/discount-fields'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { SectionTab, SectionTabsList } from '@/components/admin-platform/ui/section-tabs'
import { FilterSelect } from '@/components/admin-platform/ui/table-controls'
import { Tabs } from '@/components/ui/tabs'
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
import { getDiscountRequestAction, listDiscountRequestsAction, rejectDiscountAction } from '@/lib/actions/comercial-api'
import { cn } from '@/lib/utils'

/**
 * Comercial › Descontos: fila dos pedidos de condição especial dos
 * vendedores. O detalhe compara a cotação cheia com a pedida, mostra a
 * justificativa e deixa o superadmin aprovar (com ajuste opcional) ou
 * recusar com motivo. `?pedido=<id>` abre o pedido direto (link do sino).
 */

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const TABS: { value: Tab; label: string }[] = [
  { value: 'pending', label: 'Aguardando' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Recusados' },
  { value: 'all', label: 'Todos' },
]

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

function RequestDetail({
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
        <div className="min-w-0">
          <h2 className="m-0 text-lg font-bold text-foreground">{request.customerName}</h2>
          <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              Proposta <span className="font-mono">{request.proposalCode}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Plano {request.planName ?? '—'}</span>
            <span aria-hidden="true">·</span>
            <span>Pedido {formatRelativeShort(request.createdAt)}</span>
          </p>
        </div>
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

function DiscountsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const requested = params.get('pedido')
  /** `?proposta=<id>` (aviso de Aprovações): abre o pedido aguardando daquela proposta. */
  const forProposal = params.get('proposta')
  const { isSuperadmin } = usePlatformRole()
  const sellers = useSellers()
  const [tab, setTab] = useState<Tab>('pending')
  const [seller, setSeller] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(requested)
  const [approving, setApproving] = useState<DiscountRequest | null>(null)
  const [rejecting, setRejecting] = useState<DiscountRequest | null>(null)

  const list = useConsoleData(
    () =>
      listDiscountRequestsAction({
        status: tab === 'all' ? undefined : (tab as DiscountRequestStatus),
        sellerUserId: seller === 'all' ? undefined : seller,
        perPage: 100,
      }),
    [tab, seller],
  )
  const detail = useConsoleData(selectedId ? () => getDiscountRequestAction(selectedId) : null, [selectedId])

  useEffect(() => {
    if (requested) setSelectedId(requested)
  }, [requested])

  // Veio de Aprovações: o pedido daquela proposta; senão, o primeiro da fila.
  useEffect(() => {
    if (selectedId || !list.data?.items.length) return
    const match = forProposal ? list.data.items.find(item => item.proposalId === forProposal) : null
    setSelectedId((match ?? list.data.items[0]!).id)
  }, [selectedId, list.data, forProposal])

  const items = list.data?.items ?? []
  const current = detail.data && detail.data.id === selectedId ? detail.data : null

  const select = (id: string) => {
    setSelectedId(id)
    router.replace(`/admin/comercial/descontos?pedido=${id}`, { scroll: false })
  }

  const afterDecision = (updated: DiscountRequest) => {
    detail.setData(updated)
    void list.reload({ silent: true })
  }

  return (
    <PageContainer>
      <PageHeader
        icon={BadgePercent}
        title="Descontos"
        description="Pedidos de condição especial dos vendedores. O link do cliente espera a sua decisão."
        actions={
          <RefreshButton
            loading={list.loading}
            onClick={() => {
              void list.reload({ silent: true })
              void detail.reload({ silent: true })
            }}
          />
        }
      />
      <ComercialNav />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <SectionCard padded={false}>
          <Tabs value={tab} onValueChange={value => setTab(value as Tab)} className="gap-0">
            <div className="px-4 pt-3 sm:px-6">
              <SectionTabsList>
                {TABS.map(item => (
                  <SectionTab key={item.value} value={item.value} badge={item.value === 'pending' && list.data && tab === 'pending' ? list.data.meta.total : undefined}>
                    {item.label}
                  </SectionTab>
                ))}
              </SectionTabsList>
            </div>
          </Tabs>
          <div className="px-4 py-4 sm:px-6">
            <FilterSelect label="Vendedor" value={seller} onChange={setSeller} allLabel="Todos" options={sellers.options} />
          </div>
          <div className="border-t border-border">
            {list.error && !list.data ? (
              <ErrorState framed={false} onRetry={() => list.reload()} />
            ) : !list.data ? (
              <TableSkeleton rows={4} />
            ) : items.length === 0 ? (
              <EmptyState
                size="sm"
                tone={tab === 'pending' ? 'success' : 'default'}
                icon={BadgePercent}
                title={tab === 'pending' ? 'Nenhum pedido aguardando' : 'Nenhum pedido aqui'}
                description={tab === 'pending' ? 'Quando um vendedor pedir desconto, ele aparece aqui e no sino.' : undefined}
              />
            ) : (
              <ul className="m-0 list-none divide-y divide-[#EEF0F3] p-0">
                {items.map(item => {
                  const active = item.id === selectedId
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => select(item.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'relative flex w-full flex-col gap-1 px-4 py-3.5 text-left outline-none transition-colors focus-visible:bg-[#F6F9FC] sm:px-6',
                          active ? 'bg-accent/60' : 'hover:bg-[#F6F9FC]',
                        )}
                      >
                        {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-secondary" aria-hidden="true" /> : null}
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{item.customerName}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeShort(item.createdAt)}</span>
                        </span>
                        <span className="truncate text-[13px] text-muted-foreground">
                          {item.sellerName ?? 'Vendedor'} · {discountSummary(item.requested)}
                        </span>
                        {tab === 'all' ? (
                          <span>
                            <DiscountStatusPill status={item.status} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </SectionCard>

        <SectionCard>
          {!selectedId ? (
            <EmptyState size="sm" icon={BadgePercent} title="Escolha um pedido" description="O detalhe com a comparação de preços aparece aqui." />
          ) : detail.error && !current ? (
            <ErrorState framed={false} size="sm" title={detail.error} onRetry={() => detail.reload()} />
          ) : !current ? (
            <SectionSkeleton rows={8} />
          ) : (
            <RequestDetail
              request={current}
              isSuperadmin={isSuperadmin}
              onApprove={() => setApproving(current)}
              onReject={() => setRejecting(current)}
            />
          )}
        </SectionCard>
      </div>

      <ApproveDiscountWizard
        request={approving}
        onOpenChange={open => !open && setApproving(null)}
        onDone={updated => {
          afterDecision(updated)
          toast.success('Desconto aprovado. O vendedor foi avisado')
        }}
      />
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={open => !open && setRejecting(null)}
        title={rejecting ? `Recusar o desconto para ${rejecting.customerName}?` : 'Recusar o desconto?'}
        description="O vendedor recebe o motivo no sino e pode reenviar o link sem desconto ou fazer outro pedido."
        confirmLabel="Recusar desconto"
        destructive
        reason={{ label: 'Motivo (o vendedor vai ler)', placeholder: 'Ex.: isenção total só para clubes acima de 5 mil vidas.', minLength: 5 }}
        onConfirm={async reason => {
          if (!rejecting) return false
          const updated = await runCommand(rejectDiscountAction(rejecting.id, { reason }), 'Desconto recusado. O vendedor foi avisado')
          if (updated) afterDecision(updated)
          return !!updated
        }}
      />
    </PageContainer>
  )
}

export default function ComercialDiscountsPage() {
  return (
    <Suspense fallback={null}>
      <DiscountsPage />
    </Suspense>
  )
}
