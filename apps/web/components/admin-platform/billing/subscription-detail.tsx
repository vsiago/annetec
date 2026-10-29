'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Building2,
  CalendarClock,
  ExternalLink,
  FastForward,
  FileSearch,
  Gauge,
  History,
  Landmark,
  Loader2,
  Play,
  Receipt,
  Repeat,
  Wallet,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  daysBetweenDates,
  platformSubscriptionStatus,
  quotePlatformPlan,
  type PlatformBillingSettings,
  type PlatformSubscriptionDetail,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  Field,
  LoadError,
  RefreshButton,
  SuperadminOnly,
  runCommand,
  useConsoleData,
} from '@/components/admin-platform/billing/console-kit'
import {
  AccessPill,
  LivesTerm,
  MethodLabel,
  PlatformEventsTimeline,
  SubscriptionStatusPill,
  UsageBar,
  pluralize,
} from '@/components/admin-platform/billing/billing-bits'
import { ChargesTab } from '@/components/admin-platform/billing/charges-tab'
import { DunningLadder } from '@/components/admin-platform/billing/dunning-tab'
import {
  cancelPlatformSubscriptionAction,
  changePlatformPlanAction,
  demoTimeTravelAction,
  listPlatformPlanPricingAction,
  reactivatePlatformSubscriptionAction,
  runPlatformBillingAutomationAction,
} from '@/lib/actions/platform-billing-api'
import {
  canSimulatePayments,
  demoToolsAvailable,
  formatBRL,
  formatCnpj,
  formatDateBR,
  formatDateTimeBR,
  formatPercent,
  todaySP,
} from '@/lib/adapters/platform-console'
import { isDemoMode } from '@/lib/demo-mode'
import { cn } from '@/lib/utils'

/**
 * Detalhe de uma assinatura de plataforma, ou seja, de um clube pagante
 * (blueprint §Q4, roteiro §F passo 7): a situação da cobrança com a etapa
 * atual, a ferramenta de demonstração "avançar N dias" (recua datas e roda a
 * automação; só quando o servidor diz que é demonstração), troca de plano,
 * cancelar/reativar, faturas e o histórico do clube.
 */

/** Botões do cabeçalho e das seções: alvo de toque de 40px e o mesmo canto do console. */
const ACTION_BUTTON = 'min-h-10 gap-2 rounded-[10px] px-4 font-semibold'

const STATUS_FLOW = platformSubscriptionStatus.options

function statusTimestamp(sub: PlatformSubscriptionDetail, status: (typeof STATUS_FLOW)[number]): string | null {
  switch (status) {
    case 'active':
      return sub.startedAt
    case 'past_due':
      return sub.pastDueAt
    case 'restricted':
      return sub.restrictedAt
    case 'suspended':
      return sub.suspendedAt
    case 'canceled':
      return sub.canceledAt
  }
}

