'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Building2,
  CalendarClock,
  ExternalLink,
  FastForward,
  FileSearch,
  Loader2,
  Play,
  RefreshCw,
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  ConfirmDialog,
  Field,
  LoadError,
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
          <LoadError message={plans.error} onRetry={() => plans.reload()} />
        ) : !plans.data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando planos…</p>
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
                        {upgrade ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
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
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
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
          <FastForward className="h-4 w-4 text-violet-600" />
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
              size="sm"
              className="gap-1.5 bg-background"
              onClick={() => travel(days)}
              disabled={busy !== null}
            >
              {busy === days ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}+{days} dia{days > 1 ? 's' : ''}
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              value={custom}
              onChange={event => setCustom(event.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              className="h-8 w-16 bg-background"
              aria-label="Dias para avançar"
            />
            <Button size="sm" className="gap-1.5" onClick={() => travel(customDays)} disabled={!customValid || busy !== null}>
              {busy === customDays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FastForward className="h-3.5 w-3.5" />}
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
}: {
  sub: PlatformSubscriptionDetail
  settings: PlatformBillingSettings | null
  isSuperadmin: boolean
  onChanged: (detail: PlatformSubscriptionDetail) => void
  onReload: () => void
  reloading: boolean
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
    <div className="space-y-6">
      {/* ------------------------------------------------------ cabeçalho */}
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <SubscriptionStatusPill status={sub.status} />
              <AccessPill access={sub.access} />
              {sub.source === 'seed' && demo && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                  Demonstração
                </span>
              )}
            </div>
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{sub.tenantName}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <a href={`/${sub.tenantSlug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-secondary hover:underline">
                /{sub.tenantSlug}
                <ExternalLink className="h-3 w-3" />
              </a>
              <span aria-hidden>·</span>
              <span>
                Plano {sub.planName} · {formatBRL(sub.planPriceMonthly)}/mês
              </span>
              {sub.scheduledPlanName && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-violet-700 dark:text-violet-300">→ {sub.scheduledPlanName} no próximo mês</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onReload} disabled={reloading}>
              <RefreshCw className={cn('h-4 w-4', reloading && 'animate-spin')} />
              Atualizar
            </Button>
            {sub.status !== 'canceled' && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPlanOpen(true)}>
                <Repeat className="h-4 w-4" />
                Trocar plano
              </Button>
            )}
            {sub.status === 'canceled' ? (
              <Button size="sm" className="gap-1.5" onClick={() => setConfirm('reactivate')}>
                <Zap className="h-4 w-4" />
                Reativar assinatura
              </Button>
            ) : (
              <SuperadminOnly isSuperadmin={isSuperadmin}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-red-200 text-[#B42318] hover:bg-red-50 hover:text-[#B42318] dark:border-red-500/30"
                  onClick={() => setConfirm('cancel')}
                >
                  <Ban className="h-4 w-4" />
                  Cancelar assinatura
                </Button>
              </SuperadminOnly>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5" asChild>
              <Link href={`/admin/inquilinos/${sub.organizationId}`}>
                <Building2 className="h-4 w-4" />
                Abrir o clube
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ números */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          accent="primary"
          value={formatBRL(sub.estimatedMonthly)}
          label="Mensalidade estimada"
          hint={overage > 0 ? `Inclui ${formatBRL(overage)} de vidas acima do limite` : 'Só a mensalidade do plano, sem vidas acima do limite'}
        />
        <Card className="gap-0 py-0 shadow-none">
          <CardContent className="space-y-2 p-5">
            <p className="text-sm text-muted-foreground">
              Uso do plano (<LivesTerm />)
            </p>
            <UsageBar lives={sub.lives} limit={sub.memberLimit} pct={sub.usagePct} />
            <p className="text-xs text-muted-foreground">
              {formatPercent(sub.usagePct)} do limite · {formatBRL(sub.pricePerExtraLife)} por vida adicional, por mês
            </p>
          </CardContent>
        </Card>
        <StatCard
          icon={CalendarClock}
          accent={sub.daysLate > 0 ? 'warning' : 'info'}
          value={formatBRL(sub.openAmount)}
          label="Em aberto"
          hint={
            sub.daysLate > 0
              ? `${pluralize(sub.overdueCount, 'fatura vencida', 'faturas vencidas')} · ${pluralize(sub.daysLate, 'dia', 'dias')} de atraso`
              : sub.openAmount > 0
                ? 'Dentro do prazo'
                : 'Nada em aberto'
          }
          tone={sub.daysLate > 0 ? 'down' : 'neutral'}
        />
        <StatCard
          icon={CalendarClock}
          accent="success"
          value={sub.nextDueDate ? formatDateBR(sub.nextDueDate) : '—'}
          label="Próximo vencimento"
          hint={
            sub.currentPeriodStart && sub.currentPeriodEnd
              ? `Período de ${formatDateBR(sub.currentPeriodStart)} a ${formatDateBR(sub.currentPeriodEnd)} · vence todo dia ${sub.dueDay}`
              : `Vence todo dia ${sub.dueDay}`
          }
        />
      </div>

      {/* ------------------------------------------------------ régua ao vivo */}
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Situação da cobrança</CardTitle>
          <CardDescription>
            {sub.oldestOpenDueDate
              ? `A fatura em aberto mais antiga ${sub.daysLate > 0 ? 'venceu' : 'vence'} em ${formatDateBR(sub.oldestOpenDueDate)}${
                  sub.daysLate > 0 ? ` (${pluralize(sub.daysLate, 'dia', 'dias')} de atraso)` : ''
                }.`
              : 'Nenhuma fatura em aberto: não há nada a cobrar agora.'}
            {sub.access.source === 'override' ? ' O acesso foi definido manualmente pela equipe e vale mais que as regras de cobrança.' : ''}
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={runAutomation}
              disabled={running}
              title="Roda agora as regras de cobrança para todos os clubes"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Executar automação
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusFlow sub={sub} />
          {settings && <DunningLadder settings={settings} highlightDay={highlightDay} />}
          {demoTools && <DemoTimeTravel sub={sub} isSuperadmin={isSuperadmin} onChanged={update} />}
          {sub.cancelReason && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">Motivo do cancelamento: {sub.cancelReason}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="gap-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Faturas</CardTitle>
            <CardDescription>Ativação e mensalidades deste clube.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ChargesTab
              canSimulate={canSimulate}
              defaultDueDays={settings?.boletoDueDays}
              subscriptionId={sub.id}
              version={chargesVersion}
              onChanged={onReload}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="gap-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Cobrança</CardTitle>
              <CardDescription>Dados de cobrança do clube.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
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
                    <FileSearch className="h-3.5 w-3.5" />
                    Ver a aprovação do clube
                  </Link>
                </Field>
              )}
            </CardContent>
          </Card>

          <Card className="gap-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Histórico do clube</CardTitle>
              <CardDescription>
                {pluralize(sub.events.length, 'evento', 'eventos')}, do mais recente para o mais antigo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformEventsTimeline events={[...sub.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} />
            </CardContent>
          </Card>
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
    </div>
  )
}
