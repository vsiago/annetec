'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlaskConical, Landmark, RefreshCw } from 'lucide-react'
import type { BillingSummary, ClubChargeStatus } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { AutomationPanel } from '@/components/admin/faturamento/automation-panel'
import { GatewayBadge, LoadError, MetricTile } from '@/components/admin/faturamento/billing-ui'
import { ChargesTab } from '@/components/admin/faturamento/charges-tab'
import { OverviewTab } from '@/components/admin/faturamento/overview-tab'
import { ReceivingAccountPanel } from '@/components/admin/faturamento/receiving-account-panel'
import { SubscriptionsTab } from '@/components/admin/faturamento/subscriptions-tab'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { getBillingSettingsAction, getBillingSummaryAction } from '@/lib/actions/faturamento-api'
import {
  canSimulatePayments,
  CHARGE_STATUS_OPTIONS,
  delinquencyPercent,
  formatBRL,
  formatCount,
  formatPercent,
  formatRelative,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'

type TabKey = 'cobrancas' | 'assinaturas' | 'automacao' | 'recebimento' | 'visao-geral'

const TAB_KEYS: TabKey[] = ['cobrancas', 'assinaturas', 'automacao', 'recebimento', 'visao-geral']

/** A tela abre direto nas cobranças; `?tab=` dos links antigos continua valendo. */
function parseTab(value: string | null): TabKey {
  return TAB_KEYS.includes(value as TabKey) ? (value as TabKey) : 'cobrancas'
}

function parseChargeStatus(value: string | null): ClubChargeStatus | undefined {
  return CHARGE_STATUS_OPTIONS.some(option => option.value === value) ? (value as ClubChargeStatus) : undefined
}

/** Atualiza sozinho enquanto a aba está visível — o Pix pago aparece sem F5. */
const AUTO_REFRESH_MS = 30_000

export default function FaturamentoPage() {
  // `useSearchParams` precisa de Suspense acima dele no App Router.
  return (
    <Suspense fallback={null}>
      <FaturamentoContent />
    </Suspense>
  )
}

function FaturamentoContent() {
  const { tenant } = useTenant()
  const { clientPlans } = useTenantData()
  const params = useSearchParams()
  const slug = tenant?.slug ?? ''

  const [tab, setTabState] = useState<TabKey>(() => parseTab(params.get('tab')))

  // A aba vive na URL (sem recarregar): o menu lateral sabe se a pessoa está
  // em "Conta de recebimento", e um link `?tab=` vale mesmo já estando na tela.
  const setTab = useCallback((next: TabKey) => {
    setTabState(next)
    try {
      const url = new URL(window.location.href)
      if (next === 'cobrancas') url.searchParams.delete('tab')
      else url.searchParams.set('tab', next)
      window.history.replaceState(null, '', url.toString())
    } catch {
      // Sem histórico (ambiente restrito): a aba continua valendo só na tela.
    }
  }, [])
  const tabParam = params.get('tab')
  useEffect(() => {
    setTabState(parseTab(tabParam))
  }, [tabParam])
  const [chargeStatus, setChargeStatus] = useState<ClubChargeStatus | undefined>(() =>
    parseChargeStatus(params.get('status')),
  )
  const [subscriptionFilter, setSubscriptionFilter] = useState<{ id: string; name?: string } | null>(() => {
    const id = params.get('assinatura')
    return id ? { id, name: params.get('nome') ?? undefined } : null
  })
  const [openChargeId, setOpenChargeId] = useState<string | null>(() => params.get('cobranca'))
  const [openSubscriptionId, setOpenSubscriptionId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const summary = useActionData(slug ? () => getBillingSummaryAction(slug) : null, [slug])
  const settings = useActionData(slug ? () => getBillingSettingsAction(slug) : null, [slug])
  const reloadSummary = summary.reload

  const refresh = useCallback(() => {
    setVersion(value => value + 1)
    void reloadSummary({ silent: true })
  }, [reloadSummary])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const gateway = summary.data?.gateway ?? settings.data?.gateway
  const sandbox = summary.data?.sandbox ?? settings.data?.sandbox ?? false
  const canSimulate = canSimulatePayments(gateway, sandbox)
  const plans = useMemo(() => clientPlans.map(plan => ({ id: plan.id, name: plan.name })), [clientPlans])

  const clearOpenCharge = useCallback(() => setOpenChargeId(null), [])
  const clearOpenSubscription = useCallback(() => setOpenSubscriptionId(null), [])

  function goTo(next: TabKey, status?: ClubChargeStatus) {
    if (next === 'cobrancas') setChargeStatus(status)
    setTab(next)
  }

  const lastRunAt = summary.data?.lastAutomationRunAt ?? settings.data?.automation.lastRunAt ?? null
  const automationEnabled = settings.data?.automation.enabled ?? true
  // Gateway Asaas sem conta própria conectada: a API recusa adesão e cobrança.
  const receivingMissing = settings.data ? settings.data.gateway === 'asaas' && !settings.data.asaasConfigured : false
  const reloadSettings = settings.reload

  return (
    <div className="space-y-5">
      <PageHeader title="Faturamento" description="Cobranças e assinaturas do clube.">
        {/* O selo só aparece fora da produção — é ali que ele muda alguma coisa. */}
        {gateway && (gateway === 'simulated' || sandbox) && <GatewayBadge provider={gateway} sandbox={sandbox} />}
        <Button variant="outline" className="h-10 gap-2" onClick={refresh} disabled={!slug}>
          <RefreshCw className={cn('h-4 w-4', summary.loading && 'animate-spin')} />
          Atualizar
        </Button>
      </PageHeader>

      {gateway === 'simulated' && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <FlaskConical className="h-4 w-4 shrink-0" />
          Modo demonstração: nenhum dinheiro real circula.
        </p>
      )}

      {receivingMissing && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:flex-row sm:items-center dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="flex flex-1 items-start gap-2">
            <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
            Conecte a conta Asaas do clube: sem ela, novas adesões e cobranças ficam bloqueadas.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start border-amber-300 bg-transparent hover:bg-amber-100 sm:self-auto dark:border-amber-500/40 dark:hover:bg-amber-500/20"
            onClick={() => setTab('recebimento')}
          >
            Conectar agora
          </Button>
        </div>
      )}

      {summary.error && !summary.data ? (
        <LoadError message={summary.error} onRetry={() => void summary.reload()} />
      ) : (
        <EssentialNumbers summary={summary.data} onOverdue={() => goTo('cobrancas', 'overdue')} />
      )}

      <Tabs value={tab} onValueChange={value => setTab(parseTab(value))} className="gap-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <SectionTabsList className="sm:flex-1">
            <SectionTab value="cobrancas">Cobranças</SectionTab>
            <SectionTab value="assinaturas">Assinaturas</SectionTab>
            <SectionTab value="automacao">Régua e eventos</SectionTab>
            <SectionTab value="recebimento">Recebimento</SectionTab>
            <SectionTab value="visao-geral">Resumo mensal</SectionTab>
          </SectionTabsList>
          <button
            type="button"
            onClick={() => setTab('automacao')}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-md px-1 pb-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground sm:self-auto"
            title="Ver régua de cobrança"
          >
            <span
              className={cn('h-2 w-2 rounded-full', automationEnabled ? 'bg-emerald-500' : 'bg-amber-500')}
              aria-hidden
            />
            {automationEnabled ? 'Cobrança automática' : 'Automação desligada'}
            {lastRunAt ? ` · ${formatRelative(lastRunAt)}` : ''}
          </button>
        </div>

        <TabsContent value="cobrancas" className="m-0">
          <ChargesTab
            tenantSlug={slug}
            canSimulate={canSimulate}
            version={version}
            onChanged={refresh}
            initialStatus={chargeStatus}
            subscriptionFilter={subscriptionFilter}
            onClearSubscriptionFilter={() => setSubscriptionFilter(null)}
            onOpenSubscription={subscriptionId => {
              setOpenSubscriptionId(subscriptionId)
              setTab('assinaturas')
            }}
            openChargeId={openChargeId}
            onOpenChargeHandled={clearOpenCharge}
          />
        </TabsContent>

        <TabsContent value="assinaturas" className="m-0">
          <SubscriptionsTab
            tenantSlug={slug}
            version={version}
            onChanged={refresh}
            plans={plans}
            onViewCharges={subscription => {
              setSubscriptionFilter(subscription)
              setChargeStatus(undefined)
              setTab('cobrancas')
            }}
            onOpenCharge={chargeId => {
              setOpenChargeId(chargeId)
              setTab('cobrancas')
            }}
            openSubscriptionId={openSubscriptionId}
            onOpenSubscriptionHandled={clearOpenSubscription}
          />
        </TabsContent>

        <TabsContent value="automacao" className="m-0">
          <AutomationPanel
            tenantSlug={slug}
            settings={settings.data}
            settingsLoading={settings.loading}
            settingsError={settings.error}
            onReloadSettings={() => void settings.reload()}
            onSettingsSaved={saved => {
              settings.setData(saved)
              refresh()
            }}
            lastRunAt={lastRunAt}
            onRan={() => refresh()}
            version={version}
            onOpenReceiving={() => setTab('recebimento')}
          />
        </TabsContent>

        <TabsContent value="recebimento" className="m-0">
          {/* `asaasConfigured` das configurações depende da conta: relê quando ela muda. */}
          <ReceivingAccountPanel tenantSlug={slug} onChanged={() => void reloadSettings({ silent: true })} />
        </TabsContent>

        <TabsContent value="visao-geral" className="m-0">
          <OverviewTab
            tenantSlug={slug}
            summary={summary.data}
            summaryError={summary.error}
            onRetry={() => void summary.reload()}
            version={version}
            onGoTo={(next, status) => goTo(next, status)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** Os quatro números que respondem "como está a cobrança do clube". */
function EssentialNumbers({ summary, onOverdue }: { summary: BillingSummary | null; onOverdue: () => void }) {
  const loading = !summary
  const rate = delinquencyPercent(summary?.delinquencyRate)
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile
        label="Receita recorrente (MRR)"
        value={formatBRL(summary?.mrr ?? 0)}
        tone="primary"
        loading={loading}
      />
      <MetricTile
        label="Assinaturas ativas"
        value={formatCount(summary?.activeSubscriptions ?? 0)}
        hint={summary && summary.newThisMonth > 0 ? `+${formatCount(summary.newThisMonth)} neste mês` : undefined}
        loading={loading}
      />
      <button type="button" onClick={onOverdue} className="text-left" disabled={loading}>
        <MetricTile
          label="Em atraso"
          value={formatBRL(summary?.overdueAmount ?? 0)}
          hint={
            summary
              ? summary.overdueCharges === 0
                ? 'Nenhuma cobrança vencida'
                : `${formatCount(summary.overdueCharges)} ${summary.overdueCharges === 1 ? 'cobrança vencida' : 'cobranças vencidas'} · ver`
              : undefined
          }
          tone={summary && summary.overdueCharges > 0 ? 'warning' : 'default'}
          loading={loading}
          className="h-full transition-colors hover:bg-muted/40"
        />
      </button>
      <MetricTile
        label="Inadimplência"
        value={formatPercent(rate)}
        hint="Sobre o faturado nos últimos 90 dias"
        loading={loading}
      />
    </div>
  )
}
