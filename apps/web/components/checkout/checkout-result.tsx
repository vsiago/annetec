'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, Ban, ChevronDown, CreditCard, Info, RefreshCw, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  type CheckoutContext,
  type CheckoutStatus,
  type ClubPaymentMethod,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import {
  getCheckoutStatusAction,
  retryCheckoutPaymentAction,
  simulateCheckoutPaymentAction,
} from '@/lib/actions/checkout-api'
import { CARD_DECLINED_MESSAGE, methodsFor, phaseOf, planByName, shouldPoll, type CheckoutPhase } from '@/lib/adapters/checkout'
import { isDemoMode } from '@/lib/demo-mode'
import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DemoBanner } from './checkout-states'
import { PaymentRetry } from './payment-retry'
import {
  BoletoPanel,
  ConfirmingPanel,
  MessagePanel,
  PanelCard,
  PixPanel,
  SuccessPanel,
} from './result-panels'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 15 * 60 * 1000

export interface CheckoutHandoff {
  status: CheckoutStatus
  signedIn: boolean
  accountCreated: boolean
  holderName: string
  /** Só em memória, para lembrar com que dados entrar na área do associado. */
  holderEmail: string
  holderCpf: string
}

interface CheckoutResultViewProps {
  slug: string
  tenant: Tenant
  subscriptionId: string
  chave: string
  context: CheckoutContext | null
  /** Resultado do envio que acabou de acontecer (evita um GET e guarda o nome completo). */
  handoff: CheckoutHandoff | null
  onRestart: () => void
}

/**
 * Tela de resultado (`?assinatura=&chave=`): Pix/boleto com polling, cartão
 * recusado com nova tentativa e a celebração com as carteirinhas. Recarregar
 * a página refaz o estado a partir da API.
 */
