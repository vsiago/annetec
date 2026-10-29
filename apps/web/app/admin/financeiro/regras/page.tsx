'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { PlatformBillingAutomationReport } from '@annetec/contracts'
import { PageHeader } from '@/components/dashboard/page-header'
import { RefreshButton, runCommand, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { ReceivingBadge, pluralize } from '@/components/admin-platform/billing/billing-bits'
import { DunningTab } from '@/components/admin-platform/billing/dunning-tab'
import { getPlatformBillingSettingsAction, runPlatformBillingAutomationAction } from '@/lib/actions/platform-billing-api'

/**
 * Regras de cobrança: quando o clube é lembrado, o que acontece quando ele
 * atrasa, quais formas de pagamento valem e como a ANNETEC recebe. É o antigo
 * "Régua e automação" do Financeiro, agora numa tela própria. "Executar
 * automação" mora aqui por ser ação de suporte, não de uso diário.
 */

function automationToast(report: PlatformBillingAutomationReport): string {
  const parts = [
    report.generated && pluralize(report.generated, 'fatura gerada', 'faturas geradas'),
    report.remindersSent && pluralize(report.remindersSent, 'lembrete enviado', 'lembretes enviados'),
    report.markedOverdue && pluralize(report.markedOverdue, 'fatura vencida', 'faturas vencidas'),
    report.restricted && pluralize(report.restricted, 'clube em somente leitura', 'clubes em somente leitura'),
    report.suspended && pluralize(report.suspended, 'clube bloqueado', 'clubes bloqueados'),
    report.reactivated && pluralize(report.reactivated, 'clube reativado', 'clubes reativados'),
    report.canceled && pluralize(report.canceled, 'assinatura cancelada', 'assinaturas canceladas'),
  ].filter(Boolean)
  return parts.length > 0 ? `Automação executada: ${parts.join(' · ')}` : 'Automação executada. Não havia nada a fazer agora.'
}

export default function RegrasDeCobrancaPage() {
  const { isSuperadmin } = usePlatformRole()
  const [version, setVersion] = useState(0)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<PlatformBillingAutomationReport | null>(null)

  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [version])

  const runAutomation = async () => {
    setRunning(true)
    const result = await runCommand(runPlatformBillingAutomationAction(), automationToast)
    setRunning(false)
    if (!result) return
    setReport(result)
    if (result.errors.length > 0) {
      toast.warning(`A automação terminou com ${pluralize(result.errors.length, 'erro', 'erros')}`, {
        description: `${result.errors[0]} Veja o relatório ao lado.`,
      })
    }
    setVersion(value => value + 1)
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/financeiro"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Financeiro
      </Link>

      <PageHeader
        title="Regras de cobrança"
        description="Quando o clube é lembrado, o que acontece se ele atrasar e como a ANNETEC recebe."
      >
        {settings.data && <ReceivingBadge provider={settings.data.gateway} sandbox={settings.data.sandbox} />}
        <RefreshButton loading={settings.loading} onClick={() => setVersion(value => value + 1)} />
      </PageHeader>

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
    </div>
  )
}
