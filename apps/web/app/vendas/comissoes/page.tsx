'use client'

import { useEffect, useState } from 'react'
import { CircleDollarSign, HandCoins, Info, Undo2, Wallet } from 'lucide-react'
import type { SalesCommissionStatus } from '@annetec/contracts'
import { KpiSkeleton, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { CommissionTable } from '@/components/sales/commission-table'
import { COMMISSION_STATUS_OPTIONS, currentMonthSP, formatMoney, monthLabel, recentMonths } from '@/components/sales/sales-ui'
import { listSellerCommissionsAction } from '@/lib/actions/vendas-api'

/**
 * Comissões do vendedor: cada fatura paga do clube que ele trouxe gera um
 * lançamento (adesão e as primeiras mensalidades, pela regra vigente). Totais
 * do mês e de todo o período, e a lista com filtro por mês e situação.
 */
export default function SellerCommissionsPage() {
  const month = currentMonthSP()
  const [mes, setMes] = useState<string>(month)
  const [status, setStatus] = useState<'all' | SalesCommissionStatus>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')

  const monthTotals = useConsoleData(() => listSellerCommissionsAction({ mes: month, perPage: 1 }), [month])
  const allTotals = useConsoleData(() => listSellerCommissionsAction({ perPage: 1 }), [])
  const list = useConsoleData(
    () =>
      listSellerCommissionsAction({
        mes: mes === 'all' ? undefined : mes,
        status: status === 'all' ? undefined : status,
        page,
        perPage: Number(perPage),
      }),
    [mes, status, page, perPage],
  )
  useEffect(() => setPage(1), [mes, status, perPage])

  const m = monthTotals.data?.totals
  const t = allTotals.data?.totals
  const monthName = monthLabel(month).split(' ')[0]

  const refresh = () => {
    void monthTotals.reload({ silent: true })
    void allTotals.reload({ silent: true })
    void list.reload({ silent: true })
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Wallet}
        title="Comissões"
        description="Sua parte de cada fatura paga pelos clubes que você trouxe para a ANNETEC."
        actions={<RefreshButton loading={list.loading} onClick={refresh} />}
      />

      {(monthTotals.error && !m) || (allTotals.error && !t) ? (
        <ErrorState onRetry={refresh} />
      ) : !m || !t ? (
        <KpiSkeleton />
      ) : (
        <section aria-label="Totais de comissão" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<HandCoins />}
            accent="amber"
            label={`A receber em ${monthName}`}
            value={formatMoney(m.a_pagar)}
            hint={`${formatMoney(t.a_pagar)} a receber no total`}
          />
          <KpiCard
            icon={<CircleDollarSign />}
            accent="green"
            label={`Paga em ${monthName}`}
            value={formatMoney(m.paga)}
            tone={m.paga > 0 ? 'success' : 'default'}
            hint={`${formatMoney(t.paga)} já repassados no total`}
          />
          <KpiCard
            icon={<Undo2 />}
            accent="red"
            label={`A descontar em ${monthName}`}
            value={formatMoney(m.a_descontar)}
            tone={m.a_descontar > 0 ? 'danger' : 'default'}
            hint={t.a_descontar > 0 ? `${formatMoney(t.a_descontar)} de estornos depois do repasse` : 'Nenhum estorno a descontar'}
          />
          <KpiCard
            icon={<Wallet />}
            accent="coral"
            label={`Líquido de ${monthName}`}
            value={formatMoney(m.net)}
            hint={`${formatMoney(t.net)} no total (a receber + paga − a descontar)`}
          />
        </section>
      )}

      <SectionCard padded={false} title="Lançamentos" description="Um por parte paga da fatura: adesão ou mensalidade nº 1, 2, 3…" icon={Wallet}>
        <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Competência"
            value={mes}
            onChange={setMes}
            allLabel="Todos os meses"
            options={recentMonths(12)}
          />
          <FilterSelect
            label="Situação"
            value={status}
            onChange={value => setStatus(value as 'all' | SalesCommissionStatus)}
            allLabel="Todas"
            options={COMMISSION_STATUS_OPTIONS}
          />
          {list.data ? (
            <p className="m-0 text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
              Neste filtro: <strong className="font-semibold text-foreground">{formatMoney(list.data.totals.net)}</strong> líquido
            </p>
          ) : null}
        </div>
        <div className="border-t border-border">
          {list.error && !list.data ? (
            <ErrorState framed={false} onRetry={() => list.reload()} />
          ) : !list.data ? (
            <TableSkeleton />
          ) : list.data.items.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={mes === 'all' && status === 'all' ? 'Nenhuma comissão ainda' : 'Nenhuma comissão neste filtro'}
              description={
                mes === 'all' && status === 'all'
                  ? 'A comissão nasce quando o clube que você trouxe paga a fatura da ANNETEC.'
                  : 'Escolha outro mês ou outra situação.'
              }
            />
          ) : (
            <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
              <CommissionTable items={list.data.items} />
            </div>
          )}
        </div>
        {list.data && list.data.total > 0 ? (
          <TableFooter
            page={page}
            perPage={perPage}
            total={list.data.total}
            noun="lançamentos"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        ) : null}
      </SectionCard>

      <p className="m-0 flex items-start gap-2 text-[13px] text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        A competência é o mês em que o clube pagou a fatura. Fatura estornada antes do repasse cancela a comissão; depois do repasse, o valor
        fica &quot;a descontar&quot; do próximo pagamento.
      </p>
    </PageContainer>
  )
}
