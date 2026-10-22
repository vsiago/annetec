'use client'

import Link from 'next/link'
import { AlertCircle, AlertTriangle, Barcode, Check, CreditCard, Info, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import {
  formatBRL,
  formatDateBR,
  type CardInputOptions,
  type CheckoutContext,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanQuote,
} from '@annetec/contracts'
import { Checkbox } from '@/components/ui/checkbox'
import {
  describeMethods,
  estimateBoletoDueDate,
  estimateNextChargeDate,
  orderedMethods,
  type CardForm as CardFormValue,
  type FieldErrors,
} from '@/lib/adapters/checkout'
import { isDemoMode } from '@/lib/demo-mode'
import { cn } from '@/lib/utils'
import { CardForm } from './card-form'
import { LegalNotice } from './plan-facts'
import { PlanTermsDialog } from './plan-terms-dialog'

export const METHOD_ICONS: Record<ClubPaymentMethod, typeof CreditCard> = {
  credit_card: CreditCard,
  pix: QrCode,
  boleto: Barcode,
}

/** Uma linha de benefício por forma — só o que é verdade (não há parcelamento: é mensalidade). */
const METHOD_TAGLINES: Record<ClubPaymentMethod, string> = {
  pix: 'Liberação imediata',
  credit_card: 'Aprovação na hora',
  boleto: 'Até 3 dias úteis',
}

const METHOD_SHORT: Record<ClubPaymentMethod, string> = {
  pix: 'Pix',
  credit_card: 'Cartão',
  boleto: 'Boleto',
}

export interface PaymentSubmitError {
  message: string
  /** Falha de rede/servidor: o mesmo pedido pode ser reenviado. */
  retryable: boolean
}

interface PaymentStepProps {
  slug: string
  tenantName: string
  context: CheckoutContext
  plan: ClubPlan | null
  quote: ClubPlanQuote | null
  /** Formas EFETIVAS do plano escolhido (clube ∩ plano), Pix primeiro. */
  methods: ClubPaymentMethod[]
  method: ClubPaymentMethod
  onMethodChange: (method: ClubPaymentMethod) => void
  /** Erro de `payment.method` (regra do plano ou 422 da API). */
  methodError?: string | null
  /** A forma escolhida deixou de valer ao trocar de plano e foi ajustada. */
  notice?: string | null
  onChangePlan?: () => void
  card: CardFormValue
  cardErrors: FieldErrors
  cardValid: Partial<Record<keyof CardFormValue, boolean>>
  cardOptions: CardInputOptions
  onCardChange: (field: keyof CardFormValue, value: string) => void
  onCardBlur: (field: keyof CardFormValue) => void
  /** Foco no número do cartão ao abrir o formulário do cartão. */
  autoFocusCard: boolean
  testCards?: { approved: string; declined: string; declinedHint: string } | null
  onUseTestCard?: (kind: 'approved' | 'declined') => void
  acceptTerms: boolean
  onAcceptTerms: (value: boolean) => void
  termsError?: string
  submitError: PaymentSubmitError | null
  onRetry: () => void
  onEditHolder: () => void
  onEditDependents: () => void
}

export function PaymentStep({
  slug,
  tenantName,
  context,
  plan,
  quote,
  methods,
  method,
  onMethodChange,
  methodError,
  notice,
  onChangePlan,
  card,
  cardErrors,
  cardValid,
  cardOptions,
  onCardChange,
  onCardBlur,
  autoFocusCard,
  testCards,
  onUseTestCard,
  acceptTerms,
  onAcceptTerms,
  termsError,
  submitError,
  onRetry,
  onEditHolder,
  onEditDependents,
}: PaymentStepProps) {
  /** Regras do gateway simulado — só explicadas em ambiente de testes. */
  const testSimulation = isDemoMode(context) ? context.simulation : null
  const clubMethods = orderedMethods(context.enabledMethods)
  const restrictedByPlan = methods.length < clubMethods.length

  if (methods.length === 0) {
    return (
      <div
        className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        role="alert"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {methodError ?? 'Nenhuma forma de pagamento disponível para este plano'}.{' '}
          {onChangePlan ? (
            <button type="button" onClick={onChangePlan} className="font-semibold underline underline-offset-2">
              Escolher outro plano
            </button>
          ) : (
            'Fale com o clube para concluir a sua assinatura.'
          )}
        </p>
      </div>
    )
  }

  const loyaltyMonths = Math.max(0, plan?.loyaltyMonths ?? 0)

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{notice}</span>
        </p>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium text-foreground">Forma de pagamento</legend>
        <div
          className={cn(
            'grid gap-2 sm:gap-3',
            methods.length === 1 ? 'grid-cols-1' : methods.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
          )}
        >
          {methods.map(item => {
            const Icon = METHOD_ICONS[item]
            const selected = item === method
            return (
              <label
                key={item}
                className={cn(
                  'relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-card px-2 py-3 text-center transition-[border-color,background-color,box-shadow] duration-150 sm:py-4',
                  'has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2',
                  selected
                    ? 'border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--color-primary)]'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={item}
                  checked={selected}
                  onChange={() => onMethodChange(item)}
                  aria-describedby={methodError ? 'payment-method-error' : undefined}
                  className="sr-only"
                />
                {selected ? (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground duration-150 animate-in zoom-in-50 motion-reduce:animate-none">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                ) : null}
                <Icon className={cn('size-5', selected ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                <span className="text-sm font-semibold text-foreground">{METHOD_SHORT[item]}</span>
                <span className="text-[12px] leading-tight text-muted-foreground">{METHOD_TAGLINES[item]}</span>
              </label>
            )
          })}
        </div>
        {restrictedByPlan && plan ? (
          <p className="text-[13px] text-muted-foreground">
            Formas aceitas no plano <span className="font-medium text-foreground">{plan.name}</span>:{' '}
            {describeMethods(methods)}.
          </p>
        ) : null}
        {methodError ? (
          <p
            id="payment-method-error"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{methodError}</span>
          </p>
        ) : null}
      </fieldset>

      <div key={method} className="duration-150 animate-in fade-in motion-reduce:animate-none">
        {method === 'credit_card' ? (
          <CardForm
            value={card}
            errors={cardErrors}
            validFields={cardValid}
            cardOptions={cardOptions}
            autoFocusNumber={autoFocusCard}
            onChange={onCardChange}
            onBlur={onCardBlur}
            testCards={testCards}
            onUseTestCard={onUseTestCard}
          />
        ) : method === 'pix' ? (
          <MethodNote
            icon={QrCode}
            title="Pague com Pix em segundos"
            text="Ao gerar o Pix, mostramos o QR Code e o código copia e cola. A confirmação é automática e as carteirinhas saem na hora."
            footnote={
              testSimulation && testSimulation.pixApproveSeconds > 0
                ? `Ambiente de testes: o Pix é confirmado sozinho em cerca de ${testSimulation.pixApproveSeconds} segundos.`
                : null
            }
          />
        ) : (
          <MethodNote
            icon={Barcode}
            title={`Boleto com vencimento em ${formatDateBR(estimateBoletoDueDate(context.boletoDueDays))}`}
            text="Geramos o boleto na hora, com linha digitável para copiar. Depois da compensação (até 3 dias úteis) a assinatura é ativada."
            footnote={
              testSimulation
                ? testSimulation.boletoApproveSeconds > 0
                  ? `Ambiente de testes: o boleto compensa sozinho em cerca de ${Math.round(testSimulation.boletoApproveSeconds / 60) || 1} min.`
                  : 'Ambiente de testes: use "Simular pagamento" na próxima tela para compensar o boleto.'
                : null
            }
          />
        )}
      </div>

      {submitError ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-2">
            <p className="font-medium text-destructive">{submitError.message}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {submitError.retryable ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 font-semibold text-foreground underline underline-offset-2"
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Tentar de novo
                </button>
              ) : null}
              {/área do associado/i.test(submitError.message) ? (
                <Link href={`/${slug}/login`} className="font-semibold text-foreground underline underline-offset-2">
                  Ir para a área do associado
                </Link>
              ) : null}
              {/e-mail|cpf|titular/i.test(submitError.message) && !/dependente|parentesco/i.test(submitError.message) ? (
                <button type="button" onClick={onEditHolder} className="font-semibold text-foreground underline underline-offset-2">
                  Revisar meus dados
                </button>
              ) : null}
              {/dependente|parentesco/i.test(submitError.message) ? (
                <button type="button" onClick={onEditDependents} className="font-semibold text-foreground underline underline-offset-2">
                  Revisar dependentes
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {plan && quote ? (
        <div className="space-y-3">
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 transition-colors duration-150',
              termsError ? 'border-destructive bg-destructive/5' : 'bg-card',
            )}
          >
            <Checkbox
              id="accept-terms"
              checked={acceptTerms}
              onCheckedChange={checked => onAcceptTerms(checked === true)}
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? 'accept-terms-error' : undefined}
              className="mt-0.5 size-5"
            />
            <div className="text-[13px] leading-relaxed text-muted-foreground">
              <label htmlFor="accept-terms" className="cursor-pointer">
                Li e aceito o regulamento do plano <span className="text-foreground">{plan.name}</span> e as condições da
                assinatura do {tenantName}: 1ª cobrança de{' '}
                <strong className="font-semibold text-foreground">{formatBRL(quote.firstChargeTotal)}</strong> e
                renovação mensal automática de <strong className="font-semibold text-foreground">{formatBRL(quote.total)}</strong>
                {loyaltyMonths > 0 ? `, com fidelidade de ${loyaltyMonths} ${loyaltyMonths === 1 ? 'mês' : 'meses'}` : ''}.
              </label>{' '}
              <PlanTermsDialog
                plan={plan}
                quote={quote}
                tenantName={tenantName}
                method={method}
                nextCharge={formatDateBR(estimateNextChargeDate())}
              />
              {termsError ? (
                <p id="accept-terms-error" className="mt-1 font-medium text-destructive" role="alert" aria-live="polite">
                  {termsError}
                </p>
              ) : null}
            </div>
          </div>
          <LegalNotice className="px-1" />
        </div>
      ) : null}
    </div>
  )
}

function MethodNote({
  icon: Icon,
  title,
  text,
  footnote,
}: {
  icon: typeof QrCode
  title: string
  text: string
  footnote?: string | null
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
        </div>
      </div>
      {footnote ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {footnote}
        </p>
      ) : null}
    </div>
  )
}

