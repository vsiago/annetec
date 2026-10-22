'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Copy, ExternalLink, FlaskConical, Loader2, LogIn, Rocket, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import type { OnboardingProposalDetail } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ConfirmDialog,
  Pill,
  SuperadminOnly,
  copyToClipboard,
  runCommand,
} from '@/components/admin-platform/billing/console-kit'
import { issueActivationChargeAction } from '@/lib/actions/platform-onboarding-api'
import { simulatePlatformChargePaymentAction } from '@/lib/actions/platform-billing-api'
import {
  chargeStatusMeta,
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  isChargeOpen,
  paymentMethodLabel,
} from '@/lib/adapters/platform-console'

/**
 * Da aprovação ao clube no ar: cobrança de ativação (emitir, abrir a fatura
 * pública, simular o pagamento na demonstração) e o provisionamento.
 */
export function ActivationCard({
  proposal,
  isSuperadmin,
  onUpdated,
  onPaid,
  onProvision,
}: {
  proposal: OnboardingProposalDetail
  isSuperadmin: boolean
  onUpdated: (detail: OnboardingProposalDetail) => void
  /** Pagamento simulado confirmado: a página acompanha o provisionamento. */
  onPaid: () => void
  onProvision: () => void
}) {
  const [busy, setBusy] = useState<'issue' | null>(null)
  const [confirmPay, setConfirmPay] = useState(false)
  const charge = proposal.activationCharge
  const status = proposal.status
  const relevant = ['approved', 'awaiting_payment', 'provisioning', 'active'].includes(status) || !!charge
  if (!relevant) return null

  const canIssue = status === 'approved' && (!charge || !isChargeOpen(charge.status))
  const canWaive = status === 'approved' || status === 'awaiting_payment'
  const canRetry = status === 'provisioning' && !!proposal.provisioning.error

  const issue = async () => {
    setBusy('issue')
    const detail = await runCommand(issueActivationChargeAction(proposal.id), 'Cobrança de ativação emitida')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const copy = async () => {
    if (!charge) return
    const ok = await copyToClipboard(charge.publicUrl)
    if (ok) toast.success('Link da fatura copiado')
    else toast.error('Não foi possível copiar', { description: charge.publicUrl })
  }

  const simulate = async (): Promise<boolean> => {
    if (!charge) return false
    const result = await runCommand(
      simulatePlatformChargePaymentAction(charge.id),
      'Pagamento simulado — o provisionamento começa em instantes',
    )
    if (!result) return false
    onPaid()
    return true
  }

  return (
    <Card className="gap-4 border-primary/20 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Ativação e provisionamento
        </CardTitle>
        <CardDescription>
          {status === 'active'
            ? 'Clube no ar.'
            : status === 'provisioning'
              ? 'Pagamento confirmado — criando o clube.'
              : charge
                ? 'Aguardando o pagamento da cobrança de ativação.'
                : 'Aprovada — a cobrança de ativação ainda não foi emitida.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {charge ? (
          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-foreground">{formatBRL(charge.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {paymentMethodLabel(charge.method)} · vence {formatDateBR(charge.dueDate)}
                  {charge.paidAt ? ` · paga ${formatDateTimeBR(charge.paidAt)}` : ''}
                </p>
              </div>
              <Pill meta={chargeStatusMeta(charge.status)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={charge.publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir fatura
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </Button>
              {proposal.canSimulatePayment && isChargeOpen(charge.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300"
                  onClick={() => setConfirmPay(true)}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Simular pagamento
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {canIssue && (
          <Button onClick={issue} disabled={busy !== null} className="w-full gap-2">
            {busy === 'issue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Emitir cobrança de ativação
          </Button>
        )}

        {(proposal.provisioning.attempts > 0 || proposal.provisioning.provisionedAt) && (
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Provisionamento: {proposal.provisioning.attempts} tentativa(s)
              {proposal.provisioning.activationWaived ? ' · ativação isenta' : ''}
            </p>
            {proposal.provisioning.provisionedAt && (
              <p className="text-foreground">No ar desde {formatDateTimeBR(proposal.provisioning.provisionedAt)}</p>
            )}
            {proposal.provisioning.error && (
              <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {proposal.provisioning.error}
              </p>
            )}
          </div>
        )}

        {(canWaive || canRetry) && (
          <SuperadminOnly isSuperadmin={isSuperadmin}>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={onProvision}>
              <Rocket className="h-4 w-4" />
              {canRetry ? 'Reprocessar provisionamento' : 'Isentar ativação e provisionar'}
            </Button>
          </SuperadminOnly>
        )}

        {proposal.tenant && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{proposal.tenant.name}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 bg-background" asChild>
                <a href={proposal.tenant.siteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />/{proposal.tenant.slug}
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 bg-background" asChild>
                <a href={proposal.tenant.loginUrl} target="_blank" rel="noreferrer">
                  <LogIn className="h-3.5 w-3.5" />
                  Login
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 bg-background" asChild>
                <Link href={`/admin/inquilinos/${proposal.tenant.organizationId}`}>
                  <Building2 className="h-3.5 w-3.5" />
                  Inquilino
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmPay}
        onOpenChange={setConfirmPay}
        title="Simular o pagamento da ativação?"
        description="Só existe no gateway simulado (demonstração). O pagamento confirmado dispara o provisionamento: organização, administrador, régua, planos e assinatura."
        confirmLabel="Simular pagamento"
        onConfirm={simulate}
      />
    </Card>
  )
}
