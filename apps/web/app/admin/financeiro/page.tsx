'use client'

import { Suspense, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Activity, Building2, LayoutDashboard, Loader2, Play, ReceiptText, SlidersHorizontal, Tags } from 'lucide-react'
import { toast } from 'sonner'
import type { PlatformBillingAutomationReport } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { RefreshButton, runCommand, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { GatewayBadge } from '@/components/admin-platform/billing/billing-bits'
import { ChargesTab } from '@/components/admin-platform/billing/charges-tab'
import { AutomationReportView, DunningTab } from '@/components/admin-platform/billing/dunning-tab'
import { EventsTab } from '@/components/admin-platform/billing/events-tab'
import { PricingTab } from '@/components/admin-platform/billing/pricing-tab'
import { SubscriptionsTab } from '@/components/admin-platform/billing/subscriptions-tab'
import { SummaryTab } from '@/components/admin-platform/billing/summary-tab'
import {
  getPlatformBillingSettingsAction,
  getPlatformBillingSummaryAction,
  listPlatformPlanPricingAction,
  runPlatformBillingAutomationAction,
} from '@/lib/actions/platform-billing-api'
import { canSimulatePayments, formatRelative } from '@/lib/adapters/platform-console'

/**
 * Financeiro da PLATAFORMA (blueprint §Q4): a cobrança automática que a
 * ANNETEC faz a cada inquilino gerenciado. Tudo vem da API
 * (`/api/v1/platform/billing`) — nenhum dado de exemplo.
 */

const TABS = ['resumo', 'faturas', 'assinaturas', 'regua', 'eventos', 'precos'] as const
type TabKey = (typeof TABS)[number]

function automationToast(report: PlatformBillingAutomationReport): string {
  const parts = [
    report.generated && `${report.generated} fatura(s) gerada(s)`,
    report.remindersSent && `${report.remindersSent} lembrete(s)`,
    report.markedOverdue && `${report.markedOverdue} vencida(s)`,
    report.restricted && `${report.restricted} restrita(s)`,
    report.suspended && `${report.suspended} bloqueada(s)`,
    report.reactivated && `${report.reactivated} reativada(s)`,
    report.canceled && `${report.canceled} cancelada(s)`,
  ].filter(Boolean)
  return parts.length > 0 ? `Automação executada: ${parts.join(' · ')}` : 'Automação executada — nada a fazer agora'
}

function FinanceiroPlataforma() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('aba') as TabKey | null
  const tab: TabKey = requested && TABS.includes(requested) ? requested : 'resumo'
  const { isSuperadmin } = usePlatformRole()

  const [version, setVersion] = useState(0)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<PlatformBillingAutomationReport | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const summary = useConsoleData(() => getPlatformBillingSummaryAction(), [version])
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [version])
  const plans = useConsoleData(() => listPlatformPlanPricingAction(), [])

  const canSimulate = settings.data ? canSimulatePayments(settings.data.gateway, settings.data.sandbox) : false
  const lastRun = settings.data?.automation.lastRunAt ?? summary.data?.lastAutomationRunAt ?? null

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'resumo') params.delete('aba')
    else params.set('aba', value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const runAutomation = async () => {
    setRunning(true)
    const result = await runCommand(runPlatformBillingAutomationAction(), automationToast)
    setRunning(false)
    if (!result) return
    setReport(result)
    if (result.errors.length > 0) {
      toast.warning(`${result.errors.length} erro(s) na execução`, { description: result.errors[0] })
      setReportOpen(true)
    }
    setVersion(value => value + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro da plataforma"
        description="Cobrança automática da ANNETEC aos inquilinos: assinaturas, faturas, régua de inadimplência e automação."
      >
        {settings.data && <GatewayBadge provider={settings.data.gateway} sandbox={settings.data.sandbox} />}
        <RefreshButton loading={summary.loading} onClick={() => setVersion(value => value + 1)} />
        <Button onClick={runAutomation} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Executar automação
        </Button>
      </PageHeader>
      {lastRun && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Automação rodou {formatRelative(lastRun)}
          {report && (
            <>
              {' · '}
              <button type="button" className="text-primary hover:underline" onClick={() => setReportOpen(true)}>
                ver o último relatório
              </button>
            </>
          )}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <SectionTabsList>
          <SectionTab value="resumo">
            <LayoutDashboard className="h-4 w-4" />
            Resumo
          </SectionTab>
          <SectionTab value="faturas" badge={summary.data?.overdueCharges ? `${summary.data.overdueCharges} vencida(s)` : undefined}>
            <ReceiptText className="h-4 w-4" />
            Faturas
          </SectionTab>
          <SectionTab value="assinaturas">
            <Building2 className="h-4 w-4" />
            Assinaturas
          </SectionTab>
          <SectionTab value="regua">
            <SlidersHorizontal className="h-4 w-4" />
            Régua e automação
          </SectionTab>
          <SectionTab value="eventos">
            <Activity className="h-4 w-4" />
            Linha do tempo
          </SectionTab>
          <SectionTab value="precos">
            <Tags className="h-4 w-4" />
            Preços dos planos
          </SectionTab>
        </SectionTabsList>

        <TabsContent value="resumo">
          <SummaryTab summary={summary.data} error={summary.error} onRetry={() => summary.reload()} version={version} />
        </TabsContent>

        <TabsContent value="faturas">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-0">
              <ChargesTab
                canSimulate={canSimulate}
                defaultDueDays={settings.data?.boletoDueDays}
                version={version}
                onChanged={() => void summary.reload({ silent: true })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-0">
              <SubscriptionsTab plans={plans.data ?? []} version={version} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regua">
          <DunningTab
            settings={settings.data}
            error={settings.error}
            onRetry={() => settings.reload()}
            isSuperadmin={isSuperadmin}
            onSaved={updated => settings.setData(updated)}
            lastReport={report}
            running={running}
            onRunAutomation={runAutomation}
          />
        </TabsContent>

        <TabsContent value="eventos">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-0">
              <EventsTab version={version} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="precos">
          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="p-0">
              <PricingTab
                plans={plans.data}
                loading={plans.loading}
                error={plans.error}
                onRetry={() => plans.reload()}
                isSuperadmin={isSuperadmin}
                onSaved={offer => plans.setData(current => (current ?? []).map(item => (item.id === offer.id ? offer : item)))}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={reportOpen && !!report} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Relatório da automação</DialogTitle>
            <DialogDescription>O que a última execução manual fez, passo a passo da régua.</DialogDescription>
          </DialogHeader>
          {report && <AutomationReportView report={report} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function FinanceiroPlataformaPage() {
  return (
    <Suspense fallback={null}>
      <FinanceiroPlataforma />
    </Suspense>
  )
}