function StatusFlow({ sub }: { sub: PlatformSubscriptionDetail }) {
  const currentIndex = STATUS_FLOW.indexOf(sub.status)
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {STATUS_FLOW.map((status, index) => {
        const current = index === currentIndex
        const passed = index < currentIndex
        const at = statusTimestamp(sub, status)
        return (
          <li key={status} className="flex items-center gap-1.5">
            <span
              title={at ? formatDateTimeBR(at) : undefined}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                current
                  ? status === 'active'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : status === 'past_due'
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                      : status === 'restricted'
                        ? 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300'
                        : 'border-red-300 bg-red-50 text-[#B42318] dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300'
                  : passed
                    ? 'border-border bg-muted/60 text-muted-foreground'
                    : 'border-dashed border-border text-muted-foreground/70',
              )}
            >
              {PLATFORM_SUBSCRIPTION_STATUS_LABELS[status]}
            </span>
            {index < STATUS_FLOW.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function ChangePlanDialog({
  sub,
  open,
  onOpenChange,
  onChanged,
}: {
  sub: PlatformSubscriptionDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (detail: PlatformSubscriptionDetail) => void
}) {
  const plans = useConsoleData(open ? () => listPlatformPlanPricingAction() : null, [open])
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(null)
      setBusy(false)
    }
  }, [open])

  const options = useMemo(
    () =>
      [...(plans.data ?? [])]
        .sort((a, b) => a.priceMonthly - b.priceMonthly)
        .map(offer => ({ offer, quote: quotePlatformPlan(offer, offer.pricing, sub.lives) })),
    [plans.data, sub.lives],
  )
  const choice = options.find(item => item.offer.id === selected) ?? null
  const isUpgrade = choice ? choice.offer.priceMonthly > sub.planPriceMonthly : false

  const submit = async () => {
    if (!choice || busy) return
    setBusy(true)
    const detail = await runCommand(
      changePlatformPlanAction(sub.id, { planId: choice.offer.id }),
      updated =>
        updated.scheduledPlanId
          ? `Troca para ${choice.offer.name} agendada para o próximo mês`
          : `Plano alterado para ${updated.planName}`,
    )
    setBusy(false)
    if (detail) {
      onChanged(detail)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trocar o plano de {sub.tenantName}</DialogTitle>
          <DialogDescription>
            Para um plano maior, a troca vale na hora e o valor proporcional entra na próxima fatura. Para um plano menor, a troca
            fica agendada
            {sub.currentPeriodEnd ? ` para ${formatDateBR(sub.currentPeriodEnd)}` : ' para o fim do período'}. Valores calculados com as{' '}
            {sub.lives.toLocaleString('pt-BR')} <LivesTerm /> de hoje.
          </DialogDescription>
        </DialogHeader>
        {plans.error && !plans.data ? (
          <LoadError message={plans.error} onRetry={() => plans.reload()} framed={false} />
        ) : !plans.data ? (
          <SectionSkeleton rows={3} label="Carregando planos…" />
        ) : (
          <ul className="space-y-2">
            {options.map(({ offer, quote }) => {
              const current = offer.id === sub.planId
              const active = selected === offer.id
              const upgrade = offer.priceMonthly > sub.planPriceMonthly
              return (
                <li key={offer.id}>
                  <button
                    type="button"
                    disabled={current}
                    onClick={() => setSelected(offer.id)}
                    className={cn(
                      'flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      active ? 'border-secondary bg-accent ring-2 ring-secondary/15' : 'border-border hover:bg-muted/40',
                      current && 'cursor-default opacity-70',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">
                        {offer.name}
                        {current && <span className="ml-2 text-xs font-normal text-muted-foreground">(atual)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBRL(offer.priceMonthly)} por mês · até {offer.memberLimit.toLocaleString('pt-BR')} <LivesTerm /> · usa{' '}
                        {formatPercent(quote.usagePct)} do plano
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums text-foreground">{formatBRL(quote.monthlyTotal)}</p>
                      <p className="text-[11px] text-muted-foreground">por mês com as vidas de hoje</p>
                    </div>
                    {!current && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          upgrade
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
                        )}
                      >
                        {upgrade ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
                        {upgrade ? 'Plano maior' : 'Plano menor'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!choice || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {choice ? (isUpgrade ? 'Trocar agora' : 'Agendar a troca') : 'Escolha um plano'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Ferramenta de demonstração: só é renderizada quando o servidor diz que as
 * ferramentas estão ligadas E o recebimento é simulado (`demoToolsAvailable`,
 * que delega para `isDemoMode`). Em produção estrita o bloco nem existe.
 */
function DemoTimeTravel({
  sub,
  isSuperadmin,
  onChanged,
}: {
  sub: PlatformSubscriptionDetail
  isSuperadmin: boolean
  onChanged: (detail: PlatformSubscriptionDetail) => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [custom, setCustom] = useState('7')
  const customDays = Math.trunc(Number(custom))
  const customValid = Number.isInteger(customDays) && customDays >= 1 && customDays <= 120

  const travel = async (days: number) => {
    if (busy !== null) return
    setBusy(days)
    const before = sub.status
    const detail = await runCommand(demoTimeTravelAction(sub.id, { days }))
    setBusy(null)
    if (!detail) return
    onChanged(detail)
    const advanced = pluralize(days, 'dia', 'dias')
    if (detail.status !== before) {
      toast.success(`+${advanced}: ${PLATFORM_SUBSCRIPTION_STATUS_LABELS[before]} → ${PLATFORM_SUBSCRIPTION_STATUS_LABELS[detail.status]}`, {
        description:
          detail.access.level === 'full'
            ? 'Painel do clube com acesso completo.'
            : detail.access.level === 'read_only'
              ? 'Painel do clube em somente leitura.'
              : 'Painel do clube bloqueado.',
      })
    } else {
      toast.success(`+${advanced}: automação executada`, {
        description: detail.daysLate > 0 ? `${pluralize(detail.daysLate, 'dia', 'dias')} de atraso` : 'Assinatura em dia',
      })
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-4 dark:border-violet-500/40 dark:bg-violet-500/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FastForward className="h-4 w-4 text-violet-600" aria-hidden="true" />
          Avançar o tempo (demonstração)
        </p>
        <span className="text-xs text-muted-foreground">Recua as datas desta assinatura e roda a automação</span>
      </div>
      <SuperadminOnly isSuperadmin={isSuperadmin}>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 5, 10, 25].map(days => (
            <Button
              key={days}
              variant="outline"
              className="h-10 gap-1.5 rounded-[10px] bg-background px-3.5 font-semibold"
              onClick={() => travel(days)}
              disabled={busy !== null}
            >
              {busy === days ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}+{days} dia{days > 1 ? 's' : ''}
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              value={custom}
              onChange={event => setCustom(event.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="h-10 w-16 bg-background"
              aria-label="Dias para avançar"
            />
            <Button className="h-10 gap-1.5 rounded-[10px] px-3.5 font-semibold" onClick={() => travel(customDays)} disabled={!customValid || busy !== null}>
              {busy === customDays ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FastForward className="h-3.5 w-3.5" aria-hidden="true" />}
              Avançar
            </Button>
          </div>
        </div>
      </SuperadminOnly>
    </div>
  )
}

export function SubscriptionDetailView({
  sub,
  settings,
  isSuperadmin,
  onChanged,
  onReload,
  reloading,
  breadcrumb,
}: {
  sub: PlatformSubscriptionDetail
  settings: PlatformBillingSettings | null
  isSuperadmin: boolean
  onChanged: (detail: PlatformSubscriptionDetail) => void
  onReload: () => void
  reloading: boolean
  /** O que vem acima do título (normalmente o link "Voltar para ..."). */
  breadcrumb?: ReactNode
}) {
  const [planOpen, setPlanOpen] = useState(false)
  const [confirm, setConfirm] = useState<'cancel' | 'reactivate' | null>(null)
  const [running, setRunning] = useState(false)
  const [chargesVersion, setChargesVersion] = useState(0)

  const today = todaySP()
  const highlightDay = sub.oldestOpenDueDate ? daysBetweenDates(sub.oldestOpenDueDate, today) : null
  const canSimulate = settings ? canSimulatePayments(settings.gateway, settings.sandbox) : false
  /** Textos de demonstração só quando o DTO diz que é demonstração. */
  const demo = isDemoMode(settings)
  /** "Avançar o tempo" só com as ferramentas ligadas e recebimento simulado: em produção o bloco não existe. */
  const demoTools = demoToolsAvailable(settings)
  const overage = Math.max(0, sub.estimatedMonthly - sub.planPriceMonthly)

  const update = (detail: PlatformSubscriptionDetail) => {
    onChanged(detail)
    setChargesVersion(value => value + 1)
  }

  const cancel = async (reason: string) => {
    const detail = await runCommand(cancelPlatformSubscriptionAction(sub.id, { reason }), 'Assinatura cancelada')
    if (detail) update(detail)
    return !!detail
  }

  const reactivate = async () => {
    const detail = await runCommand(reactivatePlatformSubscriptionAction(sub.id), 'Assinatura reativada')
    if (detail) update(detail)
    return !!detail
  }

  const runAutomation = async () => {
    setRunning(true)
    const report = await runCommand(runPlatformBillingAutomationAction(), 'Automação executada')
    setRunning(false)
    if (report) {
      onReload()
      setChargesVersion(value => value + 1)
    }
  }

  return (
    <>
      {/* ------------------------------------------------------ cabeçalho */}
      <PageHeader
        breadcrumb={breadcrumb}
        title={sub.tenantName}
        badge={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SubscriptionStatusPill status={sub.status} />
            <AccessPill access={sub.access} />
            {sub.source === 'seed' && demo && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                Demonstração
              </span>
            )}
          </span>
        }
        description={
          <>
            <a
              href={`/${sub.tenantSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-secondary hover:underline"
            >
              /{sub.tenantSlug}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <span aria-hidden> · </span>
            <span>
              Plano {sub.planName} · {formatBRL(sub.planPriceMonthly)}/mês
            </span>
            {sub.scheduledPlanName && (
              <>
                <span aria-hidden> · </span>
                <span className="text-violet-700 dark:text-violet-300">→ {sub.scheduledPlanName} no próximo mês</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <RefreshButton loading={reloading} onClick={onReload} />
            {sub.status !== 'canceled' && (
              <Button variant="outline" className={ACTION_BUTTON} onClick={() => setPlanOpen(true)}>
                <Repeat className="h-4 w-4" aria-hidden="true" />
                Trocar plano
              </Button>
            )}
            {sub.status === 'canceled' ? (
              <Button className={ACTION_BUTTON} onClick={() => setConfirm('reactivate')}>
                <Zap className="h-4 w-4" aria-hidden="true" />
                Reativar assinatura
              </Button>
            ) : (
              <SuperadminOnly isSuperadmin={isSuperadmin}>
                <Button
                  variant="outline"
                  className={cn(ACTION_BUTTON, 'border-red-200 text-[#B42318] hover:bg-red-50 hover:text-[#B42318] dark:border-red-500/30')}
                  onClick={() => setConfirm('cancel')}
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Cancelar assinatura
                </Button>
              </SuperadminOnly>
            )}
            <Button variant="ghost" className={ACTION_BUTTON} asChild>
              <Link href={`/admin/inquilinos/${sub.organizationId}`}>
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Abrir o clube
              </Link>
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------ números */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Wallet />}
          label="Mensalidade estimada"
          value={formatBRL(sub.estimatedMonthly)}
          hint={overage > 0 ? `Inclui ${formatBRL(overage)} de vidas acima do limite` : 'Só a mensalidade do plano, sem vidas acima do limite'}
        />
        {/* Mesmo cartão do KpiCard, com a barra de uso no lugar do número grande. */}
        <div className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-card px-6 py-5.5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 pt-0.5 text-[13px] font-medium text-muted-foreground">
              Uso do plano (<LivesTerm />)
            </p>
            <span
              className="-mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-secondary [&>svg]:size-5"
              aria-hidden="true"
            >
              <Gauge />
            </span>
          </div>
          <UsageBar lives={sub.lives} limit={sub.memberLimit} pct={sub.usagePct} />
          <p className="m-0 text-[13px] text-muted-foreground">
            {formatPercent(sub.usagePct)} do limite · {formatBRL(sub.pricePerExtraLife)} por vida adicional, por mês
          </p>
        </div>
        <KpiCard
          icon={<Receipt />}
          label="Em aberto"
          value={formatBRL(sub.openAmount)}
          tone={sub.daysLate > 0 ? 'danger' : 'default'}
          hint={
            sub.daysLate > 0
              ? `${pluralize(sub.overdueCount, 'fatura vencida', 'faturas vencidas')} · ${pluralize(sub.daysLate, 'dia', 'dias')} de atraso`
              : sub.openAmount > 0
                ? 'Dentro do prazo'
                : 'Nada em aberto'
          }
        />
        <KpiCard
          icon={<CalendarClock />}
          label="Próximo vencimento"
          value={sub.nextDueDate ? formatDateBR(sub.nextDueDate) : '—'}
          hint={
            sub.currentPeriodStart && sub.currentPeriodEnd
              ? `Período de ${formatDateBR(sub.currentPeriodStart)} a ${formatDateBR(sub.currentPeriodEnd)} · vence todo dia ${sub.dueDay}`
              : `Vence todo dia ${sub.dueDay}`
          }
        />
      </div>

      {/* ------------------------------------------------------ régua ao vivo */}
      <SectionCard
        title="Situação da cobrança"
        icon={Activity}
        description={
          <>
            {sub.oldestOpenDueDate
              ? `A fatura em aberto mais antiga ${sub.daysLate > 0 ? 'venceu' : 'vence'} em ${formatDateBR(sub.oldestOpenDueDate)}${
                  sub.daysLate > 0 ? ` (${pluralize(sub.daysLate, 'dia', 'dias')} de atraso)` : ''
                }.`
              : 'Nenhuma fatura em aberto: não há nada a cobrar agora.'}
            {sub.access.source === 'override' ? ' O acesso foi definido manualmente pela equipe e vale mais que as regras de cobrança.' : ''}
          </>
        }
        actions={
          <Button
            variant="outline"
            className={ACTION_BUTTON}
            onClick={runAutomation}
            disabled={running}
            title="Roda agora as regras de cobrança para todos os clubes"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            Executar automação
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <StatusFlow sub={sub} />
          {settings && <DunningLadder settings={settings} highlightDay={highlightDay} />}
          {demoTools && <DemoTimeTravel sub={sub} isSuperadmin={isSuperadmin} onChanged={update} />}
          {sub.cancelReason && (
            <p className="m-0 rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Motivo do cancelamento: {sub.cancelReason}</p>
          )}
        </div>
      </SectionCard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard
          title="Faturas"
          icon={Receipt}
          description="Ativação e mensalidades deste clube."
          padded={false}
          className="overflow-hidden"
        >
          <ChargesTab
            canSimulate={canSimulate}
            defaultDueDays={settings?.boletoDueDays}
            subscriptionId={sub.id}
            version={chargesVersion}
            onChanged={onReload}
          />
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Cobrança" icon={Landmark} description="Dados de cobrança do clube.">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Razão social" className="col-span-2">
                {sub.billingName}
              </Field>
              <Field label="CNPJ">
                <span className="font-mono text-xs">{formatCnpj(sub.billingDocument)}</span>
              </Field>
              <Field label="Forma de pagamento">
                <MethodLabel method={sub.paymentMethod} card={sub.paymentCard} className="text-foreground" />
              </Field>
              <Field label="E-mail do financeiro" className="col-span-2">
                {sub.billingEmail}
              </Field>
              <Field label="Assina desde">{sub.startedAt ? formatDateBR(sub.startedAt) : '—'}</Field>
              <Field label="Taxa de adesão">{formatBRL(sub.setupFee)}</Field>
              {sub.proposalId && (
                <Field label="Contratação" className="col-span-2">
                  <Link href={`/admin/compliance/${sub.proposalId}`} className="inline-flex items-center gap-1 text-secondary hover:underline">
                    <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                    Ver a aprovação do clube
                  </Link>
                </Field>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Histórico do clube"
            icon={History}
            description={`${pluralize(sub.events.length, 'evento', 'eventos')}, do mais recente para o mais antigo.`}
          >
            <PlatformEventsTimeline events={[...sub.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} />
          </SectionCard>
        </div>
      </div>

      <ChangePlanDialog sub={sub} open={planOpen} onOpenChange={setPlanOpen} onChanged={update} />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={open => !open && setConfirm(null)}
        title={`Cancelar a assinatura de ${sub.tenantName}?`}
        description="O painel da equipe do clube fica bloqueado e as faturas em aberto são canceladas. O clube em si, os associados, a vitrine e as carteirinhas continuam funcionando. Para voltar, use “Reativar assinatura”."
        confirmLabel="Cancelar assinatura"
        destructive
        reason={{ label: 'Motivo', placeholder: 'Ex.: distrato assinado em 27/09', minLength: 3 }}
        onConfirm={cancel}
      />
      <ConfirmDialog
        open={confirm === 'reactivate'}
        onOpenChange={open => !open && setConfirm(null)}
        title={`Reativar a assinatura de ${sub.tenantName}?`}
        description="Reabre a assinatura e devolve o acesso ao painel do clube conforme as regras de cobrança."
        confirmLabel="Reativar assinatura"
        onConfirm={reactivate}
      />
    </>
  )
}
