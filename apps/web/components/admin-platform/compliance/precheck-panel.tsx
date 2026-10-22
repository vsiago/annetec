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
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
import { rerunOnboardingPrechecksAction } from '@/lib/actions/platform-onboarding-api'
import {
  formatDateTimeBR,
  formatRelative,
  precheckOutcomeMeta,
  precheckSummaryMeta,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'
import { PrecheckIcon } from './compliance-ui'

/**
 * Checklist das pré-checagens automáticas (§0.6): uma linha por regra, com o
 * resultado, a frase da API e o selo "bloqueante" quando uma falha impede a
 * aprovação sem ressalva. Ordem fixa do contracts — a mesma em toda proposta.
 */

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
    const detail = await runCommand(rerunOnboardingPrechecksAction(proposal.id), 'Pré-checagens executadas novamente')
    setRunning(false)
    if (detail) onUpdated(detail)
  }

  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Pré-checagens automáticas
          <Pill meta={precheckSummaryMeta(proposal.precheckSummary)} />
        </CardTitle>
        <CardDescription>
          {proposal.precheckRanAt ? (
            <span title={formatDateTimeBR(proposal.precheckRanAt)}>
              Executadas {formatRelative(proposal.precheckRanAt)} · {counts.pass ?? 0} ok · {counts.warn ?? 0} alerta(s) ·{' '}
              {counts.fail ?? 0} falha(s)
            </span>
          ) : (
            'Ainda não executadas — rodam no envio da proposta.'
          )}
        </CardDescription>
        {canRerun && (
          <CardAction>
            <Button variant="outline" size="sm" className="gap-2" onClick={rerun} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reexecutar
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum resultado registrado.</p>
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
                        <Pill meta={precheckOutcomeMeta(row.outcome)} className="px-2 text-[11px]" />
                        {blocking && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            <ShieldAlert className="h-3 w-3" />
                            Bloqueante
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{row.message}</p>
                      {expanded && details.length > 0 && (
                        <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-2">
                          {details.map(([key, value]) => (
                            <div key={key} className="min-w-0">
                              <dt className="font-medium text-muted-foreground">{key}</dt>
                              <dd className="break-words font-mono text-foreground">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    {details.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setOpen(expanded ? null : row.code)}
                        aria-label={expanded ? 'Esconder detalhes' : 'Ver detalhes'}
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
