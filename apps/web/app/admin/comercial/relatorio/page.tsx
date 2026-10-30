'use client'

import { useState } from 'react'
import { ChartColumn, Download, FileSignature, KanbanSquare, Trophy, Wallet } from 'lucide-react'
import { KpiSkeleton, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ComercialNav } from '@/components/admin-platform/comercial/comercial-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { EntityAvatar } from '@/components/admin-platform/ui/entity-avatar'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { FilterSelect } from '@/components/admin-platform/ui/table-controls'
import { currentMonthSP, formatInt, formatMoney, monthLabel, recentMonths } from '@/components/sales/sales-ui'
import { downloadCsv } from '@/lib/download-csv'
import { getSalesReportAction } from '@/lib/actions/comercial-api'

/**
 * Comercial › Relatório: por vendedor no mês — funil ativo, propostas em
 * andamento, clubes ganhos e perdidos, meta e comissão.
 */
export default function SalesReportPage() {
  const [mes, setMes] = useState(currentMonthSP())
  const report = useConsoleData(() => getSalesReportAction(mes), [mes])
  const data = report.data
  const rows = data?.rows ?? []
  const label = monthLabel(mes)

  const exportCsv = () => {
    if (!data) return
    downloadCsv(`relatorio-vendas-${data.month}.csv`, [
      ['Vendedor', 'Código', 'Ativo', 'Prospects ativos', 'Propostas em andamento', 'Ganhos no mês', 'Perdidos no mês', 'Meta', 'Comissão a pagar', 'Comissão paga', 'A descontar', 'Comissão líquida'],
      ...data.rows.map(row => [
        row.sellerName,
        row.referralCode,
        row.active ? 'sim' : 'não',
        row.openProspects,
        row.proposalsInProgress,
        row.wonInMonth,
        row.lostInMonth,
        row.monthlyGoal ?? '',
        row.commission.a_pagar.toFixed(2).replace('.', ','),
        row.commission.paga.toFixed(2).replace('.', ','),
        row.commission.a_descontar.toFixed(2).replace('.', ','),
        row.commission.net.toFixed(2).replace('.', ','),
      ]),
    ])
  }

  return (
    <PageContainer>
      <PageHeader
        icon={ChartColumn}
        title="Relatório de vendas"
        description="O resultado de cada vendedor no mês: funil, propostas, clubes ganhos e comissão."
        actions={
          <>
            <RefreshButton loading={report.loading} onClick={() => report.reload({ silent: true })} />
            <Button variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={exportCsv} disabled={!data || rows.length === 0}>
              <Download aria-hidden="true" />
              Baixar planilha
            </Button>
          </>
        }
      />
      <ComercialNav />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Mês" value={mes} onChange={value => setMes(value === 'all' ? currentMonthSP() : value)} allLabel="Mês atual" options={recentMonths(12)} />
      </div>

      {report.error && !data ? (
        <ErrorState onRetry={() => report.reload()} />
      ) : !data ? (
        <KpiSkeleton />
      ) : (
        <section aria-label={`Totais de ${label}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={<KanbanSquare />} accent="navy" label="Prospects ativos" value={formatInt(data.totals.openProspects)} hint="Em todos os funis, hoje" />
          <KpiCard icon={<FileSignature />} accent="blue" label="Propostas em andamento" value={formatInt(data.totals.proposalsInProgress)} hint="Links e cadastros em análise" />
          <KpiCard
            icon={<Trophy />}
            accent="green"
            label={`Clubes ganhos em ${label.split(' ')[0]}`}
            value={formatInt(data.totals.wonInMonth)}
            tone={data.totals.wonInMonth > 0 ? 'success' : 'default'}
            hint="Clubes que entraram no ar no mês"
          />
          <KpiCard
            icon={<Wallet />}
            accent="coral"
            label="Comissão do mês"
            value={formatMoney(data.totals.commission.net)}
            hint={`${formatMoney(data.totals.commission.a_pagar)} a pagar · ${formatMoney(data.totals.commission.paga)} paga`}
          />
        </section>
      )}

      <SectionCard padded={false} title={`Por vendedor · ${label}`} icon={ChartColumn}>
        {report.error && !data ? null : !data ? (
          <TableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ChartColumn} title="Nenhum vendedor no relatório" description="Cadastre vendedores em Comercial › Vendedores." />
        ) : (
          <DataTable caption={`Relatório de vendas de ${label}`} minWidth="min-w-[960px]" framed={false}>
            <thead>
              <tr>
                <Th>Vendedor</Th>
                <Th align="right">Prospects</Th>
                <Th align="right">Em andamento</Th>
                <Th align="right">Ganhos / meta</Th>
                <Th align="right">Perdidos</Th>
                <Th align="right">A pagar</Th>
                <Th align="right">Paga</Th>
                <Th align="right">Comissão líquida</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const hit = row.monthlyGoal !== null && row.wonInMonth >= row.monthlyGoal
                return (
                  <Tr key={row.sellerUserId}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <EntityAvatar name={row.sellerName} size="sm" />
                        <div className="min-w-0">
                          <p className="m-0 flex items-center gap-2 truncate font-semibold text-foreground">
                            {row.sellerName}
                            {!row.active ? <StatusPill tone="neutral">Inativo</StatusPill> : null}
                          </p>
                          <p className="m-0 font-mono text-[11px] text-muted-foreground">{row.referralCode}</p>
                        </div>
                      </div>
                    </Td>
                    <Td align="right">{formatInt(row.openProspects)}</Td>
                    <Td align="right">{formatInt(row.proposalsInProgress)}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      <span className={hit ? 'font-semibold text-[#067647]' : undefined}>{formatInt(row.wonInMonth)}</span>
                      <span className="text-muted-foreground"> / {row.monthlyGoal !== null ? formatInt(row.monthlyGoal) : 'sem meta'}</span>
                    </Td>
                    <Td align="right">{formatInt(row.lostInMonth)}</Td>
                    <Td align="right">{formatMoney(row.commission.a_pagar)}</Td>
                    <Td align="right">{formatMoney(row.commission.paga)}</Td>
                    <Td align="right">
                      <span className="font-semibold text-foreground">{formatMoney(row.commission.net)}</span>
                      {row.commission.a_descontar > 0 ? (
                        <span className="block text-xs text-[#B42318]">−{formatMoney(row.commission.a_descontar)} a descontar</span>
                      ) : null}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F6F8FB] font-semibold">
                <Td>Total</Td>
                <Td align="right">{formatInt(data.totals.openProspects)}</Td>
                <Td align="right">{formatInt(data.totals.proposalsInProgress)}</Td>
                <Td align="right">{formatInt(data.totals.wonInMonth)}</Td>
                <Td align="right">{formatInt(rows.reduce((acc, row) => acc + row.lostInMonth, 0))}</Td>
                <Td align="right">{formatMoney(data.totals.commission.a_pagar)}</Td>
                <Td align="right">{formatMoney(data.totals.commission.paga)}</Td>
                <Td align="right">{formatMoney(data.totals.commission.net)}</Td>
              </tr>
            </tfoot>
          </DataTable>
        )}
      </SectionCard>
    </PageContainer>
  )
}
