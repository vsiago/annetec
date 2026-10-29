'use client'

import Link from 'next/link'
import { AlertCircle, Check, ChevronRight, ExternalLink } from 'lucide-react'
import { HOLDING_RECEIVING_ISSUE_LABELS } from '@annetec/contracts'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { formatNumber } from '@/lib/adapters/contratacao'
import { useSiteAddress } from '@/lib/site-address'
import { cn } from '@/lib/utils'
import { HEALTH_DISPLAY, shortDateBR, type ClubListRow } from './club-list-model'

const TH = 'whitespace-nowrap border-b border-border bg-[#F9FAFB] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const TD = 'border-b border-[#EEF0F3] px-5 py-4 align-middle group-last:border-b-0'
const SUB = 'text-[13px] text-muted-foreground'
const EMPTY = (
  <span className="text-muted-foreground">
    <span aria-hidden="true">—</span>
    <span className="sr-only">Ainda sem dados</span>
  </span>
)

function SituationCell({ row }: { row: ClubListRow }) {
  switch (row.status) {
    case 'active':
      return <StatusPill tone="success">Ativo</StatusPill>
    case 'trial': {
      const until = shortDateBR(row.trialEndsAt)
      const ended = row.trialEndsAt !== null && Date.parse(row.trialEndsAt) < Date.now()
      return (
        <div className="flex flex-col items-start gap-1">
          <StatusPill tone="info">Em teste</StatusPill>
          {until ? <span className={SUB}>{ended ? `terminou em ${until}` : `até ${until}`}</span> : null}
        </div>
      )
    }
    case 'suspended':
      return <StatusPill tone="neutral">Suspenso</StatusPill>
    case 'cancelled':
      return <StatusPill tone="neutral">Encerrado</StatusPill>
  }
}

function LivesCell({ row }: { row: ClubListRow }) {
  const m = row.metrics
  if (!m) return EMPTY
  const delta = m.activeMembersDelta30
  return (
    <div className="flex flex-col gap-0.5">
      <strong
        className="font-semibold text-foreground"
        title="Vidas: titulares mais dependentes com assinatura em dia ou em atraso"
      >
        {formatNumber(m.activeLives)}
      </strong>
      {delta > 0 ? (
        <span className="text-[13px] text-[#067647]" title="Variação de associados titulares nos últimos 30 dias">
          +{formatNumber(delta)} no mês
        </span>
      ) : delta < 0 ? (
        <span className="text-[13px] text-[#B42318]" title="Variação de associados titulares nos últimos 30 dias">
          −{formatNumber(Math.abs(delta))} no mês
        </span>
      ) : (
        <span className={SUB}>{m.activeLives === 0 ? 'ainda não vende' : 'sem mudança no mês'}</span>
      )}
    </div>
  )
}

function ReceivingCell({ row }: { row: ClubListRow }) {
  const m = row.metrics
  if (!m) return EMPTY
  if (m.receivingIssue === null) {
    return (
      <StatusPill tone="success" icon={<Check strokeWidth={2.5} />}>
        Conectado
      </StatusPill>
    )
  }
  return (
    <StatusPill
      tone={m.receivingIssue === 'nao_conectado' ? 'danger' : 'warning'}
      icon={<AlertCircle strokeWidth={2.5} />}
    >
      {HOLDING_RECEIVING_ISSUE_LABELS[m.receivingIssue]}
    </StatusPill>
  )
}

function FeeCell({ row }: { row: ClubListRow }) {
  const m = row.metrics
  if (!m) return EMPTY
  // Sem assinatura da ANNETEC (clube cadastrado pelo console, não pela contratação
  // do site): nada passa a ser cobrado quando o teste acaba — o fim do teste não
  // dispara cobrança nenhuma.
  if (!m.managed) return <span className={SUB}>Sem cobrança automática</span>
  if (m.platformStatus === 'canceled') return <span className={SUB}>Assinatura encerrada</span>
  if (m.platformDaysLate > 0) {
    const days = m.platformDaysLate
    return (
      <span className="font-semibold text-[#B42318]">
        Atrasada há {days} {days === 1 ? 'dia' : 'dias'}
      </span>
    )
  }
  return <span className="text-foreground">Em dia</span>
}

function HealthCell({ row }: { row: ClubListRow }) {
  const m = row.metrics
  if (!m) return EMPTY
  if (row.status === 'suspended' || row.status === 'cancelled') return <span className={SUB}>Não se aplica</span>
  const health = HEALTH_DISPLAY[m.healthBand]
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: health.dot }} />
      {health.label}
    </span>
  )
}

const focusRing =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/40 focus-visible:ring-offset-1'

export function ClubsTable({ rows }: { rows: ClubListRow[] }) {
  const siteAddress = useSiteAddress()
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">Clubes cadastrados</caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>Clube</th>
            <th scope="col" className={TH}>Situação</th>
            <th scope="col" className={TH}>Vidas</th>
            <th scope="col" className={TH}>Recebimento</th>
            <th scope="col" className={TH}>Mensalidade ANNETEC</th>
            <th scope="col" className={TH}>Saúde</th>
            <th scope="col" className={TH}>
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group">
              <td className={TD}>
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/admin/inquilinos/${row.id}`}
                    className={cn('w-fit rounded text-[15px] font-semibold text-foreground hover:underline', focusRing)}
                  >
                    {row.name}
                  </Link>
                  <a
                    href={`/${row.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir o site de ${row.name} em nova aba (${siteAddress(row.slug)})`}
                    className={cn('inline-flex w-fit items-center gap-1 rounded text-[13px] text-muted-foreground hover:text-secondary hover:underline', focusRing)}
                  >
                    {siteAddress(row.slug)}
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              </td>
              <td className={TD}>
                <SituationCell row={row} />
              </td>
              <td className={TD}>
                <LivesCell row={row} />
              </td>
              <td className={TD}>
                <ReceivingCell row={row} />
              </td>
              <td className={TD}>
                <FeeCell row={row} />
              </td>
              <td className={TD}>
                <HealthCell row={row} />
              </td>
              <td className={cn(TD, 'text-right')}>
                <Link
                  href={`/admin/inquilinos/${row.id}`}
                  aria-label={`Abrir ${row.name}`}
                  className={cn('inline-flex size-10 items-center justify-center rounded-[10px] text-[#344054] hover:bg-[#F2F4F7]', focusRing)}
                >
                  <ChevronRight className="size-[18px]" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Esqueleto da tabela enquanto a lista carrega. */
export function ClubsTableSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-border bg-white"
    >
      <span className="sr-only">Carregando clubes…</span>
      <div className="h-11 border-b border-border bg-[#F9FAFB]" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-[#EEF0F3] px-5 py-4 last:border-b-0">
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-44 animate-pulse rounded bg-[#EEF0F3]" />
            <div className="h-3 w-32 animate-pulse rounded bg-[#F2F4F7]" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-[#EEF0F3]" />
          <div className="hidden h-4 w-12 animate-pulse rounded bg-[#EEF0F3] sm:block" />
          <div className="hidden h-6 w-24 animate-pulse rounded-full bg-[#EEF0F3] md:block" />
          <div className="hidden h-4 w-20 animate-pulse rounded bg-[#EEF0F3] md:block" />
        </div>
      ))}
    </div>
  )
}
