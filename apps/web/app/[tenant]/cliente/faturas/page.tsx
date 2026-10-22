'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Lock,
  QrCode,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import { formatBRL, formatDateBR, type ClubCharge, type ClubPaymentMethod } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { cn } from '@/lib/utils'
import { listMyClubChargesAction } from '@/lib/actions/cliente-assinatura-api'
import {
  chargeDueText,
  chargeStatusView,
  chargeTitle,
  firstName,
  isChargeLate,
  isChargeOpen,
  openChargesTotal,
  paymentMethodLabel,
  pluralize,
  splitCharges,
} from '@/lib/adapters/cliente-assinatura'
import { useClubMembership } from '@/components/client/club-membership-provider'
import { ChargePaymentDialog } from '@/components/client/charge-payment-dialog'
import { LoadErrorNotice, StatusNotice, ToneBadge } from '@/components/client/status-ui'

const SERVER_UNREACHABLE = 'Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.'

const METHOD_ICON: Record<ClubPaymentMethod, typeof QrCode> = {
  pix: QrCode,
  boleto: Barcode,
  credit_card: CreditCard,
}

export default function FaturasPage() {
  return (
    <Suspense fallback={<FaturasSkeleton />}>
      <FaturasContent />
    </Suspense>
  )
}

function FaturasContent() {
  const { tenant } = useTenant()
  const { user } = useAuth()
  const { membership, refresh: refreshMembership } = useClubMembership()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedId = searchParams.get('cobranca')
  const slug = tenant?.slug ?? ''

  const [charges, setCharges] = useState<ClubCharge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const inFlight = useRef(false)
  const autoOpened = useRef<string | null>(null)

  /** `silent`: polling/volta para a aba — não pisca carregando nem troca a tela por erro. */
  const load = useCallback(
    async (silent: boolean) => {
      if (!slug || inFlight.current) return
      inFlight.current = true
      if (!silent) setRefreshing(true)
      try {
        const result = await listMyClubChargesAction(slug)
        if (result.success) {
          setCharges(result.data)
          setError(null)
        } else if (!silent) {
          setError(result.error)
        }
      } catch {
        if (!silent) setError(SERVER_UNREACHABLE)
      } finally {
        inFlight.current = false
        if (!silent) setRefreshing(false)
      }
    },
    [slug],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  // Voltou do app do banco: relê sem alarde.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // `?cobranca=<id>` (atalhos "Pagar agora"/"Regularizar agora"): abre a fatura direto.
  useEffect(() => {
    if (!requestedId || !charges || autoOpened.current === requestedId) return
    autoOpened.current = requestedId
    if (charges.some(charge => charge.id === requestedId)) {
      setSelectedId(requestedId)
      setDialogOpen(true)
    }
  }, [requestedId, charges])

  const poll = useCallback(() => load(true), [load])

  const onChargeUpdated = useCallback(
    (updated: ClubCharge) => {
      setCharges(previous =>
        previous ? previous.map(charge => (charge.id === updated.id ? updated : charge)) : [updated],
      )
      void refreshMembership()
    },
    [refreshMembership],
  )

  const onPaid = useCallback(() => {
    void refreshMembership()
  }, [refreshMembership])

  const openCharge = (id: string) => {
    setSelectedId(id)
    setDialogOpen(true)
  }

  const onDialogOpenChange = (next: boolean) => {
    setDialogOpen(next)
    // Tira o `?cobranca=` da URL para um F5 não reabrir a fatura.
    if (!next && requestedId) router.replace(pathname, { scroll: false })
  }

  const { open, history } = useMemo(() => splitCharges(charges ?? []), [charges])
  const selected = charges?.find(charge => charge.id === selectedId) ?? null
  const lateCount = open.filter(isChargeLate).length
  const openTotal = openChargesTotal(open)
  const subscription = membership?.subscription ?? null
  const holderFirstName = firstName(subscription?.holder.name ?? user?.name)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minhas faturas</h1>
          <p className="text-muted-foreground">
            {subscription ? `Mensalidades do ${subscription.planName}` : 'Mensalidades da sua assinatura do clube'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void load(false)}
          disabled={refreshing}
          aria-label="Atualizar faturas"
          title="Atualizar"
        >
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
        </Button>
      </div>

      {charges === null ? (
        error ? (
          <LoadErrorNotice
            title="Não conseguimos carregar suas faturas"
            message={error}
            onRetry={() => void load(false)}
            retrying={refreshing}
          />
        ) : (
          <FaturasListSkeleton />
        )
      ) : charges.length === 0 ? (
        <EmptyFaturas tenantSlug={slug} hasSubscription={subscription !== null} />
      ) : (
        <>
          {error && (
            <LoadErrorNotice
              title="Não conseguimos atualizar suas faturas"
              message={error}
              onRetry={() => void load(false)}
              retrying={refreshing}
            />
          )}

          {/* Resumo do que está em aberto */}
          {open.length > 0 ? (
            <div className="space-y-3">
              {lateCount > 0 && (
                <StatusNotice
                  tone="danger"
                  icon={subscription?.status === 'suspended' ? Lock : AlertTriangle}
                  title={
                    subscription?.status === 'suspended'
                      ? 'Carteirinha bloqueada até o pagamento'
                      : `Você tem ${pluralize(lateCount, 'fatura vencida', 'faturas vencidas')}`
                  }
                  description={
                    subscription?.status === 'suspended'
                      ? 'Pague a fatura vencida por Pix e as carteirinhas voltam a funcionar assim que o pagamento for confirmado.'
                      : 'Regularize por Pix — a confirmação sai em instantes e a sua carteirinha continua valendo.'
                  }
                />
              )}
              <Card className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">Total em aberto</p>
                    <p className="text-2xl font-bold tabular-nums">{formatBRL(openTotal)}</p>
                    <p className="text-xs text-muted-foreground">{pluralize(open.length, 'fatura', 'faturas')}</p>
                  </div>
                  <Button
                    type="button"
                    className={cn('text-white', lateCount > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:opacity-90')}
                    onClick={() => openCharge(open[0].id)}
                  >
                    {lateCount > 0 ? 'Regularizar agora' : 'Pagar agora'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <StatusNotice
              tone="success"
              icon={CheckCircle2}
              title="Tudo em dia!"
              description={
                subscription?.nextDueDate && subscription.status !== 'canceled'
                  ? `Nenhuma fatura em aberto. A próxima mensalidade vence em ${formatDateBR(subscription.nextDueDate)}.`
                  : 'Nenhuma fatura em aberto.'
              }
            />
          )}

          {open.length > 0 && (
            <section className="space-y-3" aria-labelledby="faturas-abertas">
              <h2 id="faturas-abertas" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Em aberto
              </h2>
              <ul className="space-y-2">
                {open.map(charge => (
                  <li key={charge.id}>
                    <ChargeRow charge={charge} onOpen={() => openCharge(charge.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 0 && (
            <section className="space-y-3" aria-labelledby="faturas-historico">
              <h2 id="faturas-historico" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Histórico
              </h2>
              <ul className="space-y-2">
                {history.map(charge => (
                  <li key={charge.id}>
                    <ChargeRow charge={charge} onOpen={() => openCharge(charge.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ChargePaymentDialog
        charge={selected}
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        tenantSlug={slug}
        holderFirstName={holderFirstName}
        onChargeUpdated={onChargeUpdated}
        onPoll={poll}
        onPaid={onPaid}
      />
    </div>
  )
}

function ChargeRow({ charge, onOpen }: { charge: ClubCharge; onOpen: () => void }) {
  const status = chargeStatusView(charge.status)
  const Icon = METHOD_ICON[charge.method]
  const open = isChargeOpen(charge)
  const late = isChargeLate(charge)
  // Mensalidade no cartão é cobrada sozinha; a avulsa no cartão espera o associado pagar.
  const autoCard = charge.method === 'credit_card' && charge.status === 'pending' && charge.kind !== 'one_off'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left shadow-sm ring-1 ring-border/40 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
          late
            ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
            : open
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold">{chargeTitle(charge)}</span>
          <span className="shrink-0 font-semibold tabular-nums">{formatBRL(charge.amount)}</span>
        </span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm',
              late ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground',
            )}
          >
            {open ? `${chargeDueText(charge)} · ${formatDateBR(charge.dueDate)}` : chargeDueText(charge)}
            <span className="hidden sm:inline"> · {paymentMethodLabel(charge.method)}</span>
          </span>
          <ToneBadge tone={status.tone} className="shrink-0">
            {status.label}
          </ToneBadge>
        </span>
      </span>
      {open && !autoCard ? (
        <span
          className={cn(
            'hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white sm:inline-flex',
            late ? 'bg-red-600' : 'bg-primary',
          )}
        >
          Pagar
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function EmptyFaturas({ tenantSlug, hasSubscription }: { tenantSlug: string; hasSubscription: boolean }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Receipt className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-lg font-semibold">
          {hasSubscription ? 'Nenhuma fatura por aqui ainda' : 'Você ainda não tem faturas do clube'}
        </h2>
        <p className="mx-auto mb-5 max-w-md text-muted-foreground">
          {hasSubscription
            ? 'Assim que a próxima mensalidade for gerada, ela aparece aqui para você pagar por Pix ou boleto.'
            : 'Quando você assinar um plano do clube, as mensalidades aparecem aqui — com Pix, boleto e segunda via na palma da mão.'}
        </p>
        {!hasSubscription && tenantSlug && (
          <Button asChild className="bg-primary text-white hover:opacity-90">
            <Link href={`/${tenantSlug}/planos`}>Conhecer os planos</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function FaturasListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando faturas">
      <Skeleton className="h-24 w-full rounded-xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  )
}

function FaturasSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <FaturasListSkeleton />
    </div>
  )
}
