'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClock, CircleCheckBig, Inbox, ShieldCheck, Wallet } from 'lucide-react'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  ONBOARDING_REVIEW_SLA_HOURS,
  contractorType,
  type ContractorType,
  type OnboardingProposalListItem,
  type OnboardingStatus,
  type OnboardingStatusGroup,
  type PrecheckSummary,
} from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { DataTable, FilterSelect, SearchInput, TableFooter, type Column } from '@/components/dashboard/table-controls'
import {
  KpiSkeleton,
  LoadError,
  Pill,
  RefreshButton,
  TableSkeleton,
  useConsoleData,
} from '@/components/admin-platform/billing/console-kit'
import { ProposalStatusPill, SlaBadge } from '@/components/admin-platform/compliance/compliance-ui'
import {
  getOnboardingQueueSummaryAction,
  listOnboardingProposalsAction,
} from '@/lib/actions/platform-onboarding-api'
import {
  ONBOARDING_STATUS_OPTIONS,
  PRECHECK_SUMMARY_OPTIONS,
  formatCnpj,
  formatCount,
  formatDateTimeBR,
  formatHours,
  formatRelative,
  precheckSummaryMeta,
  slaInfo,
} from '@/lib/adapters/platform-console'

/**
 * Fila do compliance (blueprint §Q4, roteiro §F passo 3): propostas de
 * suboperadoras por grupo, com pré-checagens, documentos a revisar,
 * responsável e prazo de análise (SLA de 48 h a partir do envio).
 */

