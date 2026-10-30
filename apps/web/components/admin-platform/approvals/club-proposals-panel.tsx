'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlarmClock, CircleCheckBig, ClipboardCheck, Hourglass, Search, UserRoundX, Wallet, type LucideIcon } from 'lucide-react'
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
import { FilterSelect, SearchInput, TableFooter, type Column } from '@/components/admin-platform/ui/table-controls'
import { Pill, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
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
import { ApprovalsTabsRow, QueueNote, SITUATIONS, type ClubSituation } from '@/components/admin-platform/approvals/approvals-kit'
import { useSellers } from '@/components/admin-platform/comercial/comercial-kit'
import { getOnboardingQueueSummaryAction, listOnboardingProposalsAction } from '@/lib/actions/platform-onboarding-api'
import { formatCnpj, formatCount, formatDateTimeBR, formatRelative, slaInfo } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Aprovações › Novos clubes (blueprint §Q4, roteiro §F passo 3): os clubes que
 * se cadastraram pelo site e esperam liberação, por situação, com a verificação
 * automática, os documentos a revisar, quem assumiu a análise e há quanto
 * tempo esperam (o prazo de análise é de 2 dias a partir do envio). O detalhe
 * de cada clube é a página `/admin/compliance/<id>`.
 */

const GROUP_OF: Record<ClubSituation, OnboardingStatusGroup> = {
  'para-analisar': 'queue',
  'esperando-o-clube': 'awaiting_applicant',
  'aguardando-pagamento': 'awaiting_payment',
  concluidas: 'done',
  todas: 'all',
}

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

/** Ícone do estado vazio de cada situação (decorativo; o texto é o que informa). */
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

function NoteItem({ icon: Icon, children, tone }: { icon: LucideIcon; children: ReactNode; tone?: 'danger' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', tone === 'danger' && 'font-medium text-[#B42318]')}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

export function ClubProposalsPanel({
  situation,
  onSituationChange,
  kindSwitcher,
  version,
}: {
  situation: ClubSituation
  onSituationChange: (value: ClubSituation) => void
  kindSwitcher: ReactNode
  /** Muda quando a página pede "Atualizar". */
  version: number
}) {
  const router = useRouter()
  const group = GROUP_OF[situation]
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | OnboardingStatus>('all')
  const [precheck, setPrecheck] = useState<'all' | PrecheckSummary>('all')
  const [assigned, setAssigned] = useState<'all' | 'me' | 'unassigned'>('all')
  const [type, setType] = useState<'all' | ContractorType>('all')
  const [sla, setSla] = useState<SlaFilter>('all')
  const [seller, setSeller] = useState('all')
  const sellers = useSellers()
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
        sellerUserId: seller === 'all' ? undefined : seller,
        page: slaActive ? 1 : page,
        perPage: slaActive ? 200 : Number(perPage),
      }),
    [group, q, status, precheck, assigned, type, seller, page, perPage, slaActive],
  )

  // "Atualizar" da página: relê sem piscar a tabela.
  useEffect(() => {
    if (version === 0) return
    void summary.reload({ silent: true })
    void list.reload({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  useEffect(() => setPage(1), [group, q, status, precheck, assigned, type, seller, perPage, sla])

  // A situação (status) escolhida pode não existir no novo grupo.
  useEffect(() => {
    const allowed = GROUP_STATUSES[group]
    if (status !== 'all' && allowed && !allowed.includes(status)) setStatus('all')
  }, [group, status])

  const rows = useMemo(() => (list.data?.items ?? []).filter(item => matchesSla(item, sla)), [list.data, sla])
  const total = slaActive ? rows.length : (list.data?.meta.total ?? 0)
  const visibleRows = slaActive ? rows.slice((page - 1) * Number(perPage), page * Number(perPage)) : rows

  const s = summary.data
  const counts: Record<ClubSituation, number | undefined> = {
    'para-analisar': s?.queue,
    'esperando-o-clube': s?.awaitingApplicant,
    'aguardando-pagamento': s?.awaitingPayment,
    concluidas: s ? (s.byStatus.active ?? 0) + (s.byStatus.rejected ?? 0) + (s.byStatus.canceled ?? 0) : undefined,
    todas: s ? Object.values(s.byStatus).reduce((acc, value) => acc + (value ?? 0), 0) : undefined,
  }

  const statusOptions = PROPOSAL_STATUS_OPTIONS.filter(option => {
    const allowed = GROUP_STATUSES[group]
    return !allowed || allowed.includes(option.value)
  })

  const filtered =
    !!q || status !== 'all' || type !== 'all' || sla !== 'all' || precheck !== 'all' || assigned !== 'all' || seller !== 'all'

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setPrecheck('all')
    setAssigned('all')
    setType('all')
    setSla('all')
    setSeller('all')
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
      key: 'vendedor',
      header: 'Vendedor',
      hideOnMobile: true,
      render: item => (
        <span className="text-xs text-foreground">
          {item.seller?.name ?? <span className="text-muted-foreground">Venda direta</span>}
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
    <SectionCard padded={false}>
      <ApprovalsTabsRow
        situations={SITUATIONS.clubes}
        value={situation}
        onChange={onSituationChange}
        counts={counts}
        kindSwitcher={kindSwitcher}
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center">
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
        {sellers.options.length > 0 ? (
          <FilterSelect label="Vendedor" value={seller} onChange={setSeller} allLabel="Qualquer um" options={sellers.options} />
        ) : null}
      </div>

      {s ? (
        <QueueNote>
          <NoteItem icon={AlarmClock} tone={s.slaBreached > 0 ? 'danger' : undefined}>
            {s.slaBreached === 1 ? '1 esperando' : `${formatCount(s.slaBreached)} esperando`} há mais de {REVIEW_DEADLINE_DAYS} dias
          </NoteItem>
          <NoteItem icon={UserRoundX}>
            {s.unassigned === 1 ? '1 sem responsável' : `${formatCount(s.unassigned)} sem responsável`}
          </NoteItem>
          <NoteItem icon={Hourglass}>
            {s.avgDecisionHours !== null
              ? `Decisão em média em ${waitingTime(s.avgDecisionHours)} (90 dias)`
              : 'Sem decisões nos últimos 90 dias'}
          </NoteItem>
          <NoteItem icon={CircleCheckBig}>
            {s.provisionedThisMonth === 1 ? '1 liberado no mês' : `${formatCount(s.provisionedThisMonth)} liberados no mês`}
          </NoteItem>
        </QueueNote>
      ) : null}

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
            <EmptyState icon={EMPTY_ICON[group]} title={EMPTY_TEXT[group].title} description={EMPTY_TEXT[group].description} />
          )
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable caption="Novos clubes esperando aprovação" minWidth="min-w-[640px] lg:min-w-[1100px]" framed={false}>
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
                  <Tr key={item.id} className="cursor-pointer" onClick={() => router.push(`/admin/compliance/${item.id}`)}>
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
        <TableFooter page={page} perPage={perPage} total={total} noun="clubes" onPageChange={setPage} onPerPageChange={setPerPage} />
      )}
    </SectionCard>
  )
}
