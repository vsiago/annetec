'use client'

import Link from 'next/link'
import { AlertCircle, Check, ChevronRight, ExternalLink } from 'lucide-react'
import { HOLDING_RECEIVING_ISSUE_LABELS } from '@annetec/contracts'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EntityAvatar } from '@/components/admin-platform/ui/entity-avatar'
import { useClubColors } from '@/components/admin-platform/ui/use-club-colors'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { formatNumber } from '@/lib/adapters/contratacao'
import { useSiteAddress } from '@/lib/site-address'
import { cn } from '@/lib/utils'
import { HEALTH_DISPLAY, shortDateBR, type ClubListRow } from './club-list-model'

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
    <div className="flex flex-col items-end gap-0.5">
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
    <span className="inline-flex items-center gap-2 font-medium text-foreground">
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-full ring-[3px]"
        style={{ backgroundColor: health.dot, ['--tw-ring-color' as string]: `${health.dot}33` }}
      />
      {health.label}
    </span>
  )
}

const focusRing =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/40 focus-visible:ring-offset-1'

export function ClubsTable({ rows }: { rows: ClubListRow[] }) {
  const siteAddress = useSiteAddress()
  const colorOf = useClubColors()
  return (
    <DataTable caption="Clubes cadastrados" minWidth="min-w-[960px]">
      <thead>
        <tr>
          <Th>Clube</Th>
          <Th>Situação</Th>
          <Th align="right">Vidas</Th>
          <Th>Recebimento</Th>
          <Th>Mensalidade ANNETEC</Th>
          <Th>Saúde</Th>
          <Th>
            <span className="sr-only">Abrir</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <Tr key={row.id}>
            <Td>
              <div className="flex items-center gap-3">
                <EntityAvatar name={row.name} color={colorOf(row.id)} />
                <div className="flex min-w-0 flex-col gap-0.5">
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
              </div>
            </Td>
            <Td>
              <SituationCell row={row} />
            </Td>
            <Td align="right">
              <LivesCell row={row} />
            </Td>
            <Td>
              <ReceivingCell row={row} />
            </Td>
            <Td>
              <FeeCell row={row} />
            </Td>
            <Td>
              <HealthCell row={row} />
            </Td>
            <Td align="right">
              <Link
                href={`/admin/inquilinos/${row.id}`}
                aria-label={`Abrir ${row.name}`}
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-[10px] text-[#667085] transition-colors duration-150 hover:bg-white hover:text-secondary hover:shadow-[0_1px_3px_rgba(16,24,40,0.1)] group-hover:text-secondary',
                  focusRing,
                )}
              >
                <ChevronRight className="size-[18px]" aria-hidden="true" />
              </Link>
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  )
}
