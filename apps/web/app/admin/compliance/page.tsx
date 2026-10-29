'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlarmClock,
  CircleCheckBig,
  ClipboardCheck,
  Hourglass,
  Inbox,
  RefreshCw,
  Search,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  contractorType,
  type ContractorType,
  type OnboardingProposalListItem,
  type OnboardingStatus,
  type OnboardingStatusGroup,
  type PrecheckSummary,
} from '@annetec/contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { SectionTab, SectionTabsList } from '@/components/admin-platform/ui/section-tabs'
import { FilterSelect, SearchInput, TableFooter, type Column } from '@/components/admin-platform/ui/table-controls'
import { Pill, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import {
  PROPOSAL_STATUS_OPTIONS,
  ProposalStatusPill,
  REVIEW_DEADLINE_DAYS,
  SlaBadge,
  VERIFICATION_OPTIONS,
  verificationMeta,
  waitingTime,
} from '@/components/admin-platform/compliance/compliance-ui'
import {
  getOnboardingQueueSummaryAction,
  listOnboardingProposalsAction,
} from '@/lib/actions/platform-onboarding-api'
import { formatCnpj, formatCount, formatDateTimeBR, formatRelative, slaInfo } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Aprovações (blueprint §Q4, roteiro §F passo 3): os clubes que se cadastraram
 * pelo site e esperam liberação, por grupo, com a verificação automática, os
 * documentos a revisar, quem assumiu a análise e há quanto tempo esperam
 * (o prazo de análise é de 2 dias a partir do envio).
 */

const GROUPS: { value: OnboardingStatusGroup; label: string }[] = [
  { value: 'queue', label: 'Para analisar' },
  { value: 'awaiting_applicant', label: 'Esperando o clube' },
  { value: 'awaiting_payment', label: 'Aguardando pagamento' },
  { value: 'done', label: 'Concluídas' },
  { value: 'all', label: 'Todas' },
]

const GROUP_STATUSES: Record<OnboardingStatusGroup, OnboardingStatus[] | null> = {
  queue: ['submitted', 'in_review'],
  awaiting_applicant: ['draft', 'pending_info'],
  awaiting_payment: ['approved', 'awaiting_payment', 'provisioning'],
  done: ['active', 'rejected', 'canceled'],
  all: null,
}

const NONE_WAITING = {
  title: 'Nenhum clube esperando aprovação',
  description: 'Quando um clube se cadastrar pelo site, ele aparece aqui.',
}

const EMPTY_TEXT: Record<OnboardingStatusGroup, { title: string; description: string }> = {
  queue: NONE_WAITING,
  awaiting_applicant: {
    title: 'Nenhum clube esperando correção',
    description: 'Cadastros em preenchimento e correções pedidas por você aparecem aqui.',
  },
  awaiting_payment: {
    title: 'Nenhuma cobrança de ativação em aberto',
    description: 'Clubes aprovados que ainda não pagaram aparecem aqui.',
  },
  done: {
    title: 'Nenhum cadastro concluído',
    description: 'Clubes liberados, recusados e cancelados aparecem aqui.',
  },
  all: NONE_WAITING,
}

/** Ícone do estado vazio de cada aba (decorativo; o texto é o que informa). */
const EMPTY_ICON: Record<OnboardingStatusGroup, LucideIcon> = {
  queue: ClipboardCheck,
  awaiting_applicant: Hourglass,
  awaiting_payment: Wallet,
  done: CircleCheckBig,
  all: ClipboardCheck,
}

type SlaFilter = 'all' | 'breached' | 'due_soon' | 'on_time'

const SLA_OPTIONS: { value: SlaFilter; label: string }[] = [
  { value: 'breached', label: `Mais de ${REVIEW_DEADLINE_DAYS} dias` },
  { value: 'due_soon', label: `Quase ${REVIEW_DEADLINE_DAYS} dias` },
  { value: 'on_time', label: 'Dentro do prazo' },
]

function matchesSla(item: OnboardingProposalListItem, filter: SlaFilter): boolean {
  if (filter === 'all') return true
  const info = slaInfo(item)
  if (!info) return false
  if (filter === 'breached') return info.tone === 'danger'
  if (filter === 'due_soon') return info.tone === 'warning'
  return info.tone === 'info'
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function CompliancePage() {
  const router = useRouter()
  const [group, setGroup] = useState<OnboardingStatusGroup>('queue')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | OnboardingStatus>('all')
  const [precheck, setPrecheck] = useState<'all' | PrecheckSummary>('all')
  const [assigned, setAssigned] = useState<'all' | 'me' | 'unassigned'>('all')
  const [type, setType] = useState<'all' | ContractorType>('all')
  const [sla, setSla] = useState<SlaFilter>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const q = useDebounced(search)

  // O tempo de espera não é filtro da API: com ele ligado a tela busca o grupo
  // inteiro (até 200, o teto da API) e filtra aqui — a fila é pequena por natureza.
  const slaActive = sla !== 'all'

  const summary = useConsoleData(() => getOnboardingQueueSummaryAction(), [])
  const list = useConsoleData(
    () =>
      listOnboardingProposalsAction({
        group,
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        precheck: precheck === 'all' ? undefined : precheck,
        assigned: assigned === 'all' ? undefined : assigned,
        contractorType: type === 'all' ? undefined : type,
        page: slaActive ? 1 : page,
        perPage: slaActive ? 200 : Number(perPage),
      }),
    [group, q, status, precheck, assigned, type, page, perPage, slaActive],
  )

  useEffect(() => setPage(1), [group, q, status, precheck, assigned, type, perPage, sla])

  const rows = useMemo(() => (list.data?.items ?? []).filter(item => matchesSla(item, sla)), [list.data, sla])
  const total = slaActive ? rows.length : (list.data?.meta.total ?? 0)
  const visibleRows = slaActive ? rows.slice((page - 1) * Number(perPage), page * Number(perPage)) : rows

  const s = summary.data
  const counts: Record<OnboardingStatusGroup, number | undefined> = {
    queue: s?.queue,
    awaiting_applicant: s?.awaitingApplicant,
    awaiting_payment: s?.awaitingPayment,
    done: s ? (s.byStatus.active ?? 0) + (s.byStatus.rejected ?? 0) + (s.byStatus.canceled ?? 0) : undefined,
    all: s ? Object.values(s.byStatus).reduce((acc, value) => acc + (value ?? 0), 0) : undefined,
  }

  const statusOptions = PROPOSAL_STATUS_OPTIONS.filter(option => {
    const allowed = GROUP_STATUSES[group]
    return !allowed || allowed.includes(option.value)
  })

  const refresh = () => {
    void summary.reload({ silent: true })
    void list.reload({ silent: true })
  }

  const filtered = !!q || status !== 'all' || type !== 'all' || sla !== 'all' || precheck !== 'all' || assigned !== 'all'

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setPrecheck('all')
    setAssigned('all')
    setType('all')
    setSla('all')
  }

  const columns: Column<OnboardingProposalListItem>[] = [
    {
      key: 'proposta',
      header: 'Clube',
      render: item => (
        <div className="min-w-0 max-w-72">
          <Link
            href={`/admin/compliance/${item.id}`}
            onClick={event => event.stopPropagation()}
            className="block truncate rounded text-[15px] font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            {item.clubName || item.tradeName || item.legalName || 'Sem nome ainda'}
          </Link>
          <p className="m-0 truncate text-xs text-muted-foreground">
            CNPJ {formatCnpj(item.cnpj)} · <span className="font-mono">{item.code}</span>
          </p>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      hideOnMobile: true,
      render: item => (
        <div className="text-xs">
          <p className="text-foreground">{CONTRACTOR_TYPE_LABELS[item.contractorType]}</p>
          <p className="text-muted-foreground">{LEGAL_FORM_LABELS[item.legalForm]}</p>
        </div>
      ),
    },
    {
      key: 'plano',
      header: 'Plano',
      hideOnMobile: true,
      render: item => (
        <div className="text-xs">
          <p className="text-foreground">{item.planName ?? '—'}</p>
          <p className="text-muted-foreground">{formatCount(item.expectedLives)} vidas</p>
        </div>
      ),
    },
    {
      key: 'prechecagens',
      header: 'Verificação automática',
      render: item => (
        <div className="flex flex-col items-start gap-1">
          <Pill meta={verificationMeta(item.precheckSummary)} />
          {item.hasPep && <span className="text-[11px] font-medium text-[#B54708]">Pessoa politicamente exposta</span>}
        </div>
      ),
    },
    {
      key: 'documentos',
      header: 'Documentos',
      hideOnMobile: true,
      render: item => (
        <div className="text-xs">
          {item.documentsToReview > 0 && <p className="m-0 font-medium text-[#175CD3]">{item.documentsToReview} para revisar</p>}
          {item.documentsMissing > 0 && <p className="m-0 text-[#B54708]">{item.documentsMissing} faltando</p>}
          {item.documentsToReview === 0 && item.documentsMissing === 0 && <p className="m-0 text-muted-foreground">Tudo certo</p>}
        </div>
      ),
    },
    {
      key: 'responsavel',
      header: 'Responsável',
      hideOnMobile: true,
      render: item => (
        <span className="text-xs text-foreground">
          {item.assignedTo?.name ?? <span className="text-muted-foreground">Ninguém assumiu ainda</span>}
        </span>
      ),
    },
    {
      key: 'envio',
      header: 'Enviado',
      hideOnMobile: true,
      render: item =>
        item.submittedAt ? (
          <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDateTimeBR(item.submittedAt)}>
            {formatRelative(item.submittedAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'sla',
      header: 'Esperando há',
      render: item => <SlaBadge slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} />,
    },
    {
      key: 'status',
      header: 'Situação',
      render: item => <ProposalStatusPill status={item.status} />,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardCheck}
        title="Aprovações"
        description="Clubes que se cadastraram pelo site e esperam para ser liberados."
        actions={
          <Button type="button" variant="outline" className="h-10 gap-2" onClick={refresh} disabled={list.loading || summary.loading}>
            <RefreshCw className={cn('size-4', (list.loading || summary.loading) && 'animate-spin')} aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      {summary.error && !s ? (
        <ErrorState onRetry={() => summary.reload()} />
      ) : !s ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <span className="sr-only">Carregando resumo das aprovações…</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-31 rounded-2xl" />
          ))}
        </div>
      ) : (
        <section aria-label="Resumo das aprovações" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<Inbox />}
            value={formatCount(s.queue)}
            label="Para analisar"
            hint={s.unassigned > 0 ? `${formatCount(s.unassigned)} ainda sem responsável` : 'Todos já têm responsável'}
          />
          <KpiCard
            icon={<AlarmClock />}
            value={formatCount(s.slaBreached)}
            label={`Esperando há mais de ${REVIEW_DEADLINE_DAYS} dias`}
            hint={
              s.avgDecisionHours !== null
                ? `Decisão em média em ${waitingTime(s.avgDecisionHours)} (últimos 90 dias)`
                : 'Sem decisões nos últimos 90 dias'
            }
            tone={s.slaBreached > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            icon={<Wallet />}
            value={formatCount(s.awaitingPayment)}
            label="Aguardando pagamento"
            hint={`${formatCount(s.awaitingApplicant)} esperando o clube preencher ou corrigir`}
          />
          <KpiCard
            icon={<CircleCheckBig />}
            value={formatCount(s.provisionedThisMonth)}
            label="Liberados no mês"
            hint="Clubes que pagaram a ativação e já entraram no ar"
            tone={s.provisionedThisMonth > 0 ? 'success' : 'default'}
          />
        </section>
      )}

      <SectionCard padded={false}>
        <Tabs value={group} onValueChange={value => setGroup(value as OnboardingStatusGroup)} className="gap-0">
          <div className="px-6 pt-3">
            <SectionTabsList>
              {GROUPS.map(item => (
                <SectionTab key={item.value} value={item.value} badge={counts[item.value]}>
                  {item.label}
                </SectionTab>
              ))}
            </SectionTabsList>
          </div>
        </Tabs>

        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome do clube, CNPJ ou código" />
          <FilterSelect
            label="Situação"
            value={status}
            onChange={value => setStatus(value as 'all' | OnboardingStatus)}
            allLabel="Todas"
            options={statusOptions}
          />
          <FilterSelect
            label="Tipo"
            value={type}
            onChange={value => setType(value as 'all' | ContractorType)}
            allLabel="Todos"
            options={contractorType.options.map(value => ({ value, label: CONTRACTOR_TYPE_LABELS[value] }))}
          />
          <FilterSelect
            label="Esperando há"
            value={sla}
            onChange={value => setSla(value as SlaFilter)}
            allLabel="Qualquer tempo"
            options={SLA_OPTIONS}
          />
          <FilterSelect
            label="Verificação automática"
            value={precheck}
            onChange={value => setPrecheck(value as 'all' | PrecheckSummary)}
            allLabel="Qualquer resultado"
            options={VERIFICATION_OPTIONS}
          />
          <FilterSelect
            label="Responsável"
            value={assigned}
            onChange={value => setAssigned(value as 'all' | 'me' | 'unassigned')}
            allLabel="Qualquer um"
            options={[
              { value: 'me', label: 'Comigo' },
              { value: 'unassigned', label: 'Ninguém assumiu' },
            ]}
          />
        </div>

        <div className="border-t border-border">
          {list.error && !list.data ? (
            <ErrorState framed={false} onRetry={() => list.reload()} />
          ) : list.loading && !list.data ? (
            <TableSkeleton />
          ) : visibleRows.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={Search}
                title="Nenhum clube com esses filtros"
                description="Ajuste a busca ou limpe os filtros."
                action={
                  <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={EMPTY_ICON[group]}
                title={EMPTY_TEXT[group].title}
                description={EMPTY_TEXT[group].description}
              />
            )
          ) : (
            <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
              <DataTable
                caption="Cadastros de clubes esperando aprovação"
                minWidth="min-w-[640px] lg:min-w-[1100px]"
                framed={false}
              >
                <thead>
                  <tr>
                    {columns.map(column => (
                      <Th key={column.key} className={cn(column.hideOnMobile && 'hidden md:table-cell')}>
                        {column.header}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(item => (
                    <Tr
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/compliance/${item.id}`)}
                    >
                      {columns.map(column => (
                        <Td key={column.key} className={cn(column.hideOnMobile && 'hidden md:table-cell')}>
                          {column.render(item)}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>

        {list.data && total > 0 && (
          <TableFooter
            page={page}
            perPage={perPage}
            total={total}
            noun="clubes"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        )}
      </SectionCard>
    </PageContainer>
  )
}
