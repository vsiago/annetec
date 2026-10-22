'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  type CheckoutContext,
  type CheckoutStatus,
  type ClubPaymentMethod,
} from '@annetec/contracts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { retryCheckoutPaymentAction } from '@/lib/actions/checkout-api'
import {
  CARD_DECLINED_MESSAGE,
  cardOptionsFor,
  emptyCard,
  hasErrors,
  orderedMethods,
  parsePayment,
  sampleCard,
  testCards as testCardsFor,
  validateCard,
  type CardForm as CardFormValue,
  type FieldErrors,
} from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'
import { CardForm } from './card-form'
import { METHOD_ICONS } from './payment-step'

const DEFAULT_METHODS: ClubPaymentMethod[] = ['credit_card', 'pix', 'boleto']

interface PaymentRetryProps {
  slug: string
  subscriptionId: string
  chave: string
  context: CheckoutContext | null
  /** Método da cobrança atual — fica fora das opções quando não é cartão. */
  currentMethod: ClubPaymentMethod
  /** Formas efetivas do plano contratado (clube ∩ plano); ausente = as do clube. */
  methods?: readonly ClubPaymentMethod[] | null
  /** `declined`: cartão recusado (outro cartão ou outro método). `switch`: trocar Pix↔boleto↔cartão. */
  mode: 'declined' | 'switch'
  onUpdated: (status: CheckoutStatus) => void
}

/**
 * Nova tentativa de pagamento da 1ª cobrança (`POST …/:id/pagamento`):
 * outro cartão ou troca de método. Dados de cartão ficam só no estado deste
 * componente e são apagados após cada envio.
 */
export function PaymentRetry({
  slug,
  subscriptionId,
  chave,
  context,
  currentMethod,
  methods,
  mode,
  onUpdated,
}: PaymentRetryProps) {
  const options = useMemo(() => {
    const enabled = orderedMethods(methods ?? context?.enabledMethods ?? DEFAULT_METHODS)
    // Cartão recusado: "outro cartão" continua valendo. Troca: só métodos diferentes do atual.
    return mode === 'declined' ? enabled : enabled.filter(method => method !== currentMethod)
  }, [methods, context?.enabledMethods, currentMethod, mode])

  const [method, setMethod] = useState<ClubPaymentMethod | null>(
    mode === 'declined' && options.includes(currentMethod) ? currentMethod : (options[0] ?? null),
  )
  const [card, setCard] = useState<CardFormValue>(emptyCard)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const cards = context ? testCardsFor(context) : null
  const cardOptions = useMemo(() => cardOptionsFor(context), [context])

  const cardErrors = useMemo(() => (method === 'credit_card' ? validateCard(card, cardOptions) : {}), [card, method, cardOptions])
  const visibleCardErrors: FieldErrors = {}
  for (const [field, message] of Object.entries(cardErrors)) {
    if (showAll || touched[field]) visibleCardErrors[field] = message
  }
  Object.assign(visibleCardErrors, serverErrors)

  if (options.length === 0 || !method) return null

  const submit = async () => {
    if (busyRef.current) return
    if (method === 'credit_card' && hasErrors(cardErrors)) {
      setShowAll(true)
      return
    }
    const parsed = parsePayment(method, card, cardOptions)
    if (!parsed.ok) {
      setShowAll(true)
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    const result = await retryCheckoutPaymentAction(slug, subscriptionId, chave, parsed.data)
    busyRef.current = false
    setBusy(false)
    setCard(emptyCard())
    setTouched({})
    setShowAll(false)

    if (result.success) {
      setServerErrors({})
      if (result.data.charge.status === 'failed') {
        setError(result.data.charge.failureReason ?? CARD_DECLINED_MESSAGE)
      }
      onUpdated(result.data)
      return
    }
    setError(result.error)
    if (result.fieldErrors) {
      const cardFieldErrors: FieldErrors = {}
      for (const [path, message] of Object.entries(result.fieldErrors)) {
        const field = path.split('.').pop()
        if (path.startsWith('card.') && field) cardFieldErrors[field === 'expiryMonth' || field === 'expiryYear' ? 'expiry' : field] = message
      }
      setServerErrors(cardFieldErrors)
    }
  }

  const label =
    method === 'credit_card' ? 'Pagar com este cartão' : method === 'pix' ? 'Gerar Pix' : 'Gerar boleto'

  return (
    <div className="space-y-5">
      {options.length > 1 ? (
        <div role="radiogroup" aria-label="Forma de pagamento" className={cn('grid gap-2', options.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {options.map(option => {
            const Icon = METHOD_ICONS[option]
            const selected = option === method
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setMethod(option)
                  setError(null)
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-2xl border-2 bg-card px-2 py-3 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground hover:border-primary/50',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {option === 'credit_card'
                  ? mode === 'declined' && currentMethod === 'credit_card'
                    ? 'Outro cartão'
                    : 'Cartão'
                  : CLUB_PAYMENT_METHOD_LABELS[option]}
              </button>
            )
          })}
        </div>
      ) : null}

      {method === 'credit_card' ? (
        <CardForm
          idPrefix="retry-card"
          value={card}
          errors={visibleCardErrors}
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
      ) : (
        <p className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {method === 'pix'
            ? 'Geramos um novo QR Code Pix na hora. Assim que você pagar, a assinatura é ativada automaticamente.'
            : `Geramos o boleto na hora${context ? `, com vencimento em ${context.boletoDueDays} dia${context.boletoDueDays === 1 ? '' : 's'}` : ''}. A assinatura é ativada após a compensação.`}
        </p>
      )}

      {error ? (
        <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/5">
          <AlertCircle aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" size="lg" onClick={submit} disabled={busy} className="h-12 w-full rounded-xl text-base font-semibold">
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
        {busy ? 'Processando…' : label}
        {!busy ? <ArrowRight className="size-5" aria-hidden /> : null}
      </Button>
    </div>
  )
}
