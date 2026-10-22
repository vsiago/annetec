'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Check, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useClubMembership } from '@/components/client/club-membership-provider'
import { usePublicPlans } from '@/components/site/use-public-plans'
import { clientOnboardingPath } from '@/lib/auth/redirect'
import { cn } from '@/lib/utils'

/**
 * Associado sem assinatura do clube: o portal NÃO abre para ele. Toda rota
 * `/[tenant]/cliente/**` leva ao onboarding obrigatório `/cliente/assinar`
 * (tela cheia, sem o menu do portal) até a assinatura ficar ativa.
 *
 * A fonte é a leitura fresca de `/cliente/acesso` (ClubMembershipProvider —
 * muda sozinha depois de um pagamento). Só se ela falhar vale o
 * `needsSubscription` da própria sessão (`/auth/me`). Enquanto nenhuma das
 * duas resolveu, o gate mostra o carregando — não decide em cima de dado velho.
 */
export function useSubscriptionAccess() {
  const { user } = useAuth()
  const { access, membership, isLoading } = useClubMembership()
  /** Já dá para decidir: `access` chegou, ou a leitura terminou (e falhou). */
  const resolved = access !== null || !isLoading
  const needsSubscription = access ? access.needsSubscription : user?.needsSubscription === true
  const status = access?.status ?? user?.subscriptionStatus ?? null
  const pendingPayment = needsSubscription && status === 'pending_payment'
  const openCharge = membership?.openCharges?.[0] ?? null
  return { resolved, needsSubscription, pendingPayment, openCharge }
}

/** Trecho da URL do onboarding dentro de `/cliente`. */
const ONBOARDING_SECTION = 'assinar'

/**
 * Telas do portal que continuam abertas sem assinatura, além do onboarding:
 * Configurações (conta, senha) sempre; Faturas só com pagamento pendente —
 * é o caminho de reserva do "Concluir pagamento" quando a fatura aberta não
 * pode ser aberta direto no onboarding.
 */
function isOpenWithoutSubscription(section: string | null, pendingPayment: boolean): boolean {
  if (section === 'configuracoes') return true
  return section === 'faturas' && pendingPayment
}

/** Fatura em aberto no portal (abre o pagamento direto), ou a lista. */
export function pendingPaymentHref(slug: string, openChargeId: string | null | undefined): string {
  const base = `/${slug}/cliente/faturas`
  return openChargeId ? `${base}?cobranca=${encodeURIComponent(openChargeId)}` : base
}

export function isClientOnboardingPath(pathname: string, slug: string): boolean {
  return Boolean(slug) && sectionOf(pathname, slug) === ONBOARDING_SECTION
}

function sectionOf(pathname: string, slug: string): string | null {
  const prefix = `/${slug}/cliente/`
  if (!pathname.startsWith(prefix)) return null
  return pathname.slice(prefix.length).split('/')[0] || null
}

/**
 * Envolve o portal inteiro (layout do cliente), menu incluso:
 *  - sem assinatura, fora das telas liberadas → `/cliente/assinar`;
 *  - já assinante no onboarding (acabou de pagar) → `/cliente`;
 *  - `/cliente/acesso` diferente da sessão → regrava o cookie da sessão
 *    (`refreshSession`), para `needsSubscription` não voltar velho no
 *    próximo carregamento nem em quem lê o cookie (checkout).
 */
export function ClientSubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const { user, refreshSession } = useAuth()
  const { access } = useClubMembership()
  const { resolved, needsSubscription, pendingPayment } = useSubscriptionAccess()

  const section = sectionOf(pathname, slug)
  const onOnboarding = section === ONBOARDING_SECTION

  let target: string | null = null
  if (slug && resolved) {
    if (needsSubscription && !onOnboarding && !isOpenWithoutSubscription(section, pendingPayment)) {
      target = clientOnboardingPath(slug)
    } else if (!needsSubscription && onOnboarding) {
      target = `/${slug}/cliente`
    }
  }

  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])

  // Uma regravação por situação nova: se `/auth/me` e `/cliente/acesso`
  // discordarem de vez, isto não vira um laço de chamadas.
  const syncedStatus = useRef<string | null>(null)
  useEffect(() => {
    if (!access || !user) return
    const sessionIsCurrent =
      (user.needsSubscription === true) === access.needsSubscription && user.subscriptionStatus === access.status
    if (sessionIsCurrent || syncedStatus.current === access.status) return
    syncedStatus.current = access.status
    void refreshSession()
  }, [access, user, refreshSession])

  if (!slug || !resolved || target) return <PortalLoading />
  return <>{children}</>
}

function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    </div>
  )
}

/** Pagamento pendente da assinatura: concluir (fatura em aberto) ou trocar de plano. */
export function PendingPaymentPanel({
  onConcluir,
  concluindo = false,
  onEscolherOutro,
  error,
}: {
  onConcluir: () => void
  concluindo?: boolean
  onEscolherOutro?: () => void
  error?: string | null
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Clock className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Seu pagamento está pendente</p>
            <p className="text-sm text-muted-foreground">
              Pague o Pix ou o boleto da sua assinatura — ou gere um novo — para liberar sua carteirinha e os
              benefícios.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button className="h-11 rounded-xl px-6" onClick={onConcluir} disabled={concluindo}>
            {concluindo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Concluir pagamento
            {concluindo ? null : <ArrowRight className="size-4" aria-hidden />}
          </Button>
          {onEscolherOutro ? (
            <button
              type="button"
              onClick={onEscolherOutro}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Escolher outro plano
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Quantos itens do plano cada card mostra. */
const FEATURES_PER_CARD = 4

/**
 * Planos ativos do clube (vitrine pública), cada um levando ao checkout em 2
 * etapas `/[tenant]/assinar?plano=ID` — com a sessão do associado, o checkout
 * já vem com nome e e-mail dele (e-mail travado).
 */
export function PlansPicker({ slug }: { slug: string }) {
  const { plans, isLoading, error } = usePublicPlans(slug)
  const active = plans.filter(plan => plan.status === 'active')

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map(index => (
          <Skeleton key={index} className="h-72 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (active.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        {error ? 'Não conseguimos carregar os planos agora.' : 'Nenhum plano disponível no momento.'}{' '}
        <Link href={`/${slug}/planos`} className="font-semibold text-primary hover:underline">
          Ver página de planos
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {active.map(plan => (
        <div
          key={plan.id}
          className={cn(
            'flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md',
            plan.highlight ? 'border-primary ring-1 ring-primary/30' : 'border-border',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-semibold text-foreground">{plan.name}</p>
            {plan.highlight ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Destaque
              </span>
            ) : null}
          </div>
          <p className="mt-2">
            <span className="text-3xl font-bold text-foreground">{brl.format(plan.priceMonthly)}</span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </p>
          {plan.features.length > 0 ? (
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
              {plan.features.slice(0, FEATURES_PER_CARD).map(feature => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex-1" />
          )}
          <Button asChild className="mt-6 h-11 w-full rounded-xl" variant={plan.highlight ? 'default' : 'outline'}>
            <Link href={`/${slug}/assinar?plano=${encodeURIComponent(plan.id)}`}>Escolher este plano</Link>
          </Button>
        </div>
      ))}
    </div>
  )
}