const GROUPS: { value: OnboardingStatusGroup; label: string }[] = [
  { value: 'queue', label: 'Fila de análise' },
  { value: 'awaiting_applicant', label: 'Com o contratante' },
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

const EMPTY_TEXT: Record<OnboardingStatusGroup, { title: string; description: string }> = {
  queue: { title: 'Fila vazia', description: 'Nenhuma proposta esperando análise agora.' },
  awaiting_applicant: { title: 'Nada com o contratante', description: 'Rascunhos e pendências abertas aparecem aqui.' },
  awaiting_payment: { title: 'Nenhuma ativação pendente', description: 'Propostas aprovadas aguardando o pagamento aparecem aqui.' },
  done: { title: 'Nenhuma proposta concluída', description: 'Ativadas, reprovadas e canceladas aparecem aqui.' },
  all: { title: 'Nenhuma proposta', description: 'As contratações feitas pelo site aparecem aqui.' },
}

type SlaFilter = 'all' | 'breached' | 'due_soon' | 'on_time'

const SLA_OPTIONS: { value: SlaFilter; label: string }[] = [
  { value: 'breached', label: 'Estourado' },
  { value: 'due_soon', label: 'Vence em até 12 h' },
  { value: 'on_time', label: 'No prazo' },
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

  // SLA não é filtro da API: com ele ligado a tela busca o grupo inteiro
  // (até 200, o teto da API) e filtra aqui — a fila é pequena por natureza.
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

  const statusOptions = ONBOARDING_STATUS_OPTIONS.filter(option => {
    const allowed = GROUP_STATUSES[group]
    return !allowed || allowed.includes(option.value)
  })

  const refresh = () => {
    void summary.reload({ silent: true })
    void list.reload({ silent: true })
  }

  const columns: Column<OnboardingProposalListItem>[] = [
    {
      key: 'proposta',
      header: 'Proposta',
      render: item => (
        <div className="min-w-0 max-w-72">
          <p className="truncate font-medium text-foreground">
            {item.clubName || item.tradeName || item.legalName || 'Sem nome ainda'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{item.code}</span> · {formatCnpj(item.cnpj)}
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
      header: 'Pré-checagens',
      render: item => (
        <div className="flex flex-wrap items-center gap-1">
          <Pill meta={precheckSummaryMeta(item.precheckSummary)} />
          {item.hasPep && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              PEP
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'documentos',
      header: 'Documentos',
      hideOnMobile: true,
      render: item => (
        <div className="text-xs">
          {item.documentsToReview > 0 && <p className="font-medium text-sky-700 dark:text-sky-300">{item.documentsToReview} a revisar</p>}
          {item.documentsMissing > 0 && <p className="text-orange-700 dark:text-orange-300">{item.documentsMissing} faltando</p>}
          {item.documentsToReview === 0 && item.documentsMissing === 0 && <p className="text-muted-foreground">Em dia</p>}
        </div>
      ),
    },
    {
      key: 'responsavel',
      header: 'Responsável',
      hideOnMobile: true,
      render: item => <span className="text-xs text-foreground">{item.assignedTo?.name ?? <span className="text-muted-foreground">—</span>}</span>,
    },
    {
      key: 'envio',
      header: 'Enviada',
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
      header: 'SLA',
      render: item => <SlaBadge slaDueAt={item.slaDueAt} slaBreached={item.slaBreached} />,
    },
    {
      key: 'status',
      header: 'Situação',
      render: item => <ProposalStatusPill status={item.status} />,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Análise cadastral (KYB) das suboperadoras que contrataram a plataforma pelo site."
      >
        <RefreshButton loading={list.loading || summary.loading} onClick={refresh} />
      </PageHeader>

      {summary.error && !s ? (
        <LoadError message={summary.error} onRetry={() => summary.reload()} />
      ) : !s ? (
        <KpiSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Inbox}
            accent="primary"
            value={formatCount(s.queue)}
            label="Na fila de análise"
            hint={s.unassigned > 0 ? `${formatCount(s.unassigned)} sem responsável` : 'Todas com responsável'}
            tone={s.unassigned > 0 ? 'down' : 'neutral'}
          />
          <StatCard
            icon={AlarmClock}
            accent="warning"
            value={formatCount(s.slaBreached)}
            label={`SLA estourado (${ONBOARDING_REVIEW_SLA_HOURS} h)`}
            hint={
              s.avgDecisionHours !== null
                ? `Decisão média em ${formatHours(s.avgDecisionHours)} (90 dias)`
                : 'Sem decisões nos últimos 90 dias'
            }
            tone={s.slaBreached > 0 ? 'down' : 'neutral'}
          />
          <StatCard
            icon={Wallet}
            accent="info"
            value={formatCount(s.awaitingPayment)}
            label="Aguardando pagamento"
            hint={`${formatCount(s.awaitingApplicant)} com o contratante (rascunho ou pendência)`}
          />
          <StatCard
            icon={CircleCheckBig}
            accent="success"
            value={formatCount(s.provisionedThisMonth)}
            label="Clubes ativados no mês"
            hint="Provisionados após o pagamento da ativação"
            tone={s.provisionedThisMonth > 0 ? 'up' : 'neutral'}
          />
        </div>
      )}

      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="p-0">
          <Tabs value={group} onValueChange={value => setGroup(value as OnboardingStatusGroup)} className="gap-0">
            <div className="px-4 pt-2">
              <SectionTabsList>
                {GROUPS.map(item => (
                  <SectionTab key={item.value} value={item.value} badge={counts[item.value]}>
                    {item.label}
                  </SectionTab>
                ))}
              </SectionTabsList>
            </div>
          </Tabs>

          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, CNPJ ou protocolo" />
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
              label="SLA"
              value={sla}
              onChange={value => setSla(value as SlaFilter)}
              allLabel="Qualquer prazo"
              options={SLA_OPTIONS}
            />
            <FilterSelect
              label="Pré-checagens"
              value={precheck}
              onChange={value => setPrecheck(value as 'all' | PrecheckSummary)}
              allLabel="Qualquer resultado"
              options={PRECHECK_SUMMARY_OPTIONS}
            />
            <FilterSelect
              label="Responsável"
              value={assigned}
              onChange={value => setAssigned(value as 'all' | 'me' | 'unassigned')}
              allLabel="Qualquer um"
              options={[
                { value: 'me', label: 'Comigo' },
                { value: 'unassigned', label: 'Sem responsável' },
              ]}
            />
          </div>

          {list.error && !list.data ? (
            <div className="p-4 pt-0">
              <LoadError message={list.error} onRetry={() => list.reload()} />
            </div>
          ) : list.loading && !list.data ? (
            <TableSkeleton />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={q || status !== 'all' || type !== 'all' || sla !== 'all' || precheck !== 'all' || assigned !== 'all' ? 'Nenhuma proposta com esses filtros' : EMPTY_TEXT[group].title}
              description={
                q || status !== 'all' || type !== 'all' || sla !== 'all' || precheck !== 'all' || assigned !== 'all'
                  ? 'Ajuste a busca ou limpe os filtros.'
                  : EMPTY_TEXT[group].description
              }
            />
          ) : (
            <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
              <DataTable
                columns={columns}
                rows={visibleRows}
                rowKey={item => item.id}
                onRowClick={item => router.push(`/admin/compliance/${item.id}`)}
              />
            </div>
          )}

          {list.data && total > 0 && (
            <TableFooter
              page={page}
              perPage={perPage}
              total={total}
              noun="propostas"
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
