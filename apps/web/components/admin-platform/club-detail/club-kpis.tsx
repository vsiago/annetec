'use client'

import type { HoldingTenantDetail, HoldingTenantRow } from '@annetec/contracts'
import { HOLDING_THRESHOLDS } from '@annetec/contracts'
import { CalendarClock, Receipt, Users, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard, type KpiDelta } from '@/components/admin-platform/ui/kpi-card'
import { formatBRL, formatCount, formatDateBR, formatPercent } from '@/lib/adapters/platform-console'

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${formatCount(n)}`
}

function livesDelta(row: HoldingTenantRow): { delta?: KpiDelta; hint: string } {
  const change = row.activeMembersDelta30
  if (change > 0) return { delta: { text: signed(change), tone: 'up' }, hint: 'assinantes em 30 dias' }
  if (change < 0) return { delta: { text: signed(change), tone: 'down' }, hint: 'assinantes em 30 dias' }
  return { hint: 'sem mudança nos últimos 30 dias' }
}

function receivedDelta(row: HoldingTenantRow): { delta?: KpiDelta; hint: string } {
  const trend = row.salesTrendPct
  if (trend === null) return { hint: 'pago pelos associados' }
  const text = `${trend > 0 ? '+' : ''}${formatPercent(trend)}`
  return {
    delta: { text, tone: trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral' },
    hint: 'em relação aos 30 dias anteriores',
  }
}

/** Mensalidade que o clube paga à ANNETEC: "Em dia" ou "Atrasada há N dias". */
function platformFee(row: HoldingTenantRow, subscription: HoldingTenantDetail['subscription']) {
  if (!row.managed) {
    return { value: '—', tone: 'default' as const, hint: 'Este clube não tem cobrança automática da ANNETEC.' }
  }
  if (row.platformStatus === 'canceled') {
    return { value: 'Cancelada', tone: 'danger' as const, hint: 'A assinatura da ANNETEC foi cancelada.' }
  }
  if (row.platformDaysLate > 0) {
    const days = row.platformDaysLate
    return {
      value: `Atrasada há ${days} ${days === 1 ? 'dia' : 'dias'}`,
      tone: 'danger' as const,
      hint: `${formatBRL(row.platformOpenAmount)} em aberto`,
    }
  }
  const next = subscription?.nextDueDate
    ? `Próxima fatura: ${formatBRL(subscription.estimatedMonthly)} em ${formatDateBR(subscription.nextDueDate)}`
    : 'Nenhuma fatura em aberto'
  return { value: 'Em dia', tone: 'success' as const, hint: next }
}

/** Os quatro números do clube. Cada um traz o período no próprio rótulo. */
export function ClubKpis({
  detail,
  loading,
  tenantId,
}: {
  detail: HoldingTenantDetail | null
  loading: boolean
  tenantId: string
}) {
  if (!detail) {
    // Falhou ao ler: a tela mostra o erro com "Tentar de novo"; aqui não sobra o que desenhar.
    if (!loading) return null
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="grid gap-4 sm:grid-cols-2">
        <span className="sr-only">Carregando os números do clube…</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    )
  }

  const row = detail.tenant
  const lives = livesDelta(row)
  const received = receivedDelta(row)
  const fee = platformFee(row, detail.subscription)
  const delinquencyHigh = row.memberDelinquencyRate >= HOLDING_THRESHOLDS.memberDelinquencyHighPct

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <KpiCard
        label="Vidas ativas"
        value={formatCount(row.activeLives)}
        delta={lives.delta}
        hint={lives.hint}
        icon={<Users />}
        accent="coral"
      />
      <KpiCard
        label="Recebido pelo clube nos últimos 30 dias"
        value={formatBRL(row.gmvLast30)}
        delta={received.delta}
        hint={received.hint}
        icon={<Wallet />}
        accent="green"
        trend={detail.monthly.slice(-6).map(month => month.gmv)}
      />
      <KpiCard
        label="Em atraso"
        value={formatPercent(row.memberDelinquencyRate)}
        tone={delinquencyHigh ? 'danger' : 'default'}
        hint={`do valor cobrado dos associados nos últimos 90 dias · há 30 dias: ${formatPercent(row.memberDelinquencyRatePrev)}`}
        icon={<CalendarClock />}
        accent="red"
      />
      <KpiCard
        label="Mensalidade da ANNETEC"
        value={fee.value}
        tone={fee.tone}
        hint={fee.hint}
        icon={<Receipt />}
        accent="navy"
        href={row.managed ? `/admin/inquilinos/${encodeURIComponent(tenantId)}?tab=plano` : undefined}
      />
    </div>
  )
}
