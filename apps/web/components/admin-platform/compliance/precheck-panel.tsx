'use client'

import { useState } from 'react'
import { ChevronDown, Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import {
  PRECHECK_BLOCKING,
  PRECHECK_LABELS,
  precheckCode,
  type OnboardingProposalDetail,
  type PrecheckResult,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
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
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Verificação automática
          <Pill meta={verificationMeta(proposal.precheckSummary, precheckPoints(proposal.prechecks))} />
        </CardTitle>
        <CardDescription>
          {proposal.precheckRanAt ? (
            <span title={formatDateTimeBR(proposal.precheckRanAt)}>
              Feita {formatRelative(proposal.precheckRanAt)} · {counts.pass ?? 0} tudo certo · {counts.warn ?? 0} para conferir ·{' '}
              {counts.fail ?? 0} com problema
            </span>
          ) : (
            'Ainda não foi feita. Ela roda sozinha quando o clube envia o cadastro.'
          )}
        </CardDescription>
        {canRerun && (
          <CardAction>
            <Button variant="outline" size="sm" className="gap-2" onClick={rerun} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refazer verificação
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum resultado ainda.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {rows.map(row => {
              const blocking = row.outcome === 'fail' && PRECHECK_BLOCKING[row.code]
              const details = detailsText(row.details)
              const expanded = open === row.code
              return (
                <li key={row.code} className={cn('px-6 py-3', blocking && 'bg-red-50/60 dark:bg-red-500/5')}>
                  <div className="flex items-start gap-3">
                    <PrecheckIcon outcome={row.outcome} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{PRECHECK_LABELS[row.code] ?? row.code}</p>
                        <Pill meta={outcomeMeta(row.outcome)} className="px-2 text-[11px]" />
                        {blocking && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#B42318] px-2 py-0.5 text-[11px] font-semibold text-white">
                            <ShieldAlert className="h-3 w-3" />
                            Impede a aprovação
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{row.message}</p>
                      {expanded && details.length > 0 && (
                        <div className="mt-2 space-y-1.5 rounded-lg bg-muted/50 p-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Detalhes técnicos</p>
                          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                            {details.map(([key, value]) => (
                              <div key={key} className="min-w-0">
                                <dt className="font-medium text-muted-foreground">{key}</dt>
                                <dd className="break-words font-mono text-foreground">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </div>
                    {details.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setOpen(expanded ? null : row.code)}
                        aria-label={expanded ? 'Esconder detalhes técnicos' : 'Ver detalhes técnicos'}
                      >
                        <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
