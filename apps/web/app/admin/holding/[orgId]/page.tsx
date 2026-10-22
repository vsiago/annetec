'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BellOff,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  Landmark,
  Receipt,
  ScrollText,
  Settings2,
  Store,
  UserMinus,
} from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  formatDateBR,
  type HoldingTenantDetail,
  type PlatformSubscription,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertItem } from '@/components/holding/alerts-feed'
import { AuditTable } from '@/components/holding/audit-table'
import { FlowChart, GmvChart, PlatformRevenueChart } from '@/components/holding/holding-charts'
import { HEALTH_FORMULA, HealthBreakdown } from '@/components/holding/health'
import {
  AccessBadge,
  EmptyNote,
  FormulaHint,
  HealthScore,
  HoldingToolbar,
  KpiTile,
  ManagedBadge,
  SectionError,
  SoftBadge,
  TrendDelta,
  UsageMeter,
} from '@/components/holding/holding-ui'
import { LifecyclePanel } from '@/components/holding/lifecycle-panel'
import { useResource } from '@/components/holding/use-resource'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { getHoldingTenantAction } from '@/lib/actions/holding-api'
import {
  HOLDING_DEFAULT_MONTHS,
  TENANT_STATUS_LABELS,
  formatBRL,
  formatDateTimeBR,
  formatInt,
  formatPct,
  formatPp,
  tenantAgeDays,
} from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'

/**
 * Drill-down de um inquilino na holding (§Q5): KPIs, séries mensais, fatores
 * da nota, alertas, assinatura de plataforma, controles de ciclo de vida
 * (superadmin; desabilitados com explicação para quem está fora da cobrança
 * automática) e a auditoria recente.
 */
