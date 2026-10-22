'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import {
  HOLDING_ALERT_LABELS,
  PLATFORM_ACCESS_LEVEL_LABELS,
  TENANT_HEALTH_BAND_LABELS,
  holdingAlertKind,
  type HoldingTenantRow,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  ALERT_SHORT_LABELS,
  DEFAULT_TENANT_FILTERS,
  HOLDING_SORT_LABELS,
  filterAndSortTenants,
  formatBRL,
  formatInt,
  formatPct,
  formatPp,
  rowAlerts,
  type HoldingTenantFilters,
  type HoldingTenantSort,
} from '@/lib/adapters/holding'
import { HealthBreakdown, HEALTH_FORMULA } from './health'
import {
  AccessBadge,
  EmptyNote,
  FormulaHint,
  HealthScore,
  SectionError,
  SEVERITY_META,
  SoftBadge,
  TrendDelta,
  UsageMeter,
} from './holding-ui'

const COLUMNS = 10

/**
 * Ranking de inquilinos: nota de saúde (com o motivo de cada componente ao
 * expandir), uso de vidas, receita para a ANNETEC, vendas do clube,
 * inadimplência dos associados, acesso e alertas. Filtra e ordena no cliente
 * — a lista inteira já veio da API.
 */
export function TenantsTable({
  rows,
  loading,
  error,
  onRetry,
  filters,
  onFiltersChange,
}: {
  rows: HoldingTenantRow[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  filters: HoldingTenantFilters
  onFiltersChange: (filters: HoldingTenantFilters) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const visible = useMemo(() => filterAndSortTenants(rows ?? [], filters), [rows, filters])
  const hasFilters =
    filters.q !== '' ||
    filters.band !== 'all' ||
    filters.access !== 'all' ||
    filters.alert !== 'all' ||
    filters.managed !== 'all'

  const set = <K extends keyof HoldingTenantFilters>(key: K, value: HoldingTenantFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value })

  const toggle = (id: string) =>
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Card id="ranking" className="scroll-mt-24 gap-4 border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Ranking de inquilinos</CardTitle>
          <FormulaHint>{HEALTH_FORMULA}</FormulaHint>
        </div>
        <CardDescription className="text-xs">
          Pior saúde primeiro. Expanda a linha para ver o motivo de cada componente da nota.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.q}
              onChange={event => set('q', event.target.value)}
              placeholder="Buscar inquilino"
              className="h-8 pl-8"
              aria-label="Buscar inquilino por nome ou slug"
            />
          </div>
          <Select value={filters.band} onValueChange={value => set('band', value as HoldingTenantFilters['band'])}>
            <SelectTrigger size="sm" aria-label="Faixa de saúde">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as faixas</SelectItem>
              {(['healthy', 'attention', 'risk'] as const).map(band => (
                <SelectItem key={band} value={band}>
                  {TENANT_HEALTH_BAND_LABELS[band]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.access} onValueChange={value => set('access', value as HoldingTenantFilters['access'])}>
            <SelectTrigger size="sm" aria-label="Acesso ao painel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer acesso</SelectItem>
              {(['full', 'read_only', 'blocked'] as const).map(level => (
                <SelectItem key={level} value={level}>
                  {PLATFORM_ACCESS_LEVEL_LABELS[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.alert} onValueChange={value => set('alert', value as HoldingTenantFilters['alert'])}>
            <SelectTrigger size="sm" aria-label="Alerta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer alerta</SelectItem>
              {holdingAlertKind.options
                .filter(kind => !kind.startsWith('onboarding_') && kind !== 'provisioning_failed')
                .map(kind => (
                  <SelectItem key={kind} value={kind}>
                    {HOLDING_ALERT_LABELS[kind]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={filters.managed} onValueChange={value => set('managed', value as HoldingTenantFilters['managed'])}>
            <SelectTrigger size="sm" aria-label="Cobrança automática">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os contratos</SelectItem>
              <SelectItem value="1">Na cobrança automática</SelectItem>
              <SelectItem value="0">Fora da cobrança automática</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.sort} onValueChange={value => set('sort', value as HoldingTenantSort)}>
            <SelectTrigger size="sm" aria-label="Ordenar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(HOLDING_SORT_LABELS) as HoldingTenantSort[]).map(sort => (
                <SelectItem key={sort} value={sort}>
                  {HOLDING_SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange({ ...DEFAULT_TENANT_FILTERS, sort: filters.sort })}
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          )}
          {rows && (
            <span className="ml-auto text-xs text-muted-foreground">
              {formatInt(visible.length)} de {formatInt(rows.length)} inquilinos
            </span>
          )}
        </div>

        {error && !rows ? (
          <SectionError message={error} onRetry={onRetry} />
        ) : loading && !rows ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows || rows.length === 0 ? (
          <EmptyNote>Nenhum inquilino operador cadastrado ainda.</EmptyNote>
        ) : visible.length === 0 ? (
          <EmptyNote icon={Search}>Nenhum inquilino com esses filtros.</EmptyNote>
        ) : (
          <div className={cn('overflow-x-auto rounded-lg border', loading && 'opacity-60 transition-opacity')}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Inquilino</TableHead>
                  <TableHead>Saúde</TableHead>
                  <TableHead className="min-w-37.5">Vidas / limite</TableHead>
                  <TableHead className="text-right">Receita ANNETEC/mês</TableHead>
                  <TableHead className="text-right">GMV 30 dias</TableHead>
                  <TableHead className="text-right">Inadimpl. associados</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row, index) => {
                  const isOpen = expanded.has(row.organizationId)
                  const alerts = rowAlerts(row)
                  return (
                    <Fragment key={row.organizationId}>
                      <TableRow className={cn(isOpen && 'border-b-0 bg-muted/30')}>
                        <TableCell className="text-center text-xs tabular-nums text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="max-w-55">
                          <Link
                            href={`/admin/holding/${row.organizationId}`}
                            className="block truncate font-medium text-foreground hover:underline"
                          >
                            {row.name}
                          </Link>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="truncate font-mono">/{row.slug}</span>
                            {!row.managed && <span title="Sem assinatura de plataforma">· fora da cobrança</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggle(row.organizationId)}
                            className="inline-flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Ocultar' : 'Ver'} o motivo da nota de ${row.name}`}
                          >
                            <HealthScore score={row.healthScore} band={row.healthBand} />
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="tabular-nums">
                                {formatInt(row.lives)}
                                <span className="text-muted-foreground"> / {row.memberLimit === null ? '—' : formatInt(row.memberLimit)}</span>
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">{formatPct(row.usagePct)}</span>
                            </div>
                            <UsageMeter usagePct={row.usagePct} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="text-sm tabular-nums">{row.managed ? formatBRL(row.platformMrr) : '—'}</p>
                          {row.platformOpenAmount > 0 && (
                            <p className={cn('text-xs tabular-nums', row.platformDaysLate > 0 ? 'text-red-700' : 'text-muted-foreground')}>
                              {formatBRL(row.platformOpenAmount)} em aberto
                              {row.platformDaysLate > 0 ? ` · ${row.platformDaysLate} d` : ''}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="text-sm tabular-nums">{formatBRL(row.gmvLast30)}</p>
                          <TrendDelta value={row.salesTrendPct} className="justify-end" />
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="text-sm tabular-nums">{formatPct(row.memberDelinquencyRate)}</p>
                          <TrendDelta
                            value={Number((row.memberDelinquencyRate - row.memberDelinquencyRatePrev).toFixed(1))}
                            goodWhen="down"
                            format={formatPp}
                            className="justify-end"
                          />
                        </TableCell>
                        <TableCell>
                          <AccessBadge level={row.access} />
                        </TableCell>
                        <TableCell>
                          {alerts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex max-w-55 flex-wrap gap-1">
                              {alerts.slice(0, 2).map(alert => (
                                <SoftBadge
                                  key={alert.kind}
                                  tone={SEVERITY_META[alert.severity].tone}
                                  icon={SEVERITY_META[alert.severity].icon}
                                  title={HOLDING_ALERT_LABELS[alert.kind]}
                                >
                                  {ALERT_SHORT_LABELS[alert.kind]}
                                </SoftBadge>
                              ))}
                              {alerts.length > 2 && (
                                <SoftBadge
                                  tone="neutral"
                                  title={alerts.slice(2).map(a => HOLDING_ALERT_LABELS[a.kind]).join(' · ')}
                                >
                                  +{alerts.length - 2}
                                </SoftBadge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="icon-sm" aria-label={`Detalhar ${row.name}`}>
                            <Link href={`/admin/holding/${row.organizationId}`}>
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={COLUMNS} className="whitespace-normal px-4 pb-4 pt-1">
                            <HealthBreakdown row={row} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
