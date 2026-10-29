'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, Copy, ExternalLink, FlaskConical, Loader2, LogIn, Rocket, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import type { OnboardingProposalDetail } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
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
 * pública, simular o pagamento na demonstração) e a liberação do clube.
 *
 * "Simular pagamento" só aparece quando a API diz que dá (`canSimulatePayment`):
 * gateway simulado ou sandbox, e nunca em produção (`demoToolsAllowed` no
 * servidor, que também recusa o comando se alguém tentar).
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
    const detail = await runCommand(issueActivationChargeAction(proposal.id), 'Cobrança de ativação emitida. O clube foi avisado por e-mail')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const copy = async () => {
    if (!charge) return
    const ok = await copyToClipboard(charge.publicUrl)
    if (ok) toast.success('Link da fatura copiado')
    else toast.error('Não foi possível copiar o link', { description: charge.publicUrl })
  }

  const simulate = async (): Promise<boolean> => {
    if (!charge) return false
    const result = await runCommand(
      simulatePlatformChargePaymentAction(charge.id),
      'Pagamento simulado. O clube será liberado em instantes',
    )
    if (!result) return false
    onPaid()
    return true
  }

  const description =
    status === 'active'
      ? 'Clube liberado.'
      : status === 'provisioning'
        ? 'Pagamento confirmado. Estamos criando o clube.'
        : charge
          ? 'Esperando o clube pagar a cobrança de ativação.'
          : 'Clube aprovado, mas a cobrança de ativação ainda não foi emitida.'

  return (
    <>
      <SectionCard title="Ativação do clube" description={description} icon={Wallet} className="border-secondary/20">
        <div className="flex flex-col gap-4">
          {charge ? (
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-lg font-semibold text-foreground">{formatBRL(charge.amount)}</p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {paymentMethodLabel(charge.method)} · vence {formatDateBR(charge.dueDate)}
                    {charge.paidAt ? ` · paga ${formatDateTimeBR(charge.paidAt)}` : ''}
                  </p>
                </div>
                <Pill meta={chargeStatusMeta(charge.status)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" className="h-10 gap-1.5" asChild>
                  <a href={charge.publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Abrir fatura
                  </a>
                </Button>
                <Button variant="outline" className="h-10 gap-1.5" onClick={copy}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiar link da fatura
                </Button>
                {proposal.canSimulatePayment && isChargeOpen(charge.status) && (
                  <Button
                    variant="outline"
                    className="h-10 gap-1.5 border-[#FEDF89] text-[#B54708] hover:bg-[#FFFAEB] hover:text-[#B54708]"
                    onClick={() => setConfirmPay(true)}
                  >
                    <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                    Simular pagamento (demonstração)
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {canIssue && (
            <Button onClick={issue} disabled={busy !== null} className="h-11 w-full gap-2">
              {busy === 'issue' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="h-4 w-4" aria-hidden="true" />
              )}
              Emitir cobrança de ativação
            </Button>
          )}

          {(proposal.provisioning.attempts > 0 || proposal.provisioning.provisionedAt) && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="m-0 text-muted-foreground">
                Tentativas de liberar o clube: {proposal.provisioning.attempts}
                {proposal.provisioning.activationWaived ? ' · liberado sem cobrança de ativação' : ''}
              </p>
              {proposal.provisioning.provisionedAt && (
                <p className="m-0 text-foreground">No ar desde {formatDateTimeBR(proposal.provisioning.provisionedAt)}</p>
              )}
              {proposal.provisioning.error && (
                <p className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-xs text-[#B42318]">{proposal.provisioning.error}</p>
              )}
            </div>
          )}

          {(canWaive || canRetry) && (
            <SuperadminOnly isSuperadmin={isSuperadmin}>
              <Button variant="outline" className="h-10 w-full gap-2" onClick={onProvision}>
                <Rocket className="h-4 w-4" aria-hidden="true" />
                {canRetry ? 'Tentar liberar o clube de novo' : 'Liberar o clube sem cobrança'}
              </Button>
            </SuperadminOnly>
          )}

          {proposal.tenant && (
            <div className="flex flex-col gap-3 rounded-xl border border-[#ABEFC6] bg-[#ECFDF3] p-4">
              <p className="m-0 text-sm font-semibold text-[#067647]">{proposal.tenant.name}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10 gap-1.5 bg-background" asChild>
                  <a href={proposal.tenant.siteUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />/{proposal.tenant.slug}
                  </a>
                </Button>
                <Button variant="outline" className="h-10 gap-1.5 bg-background" asChild>
                  <a href={proposal.tenant.loginUrl} target="_blank" rel="noreferrer">
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    Acesso ao painel
                  </a>
                </Button>
                <Button variant="outline" className="h-10 gap-1.5 bg-background" asChild>
                  <Link href={`/admin/inquilinos/${proposal.tenant.organizationId}`}>
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Ver o clube
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmPay}
        onOpenChange={setConfirmPay}
        title="Simular o pagamento da ativação?"
        description="Só existe no modo demonstração. Ao confirmar, o clube é criado como se a ativação tivesse sido paga: administrador, planos, régua de cobrança e assinatura."
        confirmLabel="Simular pagamento"
        onConfirm={simulate}
      />
    </>
  )
}
