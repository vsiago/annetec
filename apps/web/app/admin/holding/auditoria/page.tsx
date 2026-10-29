'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText, Search, X } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { TableLoading } from '@/components/admin-platform/ui/data-table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuditTable } from '@/components/holding/audit-table'
import { useResource } from '@/components/holding/use-resource'
import { useTenants } from '@/contexts/tenants-context'
import { listHoldingAuditAction } from '@/lib/actions/holding-api'
import { AUDIT_ACTION_FILTERS, describeError, formatInt, type HoldingAuditPage } from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'

const PER_PAGE = 25

/** Botões e campos do console: alvo de toque de pelo menos 44px, cantos suaves. */
const BOTAO = 'h-11 rounded-[10px] px-4 font-semibold'
const CAMPO = 'h-11 rounded-[10px]'

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

/**
 * Frase curta para a pessoa; o texto técnico da API (SQL etc.) vai numa linha
 * pequena abaixo, cortada. Só `span`: o ErrorState põe a descrição num `<p>`.
 */
function errorDescription(raw: string): ReactNode {
  const { message, technical } = describeError(raw)
  if (!technical) return message
  return (
    <>
      {message}
      <span className="mt-2 block break-all font-mono text-[11px] text-muted-foreground">
        Detalhes técnicos: {technical.slice(0, 300)}
        {technical.length > 300 ? '…' : ''}
      </span>
    </>
  )
}

export default function HoldingAuditPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <SectionCard>
            <SectionSkeleton rows={6} label="Carregando o histórico…" />
          </SectionCard>
        </PageContainer>
      }
    >
      <AuditContent />
    </Suspense>
  )
}

/**
 * Histórico de alterações: `audit_logs` de toda a plataforma com nome do clube
 * e de quem fez. Filtros ficam na URL (o detalhe do clube abre esta tela já
 * filtrada por `organizationId`). Fica em Avançado: serve ao suporte.
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

  const clearFilters = () => {
    setSearch('')
    setFilters(EMPTY)
  }

  const tenantOptions = useMemo(
    () => [...tenants].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [tenants],
  )
  const selectedTenant = tenantOptions.find(t => t.id === filters.organizationId)
  const hasFilters = filters.organizationId || filters.action || filters.q || filters.from || filters.to
  const meta = page.data?.meta
  const totalPages = meta?.totalPages ?? 1

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={
          <BackLink href={filters.organizationId ? `/admin/inquilinos/${encodeURIComponent(filters.organizationId)}` : '/admin'}>
            {filters.organizationId ? `Voltar para ${selectedTenant?.name ?? 'o clube'}` : 'Voltar para o Início'}
          </BackLink>
        }
        icon={ScrollText}
        title="Histórico de alterações"
        description="Quem mudou o quê, em qual clube e quando, com o motivo. Inclui restrições, suspensões e reativações de clubes."
        actions={
          <Button type="button" variant="outline" className={BOTAO} onClick={() => fetchPage()} disabled={page.loading}>
            <RefreshCw className={cn(page.loading && 'animate-spin')} aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      <SectionCard
        icon={ScrollText}
        title="Alterações"
        description={
          <>
            {meta ? `${formatInt(meta.total)} ${meta.total === 1 ? 'alteração' : 'alterações'}` : 'Carregando…'}
            {selectedTenant ? ` · ${selectedTenant.name}` : ''}
          </>
        }
        bodyClassName="flex flex-col gap-4"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto_auto] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-clube" className="text-sm text-muted-foreground">
              Clube
            </Label>
            <Select
              value={filters.organizationId || 'all'}
              onValueChange={value => update({ organizationId: value === 'all' ? '' : value })}
            >
              <SelectTrigger id="audit-clube" className={cn(CAMPO, 'w-full data-[size=default]:h-11')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clubes</SelectItem>
                {filters.organizationId && !selectedTenant && (
                  <SelectItem value={filters.organizationId}>Clube selecionado</SelectItem>
                )}
                {tenantOptions.map(tenant => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-tipo" className="text-sm text-muted-foreground">
              Tipo de alteração
            </Label>
            <Select value={filters.action || 'all'} onValueChange={value => update({ action: value === 'all' ? '' : value })}>
              <SelectTrigger id="audit-tipo" className={cn(CAMPO, 'w-full data-[size=default]:h-11')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-search" className="text-sm text-muted-foreground">
              Busca
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="audit-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Alteração, pessoa ou clube"
                className={cn(CAMPO, 'pl-10')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-from" className="text-sm text-muted-foreground">
              De
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={event => update({ from: event.target.value })}
              className={CAMPO}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-to" className="text-sm text-muted-foreground">
              Até
            </Label>
            <Input
              id="audit-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={event => update({ to: event.target.value })}
              className={CAMPO}
            />
          </div>
          <Button type="button" variant="ghost" className={BOTAO} disabled={!hasFilters} onClick={clearFilters}>
            <X aria-hidden="true" />
            Limpar
          </Button>
        </div>

        {page.error && !page.data ? (
          <ErrorState
            size="sm"
            title="Não foi possível carregar o histórico"
            description={errorDescription(page.error)}
            onRetry={() => fetchPage()}
          />
        ) : !page.data ? (
          <TableLoading rows={6} label="Carregando o histórico…" />
        ) : page.data.rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={hasFilters ? Search : ScrollText}
            title={hasFilters ? 'Nenhuma alteração com esses filtros' : 'Nenhuma alteração registrada ainda'}
            description={hasFilters ? 'Ajuste a busca ou limpe os filtros.' : undefined}
            action={
              hasFilters ? (
                <Button type="button" variant="outline" className={BOTAO} onClick={clearFilters}>
                  <X aria-hidden="true" />
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn('flex flex-col gap-4', page.loading && 'opacity-60 transition-opacity')}>
            {page.error && (
              <ErrorState
                size="sm"
                title="Não foi possível atualizar"
                description={errorDescription(page.error)}
                onRetry={() => fetchPage()}
              />
            )}
            <AuditTable entries={page.data.rows} className="rounded-xl border-border" />
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Página {formatInt(filters.page)} de {formatInt(Math.max(1, totalPages))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[10px] px-4 font-semibold"
                  disabled={filters.page <= 1 || page.loading}
                  onClick={() => update({ page: filters.page - 1 })}
                >
                  <ChevronLeft aria-hidden="true" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-[10px] px-4 font-semibold"
                  disabled={filters.page >= totalPages || page.loading}
                  onClick={() => update({ page: filters.page + 1 })}
                >
                  Próxima
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </PageContainer>
  )
}
