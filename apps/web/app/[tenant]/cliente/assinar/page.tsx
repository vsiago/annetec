'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Sparkles } from 'lucide-react'
import type { ClubCharge } from '@annetec/contracts'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useClubMembership } from '@/components/client/club-membership-provider'
import { ChargePaymentDialog } from '@/components/client/charge-payment-dialog'
import {
  PendingPaymentPanel,
  PlansPicker,
  pendingPaymentHref,
  useSubscriptionAccess,
} from '@/components/client/subscription-access'
import { listMyClubChargesAction } from '@/lib/actions/cliente-assinatura-api'
import { isChargeOpen } from '@/lib/adapters/cliente-assinatura'

const SERVER_UNREACHABLE = 'Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.'

/**
 * Onboarding obrigatório do associado sem assinatura (`/cliente/assinar`).
 *
 * É a única tela do portal que ele vê até assinar: tela cheia, sem o menu,
 * com a marca do clube. Os e-mails de "falta assinar" da API apontam para cá.
 *
 *  - Sem assinatura: os planos ativos, cada um levando ao checkout.
 *  - Pagamento pendente: "Concluir pagamento" abre a fatura em aberto aqui
 *    mesmo (o mesmo diálogo de Pix/boleto das Faturas); "Escolher outro
 *    plano" mostra os planos.
 *
 * Confirmado o pagamento, a sessão é relida e o gate do layout leva ao
 * painel `/cliente` — esta página não precisa navegar sozinha.
 */
export default function ClientOnboardingPage() {
  const router = useRouter()
  const { user, logout, refreshSession } = useAuth()
  const { tenant } = useTenant()
  const { refresh: refreshMembership } = useClubMembership()
  const { pendingPayment, openCharge } = useSubscriptionAccess()
  const slug = tenant?.slug ?? ''
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? ''

  const [choosingOther, setChoosingOther] = useState(false)
  const [charges, setCharges] = useState<ClubCharge[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const loadCharges = useCallback(async (): Promise<ClubCharge[] | null> => {
    if (!slug) return null
    const result = await listMyClubChargesAction(slug)
    if (!result.success) return null
    setCharges(result.data)
    return result.data
  }, [slug])

  const concluirPagamento = async () => {
    setOpening(true)
    setPayError(null)
    try {
      const list = await loadCharges()
      const charge =
        list?.find(item => item.id === openCharge?.id && isChargeOpen(item)) ?? list?.find(isChargeOpen) ?? null
      if (!charge) {
        // Sem a fatura à mão: o caminho de sempre, pela tela de Faturas.
        router.push(pendingPaymentHref(slug, openCharge?.id))
        return
      }
      setSelectedId(charge.id)
      setDialogOpen(true)
    } catch {
      setPayError(SERVER_UNREACHABLE)
    } finally {
      setOpening(false)
    }
  }

  const poll = useCallback(async () => {
    await loadCharges().catch(() => null)
  }, [loadCharges])

  const onChargeUpdated = useCallback(
    (updated: ClubCharge) => {
      setCharges(previous =>
        previous ? previous.map(charge => (charge.id === updated.id ? updated : charge)) : [updated],
      )
      void refreshMembership()
    },
    [refreshMembership],
  )

  // Pago: a sessão (cookie) deixa de dizer `needsSubscription` e `/cliente/acesso`
  // é relido — com ele, o gate do layout leva ao painel.
  const onPaid = useCallback(() => {
    void Promise.all([refreshSession(), refreshMembership()])
  }, [refreshSession, refreshMembership])

  const selected = charges?.find(charge => charge.id === selectedId) ?? null
  const showPlans = !pendingPayment || choosingOther
  const logoUrl = tenant?.branding.logoLightUrl || tenant?.branding.logoUrl

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {logoUrl ? (
            <img src={logoUrl} alt={tenant?.name ?? 'Clube'} className="h-9 object-contain" />
          ) : (
            <span className="text-lg font-bold">{tenant?.name}</span>
          )}
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </button>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/80">
            <Sparkles className="size-3.5" aria-hidden />
            Primeiro passo
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            {firstName ? `Olá, ${firstName}! ` : 'Olá! '}
            {pendingPayment ? 'Falta só concluir o pagamento.' : 'Falta só escolher seu plano.'}
          </h1>
          <p className="mt-2 max-w-2xl text-white/85">
            {pendingPayment
              ? `Assim que o pagamento for confirmado, sua carteirinha e todos os benefícios do ${tenant?.name ?? 'clube'} são liberados.`
              : `Assine um plano do ${tenant?.name ?? 'clube'} para liberar sua carteirinha e todos os benefícios.`}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {pendingPayment ? (
          <PendingPaymentPanel
            onConcluir={() => void concluirPagamento()}
            concluindo={opening}
            onEscolherOutro={choosingOther ? undefined : () => setChoosingOther(true)}
            error={payError}
          />
        ) : null}

        {showPlans && slug ? (
          <section className="space-y-4">
            {pendingPayment ? (
              <h2 className="text-lg font-semibold text-foreground">Escolha outro plano</h2>
            ) : null}
            <PlansPicker slug={slug} />
          </section>
        ) : null}
      </main>

      <ChargePaymentDialog
        charge={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantSlug={slug}
        holderFirstName={firstName || undefined}
        onChargeUpdated={onChargeUpdated}
        onPoll={poll}
        onPaid={onPaid}
      />
    </div>
  )
}
