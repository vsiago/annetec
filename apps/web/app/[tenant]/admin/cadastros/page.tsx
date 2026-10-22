'use client'

import { Fragment, Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Clock, IdCard, UserRoundCheck, UserRoundPlus, UsersRound, Wallet } from 'lucide-react'
import type { ClubSubscription, ClubSubscriptionStatus } from '@annetec/contracts'
import { ageOn } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { FilterSelect, SearchInput, StatusPill, TableFooter } from '@/components/dashboard/table-controls'
import { LoadError, MethodLabel, TableSkeleton } from '@/components/admin/faturamento/billing-ui'
import { useDebounced } from '@/components/admin/faturamento/charges-tab'
import {
  SubscriptionActionsMenu,
  useSubscriptionActions,
  type SubscriptionAction,
} from '@/components/admin/faturamento/subscription-actions'
import { SubscriptionDetailSheet } from '@/components/admin/faturamento/subscription-detail-sheet'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import {
  getBillingSummaryAction,
  latestChargeBySubscriptionAction,
  listClubSubscriptionsAction,
} from '@/lib/actions/faturamento-api'
import {
  chargeStatusMeta,
  formatCount,
  formatCpf,
  formatDateBR,
  relationshipLabel,
  SUBSCRIPTION_STATUS_OPTIONS,
  subscriptionStatusMeta,
  type LatestChargeInfo,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'

/** Colunas da tabela; o número entra no `colSpan` da linha expandida. */
const COLUMN_COUNT = 9

export default function CadastrosPage() {
  // `useSearchParams` precisa de Suspense acima dele no App Router.
  return (
    <Suspense fallback={null}>
      <CadastrosContent />
    </Suspense>
  )
}

function CadastrosContent() {
  const { tenant } = useTenant()
  const { clientPlans } = useTenantData()
  const router = useRouter()
  const params = useSearchParams()
  const slug = tenant?.slug ?? ''
  const base = slug ? `/${slug}/admin` : ''

  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [status, setStatus] = useState<'all' | ClubSubscriptionStatus>('all')
  // `?plano=<id>` abre já filtrado (link "Ver todos em Cadastros" de Produtos e Planos).
  const [planId, setPlanId] = useState(() => params.get('plano') ?? 'all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('10')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [detailId, setDetailId] = useState<string | null>(() => params.get('assinatura'))
  const [version, setVersion] = useState(0)

  // A busca da barra superior navega para cá com `?q=`; se a página já estava
  // aberta, o estado inicial não roda de novo — sincroniza aqui.
  const urlQuery = params.get('q')
  useEffect(() => {
    if (urlQuery !== null) setSearch(urlQuery)
  }, [urlQuery])

  const q = useDebounced(search.trim())

  useEffect(() => {
    setPage(1)
  }, [q, status, planId, perPage])

  const list = useActionData(
    slug
      ? () =>
          listClubSubscriptionsAction(slug, {
            page,
            perPage: Number(perPage),
            q: q || undefined,
            status: status === 'all' ? undefined : status,
            planId: planId === 'all' ? undefined : planId,
          })
      : null,
    [slug, page, perPage, q, status, planId, version],
  )
  const summary = useActionData(slug ? () => getBillingSummaryAction(slug) : null, [slug, version])
  const latest = useActionData(slug ? () => latestChargeBySubscriptionAction(slug) : null, [slug, version])

  const changed = () => setVersion(value => value + 1)
  const actions = useSubscriptionActions({ tenantSlug: slug, onChanged: changed, onChargeCreated: changed })

  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function viewCharges(id: string, name: string) {
    router.push(
      `${base}/faturamento?tab=cobrancas&assinatura=${encodeURIComponent(id)}&nome=${encodeURIComponent(name)}`,
    )
  }

  function handleAction(action: SubscriptionAction, subscription: ClubSubscription) {
    if (action === 'detail') setDetailId(subscription.id)
    else if (action === 'charges') viewCharges(subscription.id, subscription.holder.name)
    else if (action === 'generate_charge') actions.requestGenerateCharge(subscription)
    else if (action === 'cancel') actions.requestCancel(subscription)
    else if (action === 'reactivate') actions.requestReactivate(subscription)
  }

  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtersActive = Boolean(q) || status !== 'all' || planId !== 'all'
  const s = summary.data

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cadastros"
        description="Assinantes do Clube de Benefícios que chegaram pelo checkout do site — titular, dependentes e carteirinhas emitidas automaticamente."
      >
        <Button asChild variant="outline" className="h-11 gap-2">
          <Link href={`${base}/faturamento`}>
            <Wallet className="h-4 w-4" />
            Ver faturamento
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UserRoundCheck}
          accent="success"
          value={s ? formatCount(s.activeSubscriptions) : '—'}
          label="Assinantes ativos"
          hint={s ? `${formatCount(s.pastDueSubscriptions)} em atraso · ${formatCount(s.suspendedSubscriptions)} suspensos` : undefined}
        />
        <StatCard
          icon={UsersRound}
          accent="info"
          value={s ? formatCount(s.totalDependents) : '—'}
          label="Dependentes"
          hint="Cada um com a própria carteirinha"
        />
        <StatCard
          icon={UserRoundPlus}
          accent="primary"
          value={s ? formatCount(s.newThisMonth) : '—'}
          label="Novos no mês"
          hint={s ? `${formatCount(s.canceledThisMonth)} cancelamentos no mês` : undefined}
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={s ? formatCount(s.pendingSubscriptions) : '—'}
          label="Aguardando 1º pagamento"
          hint="A carteirinha sai quando o pagamento confirma"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nome, CPF, e-mail ou nº da carteirinha..."
          />
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Status"
              value={status}
              onChange={value => setStatus(value as 'all' | ClubSubscriptionStatus)}
              allLabel="Todos"
              options={SUBSCRIPTION_STATUS_OPTIONS}
            />
            <FilterSelect
              label="Plano"
              value={planId}
              onChange={setPlanId}
              allLabel="Todos os planos"
              options={clientPlans.map(plan => ({ value: plan.id, label: plan.name }))}
            />
          </div>
        </div>

        {list.error && (
          <div className="px-4 pb-4">
            <LoadError message={list.error} onRetry={() => void list.reload()} />
          </div>
        )}

        <CardContent className={cn('p-0 transition-opacity', list.loading && list.data && 'opacity-60')}>
          {!list.data && list.loading ? (
            <TableSkeleton />
          ) : !list.data ? null : rows.length === 0 ? (
            <EmptyState
              icon={IdCard}
              title={filtersActive ? 'Nenhum cadastro com estes filtros' : 'Nenhum assinante ainda'}
              description={
                filtersActive
                  ? 'Ajuste a busca ou os filtros.'
                  : 'Os cadastros chegam sozinhos pelo checkout do site do clube, já com a cobrança configurada.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="w-10 py-3 pl-4" aria-label="Dependentes" />
                    <th className="px-4 py-3 font-medium">Titular</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Plano</th>
                    <th className="px-4 py-3 font-medium">Assinatura</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Último pagamento</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">Carteirinha</th>
                    <th className="hidden px-4 py-3 font-medium xl:table-cell">Método</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Adesão</th>
                    <th className="px-4 py-3" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(subscription => {
                    const open = expanded.has(subscription.id)
                    return (
                      <Fragment key={subscription.id}>
                        <tr
                          onClick={() => setDetailId(subscription.id)}
                          className={cn(
                            'cursor-pointer border-b border-border/60 hover:bg-muted/40',
                            (open || detailId === subscription.id) && 'bg-primary/5',
                          )}
                        >
                          <td className="py-3 pl-4">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation()
                                toggle(subscription.id)
                              }}
                              aria-expanded={open}
                              aria-label={open ? 'Esconder dependentes' : 'Mostrar dependentes'}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{subscription.holder.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCpf(subscription.holder.cpf)} · {subscription.holder.email}
                            </p>
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <p className="text-foreground">{subscription.planName}</p>
                            <p className="text-xs text-muted-foreground">
                              {subscription.dependents.length === 0
                                ? 'Individual'
                                : `+ ${subscription.dependents.length} ${subscription.dependents.length === 1 ? 'dependente' : 'dependentes'}`}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill {...subscriptionStatusMeta(subscription.status)} />
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            <LastPayment subscription={subscription} latest={latest.data?.[subscription.id]} />
                          </td>
                          <td className="hidden px-4 py-3 lg:table-cell">
                            {subscription.cardNumber ? (
                              <span className="whitespace-nowrap font-mono text-xs text-foreground">
                                {subscription.cardNumber}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Na ativação</span>
                            )}
                          </td>
                          <td className="hidden px-4 py-3 xl:table-cell">
                            <MethodLabel method={subscription.paymentMethod} card={subscription.paymentCard} />
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
                            {formatDateBR(subscription.startedAt ?? subscription.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={event => event.stopPropagation()}>
                            <SubscriptionActionsMenu subscription={subscription} onAction={handleAction} />
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-border/60 bg-muted/20">
                            <td colSpan={COLUMN_COUNT} className="px-4 py-3">
                              <DependentsList subscription={subscription} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {list.data && total > 0 && (
          <TableFooter
            page={page}
            perPage={perPage}
            total={total}
            noun="cadastros"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        )}
      </Card>

      <SubscriptionDetailSheet
        tenantSlug={slug}
        subscriptionId={detailId}
        open={detailId !== null}
        onOpenChange={open => !open && setDetailId(null)}
        onChanged={changed}
        onChargesChanged={changed}
        onViewCharges={viewCharges}
      />
      {actions.dialogs}
    </div>
  )
}

function LastPayment({
  subscription,
  latest,
}: {
  subscription: ClubSubscription
  latest: LatestChargeInfo | undefined
}) {
  if (latest) {
    const meta = chargeStatusMeta(latest.status)
    return (
      <div className="space-y-1">
        <StatusPill {...meta} />
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          {latest.status === 'paid' && latest.paidAt
            ? `em ${formatDateBR(latest.paidAt)}`
            : `vence ${formatDateBR(latest.dueDate)}`}
        </p>
      </div>
    )
  }
  if (subscription.overdueCount > 0) return <StatusPill {...chargeStatusMeta('overdue')} />
  if (subscription.status === 'pending_payment') return <StatusPill {...chargeStatusMeta('pending')} />
  return <span className="text-xs text-muted-foreground">—</span>
}

function DependentsList({ subscription }: { subscription: ClubSubscription }) {
  if (subscription.dependents.length === 0) {
    return <p className="py-1 text-sm text-muted-foreground">Plano individual — sem dependentes.</p>
  }
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Dependentes de {subscription.holder.name.split(' ')[0]}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-4 font-medium">Nome</th>
            <th className="py-1.5 pr-4 font-medium">Parentesco</th>
            <th className="py-1.5 pr-4 font-medium">Nascimento</th>
            <th className="hidden py-1.5 pr-4 font-medium sm:table-cell">CPF</th>
            <th className="py-1.5 font-medium">Carteirinha</th>
          </tr>
        </thead>
        <tbody>
          {subscription.dependents.map(dependent => {
            const age = dependent.birthDate ? ageOn(dependent.birthDate) : null
            return (
              <tr key={dependent.id} className="border-t border-border/50">
                <td className="py-2 pr-4 font-medium text-foreground">{dependent.name}</td>
                <td className="py-2 pr-4 text-muted-foreground">{relationshipLabel(dependent.relationship)}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                  {dependent.birthDate ? formatDateBR(dependent.birthDate) : '—'}
                  {age !== null && ` (${age})`}
                </td>
                <td className="hidden whitespace-nowrap py-2 pr-4 text-muted-foreground sm:table-cell">
                  {dependent.cpf ? formatCpf(dependent.cpf) : '—'}
                </td>
                <td className="whitespace-nowrap py-2 font-mono text-xs text-foreground">
                  {dependent.cardNumber ?? <span className="font-sans text-muted-foreground">Na ativação</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
