'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  Repeat,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  CARD_BRAND_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  PLATFORM_ACCESS_LEVEL_LABELS,
  PLATFORM_CHARGE_KIND_LABELS,
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  formatBRL,
  formatDateBR,
  reissuePlatformChargeInput,
  type MyPlatformSubscription,
  type PlatformCharge,
} from '@annetec/contracts'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { safeAction, usePolling } from '@/components/contratar/hooks'
import { ActionError, ChoiceCard, Notice, Pill, TextField } from '@/components/contratar/ui'
import { useTenant } from '@/contexts/tenant-context'
import {
  changeMyPlatformPlanAction,
  getMyPlatformSubscriptionAction,
  reissueMyPlatformChargeAction,
} from '@/lib/actions/assinatura-annetec-api'
import { formatCnpj, formatNumber, todayInSaoPaulo, validate } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { tenantInvoicePath } from './access-gate'
import { ChargeStatusPill } from './charge-ui'
import { ManagedDebitNotice } from './managed-debit-notice'

type UpgradeOption = MyPlatformSubscription['upgradeOptions'][number]

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof Users; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-5 shadow-sm', className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="size-4 text-primary" aria-hidden />
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function UsageMeter({ lives, limit, pct }: { lives: number; limit: number; pct: number }) {
  const width = Math.min(100, Math.max(0, pct))
  const tone = pct > 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          {formatNumber(lives)}
          <span className="text-base font-semibold text-muted-foreground"> / {formatNumber(limit)} vidas</span>
        </p>
        <span className="text-sm font-semibold text-foreground">{pct.toLocaleString('pt-BR')}%</span>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={lives}
        aria-label="Vidas ativas em relação ao limite do plano"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700', tone)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function ReissueDialog({
  charge,
  slug,
  onClose,
  onDone,
}: {
  charge: PlatformCharge | null
  slug: string
  onClose: () => void
  onDone: (charge: PlatformCharge) => void
}) {
  const [dueDate, setDueDate] = useState('')
  const [method, setMethod] = useState<'pix' | 'boleto' | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDueDate('')
    setMethod(charge && (charge.method === 'pix' || charge.method === 'boleto') ? charge.method : 'pix')
    setError(null)
  }, [charge])

  async function submit() {
    if (!charge) return
    const parsed = validate(reissuePlatformChargeInput, { dueDate: dueDate || undefined, method: method || undefined })
    if (!parsed.ok) {
      setError(Object.values(parsed.errors)[0] ?? 'Confira os dados')
      return
    }
    if (dueDate && dueDate < todayInSaoPaulo()) {
      setError('O novo vencimento não pode ser no passado')
      return
    }
    setBusy(true)
    const result = await safeAction(() => reissueMyPlatformChargeAction(slug, charge.id, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onDone(result.data)
  }

  return (
    <Dialog open={charge !== null} onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Segunda via da fatura</DialogTitle>
          <DialogDescription>
            {charge ? `${charge.description} · ${formatBRL(charge.amount)}` : ''}. A via anterior é cancelada e uma nova é
            emitida.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Forma de pagamento da nova via" className="grid grid-cols-2 gap-2">
            {(['pix', 'boleto'] as const).map(option => (
              <ChoiceCard
                key={option}
                selected={method === option}
                onSelect={() => setMethod(option)}
                title={CLUB_PAYMENT_METHOD_LABELS[option]}
                className="p-3"
              />
            ))}
          </div>
          <TextField
            label="Novo vencimento"
            type="date"
            optional
            min={todayInSaoPaulo()}
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
            hint="Em branco, usamos o prazo padrão da régua."
          />
          <ActionError message={error} />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Repeat className="size-4" aria-hidden />}
            Emitir segunda via
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanChangeDialog({
  option,
  current,
  slug,
  onClose,
  onDone,
}: {
  option: UpgradeOption | null
  current: MyPlatformSubscription
  slug: string
  onClose: () => void
  onDone: (data: MyPlatformSubscription) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [option])
  if (!option) return null
  const now = current.currentQuote?.monthlyTotal ?? 0
  const diff = option.quote.monthlyTotal - now

  async function confirm() {
    if (!option) return
    setBusy(true)
    const result = await safeAction(() => changeMyPlatformPlanAction(slug, { planId: option.plan.id }))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onDone(result.data)
  }

  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{option.isUpgrade ? `Upgrade para o plano ${option.plan.name}` : `Trocar para o plano ${option.plan.name}`}</DialogTitle>
          <DialogDescription>
            {option.isUpgrade
              ? 'Vale na hora: o limite de vidas aumenta agora e a diferença proporcional dos dias restantes entra na próxima fatura.'
              : 'A troca fica agendada para a virada do ciclo; até lá, o plano atual continua valendo.'}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Mensal estimado hoje</dt>
            <dd className="tabular-nums">{formatBRL(now)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Com o plano {option.plan.name}</dt>
            <dd className="font-semibold tabular-nums">{formatBRL(option.quote.monthlyTotal)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2">
            <dt className="text-muted-foreground">Diferença por mês</dt>
            <dd className={cn('font-semibold tabular-nums', diff > 0 ? 'text-foreground' : 'text-emerald-700')}>
              {diff > 0 ? '+' : ''}
              {formatBRL(diff)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Limite de vidas</dt>
            <dd className="tabular-nums">{formatNumber(option.plan.memberLimit)}</dd>
          </div>
        </dl>
        <ActionError message={error} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {option.isUpgrade ? 'Confirmar upgrade' : 'Agendar troca'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Assinatura da plataforma" — o inquilino vê, paga e ajusta a assinatura da plataforma. */
export function MyPlatformSubscriptionView() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const router = useRouter()
  const [data, setData] = useState<MyPlatformSubscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reissuing, setReissuing] = useState<PlatformCharge | null>(null)
  const [changing, setChanging] = useState<UpgradeOption | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!slug) return
      if (!silent) setLoading(true)
      const result = await safeAction(() => getMyPlatformSubscriptionAction(slug))
      if (result.success) {
        setData(result.data)
        setError(null)
      } else if (!silent) {
        setError(result.error)
      }
      if (!silent) setLoading(false)
    },
    [slug],
  )

  useEffect(() => {
    void load()
  }, [load])

  usePolling(() => load(true), 30_000, Boolean(data?.managed))

  const header = (
    <PageHeader
      title="Assinatura da plataforma"
      description="Plano da plataforma, uso de vidas, faturas e forma de pagamento do seu clube."
    >
      <Button variant="outline" className="h-11 gap-2" onClick={() => void load()} disabled={!slug || loading}>
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden />
        Atualizar
      </Button>
    </PageHeader>
  )

  if (loading && !data) {
    return (
      <div className="space-y-5">
        {header}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando assinatura">
          {[0, 1, 2, 3].map(key => (
            <Skeleton key={key} className="h-40 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-5">
        {header}
        <Notice
          tone="error"
          title="Não foi possível carregar a sua assinatura."
          action={
            <Button type="button" variant="outline" size="sm" className="bg-background text-foreground" onClick={() => void load()}>
              Tentar de novo
            </Button>
          }
        >
          {error}
        </Notice>
      </div>
    )
  }

  if (!data.managed || !data.subscription) {
    return (
      <div className="space-y-5">
        {header}
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
              <FileText className="size-6" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-foreground">Contrato fora da cobrança automática</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                O contrato do seu clube com a plataforma é faturado fora da cobrança automática da plataforma, por isso não há
                faturas nem plano para gerenciar aqui. O painel funciona normalmente. Para dúvidas sobre valores ou para mudar
                de plano, fale com o seu gerente de conta da plataforma.
              </p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const { subscription, access, usage, currentQuote, nextCharge, openCharges, recentCharges, upgradeOptions } = data
  const canChangePlan = access.level === 'full'
  const statusTone =
    subscription.status === 'active' ? 'success' : subscription.status === 'past_due' ? 'warning' : 'danger'

  return (
    <div className="space-y-5">
      {header}

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={statusTone}>{PLATFORM_SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Pill>
        <Pill tone={access.level === 'full' ? 'neutral' : access.level === 'read_only' ? 'warning' : 'danger'}>
          {access.level !== 'full' ? <Lock className="size-3" aria-hidden /> : null}
          Painel: {PLATFORM_ACCESS_LEVEL_LABELS[access.level]}
        </Pill>
        {subscription.startedAt ? (
          <span className="text-xs text-muted-foreground">Assinante desde {formatDateBR(subscription.startedAt)}</span>
        ) : null}
      </div>

      {access.message ? (
        <Notice
          tone={access.level === 'full' ? 'warning' : 'error'}
          title={access.level === 'blocked' ? 'Painel suspenso' : access.level === 'read_only' ? 'Painel em somente leitura' : 'Fatura em atraso'}
          action={
            access.payChargeId ? (
              <Button asChild size="sm" className="rounded-lg">
                <Link href={tenantInvoicePath(slug, access.payChargeId)}>Pagar agora</Link>
              </Button>
            ) : null
          }
        >
          {access.message}
        </Notice>
      ) : null}

      <ManagedDebitNotice slug={slug} data={data} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Plano" icon={Sparkles}>
          <p className="font-display text-2xl font-extrabold tracking-tight text-foreground">{subscription.planName}</p>
          <p className="text-sm text-muted-foreground">{formatBRL(subscription.planPriceMonthly)}/mês · até {formatNumber(subscription.memberLimit)} vidas</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Vida extra: {subscription.pricePerExtraLife > 0 ? formatBRL(subscription.pricePerExtraLife) : 'sem cobrança'}
          </p>
          {subscription.scheduledPlanName ? (
            <p className="mt-2 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[12px] text-sky-900 dark:bg-sky-500/10 dark:text-sky-100">
              Troca para {subscription.scheduledPlanName} agendada para{' '}
              {subscription.currentPeriodEnd ? formatDateBR(subscription.currentPeriodEnd) : 'o próximo ciclo'}.
            </p>
          ) : null}
        </Card>

        <Card title="Uso de vidas" icon={Users}>
          {usage ? (
            <>
              <UsageMeter lives={usage.lives} limit={usage.memberLimit} pct={usage.usagePct} />
              <p className="mt-2 text-[13px] text-muted-foreground">
                {usage.extraLives > 0
                  ? `${formatNumber(usage.extraLives)} acima do limite: +${formatBRL(usage.projectedOverage)} projetados na próxima fatura.`
                  : 'Dentro do limite do plano. Vidas = titulares + dependentes ativos.'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados de uso ainda.</p>
          )}
        </Card>

        <Card title="Próxima fatura" icon={CalendarClock}>
          {nextCharge ? (
            <>
              <p className="font-display text-2xl font-extrabold tracking-tight text-foreground">{formatBRL(nextCharge.amount)}</p>
              <p className="text-sm text-muted-foreground">Vence em {formatDateBR(nextCharge.dueDate)}</p>
              <div className="mt-2 flex items-center gap-2">
                <ChargeStatusPill status={nextCharge.status} />
                <Link href={tenantInvoicePath(slug, nextCharge.id)} className="text-[13px] font-medium text-primary hover:underline">
                  Abrir fatura
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-extrabold tracking-tight text-foreground">
                {formatBRL(currentQuote?.monthlyTotal ?? subscription.estimatedMonthly)}
              </p>
              <p className="text-sm text-muted-foreground">
                {subscription.nextDueDate ? `Estimada para ${formatDateBR(subscription.nextDueDate)}` : 'Gerada antes do vencimento'}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">Valor final calculado com as vidas ativas na geração.</p>
            </>
          )}
        </Card>

        <Card title="Forma de pagamento" icon={CreditCard}>
          <p className="text-lg font-semibold text-foreground">{CLUB_PAYMENT_METHOD_LABELS[subscription.paymentMethod]}</p>
          {subscription.paymentCard ? (
            <p className="text-sm text-muted-foreground">
              {CARD_BRAND_LABELS[subscription.paymentCard.brand]} final {subscription.paymentCard.last4}
              {subscription.paymentCard.expiry ? ` · validade ${subscription.paymentCard.expiry}` : ''}
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-muted-foreground">
            Vencimento todo dia {subscription.dueDay}. Na página de cada fatura você pode pagar por outra forma.
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {subscription.billingName} · CNPJ {formatCnpj(subscription.billingDocument)} · {subscription.billingEmail}
          </p>
        </Card>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Receipt className="size-4 text-primary" aria-hidden />
            Faturas em aberto
          </h2>
          {subscription.openAmount > 0 ? (
            <span className="text-sm text-muted-foreground">Total em aberto: {formatBRL(subscription.openAmount)}</span>
          ) : null}
        </div>
        {openCharges.length ? (
          <ul className="mt-4 divide-y">
            {openCharges.map(charge => (
              <li key={charge.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{charge.description}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {PLATFORM_CHARGE_KIND_LABELS[charge.kind]} · vence {formatDateBR(charge.dueDate)} · {CLUB_PAYMENT_METHOD_LABELS[charge.method]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-foreground">{formatBRL(charge.amount)}</span>
                  <ChargeStatusPill status={charge.status} />
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="h-9 rounded-lg">
                    <Link href={tenantInvoicePath(slug, charge.id)}>Pagar</Link>
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => setReissuing(charge)}>
                    2ª via
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma fatura em aberto. Tudo em dia!</p>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <FileText className="size-4 text-primary" aria-hidden />
          Histórico de faturas
        </h2>
        {recentCharges.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-2 font-semibold">Descrição</th>
                  <th scope="col" className="py-2 font-semibold">Vencimento</th>
                  <th scope="col" className="py-2 text-right font-semibold">Valor</th>
                  <th scope="col" className="py-2 pl-3 font-semibold">Situação</th>
                  <th scope="col" className="py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {recentCharges.map(charge => (
                  <tr key={charge.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="block text-foreground">{charge.description}</span>
                      {charge.livesCount !== null ? (
                        <span className="text-[12px] text-muted-foreground">{formatNumber(charge.livesCount)} vidas apuradas</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 tabular-nums text-foreground/85">{formatDateBR(charge.dueDate)}</td>
                    <td className="py-2.5 text-right tabular-nums text-foreground">{formatBRL(charge.amount)}</td>
                    <td className="py-2.5 pl-3">
                      <ChargeStatusPill status={charge.status} />
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={tenantInvoicePath(slug, charge.id)}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
                      >
                        {charge.status === 'paid' ? 'Comprovante' : 'Ver'}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">As faturas aparecem aqui a partir da ativação.</p>
        )}
      </section>

      {upgradeOptions.length ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              Planos da plataforma
            </h2>
            <span className="text-[13px] text-muted-foreground">
              Valores para as {formatNumber(usage?.lives ?? subscription.lives)} vidas ativas de hoje
            </span>
          </div>
          {!canChangePlan ? (
            <Notice tone="warning" className="mt-3">
              A troca de plano fica disponível quando as faturas em atraso forem regularizadas.
            </Notice>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upgradeOptions.map(option => (
              <div
                key={option.plan.id}
                className={cn('flex flex-col rounded-2xl border p-4', option.isCurrent ? 'border-primary bg-primary/5' : 'bg-background')}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{option.plan.name}</p>
                  {option.isCurrent ? <Pill tone="brand">Plano atual</Pill> : option.isUpgrade ? <Pill tone="info">Upgrade</Pill> : null}
                </div>
                <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-foreground">
                  {formatBRL(option.quote.monthlyTotal)}
                  <span className="text-sm font-medium text-muted-foreground">/mês</span>
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Até {formatNumber(option.plan.memberLimit)} vidas
                  {option.quote.extraLives > 0 ? ` · ${formatNumber(option.quote.extraLives)} excedentes` : ''}
                </p>
                {!option.isCurrent ? (
                  <Button
                    type="button"
                    variant={option.isUpgrade ? 'default' : 'outline'}
                    className="mt-4 h-10 rounded-xl"
                    disabled={!canChangePlan || subscription.scheduledPlanId === option.plan.id}
                    onClick={() => setChanging(option)}
                  >
                    {subscription.scheduledPlanId === option.plan.id
                      ? 'Troca agendada'
                      : option.isUpgrade
                        ? 'Fazer upgrade'
                        : 'Agendar troca'}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ReissueDialog
        charge={reissuing}
        slug={slug}
        onClose={() => setReissuing(null)}
        onDone={charge => {
          setReissuing(null)
          toast.success('Segunda via emitida', {
            description: `Vencimento ${formatDateBR(charge.dueDate)}.`,
            action: { label: 'Abrir', onClick: () => router.push(tenantInvoicePath(slug, charge.id)) },
          })
          void load(true)
        }}
      />
      <PlanChangeDialog
        option={changing}
        current={data}
        slug={slug}
        onClose={() => setChanging(null)}
        onDone={next => {
          setChanging(null)
          setData(next)
          toast.success(next.subscription?.scheduledPlanName ? 'Troca de plano agendada' : 'Plano atualizado')
        }}
      />
    </div>
  )
}
