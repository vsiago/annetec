'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, HandCoins, LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  CARD_BRAND_LABELS,
  CLUB_RECEIPT_KIND_LABELS,
  type ClubPaymentMethod,
  type ClubReceiptItem,
  type ClubReceiptsPage,
  type ClubReceiptsTotals,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/dashboard/page-header'
import { EmptyState } from '@/components/dashboard/empty-state'
import { DataTable, FilterSelect, StatusPill, type Column } from '@/components/dashboard/table-controls'
import { listClubReceiptsAction } from '@/lib/actions/faturamento-api'
import {
  addDays,
  formatBRL,
  formatCount,
  formatDateBR,
  formatDateTimeBR,
  paymentMethodLabel,
  toneClass,
  todaySP,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError, MethodLabel, MetricTile, TableSkeleton } from './billing-ui'
import { ChargeDetailSheet } from './charge-detail-sheet'

/**
 * Financeiro → Recebimento: o dinheiro que entrou no clube, pela data do
 * pagamento. Três números, uma faixa por dia e a lista de movimentações
 * (pagamentos e estornos), com exportação em CSV.
 */

type PeriodKey = 'this_month' | 'last_month' | 'last_30' | 'custom'

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Personalizado' },
]

const METHOD_OPTIONS: { value: ClubPaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'credit_card', label: 'Cartão' },
]

const PAGE_SIZE = 50
/** Teto do CSV (linhas) — evita travar o navegador num período enorme. */
const CSV_MAX_ROWS = 5000

function lastDayOfMonth(firstDay: string): string {
  return addDays(`${addDays(firstDay, 32).slice(0, 8)}01`, -1)
}

function periodRange(key: PeriodKey, custom: { from: string; to: string }): { from?: string; to?: string } {
  const today = todaySP()
  const monthStart = `${today.slice(0, 8)}01`
  switch (key) {
    case 'this_month':
      return { from: monthStart, to: lastDayOfMonth(monthStart) }
    case 'last_month': {
      const start = `${addDays(monthStart, -1).slice(0, 8)}01`
      return { from: start, to: lastDayOfMonth(start) }
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today }
    case 'custom':
      return { from: custom.from || undefined, to: custom.to || undefined }
  }
}

/** Dias do período (para a faixa diária); vazio se longo demais para caber bem. */
function daysOf(from: string, to: string, max = 62): string[] {
  const days: string[] = []
  for (let day = from; day <= to && days.length <= max; day = addDays(day, 1)) days.push(day)
  return days.length > max ? [] : days
}

