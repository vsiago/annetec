'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CreditCard, Loader2, Lock, MapPin, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  CARD_BRAND_LABELS,
  cardCvvLength,
  cardNumberIssue,
  detectCardBrand,
  maskCardExpiry,
  maskCardNumber,
  maskCep,
  maskCpf,
  onlyDigits,
  type CardInputOptions,
} from '@annetec/contracts'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CardForm as CardFormValue, FieldErrors } from '@/lib/adapters/checkout'
import { BrandMark, CardPreview } from './card-preview'
import { CheckoutField } from './form-field'

type CardField = keyof CardFormValue

interface TestCardsHint {
  approved: string
  declined: string
  declinedHint: string
}

interface CardFormProps {
  value: CardFormValue
  errors: FieldErrors
  onChange: (field: CardField, value: string) => void
  onBlur: (field: CardField) => void
  testCards?: TestCardsHint | null
  onUseTestCard?: (kind: 'approved' | 'declined') => void
  /** Prefixo dos ids (o formulário aparece no checkout e na nova tentativa). */
  idPrefix?: string
  /** Leva o foco ao número do cartão ao montar (passo Pagamento com cartão). */
  autoFocusNumber?: boolean
  /** Regras do número (sandbox) — para saber quando ele está completo e avançar o foco. */
  cardOptions?: CardInputOptions
  /** Campos válidos (check discreto no campo). */
  validFields?: Partial<Record<CardField, boolean>>
}

type Address = { street: string; district: string; city: string; uf: string }
type CepLookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; address: Address }
  | { state: 'not_found' }

/**
 * Consulta o ViaCEP direto do navegador para confirmar o endereço de
 * cobrança do cartão. Falha de rede não bloqueia nada — é só conferência.
 */
function useCepLookup(cep: string): CepLookup {
  const digits = onlyDigits(cep)
  const [lookup, setLookup] = useState<CepLookup>({ state: 'idle' })

  useEffect(() => {
    if (digits.length !== 8) {
      setLookup({ state: 'idle' })
      return
    }
    const controller = new AbortController()
    setLookup({ state: 'loading' })
    fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string }) => {
        if (data.erro) {
          setLookup({ state: 'not_found' })
          return
        }
        setLookup({
          state: 'found',
          address: {
            street: data.logradouro ?? '',
            district: data.bairro ?? '',
            city: data.localidade ?? '',
            uf: data.uf ?? '',
          },
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup({ state: 'idle' })
      })
    return () => controller.abort()
  }, [digits])

  return lookup
}

