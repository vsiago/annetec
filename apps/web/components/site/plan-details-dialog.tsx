'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Clock } from 'lucide-react'
import {
  CLUB_COVERAGE_CHANNEL_LABELS,
  describeCoverageValue,
  describeWaitingPeriod,
  formatBRL,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PlanLegalNotice, PlanRulesList, PlanTerms, groupCoverages, planBadge, planCoverages, planRuleRows } from './plan-ui'
import { usePublicPaymentMethods, type VitrinePlan } from './use-public-plans'
import { useVitrine } from './vitrine-context'

/**
 * Tudo sobre um plano num diálogo (gaveta no celular): coberturas por
 * categoria com valor, carência, canal e parceiro; regras; regulamento; aviso
 * legal; e o CTA de contratação.
 */
export function PlanDetailsDialog({ plan, trigger }: { plan: VitrinePlan; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        {open && <PlanDetailsBody plan={plan} onNavigate={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PlanDetailsBody({ plan, onNavigate }: { plan: VitrinePlan; onNavigate: () => void }) {
  const { content, paths, tenant } = useVitrine()
  const enabledMethods = usePublicPaymentMethods(tenant.slug)
  const badge = planBadge(plan, content.plans.highlightLabel)
  const coverages = planCoverages(plan)
  const groups = groupCoverages(coverages)
  const rules = planRuleRows(plan, enabledMethods)
  const tagline = plan.tagline?.trim() || null
  const titleId = `detalhe-${plan.id}`

  // Um contêiner só: o espaçamento fica igual no diálogo (desktop) e na gaveta (celular).
  return (
    <div className="space-y-5">
        <DialogHeader className="gap-2 text-left">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="text-2xl font-bold">Plano {plan.name}</DialogTitle>
            {badge && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{badge}</span>
            )}
          </div>
          <DialogDescription className="text-sm leading-relaxed">{tagline ?? plan.description}</DialogDescription>
          <p className="text-foreground">
            <span className="text-2xl font-bold tracking-tight">{formatBRL(plan.priceMonthly)}</span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </p>
        </DialogHeader>

        {tagline && plan.description && <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>}

        {groups.length > 0 && (
          <section aria-labelledby={`${titleId}-coberturas`} className="space-y-4">
            <h3 id={`${titleId}-coberturas`} className="text-base font-semibold text-foreground">
              Coberturas <span className="font-normal text-muted-foreground">({coverages.length})</span>
            </h3>
            {groups.map(group => {
              const Icon = group.icon
              return (
                <div key={group.category}>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    {group.label}
                  </p>
                  <ul className="mt-2 divide-y divide-border/70 rounded-2xl border border-border/80">
                    {group.coverages.map(coverage => (
                      <li key={coverage.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <p className="font-medium text-foreground">{coverage.title}</p>
                          <p className="text-sm font-semibold text-primary">{describeCoverageValue(coverage)}</p>
                        </div>
                        {coverage.description && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{coverage.description}</p>
                        )}
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className={cn('inline-flex items-center gap-1', coverage.waitingDays > 0 && 'text-foreground/80')}>
                            {coverage.waitingDays > 0 ? (
                              <Clock className="size-3.5" aria-hidden="true" />
                            ) : (
                              <Check className="size-3.5" aria-hidden="true" />
                            )}
                            {describeWaitingPeriod(coverage.waitingDays)}
                          </span>
                          <span>{CLUB_COVERAGE_CHANNEL_LABELS[coverage.channel]}</span>
                          {coverage.provider && <span>{coverage.provider}</span>}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            {coverages.some(coverage => coverage.waitingDays > 0) && (
              <p className="text-xs text-muted-foreground">A carência é contada a partir da ativação da assinatura (confirmação do 1º pagamento).</p>
            )}
          </section>
        )}

        {rules.length > 0 && (
          <section aria-labelledby={`${titleId}-regras`} className="space-y-3">
            <h3 id={`${titleId}-regras`} className="text-base font-semibold text-foreground">
              Regras do plano
            </h3>
            <PlanRulesList rows={rules} />
          </section>
        )}

        <PlanTerms terms={plan.terms} planName={plan.name} />
        <PlanLegalNotice />

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11 rounded-full px-5 font-semibold" asChild>
            <Link href={`${paths.plans}#comparativo`} onClick={onNavigate}>
              Comparar planos
            </Link>
          </Button>
          <Button className="h-11 rounded-full px-6 font-semibold" asChild>
            <Link href={paths.checkout(plan.id)} onClick={onNavigate} aria-label={`${content.plans.cta}: plano ${plan.name}`}>
              {content.plans.cta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
    </div>
  )
}