export default function HoldingTenantPage() {
  const params = useParams<{ orgId: string }>()
  const orgId = params.orgId
  const { user } = usePlatformAuth()
  const canOperate = user?.platformRole === 'superadmin'

  const [meses, setMeses] = useState<number>(HOLDING_DEFAULT_MONTHS)
  const [refreshing, setRefreshing] = useState(false)
  const [detail, loadDetail, replaceDetail] = useResource<HoldingTenantDetail>()

  const fetchDetail = useCallback(
    (fresh?: boolean) => loadDetail(() => getHoldingTenantAction(orgId, { meses, fresh })),
    [loadDetail, orgId, meses],
  )

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  const refresh = async () => {
    setRefreshing(true)
    await fetchDetail(true)
    setRefreshing(false)
  }

  // Ao trocar de inquilino, o dado do anterior não aparece enquanto o novo carrega.
  const isOtherTenant = detail.data !== null && detail.data.tenant.organizationId !== orgId
  const data = isOtherTenant && detail.loading ? null : detail.data
  const row = data?.tenant
  const subscription = data?.subscription ?? null

  return (
    <div className="space-y-6">
      <Link
        href="/admin/holding"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Holding
      </Link>

      {!data && detail.error ? (
        <SectionError title="Não foi possível abrir o inquilino" message={detail.error} onRetry={() => fetchDetail()} />
      ) : !data || !row ? (
        <DetailSkeleton />
      ) : (
        <div className={cn('space-y-6', detail.loading && 'opacity-60 transition-opacity')}>
          {detail.error && (
            <SectionError title="Não foi possível atualizar" message={detail.error} onRetry={() => fetchDetail()} />
          )}

          {/* Cabeçalho */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold text-foreground">{row.name}</h1>
                <span className="font-mono text-sm text-muted-foreground">/{row.slug}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SoftBadge tone={row.tenantStatus === 'active' ? 'positive' : row.tenantStatus === 'trial' ? 'info' : 'danger'}>
                  Cadastro: {TENANT_STATUS_LABELS[row.tenantStatus]}
                </SoftBadge>
                <ManagedBadge managed={row.managed} />
                <AccessBadge level={row.access} override={subscription?.access.source === 'override'} />
                {row.platformStatus && (
                  <SoftBadge
                    tone={row.platformStatus === 'active' ? 'positive' : row.platformStatus === 'past_due' ? 'warning' : 'danger'}
                  >
                    Assinatura: {PLATFORM_SUBSCRIPTION_STATUS_LABELS[row.platformStatus]}
                  </SoftBadge>
                )}
                <span className="text-xs text-muted-foreground">
                  Na plataforma há {formatInt(tenantAgeDays(row.createdAt))} dias
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <QuickLink href={`/admin/inquilinos/${row.organizationId}`} icon={Settings2}>
                  Cadastro do inquilino
                </QuickLink>
                <QuickLink href={`/${row.slug}`} icon={ExternalLink} external>
                  Vitrine
                </QuickLink>
                {subscription && (
                  <QuickLink href={`/admin/financeiro/assinaturas/${subscription.id}`} icon={Receipt}>
                    Assinatura no Financeiro
                  </QuickLink>
                )}
                {data.proposalId && (
                  <QuickLink href={`/admin/compliance/${data.proposalId}`} icon={FileCheck2}>
                    Proposta de contratação
                  </QuickLink>
                )}
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <HealthScore score={row.healthScore} band={row.healthBand} size="lg" />
              <HoldingToolbar meses={meses} onMesesChange={setMeses} onRefresh={refresh} refreshing={refreshing} />
            </div>
          </div>

          {/* Destaques */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Vidas"
              icon={HeartPulse}
              value={formatInt(row.lives)}
              delta={
                <span className="text-xs text-muted-foreground">
                  de {row.memberLimit === null ? 'sem limite' : formatInt(row.memberLimit)}
                </span>
              }
              formula="Titulares + dependentes de assinaturas do clube ativas ou em atraso. Limite = limite de vidas do plano da plataforma (retrato da assinatura) ou do plano de tabela."
            >
              <UsageMeter usagePct={row.usagePct} />
              <p>
                {formatPct(row.usagePct)} do limite{row.planName ? ` · plano ${row.planName}` : ''}
              </p>
            </KpiTile>

            <KpiTile
              label="Receita para a ANNETEC/mês"
              icon={Landmark}
              value={row.managed ? formatBRL(row.platformMrr) : '—'}
              formula="Mensalidade estimada agora pela cotação do plano com as vidas atuais (plano + vidas excedentes). Em aberto = faturas pendentes, vencidas ou com falha."
            >
              {row.managed ? (
                <>
                  <p className={cn(row.platformDaysLate > 0 && 'font-medium text-red-700')}>
                    {row.platformOpenAmount > 0
                      ? `${formatBRL(row.platformOpenAmount)} em aberto${
                          row.platformDaysLate > 0 ? ` · ${row.platformDaysLate} dias de atraso` : ''
                        }`
                      : 'Nada em aberto'}
                  </p>
                  {subscription?.nextDueDate && <p>Próximo vencimento: {formatDateBR(subscription.nextDueDate)}</p>}
                </>
              ) : (
                <p>Fora da cobrança automática (contrato sem assinatura de plataforma)</p>
              )}
            </KpiTile>

            <KpiTile
              label="GMV dos últimos 30 dias"
              icon={Store}
              value={formatBRL(row.gmvLast30)}
              delta={<TrendDelta value={row.salesTrendPct} suffix="vs 30 dias antes" />}
              formula="Σ valor pago das cobranças dos associados deste clube nos últimos 30 dias, comparado com os 30 dias anteriores. Recorrência = Σ mensalidade das assinaturas de associados ativas ou em atraso."
            >
              <p>30 dias anteriores: {formatBRL(row.gmvPrev30)}</p>
              <p>Recorrência do clube: {formatBRL(row.clubMrr)}/mês</p>
            </KpiTile>

            <KpiTile
              label="Inadimplência dos associados"
              icon={UserMinus}
              value={formatPct(row.memberDelinquencyRate)}
              delta={
                <TrendDelta
                  value={Number((row.memberDelinquencyRate - row.memberDelinquencyRatePrev).toFixed(1))}
                  goodWhen="down"
                  format={formatPp}
                  suffix="em 30 dias"
                />
              }
              formula="Σ vencido em aberto ÷ Σ faturado com vencimento nos últimos 90 dias × 100. A comparação usa a mesma conta avaliada 30 dias atrás."
            >
              <p>Há 30 dias: {formatPct(row.memberDelinquencyRatePrev)}</p>
              <p>
                {formatInt(row.newMembersLast30)} {row.newMembersLast30 === 1 ? 'associado novo' : 'associados novos'} em 30 dias
              </p>
            </KpiTile>
          </div>

          {/* Séries */}
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <GmvChart data={data.monthly} title="GMV do clube" />
            <FlowChart data={data.monthly} />
            <PlatformRevenueChart
              data={data.monthly}
              title="Faturas da ANNETEC"
              emptyText={
                row.managed
                  ? 'Nenhuma fatura da plataforma no período.'
                  : 'Fora da cobrança automática: a ANNETEC não emite faturas para este inquilino pela plataforma.'
              }
            />
          </div>

          {/* Nota e alertas */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="gap-4 border-0 shadow-sm lg:col-span-3">
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">Por que a nota é {row.healthScore}</CardTitle>
                  <FormulaHint>{HEALTH_FORMULA}</FormulaHint>
                </div>
                <CardDescription className="text-xs">Cada componente, quanto descontou e por quê</CardDescription>
              </CardHeader>
              <CardContent>
                <HealthBreakdown row={row} />
              </CardContent>
            </Card>

            <Card className="gap-3 border-0 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Alertas</CardTitle>
                <CardDescription className="text-xs">O que pede ação neste inquilino</CardDescription>
              </CardHeader>
              <CardContent>
                {data.alerts.length === 0 ? (
                  <EmptyNote icon={BellOff}>Nenhum alerta para este inquilino.</EmptyNote>
                ) : (
                  <ul className="divide-y">
                    {data.alerts.map(alert => (
                      <AlertItem key={alert.id} alert={alert} showTenant={false} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Assinatura e ciclo de vida */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SubscriptionCard subscription={subscription} planName={row.planName} memberLimit={row.memberLimit} />
            <LifecyclePanel detail={data} canOperate={canOperate} onChanged={replaceDetail} />
          </div>

          {/* Auditoria */}
          <Card className="gap-4 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Auditoria recente</CardTitle>
              <CardDescription className="text-xs">Quem fez o quê neste inquilino — motivos incluídos</CardDescription>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/holding/auditoria?organizationId=${encodeURIComponent(row.organizationId)}`}>
                    <ScrollText className="h-4 w-4" />
                    Trilha completa
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.recentAudit.length === 0 ? (
                <EmptyNote icon={ScrollText}>Nenhum registro de auditoria para este inquilino.</EmptyNote>
              ) : (
                <AuditTable entries={data.recentAudit} showTenant={false} showIp={false} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function QuickLink({
  href,
  icon: Icon,
  external,
  children,
}: {
  href: string
  icon: typeof ArrowRight
  external?: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  )
}

function SubscriptionCard({
  subscription,
  planName,
  memberLimit,
}: {
  subscription: PlatformSubscription | null
  planName: string | null
  memberLimit: number | null
}) {
  if (!subscription) {
    return (
      <Card className="gap-4 border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Assinatura de plataforma</CardTitle>
          <CardDescription className="text-xs">Contrato fora da cobrança automática</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Este inquilino não tem assinatura de plataforma: não recebe faturas automáticas da ANNETEC e nunca é
            restringido pela régua. Os números da holding continuam valendo para acompanhamento.
          </p>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Plano de tabela">{planName ?? '—'}</Field>
            <Field label="Limite de vidas">{memberLimit === null ? '—' : formatInt(memberLimit)}</Field>
          </dl>
        </CardContent>
      </Card>
    )
  }

  const steps = [
    { label: 'Em atraso desde', value: subscription.pastDueAt },
    { label: 'Restrita desde', value: subscription.restrictedAt },
    { label: 'Suspensa desde', value: subscription.suspendedAt },
    { label: 'Cancelada em', value: subscription.canceledAt },
  ].filter(step => step.value)

  return (
    <Card className="gap-4 border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Assinatura de plataforma</CardTitle>
        <CardDescription className="text-xs">
          {PLATFORM_SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          {subscription.startedAt ? ` · desde ${formatDateBR(subscription.startedAt)}` : ''}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/financeiro/assinaturas/${subscription.id}`}>
              Financeiro <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Plano">
            {subscription.planName}
            {subscription.scheduledPlanName && (
              <span className="block text-xs text-muted-foreground">troca agendada: {subscription.scheduledPlanName}</span>
            )}
          </Field>
          <Field label="Mensalidade do plano">{formatBRL(subscription.planPriceMonthly)}</Field>
          <Field label="Mensal estimado agora">{formatBRL(subscription.estimatedMonthly)}</Field>
          <Field label="Limite de vidas">
            {formatInt(subscription.memberLimit)}
            <span className="block text-xs text-muted-foreground">
              excedente {formatBRL(subscription.pricePerExtraLife)}/vida
            </span>
          </Field>
          <Field label="Uso agora">
            {formatInt(subscription.lives)} vidas · {formatPct(subscription.usagePct)}
          </Field>
          <Field label="Participação na receita">{formatPct(subscription.revenueSharePercent)}</Field>
          <Field label="Pagamento">
            {CLUB_PAYMENT_METHOD_LABELS[subscription.paymentMethod]} · dia {subscription.dueDay}
          </Field>
          <Field label="Próximo vencimento">{subscription.nextDueDate ? formatDateBR(subscription.nextDueDate) : '—'}</Field>
          <Field label="Período atual">
            {subscription.currentPeriodStart && subscription.currentPeriodEnd
              ? `${formatDateBR(subscription.currentPeriodStart)} a ${formatDateBR(subscription.currentPeriodEnd)}`
              : '—'}
          </Field>
          <Field label="Em aberto">
            <span className={cn(subscription.daysLate > 0 && 'font-medium text-red-700')}>
              {formatBRL(subscription.openAmount)}
            </span>
            {subscription.overdueCount > 0 && (
              <span className="block text-xs text-muted-foreground">
                {formatInt(subscription.overdueCount)} vencida(s) · {subscription.daysLate} dias de atraso
              </span>
            )}
          </Field>
          <Field label="Adesão">{formatBRL(subscription.setupFee)}</Field>
          <Field label="Faturamento">{subscription.billingName}</Field>
        </dl>
        {steps.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            {steps.map(step => (
              <span key={step.label}>
                {step.label}: <span className="text-foreground">{formatDateTimeBR(step.value)}</span>
              </span>
            ))}
            {subscription.cancelReason && <span>Motivo do cancelamento: {subscription.cancelReason}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