function cardText(item: Pick<ClubReceiptItem, 'method' | 'card'>): string {
  if (item.method === 'credit_card' && item.card) {
    return `${CARD_BRAND_LABELS[item.card.brand] ?? 'Cartão'} •••• ${item.card.last4}`
  }
  return ''
}

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** CSV no padrão do Excel em português: `;` como separador, vírgula decimal e BOM. */
function buildCsv(items: ClubReceiptItem[]): string {
  const header = ['Data do pagamento', 'Associado', 'Plano', 'Forma', 'Cartão', 'Valor', 'Situação', 'Vencimento', 'Cobrança']
  const lines = items.map(item =>
    [
      formatDateTimeBR(item.occurredAt),
      item.holderName,
      item.chargeKind === 'one_off' ? `Avulsa: ${item.description}` : item.planName,
      paymentMethodLabel(item.method),
      cardText(item),
      (item.kind === 'refunded' ? -item.amount : item.amount).toFixed(2).replace('.', ','),
      CLUB_RECEIPT_KIND_LABELS[item.kind],
      formatDateBR(item.dueDate),
      item.chargeId,
    ]
      .map(csvCell)
      .join(';'),
  )
  return `﻿${[header.join(';'), ...lines].join('\r\n')}`
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReceiptsView({ tenantSlug }: { tenantSlug: string }) {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [method, setMethod] = useState<'all' | ClubPaymentMethod>('all')

  const [page, setPage] = useState<ClubReceiptsPage | null>(null)
  const [items, setItems] = useState<ClubReceiptItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // `?cobranca=<id>` abre o detalhe direto (atalho "Ver detalhes" do sino).
  // Efeito, não só estado inicial: clicar em outra notificação com a tela já
  // aberta muda só a query.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const linkedChargeId = searchParams.get('cobranca')
  useEffect(() => {
    if (linkedChargeId) setDetailId(linkedChargeId)
  }, [linkedChargeId])
  const closeDetail = useCallback(() => {
    setDetailId(null)
    // Tira o `?cobranca=` da URL para o mesmo atalho poder abrir de novo.
    if (linkedChargeId) router.replace(pathname, { scroll: false })
  }, [linkedChargeId, pathname, router])
  const sequence = useRef(0)

  const range = periodRange(period, { from: customFrom, to: customTo })
  // Personalizado só consulta com as duas datas válidas.
  const customInvalid = period === 'custom' && (!customFrom || !customTo || customFrom > customTo)
  const filters = useMemo(
    () => ({ from: range.from, to: range.to, method: method === 'all' ? undefined : method }),
    [range.from, range.to, method],
  )

  const load = useCallback(async () => {
    const id = ++sequence.current
    if (!tenantSlug || customInvalid) {
      setPage(null)
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listClubReceiptsAction(tenantSlug, { ...filters, limit: PAGE_SIZE })
      if (id !== sequence.current) return
      if (result.success) {
        setPage(result.data)
        setItems(result.data.items)
      } else {
        setError(result.error)
      }
    } catch {
      if (id === sequence.current) setError('Não foi possível carregar os recebimentos. Verifique a conexão e tente novamente.')
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [tenantSlug, filters, customInvalid])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    if (!page?.nextCursor) return
    const id = sequence.current
    setLoadingMore(true)
    try {
      const result = await listClubReceiptsAction(tenantSlug, { ...filters, cursor: page.nextCursor, limit: PAGE_SIZE })
      if (id !== sequence.current) return
      if (result.success) {
        setPage(current => (current ? { ...current, nextCursor: result.data.nextCursor } : current))
        setItems(current => [...current, ...result.data.items])
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  async function exportCsv() {
    if (!page) return
    setExporting(true)
    try {
      // Reaproveita o que já está na tela e busca só o que falta.
      const all = [...items]
      let cursor = page.nextCursor
      while (cursor && all.length < CSV_MAX_ROWS) {
        const result = await listClubReceiptsAction(tenantSlug, { ...filters, cursor, limit: 200 })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        all.push(...result.data.items)
        cursor = result.data.nextCursor
      }
      const rows = all.slice(0, CSV_MAX_ROWS)
      downloadText(`recebimentos_${page.from}_a_${page.to}.csv`, buildCsv(rows), 'text/csv;charset=utf-8')
      toast.success(
        cursor
          ? `CSV com as ${formatCount(rows.length)} movimentações mais recentes (limite do arquivo).`
          : `CSV com ${formatCount(rows.length)} ${rows.length === 1 ? 'movimentação' : 'movimentações'} baixado.`,
      )
    } catch {
      toast.error('Não foi possível gerar o CSV. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const totals = page?.totals
  const totalRows = totals ? totals.count + totals.refundedCount : 0

  const columns: Column<ClubReceiptItem>[] = [
    {
      key: 'data',
      header: 'Data',
      render: item => <span className="whitespace-nowrap text-foreground">{formatDateTimeBR(item.occurredAt)}</span>,
    },
    {
      key: 'associado',
      header: 'Associado',
      render: item => (
        <div className="min-w-0">
          <p className="max-w-56 truncate font-medium text-foreground">{item.holderName}</p>
          <p className="max-w-56 truncate text-xs text-muted-foreground" title={item.chargeKind === 'one_off' ? item.description : undefined}>
            {item.chargeKind === 'one_off' ? `Avulsa · ${item.description}` : item.planName}
          </p>
        </div>
      ),
    },
    {
      key: 'forma',
      header: 'Forma',
      hideOnMobile: true,
      render: item => <MethodLabel method={item.method} card={item.card} />,
    },
    {
      key: 'valor',
      header: 'Valor',
      align: 'right',
      render: item => (
        <span
          className={cn(
            'whitespace-nowrap font-semibold',
            item.kind === 'refunded' ? 'text-red-600 dark:text-red-400' : 'text-foreground',
          )}
        >
          {item.kind === 'refunded' ? `− ${formatBRL(item.amount)}` : formatBRL(item.amount)}
        </span>
      ),
    },
    {
      key: 'situacao',
      header: 'Situação',
      align: 'right',
      render: item => (
        <StatusPill
          label={CLUB_RECEIPT_KIND_LABELS[item.kind]}
          className={toneClass(item.kind === 'refunded' ? 'danger' : 'success')}
        />
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Recebimento" description="Todo o dinheiro que entrou, pela data do pagamento.">
        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => void load()} aria-label="Atualizar">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
        <Button
          variant="outline"
          className="h-10 gap-2"
          onClick={() => void exportCsv()}
          disabled={!page || totalRows === 0 || exporting || loading}
        >
          {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar CSV
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {PERIODS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
              className={cn(
                'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
                period === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="lg:ml-auto">
          <FilterSelect
            label="Forma"
            value={method}
            onChange={value => setMethod(value as 'all' | ClubPaymentMethod)}
            allLabel="Todas"
            options={METHOD_OPTIONS}
          />
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>De</span>
          <Input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={event => setCustomFrom(event.target.value)}
            className="h-9 w-40"
            aria-label="Data inicial"
          />
          <span>até</span>
          <Input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={event => setCustomTo(event.target.value)}
            className="h-9 w-40"
            aria-label="Data final"
          />
          {customInvalid && <span className="text-xs">Escolha as duas datas para ver o período.</span>}
        </div>
      )}

      {error && <LoadError message={error} onRetry={() => void load()} />}

      {!customInvalid && <ReceiptTotals totals={totals} loading={loading && !page} />}

      {page && <DailyStrip page={page} />}

      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className={cn('p-0 transition-opacity', loading && page && 'opacity-60')}>
          {loading && !page ? (
            <TableSkeleton />
          ) : customInvalid ? (
            <EmptyState icon={HandCoins} title="Escolha o período" description="Informe a data inicial e a final." />
          ) : items.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="Nenhum recebimento neste período"
              description={
                method === 'all'
                  ? 'Os pagamentos aparecem aqui assim que são confirmados — Pix, boleto ou cartão.'
                  : `Nenhum pagamento por ${METHOD_OPTIONS.find(option => option.value === method)?.label ?? 'esta forma'} no período. Experimente "Todas".`
              }
            />
          ) : (
            <DataTable
              columns={columns}
              rows={items}
              rowKey={item => item.id}
              onRowClick={item => setDetailId(item.chargeId)}
              isRowActive={item => item.chargeId === detailId}
            />
          )}
        </CardContent>
        {items.length > 0 && (
          <div className="flex flex-col items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:justify-between">
            <span>
              Mostrando {formatCount(items.length)} de {formatCount(totalRows)}
            </span>
            {page?.nextCursor && (
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore} className="gap-2">
                {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Carregar mais
              </Button>
            )}
          </div>
        )}
      </Card>

      <ChargeDetailSheet
        tenantSlug={tenantSlug}
        chargeId={detailId}
        open={detailId !== null}
        onOpenChange={open => !open && closeDetail()}
        canSimulate={false}
        onChanged={() => void load()}
      />
    </div>
  )
}

function ReceiptTotals({ totals, loading }: { totals: ClubReceiptsTotals | undefined; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile
        label="Recebido no período"
        value={formatBRL(totals?.received ?? 0)}
        hint={
          totals && totals.refunded > 0
            ? `${formatBRL(totals.refunded)} estornados · líquido ${formatBRL(totals.net)}`
            : 'Pagamentos confirmados'
        }
        tone="primary"
        loading={loading}
      />
      <MetricTile
        label="Pagamentos"
        value={formatCount(totals?.count ?? 0)}
        hint={totals && totals.refundedCount > 0 ? `${formatCount(totals.refundedCount)} estornados` : undefined}
        loading={loading}
      />
      <MetricTile label="Ticket médio" value={formatBRL(totals?.average ?? 0)} loading={loading} />
      <MetricTile
        label="A receber"
        value={formatBRL(totals?.receivable ?? 0)}
        hint={
          totals
            ? totals.receivableCount === 0
              ? 'Nada em aberto no período'
              : `${formatCount(totals.receivableCount)} ${totals.receivableCount === 1 ? 'cobrança' : 'cobranças'} com vencimento no período`
            : undefined
        }
        tone={totals && totals.receivable > 0 ? 'warning' : 'default'}
        loading={loading}
      />
    </div>
  )
}

/** Uma barra por dia do período (até ~2 meses), na cor do clube. */
function DailyStrip({ page }: { page: ClubReceiptsPage }) {
  const today = todaySP()
  const days = daysOf(page.from, page.to < today ? page.to : today)
  const byDay = new Map(page.daily.map(point => [point.date, point.amount]))
  const max = Math.max(0, ...page.daily.map(point => point.amount))
  if (days.length < 2 || max === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card px-4 pb-2 pt-3 shadow-sm">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Recebido por dia</p>
      <div className="flex h-16 items-end gap-0.5" aria-hidden>
        {days.map(day => {
          const amount = byDay.get(day) ?? 0
          return (
            <div
              key={day}
              title={`${formatDateBR(day)}: ${formatBRL(amount)}`}
              className={cn('min-w-0 flex-1 rounded-t-sm', amount > 0 ? 'bg-primary/80 hover:bg-primary' : 'bg-muted')}
              style={{ height: amount > 0 ? `${Math.max(8, (amount / max) * 100)}%` : '3px' }}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatDateBR(days[0]!)}</span>
        <span>{formatDateBR(days[days.length - 1]!)}</span>
      </div>
    </div>
  )
}
