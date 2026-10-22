'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, ScrollText, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AuditTable } from '@/components/holding/audit-table'
import { EmptyNote, SectionError } from '@/components/holding/holding-ui'
import { useResource } from '@/components/holding/use-resource'
import { useTenants } from '@/contexts/tenants-context'
import { listHoldingAuditAction } from '@/lib/actions/holding-api'
import { AUDIT_ACTION_FILTERS, formatInt, type HoldingAuditPage } from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'

const PER_PAGE = 25

interface AuditFilters {
  organizationId: string
  action: string
  q: string
  from: string
  to: string
  page: number
}

const EMPTY: AuditFilters = { organizationId: '', action: '', q: '', from: '', to: '', page: 1 }

function filtersFromParams(params: URLSearchParams): AuditFilters {
  const page = Number(params.get('page'))
  return {
    organizationId: params.get('organizationId') ?? '',
    action: params.get('action') ?? '',
    q: params.get('q') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

function filtersToQuery(filters: AuditFilters): string {
  const params = new URLSearchParams()
  if (filters.organizationId) params.set('organizationId', filters.organizationId)
  if (filters.action) params.set('action', filters.action)
  if (filters.q) params.set('q', filters.q)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params.toString()
}

export default function HoldingAuditPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <AuditContent />
    </Suspense>
  )
}

/**
 * Trilha de auditoria da holding: `audit_logs` de toda a plataforma com nome
 * do inquilino e do ator. Filtros ficam na URL (o detalhe do inquilino abre
 * esta tela já filtrada por `organizationId`).
 */
function AuditContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { tenants } = useTenants()

  const [filters, setFilters] = useState<AuditFilters>(() => filtersFromParams(new URLSearchParams(searchParams.toString())))
  const [search, setSearch] = useState(filters.q)
  const [page, loadPage] = useResource<HoldingAuditPage>()

  const fetchPage = useCallback(
    () =>
      loadPage(() =>
        listHoldingAuditAction({
          page: filters.page,
          perPage: PER_PAGE,
          organizationId: filters.organizationId || undefined,
          action: filters.action || undefined,
          q: filters.q || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        }),
      ),
    [loadPage, filters],
  )

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  // Filtros na URL — link compartilhável e "voltar" do navegador preservam a busca.
  useEffect(() => {
    const query = filtersToQuery(filters)
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [filters, pathname, router])

  // Busca por texto com pequena espera, para não bater na API a cada tecla.
  useEffect(() => {
    if (search === filters.q) return
    const timer = setTimeout(() => setFilters(current => ({ ...current, q: search.trim(), page: 1 })), 400)
    return () => clearTimeout(timer)
  }, [search, filters.q])

  const update = (patch: Partial<AuditFilters>) => setFilters(current => ({ ...current, ...patch, page: patch.page ?? 1 }))

  const tenantOptions = useMemo(
    () => [...tenants].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [tenants],
  )
  const selectedTenant = tenantOptions.find(t => t.id === filters.organizationId)
  const hasFilters = filters.organizationId || filters.action || filters.q || filters.from || filters.to
  const meta = page.data?.meta
  const totalPages = meta?.totalPages ?? 1

  return (
    <div className="space-y-6">
      <Link
        href="/admin/holding"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Holding
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ScrollText className="h-6 w-6 text-primary" />
            Trilha de auditoria
          </h1>
          <p className="text-sm text-muted-foreground">
            Quem fez o quê, em qual inquilino e por quê — inclusive restrições, suspensões e reativações da holding
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => fetchPage()} disabled={page.loading}>
          <RefreshCw className={cn('h-4 w-4', page.loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <Card className="gap-4 border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Registros</CardTitle>
          <CardDescription className="text-xs">
            {meta ? `${formatInt(meta.total)} registro(s)` : 'Carregando…'}
            {selectedTenant ? ` · ${selectedTenant.name}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Inquilino</Label>
              <Select
                value={filters.organizationId || 'all'}
                onValueChange={value => update({ organizationId: value === 'all' ? '' : value })}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os inquilinos</SelectItem>
                  {filters.organizationId && !selectedTenant && (
                    <SelectItem value={filters.organizationId}>Inquilino selecionado</SelectItem>
                  )}
                  {tenantOptions.map(tenant => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ação</Label>
              <Select value={filters.action || 'all'} onValueChange={value => update({ action: value === 'all' ? '' : value })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {filters.action && !AUDIT_ACTION_FILTERS.some(option => option.value === filters.action) && (
                    <SelectItem value={filters.action}>{filters.action}</SelectItem>
                  )}
                  {AUDIT_ACTION_FILTERS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-search" className="text-xs text-muted-foreground">
                Busca
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="audit-search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Ação, recurso, pessoa…"
                  className="h-8 pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
                De
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={event => update({ from: event.target.value })}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
                Até
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={event => update({ to: event.target.value })}
                className="h-8"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!hasFilters}
              onClick={() => {
                setSearch('')
                setFilters(EMPTY)
              }}
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>

          {page.error && !page.data ? (
            <SectionError message={page.error} onRetry={() => fetchPage()} />
          ) : !page.data ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : page.data.rows.length === 0 ? (
            <EmptyNote icon={ScrollText}>
              {hasFilters ? 'Nenhum registro com esses filtros.' : 'Nenhum registro de auditoria ainda.'}
            </EmptyNote>
          ) : (
            <div className={cn('space-y-3', page.loading && 'opacity-60 transition-opacity')}>
              {page.error && <SectionError title="Não foi possível atualizar" message={page.error} onRetry={() => fetchPage()} />}
              <AuditTable entries={page.data.rows} />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Página {formatInt(filters.page)} de {formatInt(Math.max(1, totalPages))}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page <= 1 || page.loading}
                    onClick={() => update({ page: filters.page - 1 })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={filters.page >= totalPages || page.loading}
                    onClick={() => update({ page: filters.page + 1 })}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
