'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BadgePercent,
  CalendarClock,
  ChevronRight,
  FileSignature,
  KanbanSquare,
  LayoutDashboard,
  Link2,
  Plus,
  Trophy,
  Wallet,
} from 'lucide-react'
import type { Prospect, ProspectDetail } from '@annetec/contracts'
import { KpiSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import {
  STAGE_META,
  STAGE_ORDER,
  actionDue,
  discountSummary,
  formatDay,
  formatInt,
  formatMoney,
  formatPct,
  monthLabel,
} from '@/components/sales/sales-ui'
import { LinkWizard } from '@/components/vendas/link-wizard'
import { ProspectPickerDialog } from '@/components/vendas/prospect-picker'
import { ProspectWizard } from '@/components/vendas/prospect-wizard'
import { getSellerDashboardAction, listSellerDiscountsAction } from '@/lib/actions/vendas-api'
import { cn } from '@/lib/utils'

/**
 * Painel do vendedor ANNETEC: números do mês, funil por etapa, próximas
 * ações (atrasadas em destaque) e pedidos de desconto aguardando o
 * superadmin. Atalhos para cadastrar prospect e gerar link.
 */
export default function SellerDashboardPage() {
  const router = useRouter()
  const { user } = usePlatformAuth()
  const { canWrite } = useSellerProfile()
  const dashboard = useConsoleData(() => getSellerDashboardAction(), [])
  const pending = useConsoleData(() => listSellerDiscountsAction({ status: 'pending', perPage: 10 }), [])

  const [prospectOpen, setProspectOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [linkFor, setLinkFor] = useState<Prospect | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  const d = dashboard.data
  const firstName = user?.name?.split(/\s+/)[0]

  const reload = () => {
    void dashboard.reload({ silent: true })
    void pending.reload({ silent: true })
  }

  const openLink = (prospect: Prospect) => {
    setPickerOpen(false)
    setLinkFor(prospect)
    setLinkOpen(true)
  }

  const actions = canWrite ? (
    <>
      <Button variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setPickerOpen(true)}>
        <Link2 aria-hidden="true" />
        Gerar link
      </Button>
      <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setProspectOpen(true)}>
        <Plus aria-hidden="true" />
        Novo prospect
      </Button>
    </>
  ) : null

  const totalInFunnel = d ? STAGE_ORDER.reduce((acc, stage) => acc + (d.prospectsByStage[stage] ?? 0), 0) : 0
  const maxStage = d ? Math.max(1, ...STAGE_ORDER.map(stage => d.prospectsByStage[stage] ?? 0)) : 1
  const goalPct = d?.goal.target ? Math.min(100, Math.round((d.goal.achieved / d.goal.target) * 100)) : null

  return (
    <PageContainer>
      <PageHeader
        icon={LayoutDashboard}
        title={firstName ? `Olá, ${firstName}` : 'Painel de vendas'}
        description={d ? `Seu funil, suas propostas e a sua comissão de ${monthLabel(d.month)}.` : 'Seu funil, suas propostas e a sua comissão do mês.'}
        actions={actions}
      />

      {dashboard.error && !d ? (
        <ErrorState onRetry={() => dashboard.reload()} />
      ) : !d ? (
        <KpiSkeleton />
      ) : (
        <section aria-label="Números do mês" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<KanbanSquare />}
            accent="navy"
            label="Prospects ativos"
            value={formatInt(d.openProspects)}
            hint={d.openProspects === 0 ? 'Cadastre o primeiro prospect' : `${formatInt(totalInFunnel)} no funil, contando ganhos e perdidos`}
            href="/vendas/funil"
          />
          <KpiCard
            icon={<FileSignature />}
            accent="blue"
            label="Propostas em andamento"
            value={formatInt(d.proposalsInProgress)}
            hint={d.pendingDiscounts > 0 ? `${formatInt(d.pendingDiscounts)} com desconto aguardando` : 'Links e cadastros em análise'}
            href="/vendas/propostas"
          />
          <KpiCard
            icon={<Trophy />}
            accent="green"
            label="Ganhos no mês"
            value={`${formatInt(d.wonThisMonth)} ${d.wonThisMonth === 1 ? 'clube' : 'clubes'}`}
            tone={d.wonThisMonth > 0 ? 'success' : 'default'}
            hint={
              d.goal.target
                ? `Meta: ${formatInt(d.goal.target)} ${d.goal.target === 1 ? 'clube' : 'clubes'} no ar`
                : 'Sem meta definida para você'
            }
          >
            {goalPct !== null ? (
              <div className="flex flex-col gap-1.5">
                <div
                  role="progressbar"
                  aria-label="Progresso da meta do mês"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goalPct}
                  className="h-2 w-full overflow-hidden rounded-full bg-[#EEF2F6]"
                >
                  <div className={cn('h-full rounded-full', goalPct >= 100 ? 'bg-[#17B26A]' : 'bg-secondary')} style={{ width: `${goalPct}%` }} />
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                  {goalPct >= 100 ? 'Meta batida!' : `${formatPct(d.goal.pct ?? goalPct)} da meta`}
                </p>
              </div>
            ) : null}
          </KpiCard>
          <KpiCard
            icon={<Wallet />}
            accent="coral"
            label={`Comissão de ${monthLabel(d.month).split(' ')[0]}`}
            value={formatMoney(d.commissionThisMonth.net)}
            hint={`${formatMoney(d.commissionThisMonth.a_pagar)} a receber · ${formatMoney(d.commissionThisMonth.paga)} paga`}
            href="/vendas/comissoes"
          >
            {d.commissionThisMonth.a_descontar > 0 ? (
              <p className="m-0 text-xs font-medium text-[#B42318]">{formatMoney(d.commissionThisMonth.a_descontar)} a descontar (estorno)</p>
            ) : null}
          </KpiCard>
        </section>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionCard
          title="Funil por etapa"
          description="Quantos prospects você tem em cada etapa."
          icon={KanbanSquare}
          actions={
            <Button asChild variant="outline" className="h-10 rounded-[10px] px-3 text-sm font-semibold">
              <Link href="/vendas/funil">Abrir o funil</Link>
            </Button>
          }
        >
          {!d ? (
            <SectionSkeleton rows={6} />
          ) : totalInFunnel === 0 ? (
            <EmptyState
              size="sm"
              icon={KanbanSquare}
              title="Seu funil está vazio"
              description="Cadastre operadoras e clubes que você vai abordar."
              action={
                canWrite ? (
                  <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setProspectOpen(true)}>
                    <Plus aria-hidden="true" />
                    Novo prospect
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {STAGE_ORDER.map(stage => {
                const count = d.prospectsByStage[stage] ?? 0
                return (
                  <li key={stage}>
                    <Link
                      href={`/vendas/funil?etapa=${stage}`}
                      className="group grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg py-1 outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 sm:grid-cols-[10rem_minmax(0,1fr)_3rem]"
                    >
                      <span className="truncate text-sm text-foreground group-hover:underline">{STAGE_META[stage].label}</span>
                      <span className="h-3 overflow-hidden rounded-full bg-[#EEF2F6]" aria-hidden="true">
                        <span
                          className="block h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${count === 0 ? 0 : Math.max(4, (count / maxStage) * 100)}%`, background: STAGE_META[stage].bar }}
                        />
                      </span>
                      <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatInt(count)}
                        <span className="sr-only"> {count === 1 ? 'prospect' : 'prospects'}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Próximas ações" description="Até 7 dias à frente, e as atrasadas." icon={CalendarClock} padded={false}>
          {!d ? (
            <div className="p-5">
              <SectionSkeleton rows={4} />
            </div>
          ) : d.upcomingActions.length === 0 ? (
            <EmptyState
              size="sm"
              icon={CalendarClock}
              title="Nenhuma ação marcada"
              description="Ao cadastrar ou editar um prospect, combine o próximo passo e a data."
            />
          ) : (
            <ul className="m-0 list-none divide-y divide-[#EEF0F3] p-0">
              {d.upcomingActions.map(item => {
                const due = actionDue(item.nextActionAt)
                return (
                  <li key={item.id}>
                    <Link
                      href={`/vendas/funil/${item.id}`}
                      className={cn(
                        'flex items-center gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-[#F6F9FC] focus-visible:bg-[#F6F9FC] sm:px-6',
                        due === 'late' && 'bg-[#FEF3F2]/60',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                        <span className="block truncate text-[13px] text-muted-foreground">{item.nextAction ?? 'Próximo passo sem descrição'}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {due === 'late' ? (
                          <StatusPill tone="danger">Atrasada</StatusPill>
                        ) : due === 'today' ? (
                          <StatusPill tone="warning">Hoje</StatusPill>
                        ) : null}
                        <span className={cn('text-xs tabular-nums', due === 'late' ? 'font-semibold text-[#B42318]' : 'text-muted-foreground')}>
                          {formatDay(item.nextActionAt)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Pedidos de desconto aguardando"
        description="Quando o superadmin decidir, você recebe um aviso no sino."
        icon={BadgePercent}
        iconTone="amber"
        padded={false}
      >
        {pending.error && !pending.data ? (
          <ErrorState framed={false} size="sm" onRetry={() => pending.reload()} />
        ) : !pending.data ? (
          <div className="p-5">
            <SectionSkeleton rows={2} />
          </div>
        ) : pending.data.items.length === 0 ? (
          <EmptyState size="sm" tone="success" icon={BadgePercent} title="Nenhum pedido aguardando" description="Pedidos de condição especial aparecem aqui até a decisão." />
        ) : (
          <ul className="m-0 list-none divide-y divide-[#EEF0F3] p-0">
            {pending.data.items.map(item => (
              <li key={item.id}>
                <Link
                  href={`/vendas/propostas/${item.proposalId}`}
                  className="flex items-center gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-[#F6F9FC] focus-visible:bg-[#F6F9FC] sm:px-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{item.customerName}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {discountSummary(item.requested)} · proposta <span className="font-mono">{item.proposalCode}</span>
                    </span>
                  </span>
                  <StatusPill tone="warning">Aguardando</StatusPill>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ProspectWizard
        open={prospectOpen}
        onOpenChange={setProspectOpen}
        onSaved={reload}
        onOpenProspect={(detail: ProspectDetail) => router.push(`/vendas/funil/${detail.id}`)}
        onGenerateLink={detail => openLink(detail)}
      />
      <ProspectPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={openLink}
        onCreateNew={() => {
          setPickerOpen(false)
          setProspectOpen(true)
        }}
      />
      <LinkWizard open={linkOpen} onOpenChange={setLinkOpen} prospect={linkFor} onCreated={reload} />
    </PageContainer>
  )
}
