'use client'

import { useState } from 'react'
import { CreditCard, Loader2, Lock, ShieldCheck } from 'lucide-react'
import {
  CARD_BRAND_LABELS,
  cardCvvLength,
  checkoutCardSchema,
  detectCardBrand,
  formatBRL,
  maskCardExpiry,
  maskCardNumber,
  maskCep,
  maskCpf,
  onlyDigits,
  type CheckoutCardInput,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField } from '@/components/contratar/ui'
import { sampleCard, testCards } from '@/lib/adapters/checkout'
import { errorsUnder, validate, type FieldErrors } from '@/lib/adapters/contratacao'
import { isDemoMode } from '@/lib/demo-mode'

interface CardFormState {
  number: string
  holderName: string
  expiry: string
  ccv: string
  holderCpf: string
  holderPostalCode: string
  holderAddressNumber: string
}

const EMPTY: CardFormState = {
  number: '',
  holderName: '',
  expiry: '',
  ccv: '',
  holderCpf: '',
  holderPostalCode: '',
  holderAddressNumber: '',
}

/** O que a fatura diz sobre o gateway — decide o ambiente de testes (`isDemoMode`). */
export interface InvoiceGatewayInfo {
  gateway: PaymentGatewayProvider
  canSimulatePayment: boolean
}

/**
 * Cartão para pagar a fatura ANNETEC. Validação com o `checkoutCardSchema` do
 * contrato (bandeira, Luhn, validade, CVV por bandeira; `4444…` da sandbox só
 * em ambiente de testes). Sem CPF do dono, a API usa o CNPJ do
 * pagador. Número e CVV só atravessam para o gateway; nada é guardado aqui.
 */
export function CardPaymentForm({
  amount,
  busy,
  serverErrors,
  gateway,
  onSubmit,
}: {
  amount: number
  busy: boolean
  serverErrors?: FieldErrors
  /** Gateway da fatura; os atalhos de cartão de teste só aparecem em ambiente de testes. */
  gateway?: InvoiceGatewayInfo | null
  onSubmit: (card: CheckoutCardInput) => void
}) {
  const demo = isDemoMode(gateway)
  const cards =
    gateway && demo
      ? testCards({
          gateway: gateway.gateway,
          sandbox: gateway.gateway === 'asaas' && gateway.canSimulatePayment,
          canSimulatePayment: gateway.canSimulatePayment,
          simulation: null,
        })
      : null
  const [form, setForm] = useState<CardFormState>(EMPTY)
  const [otherOwner, setOtherOwner] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const brand = detectCardBrand(form.number)
  const shown = { ...errorsUnder(serverErrors, 'card.'), ...errors }

  function set(key: keyof CardFormState, value: string) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => {
      const next = { ...current }
      delete next[key]
      if (key === 'expiry') {
        delete next.expiryMonth
        delete next.expiryYear
      }
      return next
    })
  }

  function submit() {
    const [month, year] = form.expiry.split('/')
    const parsed = validate(checkoutCardSchema({ allowSandboxCard: demo }), {
      holderName: form.holderName,
      number: form.number,
      expiryMonth: month ?? '',
      expiryYear: year ?? '',
      ccv: onlyDigits(form.ccv),
      holderCpf: otherOwner ? form.holderCpf : '',
      holderPostalCode: form.holderPostalCode,
      holderAddressNumber: form.holderAddressNumber,
    })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    onSubmit(parsed.data)
  }

  return (
    <div className="space-y-4">
      {cards ? (
        <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50/60 px-3 py-2.5 text-xs dark:border-amber-500/40 dark:bg-amber-950/20">
          <p className="text-amber-900 dark:text-amber-100">
            <span className="font-semibold">Ambiente de testes</span> — nenhum valor é cobrado. Preencha o número com um
            cartão de teste:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800"
              onClick={() => set('number', sampleCard(cards.approved))}
            >
              Cartão aprovado
            </button>
            <button
              type="button"
              className="rounded-full border border-rose-600/30 bg-rose-50 px-2.5 py-1 font-medium text-rose-800"
              onClick={() => set('number', sampleCard(cards.declined))}
            >
              Cartão recusado ({cards.declinedHint})
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Número do cartão"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={form.number}
          onChange={event => set('number', maskCardNumber(event.target.value))}
          error={shown.number}
          containerClassName="sm:col-span-2"
          adornment={
            brand ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">{CARD_BRAND_LABELS[brand]}</span>
            ) : (
              <CreditCard className="size-4 text-muted-foreground" aria-hidden />
            )
          }
        />
        <TextField
          label="Nome impresso no cartão"
          autoComplete="cc-name"
          value={form.holderName}
          onChange={event => set('holderName', event.target.value.toUpperCase())}
          error={shown.holderName}
          containerClassName="sm:col-span-2"
        />
        <TextField
          label="Validade"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/AA"
          value={form.expiry}
          onChange={event => set('expiry', maskCardExpiry(event.target.value))}
          error={shown.expiryMonth ?? shown.expiryYear}
        />
        <TextField
          label="CVV"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder={`${cardCvvLength(brand)} dígitos`}
          maxLength={4}
          value={form.ccv}
          onChange={event => set('ccv', onlyDigits(event.target.value).slice(0, cardCvvLength(brand)))}
          error={shown.ccv}
          adornment={<Lock className="size-4 text-muted-foreground" aria-hidden />}
        />
        <TextField
          label="CEP da fatura do cartão"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={form.holderPostalCode}
          onChange={event => set('holderPostalCode', maskCep(event.target.value))}
          error={shown.holderPostalCode}
        />
        <TextField
          label="Número do endereço"
          value={form.holderAddressNumber}
          maxLength={10}
          onChange={event => set('holderAddressNumber', event.target.value)}
          error={shown.holderAddressNumber}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Checkbox id="card-other-owner" checked={otherOwner} onCheckedChange={checked => setOtherOwner(checked === true)} />
        <label htmlFor="card-other-owner" className="cursor-pointer text-sm text-foreground">
          Cartão pessoal de um representante (informar CPF)
        </label>
      </div>
      {otherOwner ? (
        <TextField
          label="CPF do dono do cartão"
          inputMode="numeric"
          value={form.holderCpf}
          onChange={event => set('holderCpf', maskCpf(event.target.value))}
          error={shown.holderCpf}
          containerClassName="max-w-xs"
        />
      ) : null}
      <Button type="button" className="h-12 w-full gap-2 rounded-xl text-base font-semibold shadow-md" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-5" aria-hidden />}
        {busy ? 'Processando…' : `Pagar ${formatBRL(amount)}`}
      </Button>
      <p className="flex items-start gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Dados enviados criptografados ao processador de pagamentos. Guardamos só bandeira e 4 últimos dígitos para as
        próximas mensalidades.
      </p>
    </div>
  )
}