export function CheckoutResultView({
  slug,
  tenant,
  subscriptionId,
  chave,
  context,
  handoff,
  onRestart,
}: CheckoutResultViewProps) {
  const { user } = useAuth()
  const [status, setStatus] = useState<CheckoutStatus | null>(handoff?.status ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(() => (handoff ? phaseOf(handoff.status) === 'active' : false))
  const [stale, setStale] = useState(false)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [tick, setTick] = useState(0)
  const [simulating, setSimulating] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const failures = useRef(0)
  const pollStartedAt = useRef(Date.now())
  const lastPhase = useRef<CheckoutPhase | null>(handoff ? phaseOf(handoff.status) : null)
  const busyRef = useRef(false)

  const signedIn = Boolean(handoff?.signedIn) || user?.role === 'client'
  const phase = status ? phaseOf(status) : null

  const applyStatus = useCallback((next: CheckoutStatus) => {
    const nextPhase = phaseOf(next)
    if (nextPhase === 'active' && lastPhase.current !== null && lastPhase.current !== 'active') {
      setCelebrate(true)
      toast.success('Pagamento confirmado! Sua assinatura está ativa.')
    }
    lastPhase.current = nextPhase
    setStatus(next)
  }, [])

  // Carga inicial (recarregou a página ou abriu o link de acompanhamento).
  const load = useCallback(async () => {
    setLoadError(null)
    const result = await getCheckoutStatusAction(slug, subscriptionId, chave)
    if (result.success) applyStatus(result.data)
    else setLoadError(result.error)
  }, [applyStatus, chave, slug, subscriptionId])

  useEffect(() => {
    if (handoff) return
    void load()
  }, [handoff, load])

  // Polling de 3 s enquanto o pagamento está pendente (para em ativa/cancelada ou após 15 min).
  useEffect(() => {
    if (!phase || !shouldPoll(phase) || pollTimedOut) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) {
        setPollTimedOut(true)
        return
      }
      if (document.visibilityState === 'hidden') {
        setTick(value => value + 1)
        return
      }
      const result = await getCheckoutStatusAction(slug, subscriptionId, chave)
      if (cancelled) return
      if (result.success) {
        failures.current = 0
        setStale(false)
        applyStatus(result.data)
      } else {
        failures.current += 1
        if (failures.current >= 3) setStale(true)
      }
      setTick(value => value + 1)
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [applyStatus, chave, phase, pollTimedOut, slug, subscriptionId, tick])

  const resumePolling = () => {
    pollStartedAt.current = Date.now()
    setPollTimedOut(false)
    setTick(value => value + 1)
  }

  const simulate = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSimulating(true)
    const result = await simulateCheckoutPaymentAction(slug, subscriptionId, chave)
    busyRef.current = false
    setSimulating(false)
    if (result.success) applyStatus(result.data)
    else toast.error(result.error)
  }

  const regeneratePix = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setRegenerating(true)
    const result = await retryCheckoutPaymentAction(slug, subscriptionId, chave, { method: 'pix' })
    busyRef.current = false
    setRegenerating(false)
    if (result.success) {
      pollStartedAt.current = Date.now()
      setPollTimedOut(false)
      applyStatus(result.data)
    } else toast.error(result.error)
  }

  const isDemo = isDemoMode(context) || isDemoMode({ canSimulatePayment: status?.canSimulatePayment })
  // Nova tentativa / troca de forma: só as formas do plano contratado (clube ∩ plano).
  const planMethods = context && status ? methodsFor(planByName(context.plans, status.planName), context.enabledMethods) : null

  // ------------------------------------------------------------------ render
  let body: React.ReactNode

  if (!status) {
    body = loadError ? (
      <MessagePanel
        icon={<SearchX className="size-8" aria-hidden />}
        tone="warning"
        title="Não encontramos este pedido"
        actions={
          <>
            <Button type="button" onClick={() => void load()} className="h-12 rounded-xl text-base">
              <RefreshCw className="size-4" aria-hidden />
              Tentar novamente
            </Button>
            <Button type="button" variant="outline" onClick={onRestart} className="h-12 rounded-xl text-base">
              Fazer uma nova assinatura
            </Button>
          </>
        }
      >
        <p>{loadError}</p>
        <p className="mt-2 text-sm">Confira se o link está completo — ele contém a chave de acesso do seu pedido.</p>
      </MessagePanel>
    ) : (
      <ConfirmingPanel title="Carregando o seu pedido…" text="Só um instante." stale={false} />
    )
  } else if (phase === 'active') {
    body = (
      <SuccessPanel
        slug={slug}
        tenant={tenant}
        status={status}
        holderName={handoff?.holderName}
        loginHint={handoff ? { email: handoff.holderEmail, cpf: handoff.holderCpf } : undefined}
        signedIn={signedIn}
        celebrate={celebrate}
      />
    )
  } else if (phase === 'awaiting_pix') {
    body = (
      <PixPanel
        status={status}
        context={context}
        stale={stale}
        simulating={simulating}
        onSimulate={simulate}
        onRegenerate={regeneratePix}
        regenerating={regenerating}
        footer={
          <SwitchMethod
            slug={slug}
            subscriptionId={subscriptionId}
            chave={chave}
            context={context}
            methods={planMethods}
            status={status}
            onUpdated={applyStatus}
          />
        }
      />
    )
  } else if (phase === 'awaiting_boleto') {
    body = (
      <BoletoPanel
        slug={slug}
        chave={chave}
        status={status}
        context={context}
        stale={stale}
        simulating={simulating}
        onSimulate={simulate}
        footer={
          <SwitchMethod
            slug={slug}
            subscriptionId={subscriptionId}
            chave={chave}
            context={context}
            methods={planMethods}
            status={status}
            onUpdated={applyStatus}
          />
        }
      />
    )
  } else if (phase === 'declined') {
    const isCard = status.charge.method === 'credit_card'
    body = (
      <PanelCard>
        <div className="text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {isCard ? <CreditCard className="size-8" aria-hidden /> : <Info className="size-8" aria-hidden />}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
            {isCard ? 'Pagamento não aprovado' : 'Pagamento não gerado'}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {isCard
              ? `O cartão foi recusado, ${status.holderFirstName}`
              : `Não conseguimos gerar o ${CLUB_PAYMENT_METHOD_LABELS[status.charge.method]}, ${status.holderFirstName}`}
          </h1>
          <p className="mx-auto mt-3 max-w-md rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            {status.charge.failureReason ??
              (isCard ? CARD_DECLINED_MESSAGE : 'O processador de pagamentos não respondeu.')}
          </p>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Fique tranquilo(a): <strong className="text-foreground">nada foi cobrado</strong> e seus dados estão salvos.
            {isCard
              ? ` Tente outro cartão ou pague com ${(planMethods ?? context?.enabledMethods ?? []).includes('pix') ? 'Pix' : 'outra forma'} — leva menos de um minuto.`
              : ' Tente de novo ou escolha outra forma de pagamento.'}
          </p>
        </div>
        <div className="mx-auto mt-6 max-w-lg">
          <PaymentRetry
            slug={slug}
            subscriptionId={subscriptionId}
            chave={chave}
            context={context}
            currentMethod={status.charge.method}
            methods={planMethods}
            mode="declined"
            onUpdated={applyStatus}
          />
        </div>
      </PanelCard>
    )
  } else if (phase === 'awaiting_card') {
    body = (
      <ConfirmingPanel
        title="Confirmando o pagamento com a operadora"
        text="Isso costuma levar poucos segundos. Não feche esta página."
        stale={stale}
      />
    )
  } else if (phase === 'confirming') {
    body = (
      <ConfirmingPanel
        title="Pagamento recebido!"
        text="Estamos ativando a sua assinatura e emitindo as carteirinhas."
        stale={stale}
      />
    )
  } else if (phase === 'canceled') {
    body = (
      <MessagePanel
        icon={<Ban className="size-8" aria-hidden />}
        tone="danger"
        title="Este pedido não está mais ativo"
        actions={
          <>
            <Button type="button" onClick={onRestart} className="h-12 rounded-xl text-base">
              Fazer uma nova assinatura
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl text-base">
              <Link href={`/${slug}`}>Voltar ao site</Link>
            </Button>
          </>
        }
      >
        <p>
          Ele foi cancelado — por falta de pagamento ou porque uma nova contratação foi feita com os mesmos dados. Se
          você já assinou de novo, acesse a sua área com CPF e e-mail.
        </p>
      </MessagePanel>
    )
  } else {
    body = (
      <MessagePanel
        icon={<Info className="size-8" aria-hidden />}
        title="Esta assinatura já foi processada"
        actions={
          <Button asChild className="h-12 rounded-xl text-base">
            <Link href={signedIn ? `/${slug}/cliente` : `/${slug}/login`}>Acessar minha área</Link>
          </Button>
        }
      >
        <p>Os detalhes de pagamento e as carteirinhas estão na sua área do associado.</p>
      </MessagePanel>
    )
  }

  return (
    <>
      {isDemo ? <DemoBanner /> : null}
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {status ? (
          <p className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{status.planName}</span>
            <span aria-hidden>·</span>
            <span>{formatBRL(status.amount)}/mês</span>
            <span aria-hidden>·</span>
            <span>{CLUB_PAYMENT_METHOD_LABELS[status.charge.method]}</span>
          </p>
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase ?? (loadError ? 'error' : 'loading')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
        {pollTimedOut && phase && shouldPoll(phase) ? (
          <div className="mt-4 rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">
            <p>
              Ainda não identificamos o pagamento. Assim que ele for confirmado, a assinatura é ativada automaticamente.
            </p>
            <Button type="button" variant="outline" onClick={resumePolling} className="mt-3 h-10 rounded-xl">
              <RefreshCw className="size-4" aria-hidden />
              Verificar agora
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

/** "Prefere outra forma de pagamento?" — troca Pix↔boleto↔cartão enquanto pendente. */
function SwitchMethod({
  slug,
  subscriptionId,
  chave,
  context,
  methods,
  status,
  onUpdated,
}: {
  slug: string
  subscriptionId: string
  chave: string
  context: CheckoutContext | null
  /** Formas efetivas do plano contratado; ausente = as do clube. */
  methods: readonly ClubPaymentMethod[] | null
  status: CheckoutStatus
  onUpdated: (status: CheckoutStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const enabled = methods ?? context?.enabledMethods ?? ['pix', 'boleto', 'credit_card']
  if (!enabled.some(method => method !== status.charge.method)) return null

  return (
    <div className="rounded-2xl border">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-primary" aria-hidden />
          Prefere outra forma de pagamento?
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t p-4">
              <PaymentRetry
                slug={slug}
                subscriptionId={subscriptionId}
                chave={chave}
                context={context}
                currentMethod={status.charge.method}
                methods={methods}
                mode="switch"
                onUpdated={next => {
                  setOpen(false)
                  onUpdated(next)
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
