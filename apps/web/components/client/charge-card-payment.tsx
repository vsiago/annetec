'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CreditCard, Loader2, Lock } from 'lucide-react'
import { formatBRL, type CheckoutContext, type ClubCharge } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { CardForm } from '@/components/checkout/card-form'
import { getCheckoutContextAction } from '@/lib/actions/checkout-api'
import { payMyClubChargeAction } from '@/lib/actions/cliente-assinatura-api'
import {
  CARD_DECLINED_MESSAGE,
  cardNameFromHolder,
  cardOptionsFor,
  emptyCard,
  hasErrors,
  parsePayment,
  sampleCard,
  testCards as testCardsFor,
  validateCard,
  type CardForm as CardFormValue,
  type FieldErrors,
} from '@/lib/adapters/checkout'

const SERVER_UNREACHABLE = 'Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.'

/**
 * Pagar uma fatura do portal com cartão digitado — o mesmo formulário do
 * checkout (`CardForm`), enviado para `POST /cliente/cobrancas/:id/pagar`.
 * Usado quando o clube mandou a cobrança "para pagar com cartão" (link no
 * e-mail) ou quando o associado quer usar outro cartão. Os dados do cartão
 * ficam só no estado deste componente e são apagados após cada envio.
 */
export function ChargeCardPayment({
  tenantSlug,
  charge,
  holderName,
  disabled,
  onUpdated,
}: {
  tenantSlug: string
  charge: ClubCharge
  holderName?: string
  disabled?: boolean
  onUpdated: (charge: ClubCharge) => void
}) {
  const [context, setContext] = useState<CheckoutContext | null>(null)
  const [card, setCard] = useState<CardFormValue>(() => ({
    ...emptyCard(),
    holderName: holderName ? cardNameFromHolder(holderName) : '',
  }))
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  // Contexto público do checkout: diz se o gateway é de teste (cartões de exemplo).
  useEffect(() => {
    let alive = true
    void getCheckoutContextAction(tenantSlug)
      .then(result => {
        if (alive && result.success) setContext(result.data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tenantSlug])

  const cardOptions = useMemo(() => cardOptionsFor(context), [context])
  const cards = context ? testCardsFor(context) : null
  const cardErrors = useMemo(() => validateCard(card, cardOptions), [card, cardOptions])
  const visibleErrors: FieldErrors = {}
  for (const [field, message] of Object.entries(cardErrors)) {
    if (showAll || touched[field]) visibleErrors[field] = message
  }
  Object.assign(visibleErrors, serverErrors)

  const submit = async () => {
    if (busyRef.current) return
    if (hasErrors(cardErrors)) {
      setShowAll(true)
      return
    }
    const parsed = parsePayment('credit_card', card, cardOptions)
    if (!parsed.ok) {
      setShowAll(true)
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await payMyClubChargeAction(tenantSlug, charge.id, parsed.data)
      setCard(current => ({ ...emptyCard(), holderName: current.holderName }))
      setTouched({})
      setShowAll(false)
      if (!result.success) {
        setError(result.error)
        if (result.fieldErrors) {
          const next: FieldErrors = {}
          for (const [path, message] of Object.entries(result.fieldErrors)) {
            const field = path.split('.').pop()
            if (path.startsWith('card.') && field) next[field === 'expiryMonth' || field === 'expiryYear' ? 'expiry' : field] = message
          }
          setServerErrors(next)
        }
        return
      }
      setServerErrors({})
      if (result.data.status === 'failed') setError(result.data.failureReason ?? CARD_DECLINED_MESSAGE)
      onUpdated(result.data)
    } catch {
      setError(SERVER_UNREACHABLE)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <CardForm
        idPrefix="fatura-card"
        value={card}
        errors={visibleErrors}
        cardOptions={cardOptions}
        onChange={(field, value) => {
          setCard(current => ({ ...current, [field]: value }))
          setServerErrors(current => {
            if (!(field in current)) return current
            const next = { ...current }
            delete next[field]
            return next
          })
        }}
        onBlur={field => setTouched(current => ({ ...current, [field]: true }))}
        testCards={cards}
        onUseTestCard={
          cards
            ? kind => setCard(current => ({ ...current, number: sampleCard(kind === 'approved' ? cards.approved : cards.declined) }))
            : undefined
        }
      />

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="h-12 w-full bg-primary text-base text-white hover:opacity-90"
        onClick={submit}
        disabled={busy || disabled}
      >
        {busy ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {busy ? 'Processando…' : `Pagar ${formatBRL(charge.amount)} no cartão`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Pagamento processado com segurança. Não guardamos o número nem o código do cartão.
      </p>
    </div>
  )
}