export function CardForm({
  value,
  errors,
  onChange,
  onBlur,
  testCards,
  onUseTestCard,
  idPrefix = 'card',
  autoFocusNumber = false,
  cardOptions = { allowSandboxCard: false },
  validFields = {},
}: CardFormProps) {
  const [ccvFocused, setCcvFocused] = useState(false)
  // Padrão: o cartão é do titular (sem campo de CPF; a API usa o CPF do titular).
  const [otherOwner, setOtherOwner] = useState(Boolean(value.holderCpf))
  const numberRef = useRef<HTMLInputElement>(null)
  const expiryRef = useRef<HTMLInputElement>(null)
  const ccvRef = useRef<HTMLInputElement>(null)
  const cepRef = useRef<HTMLInputElement>(null)
  const ownerCpfRef = useRef<HTMLInputElement>(null)
  const addressNumberRef = useRef<HTMLInputElement>(null)
  const brand = detectCardBrand(value.number)
  const cep = useCepLookup(value.holderPostalCode)
  const lastFoundCep = useRef<string | null>(null)

  // CEP encontrado → leva o foco para o número do endereço (se ainda vazio).
  useEffect(() => {
    if (cep.state !== 'found') return
    const digits = onlyDigits(value.holderPostalCode)
    if (lastFoundCep.current === digits) return
    lastFoundCep.current = digits
    if (!value.holderAddressNumber && document.activeElement?.id === `${idPrefix}-cep`) {
      addressNumberRef.current?.focus()
    }
  }, [cep, idPrefix, value.holderAddressNumber, value.holderPostalCode])

  const ccvMax = cardCvvLength(brand)

  useEffect(() => {
    if (autoFocusNumber && !value.number) numberRef.current?.focus()
    // Só ao montar: depois disso o foco é de quem está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Avança o foco só quando o campo foi completado digitando (não ao apagar). */
  const advance = (target: HTMLInputElement | null, grew: boolean) => {
    if (grew && target && !target.value) target.focus()
  }

  const handleNumber = (raw: string) => {
    const masked = maskCardNumber(raw)
    const grew = onlyDigits(masked).length > onlyDigits(value.number).length
    onChange('number', masked)
    // Visa (13/16/19) e Diners (14/16) têm tamanhos curtos que podem passar no Luhn no meio da
    // digitação: só avança no tamanho cheio (16; Amex 15).
    const length = onlyDigits(masked).length
    const full = length >= 16 || (detectCardBrand(masked) === 'amex' && length === 15)
    if (full && cardNumberIssue(masked, cardOptions) === null) advance(expiryRef.current, grew)
  }

  const handleExpiry = (raw: string) => {
    const masked = maskCardExpiry(raw)
    const digits = onlyDigits(masked)
    const grew = digits.length > onlyDigits(value.expiry).length
    onChange('expiry', masked)
    const month = Number(digits.slice(0, 2))
    if (digits.length === 4 && month >= 1 && month <= 12) advance(ccvRef.current, grew)
  }

  const handleCcv = (raw: string) => {
    const digits = onlyDigits(raw).slice(0, ccvMax)
    const grew = digits.length > value.ccv.length
    onChange('ccv', digits)
    if (digits.length === ccvMax) advance(cepRef.current, grew)
  }

  return (
    <div className="space-y-5">
      {/* No celular o cartão ilustrado só empurraria os campos para baixo. */}
      <div className="hidden sm:block">
        <CardPreview
          number={value.number}
          holderName={value.holderName}
          expiry={value.expiry}
          ccvLength={onlyDigits(value.ccv).length}
          brand={brand}
          flipped={ccvFocused}
        />
      </div>

      {testCards && onUseTestCard ? (
        <div className="rounded-xl border border-dashed border-amber-400/60 bg-amber-50/60 px-3 py-2.5 text-xs dark:border-amber-500/40 dark:bg-amber-950/20">
          <p className="text-center text-amber-900 dark:text-amber-100">
            <span className="font-semibold">Ambiente de testes</span> — nenhum valor é cobrado. Preencha o número com um
            cartão de teste:
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                onUseTestCard('approved')
                if (!value.expiry) window.setTimeout(() => expiryRef.current?.focus(), 0)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-3" aria-hidden />
              Cartão aprovado
            </button>
            <button
              type="button"
              onClick={() => {
                onUseTestCard('declined')
                if (!value.expiry) window.setTimeout(() => expiryRef.current?.focus(), 0)
              }}
              className="inline-flex items-center gap-1 rounded-full border border-rose-600/30 bg-rose-50 px-2.5 py-1 font-medium text-rose-800 transition-colors hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <TriangleAlert className="size-3" aria-hidden />
              Cartão recusado ({testCards.declinedHint})
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <CheckoutField
          ref={numberRef}
          id={`${idPrefix}-number`}
          label="Número do cartão"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={value.number}
          error={errors.number}
          onChange={event => handleNumber(event.target.value)}
          onBlur={() => onBlur('number')}
          containerClassName="sm:col-span-2"
          adornment={
            brand ? (
              <span className="flex h-7 items-center rounded-md bg-muted px-2 text-foreground" title={CARD_BRAND_LABELS[brand]}>
                <BrandMark brand={brand} className="scale-75 text-foreground" />
              </span>
            ) : (
              <CreditCard className="size-5 text-muted-foreground" aria-hidden />
            )
          }
        />
        <CheckoutField
          id={`${idPrefix}-name`}
          label="Nome impresso no cartão"
          autoComplete="cc-name"
          autoCapitalize="characters"
          placeholder="Como aparece no cartão"
          value={value.holderName}
          error={errors.holderName}
          valid={validFields.holderName}
          onChange={event => onChange('holderName', event.target.value.toUpperCase())}
          onBlur={() => onBlur('holderName')}
          containerClassName="sm:col-span-2"
        />
        <CheckoutField
          ref={expiryRef}
          id={`${idPrefix}-expiry`}
          label="Validade"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/AA"
          value={value.expiry}
          error={errors.expiry}
          valid={validFields.expiry}
          onChange={event => handleExpiry(event.target.value)}
          onBlur={() => onBlur('expiry')}
        />
        <CheckoutField
          ref={ccvRef}
          id={`${idPrefix}-ccv`}
          label="Código de segurança (CVV)"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder={brand === 'amex' ? '4 dígitos' : '3 dígitos'}
          maxLength={4}
          value={value.ccv}
          error={errors.ccv}
          onChange={event => handleCcv(event.target.value)}
          onFocus={() => setCcvFocused(true)}
          onBlur={() => {
            setCcvFocused(false)
            onBlur('ccv')
          }}
          adornment={<Lock className="size-4 text-muted-foreground" aria-hidden />}
        />
      </div>

      <div className="rounded-2xl border bg-muted/30 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Endereço de cobrança do cartão</p>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-4">
          <CheckoutField
            ref={cepRef}
            id={`${idPrefix}-cep`}
            label="CEP"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={value.holderPostalCode}
            error={errors.holderPostalCode}
            valid={validFields.holderPostalCode && cep.state !== 'not_found'}
            onChange={event => onChange('holderPostalCode', maskCep(event.target.value))}
            onBlur={() => onBlur('holderPostalCode')}
            adornment={cep.state === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          />
          <CheckoutField
            ref={addressNumberRef}
            id={`${idPrefix}-address-number`}
            label="Número"
            inputMode="text"
            autoComplete="off"
            placeholder="Nº"
            maxLength={10}
            value={value.holderAddressNumber}
            error={errors.holderAddressNumber}
            valid={validFields.holderAddressNumber}
            onChange={event => onChange('holderAddressNumber', event.target.value)}
            onBlur={() => onBlur('holderAddressNumber')}
          />
        </div>
        <div aria-live="polite" className="mt-2 min-h-5 text-[13px]">
          {cep.state === 'found' ? (
            <p className="flex items-start gap-1.5 text-foreground/80">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                {[cep.address.street, cep.address.district].filter(Boolean).join(', ')}
                {cep.address.street || cep.address.district ? ' — ' : ''}
                {cep.address.city}/{cep.address.uf}
              </span>
            </p>
          ) : cep.state === 'not_found' ? (
            <p className="text-amber-700 dark:text-amber-300">Não encontramos este CEP. Confira os números.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={`${idPrefix}-other-owner`}
            checked={otherOwner}
            onCheckedChange={checked => {
              const next = checked === true
              setOtherOwner(next)
              if (!next) onChange('holderCpf', '')
              else window.setTimeout(() => ownerCpfRef.current?.focus(), 0)
            }}
          />
          <Label htmlFor={`${idPrefix}-other-owner`} className="cursor-pointer text-sm font-normal text-foreground">
            O cartão é de outra pessoa
          </Label>
        </div>
        {otherOwner ? (
          <CheckoutField
            ref={ownerCpfRef}
            id={`${idPrefix}-holder-cpf`}
            label="CPF do dono do cartão"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={value.holderCpf}
            error={errors.holderCpf}
            valid={validFields.holderCpf}
            onChange={event => onChange('holderCpf', maskCpf(event.target.value))}
            onBlur={() => onBlur('holderCpf')}
          />
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Os dados do cartão seguem criptografados para o processador de pagamentos e não ficam gravados. Guardamos só
        a bandeira e os 4 últimos dígitos para as próximas mensalidades.
      </p>
    </div>
  )
}
