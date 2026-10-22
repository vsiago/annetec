'use client'

import { useState } from 'react'
import { Barcode, CreditCard, QrCode } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  clubPaymentMethod,
  formatBRL,
  onboardingPaymentInput,
  type ClubPaymentMethod,
} from '@annetec/contracts'
import { saveOnboardingPaymentAction } from '@/lib/actions/contratacao-api'
import { validate } from '@/lib/adapters/contratacao'
import { safeAction } from '../hooks'
import { ApprovalFirstBadge } from '../quote-summary'
import { StepFooter } from '../step-footer'
import { ActionError, ChoiceCard, Notice, StepHeading } from '../ui'
import type { StepContext } from './types'

const METHOD_UI: Record<ClubPaymentMethod, { icon: typeof QrCode; description: string }> = {
  pix: { icon: QrCode, description: 'Confirmação em segundos. Ativa o clube logo após o pagamento.' },
  boleto: { icon: Barcode, description: 'Compensa em até 2 dias úteis. As mensalidades seguem por boleto.' },
  credit_card: {
    icon: CreditCard,
    description: 'Cobrança automática todo mês. Os dados do cartão são digitados só na página segura da fatura.',
  },
}

export function PaymentStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack } = ctx
  const [method, setMethod] = useState<ClubPaymentMethod | null>(view.paymentMethod)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const quote = view.plan.quote

  async function save() {
    setError(null)
    const parsed = validate(onboardingPaymentInput, { paymentMethod: method })
    if (!parsed.ok) {
      setFieldError('Escolha a forma de pagamento')
      return
    }
    if (method === view.paymentMethod) {
      ctx.goNext()
      return
    }
    setBusy(true)
    const result = await safeAction(() => saveOnboardingPaymentAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onSaved(result.data, { advance: true, message: 'Forma de pagamento salva' })
  }

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-payment"
        eyebrow="Pagamento"
        title="Como você prefere pagar?"
        description="Vale para a ativação e para as mensalidades. Nada é cobrado agora: a cobrança de ativação é emitida só depois da aprovação cadastral, e o link chega por e-mail."
      />

      {quote ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ativação (após aprovação)</p>
            <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-foreground">{formatBRL(quote.activationTotal)}</p>
            <p className="text-[13px] text-muted-foreground">
              {quote.setupFee > 0 ? `Adesão ${formatBRL(quote.setupFee)} + ` : ''}1ª mensalidade {formatBRL(quote.planFee)}
            </p>
          </div>
          <div className="rounded-2xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Depois, por mês</p>
            <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-foreground">{formatBRL(quote.monthlyTotal)}</p>
            <p className="text-[13px] text-muted-foreground">Estimado para {quote.lives.toLocaleString('pt-BR')} vidas; varia com as vidas ativas.</p>
          </div>
        </div>
      ) : (
        <Notice tone="info">Escolha o plano para ver os valores.</Notice>
      )}

      <div role="radiogroup" aria-label="Forma de pagamento" className="grid gap-3">
        {clubPaymentMethod.options.map(option => {
          const ui = METHOD_UI[option]
          const Icon = ui.icon
          return (
            <ChoiceCard
              key={option}
              selected={method === option}
              onSelect={() => {
                setMethod(option)
                setFieldError(null)
              }}
              icon={<Icon className="size-5" />}
              title={CLUB_PAYMENT_METHOD_LABELS[option]}
              description={ui.description}
            />
          )
        })}
      </div>
      {fieldError ? (
        <p className="text-[13px] text-destructive" role="alert">
          {fieldError}
        </p>
      ) : null}

      <ApprovalFirstBadge />
      <ActionError message={error} />
      <StepFooter onBack={goBack} onPrimary={() => void save()} busy={busy} primaryLabel={method === view.paymentMethod ? 'Continuar' : 'Salvar e continuar'} />
    </div>
  )
}
