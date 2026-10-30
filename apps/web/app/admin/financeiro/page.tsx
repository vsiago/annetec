'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Handshake, LayoutDashboard, ReceiptText, SlidersHorizontal, Wallet } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { SectionTab, SectionTabsList } from '@/components/admin-platform/ui/section-tabs'
import { RefreshButton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ChargesTab } from '@/components/admin-platform/billing/charges-tab'
import { SubscriptionsTab } from '@/components/admin-platform/billing/subscriptions-tab'
import { SummaryTab } from '@/components/admin-platform/billing/summary-tab'
import {
  getPlatformBillingSettingsAction,
  getPlatformBillingSummaryAction,
  listPlatformPlanPricingAction,
} from '@/lib/actions/platform-billing-api'
import { listManagedAccountsAction } from '@/lib/actions/platform-managed-accounts-api'
import { canSimulatePayments } from '@/lib/adapters/platform-console'

/**
 * Financeiro da PLATAFORMA: o que os clubes pagam à ANNETEC pelo uso da
 * plataforma. Três abas — Resumo, Faturas e Clubes pagantes. As regras de
 * cobrança (lembretes, atrasos, formas de pagamento e a automação) ficam em
 * `/admin/financeiro/regras`; o histórico de cada clube, no detalhe da
 * assinatura; os preços dos planos, em Planos e preços. Tudo vem da API
 * (`/api/v1/platform/billing`) — nenhum dado de exemplo.
 */

/** O valor `assinaturas` da aba "Clubes pagantes" segue o mesmo da URL antiga, para os links salvos não quebrarem. */
const TABS = ['resumo', 'faturas', 'assinaturas'] as const
type TabKey = (typeof TABS)[number]

/** Abas que saíram do Financeiro e para onde cada link antigo passa a levar. */
const MOVED: Record<string, string> = {
  regua: '/admin/financeiro/regras',
  precos: '/admin/configuracoes',
}

const DESCRIPTION = 'O que os clubes pagam à ANNETEC pelo uso da plataforma.'

function FinanceiroPlataforma() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get('aba')
  const tab: TabKey = TABS.includes(requested as TabKey) ? (requested as TabKey) : 'resumo'

  const [version, setVersion] = useState(0)

  const summary = useConsoleData(() => getPlatformBillingSummaryAction(), [version])
  // Só para o que a tela precisa: prazo padrão da segunda via e se é demonstração.
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [])
  const plans = useConsoleData(() => listPlatformPlanPricingAction(), [])
  // Pedidos de conta gerenciada aguardando aprovação (contador do botão).
  const managedPending = useConsoleData(() => listManagedAccountsAction({ status: 'pendente' }), [version])
  const pendingRequests = managedPending.data?.length ?? 0

  // "Simular pagamento" só aparece quando o servidor diz que é demonstração (gateway simulado ou ambiente de testes).
  const canSimulate = settings.data ? canSimulatePayments(settings.data.gateway, settings.data.sandbox) : false

  // Links antigos: régua e preços mudaram de lugar; linha do tempo virou histórico dentro de cada clube.
  useEffect(() => {
    if (requested && MOVED[requested]) router.replace(MOVED[requested]!)
    else if (requested === 'eventos') router.replace(pathname, { scroll: false })
  }, [requested, router, pathname])

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'resumo') params.delete('aba')
    else params.set('aba', value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const overdue = summary.data?.overdueCharges ?? 0

  return (
    <PageContainer>
      <PageHeader
        title="Financeiro"
        icon={Wallet}
        description={DESCRIPTION}
        actions={
          <>
            <RefreshButton loading={summary.loading} onClick={() => setVersion(value => value + 1)} />
            <Button variant="outline" asChild className="min-h-10 gap-2 rounded-[10px] px-4 font-semibold">
              <Link href="/admin/financeiro/contas-gerenciadas">
                <Handshake className="h-4 w-4" aria-hidden="true" />
                Contas gerenciadas
                {pendingRequests > 0 && (
                  <span className="rounded-full bg-[#FEF3DC] px-2 py-0.5 text-xs font-semibold text-[#B54708]">
                    {pendingRequests}
                    <span className="sr-only"> {pendingRequests === 1 ? 'pedido aguardando' : 'pedidos aguardando'}</span>
                  </span>
                )}
              </Link>
            </Button>
            <Button variant="outline" asChild className="min-h-10 gap-2 rounded-[10px] px-4 font-semibold">
              <Link href="/admin/financeiro/regras">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Regras de cobrança
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <SectionTabsList>
          <SectionTab value="resumo">
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Resumo
          </SectionTab>
          <SectionTab value="faturas" badge={overdue > 0 ? `${overdue} em atraso` : undefined}>
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            Faturas
          </SectionTab>
          <SectionTab value="assinaturas">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            Clubes pagantes
          </SectionTab>
        </SectionTabsList>

        <TabsContent value="resumo">
          <SummaryTab
            summary={summary.data}
            error={summary.error}
            onRetry={() => summary.reload()}
            version={version}
            canSimulate={canSimulate}
            defaultDueDays={settings.data?.boletoDueDays}
            onChanged={() => void summary.reload({ silent: true })}
            onSeeAllCharges={() => setTab('faturas')}
          />
        </TabsContent>

        <TabsContent value="faturas">
          <SectionCard padded={false} className="overflow-hidden">
            <ChargesTab
              canSimulate={canSimulate}
              defaultDueDays={settings.data?.boletoDueDays}
              version={version}
              onChanged={() => void summary.reload({ silent: true })}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="assinaturas">
          <SectionCard padded={false} className="overflow-hidden">
            <SubscriptionsTab plans={plans.data ?? []} version={version} />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

export default function FinanceiroPlataformaPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Financeiro" icon={Wallet} description={DESCRIPTION} />
          <SectionCard>
            <SectionSkeleton rows={4} label="Carregando o financeiro…" />
          </SectionCard>
        </PageContainer>
      }
    >
      <FinanceiroPlataforma />
    </Suspense>
  )
}
