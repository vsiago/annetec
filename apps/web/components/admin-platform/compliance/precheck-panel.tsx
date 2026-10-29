'use client'

import { useState } from 'react'
import { ChevronDown, ClipboardCheck, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  PRECHECK_BLOCKING,
  PRECHECK_LABELS,
  precheckCode,
  type OnboardingProposalDetail,
  type PrecheckResult,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { rerunOnboardingPrechecksAction } from '@/lib/actions/platform-onboarding-api'
import { formatDateTimeBR, formatRelative, precheckOutcomeMeta, type StatusMeta } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'
import { PrecheckIcon, precheckPoints, verificationMeta } from './compliance-ui'

/**
 * Verificação automática (§0.6): uma linha por regra, com o resultado, a frase
 * da API e o selo "Impede a aprovação" quando uma falha bloqueia a aprovação
 * sem ressalva. Ordem fixa do contracts — a mesma em todo cadastro.
 */

const OUTCOME_LABEL: Record<string, string> = {
  pass: 'Tudo certo',
  warn: 'Para conferir',
  fail: 'Com problema',
  skipped: 'Não se aplica',
}

function outcomeMeta(outcome: PrecheckResult['outcome']): StatusMeta {
  return { ...precheckOutcomeMeta(outcome), label: OUTCOME_LABEL[outcome] ?? outcome }
}

const ORDER = precheckCode.options

function detailsText(details: PrecheckResult['details']): [string, string][] {
  if (!details) return []
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 12)
    .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
}

export function PrecheckPanel({
  proposal,
  onUpdated,
  canRerun,
}: {
  proposal: OnboardingProposalDetail
  onUpdated: (detail: OnboardingProposalDetail) => void
  canRerun: boolean
}) {
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const byCode = new Map((proposal.prechecks ?? []).map(result => [result.code, result]))
  const rows = ORDER.map(code => byCode.get(code)).filter((row): row is PrecheckResult => !!row)
  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.outcome]: (acc[row.outcome] ?? 0) + 1 }),
    {} as Record<string, number>,
  )

  const rerun = async () => {
    setRunning(true)
    const detail = await runCommand(rerunOnboardingPrechecksAction(proposal.id), 'Verificação automática refeita')
    setRunning(false)
    if (detail) onUpdated(detail)
  }

  return (
    <SectionCard
      padded={false}
      icon={ShieldCheck}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Verificação automática
          <Pill meta={verificationMeta(proposal.precheckSummary, precheckPoints(proposal.prechecks))} />
        </span>
      }
      description={
        proposal.precheckRanAt ? (
          <span title={formatDateTimeBR(proposal.precheckRanAt)}>
            Feita {formatRelative(proposal.precheckRanAt)} · {counts.pass ?? 0} tudo certo · {counts.warn ?? 0} para conferir ·{' '}
            {counts.fail ?? 0} com problema
          </span>
        ) : (
          'Ainda não foi feita. Ela roda sozinha quando o clube envia o cadastro.'
        )
      }
      actions={
        canRerun ? (
          <Button variant="outline" className="h-10 gap-2" onClick={rerun} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Refazer verificação
          </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} size="sm" title="Nenhum resultado ainda." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map(row => {
            const blocking = row.outcome === 'fail' && PRECHECK_BLOCKING[row.code]
            const details = detailsText(row.details)
            const expanded = open === row.code
            return (
              <li
                key={row.code}
                className={cn('border-b border-[#EEF0F3] px-6 py-4 last:border-b-0', blocking && 'bg-[#FEF3F2]/60')}
              >
                <div className="flex items-start gap-3">
                  <PrecheckIcon outcome={row.outcome} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="m-0 text-sm font-medium text-foreground">{PRECHECK_LABELS[row.code] ?? row.code}</p>
                      <Pill meta={outcomeMeta(row.outcome)} className="px-2 text-[11px]" />
                      {blocking && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#B42318] px-2 py-0.5 text-[11px] font-semibold text-white">
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                          Impede a aprovação
                        </span>
                      )}
                    </div>
                    <p className="m-0 mt-0.5 text-sm text-muted-foreground">{row.message}</p>
                    {expanded && details.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/50 p-4">
                        <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Detalhes técnicos</p>
                        <dl className="m-0 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                          {details.map(([key, value]) => (
                            <div key={key} className="min-w-0">
                              <dt className="font-medium text-muted-foreground">{key}</dt>
                              <dd className="m-0 break-words font-mono text-foreground">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                  {details.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      onClick={() => setOpen(expanded ? null : row.code)}
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Esconder detalhes técnicos' : 'Ver detalhes técnicos'}
                    >
                      <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
