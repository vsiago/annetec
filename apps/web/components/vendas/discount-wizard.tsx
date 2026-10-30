'use client'

import { useMemo, useState } from 'react'
import { BadgePercent } from 'lucide-react'
import { quotePlatformPlan, type SellerLinkResult, type SellerProposal } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  successButton,
  useWizard,
  type FieldBinding,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import {
  DISCOUNT_FIELDS,
  DiscountFields,
  EMPTY_DISCOUNT,
  discountPercentsOf,
  toDiscountRequest,
  validateDiscount,
  type DiscountFormValues,
} from '@/components/sales/discount-fields'
import { QuoteComparison } from '@/components/sales/sales-ui'
import { requestProposalDiscountAction } from '@/lib/actions/vendas-api'
import { useSellerPlans } from './vendas-kit'

/**
 * "Pedir desconto" numa proposta que já existe (antes da aprovação da
 * ANNETEC). O pedido vai ao superadmin; se o link ainda não saiu, ele fica
 * guardado até a decisão.
 */
export function DiscountRequestWizard({
  open,
  onOpenChange,
  proposal,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  proposal: SellerProposal | null
  onSaved: (result: SellerLinkResult) => void
}) {
  const { plans } = useSellerPlans()
  const [done, setDone] = useState<SellerLinkResult | null>(null)
  const steps = useMemo<WizardStep<DiscountFormValues>[]>(
    () => [
      {
        id: 'desconto',
        title: 'Desconto',
        icon: BadgePercent,
        fields: DISCOUNT_FIELDS,
        validate: values => validateDiscount(values, { required: true }),
      },
    ],
    [],
  )
  const wizard = useWizard<DiscountFormValues>({
    steps,
    initialValues: EMPTY_DISCOUNT,
    onSubmit: async values => {
      if (!proposal) return { ok: false, message: 'Escolha uma proposta.' }
      const result = await requestProposalDiscountAction(proposal.id, toDiscountRequest(values))
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível enviar o pedido. Tente de novo.',
          fieldErrors: apiFieldErrors<DiscountFormValues>(result.fieldErrors, DISCOUNT_FIELDS, { setupFeePercent: 'setupPercent' }),
        }
      }
      setDone(result.data)
      onSaved(result.data)
      return { ok: true }
    },
  })

  const offer = plans.find(plan => plan.id === proposal?.planId) ?? null
  const lives = proposal?.expectedLives ?? 0
  const before = offer && lives > 0 ? quotePlatformPlan(offer, offer.pricing, lives) : null
  const after = offer && lives > 0 ? quotePlatformPlan(offer, offer.pricing, lives, { discount: discountPercentsOf(wizard.values) }) : null

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) setDone(null)
  }

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      icon={BadgePercent}
      title="Pedir desconto"
      description={proposal ? `Condição especial para ${proposal.customerName} (proposta ${proposal.code}).` : undefined}
      submitLabel="Enviar pedido de desconto"
      submittingLabel="Enviando…"
      discardTitle="Descartar o pedido?"
      renderStep={() => (
        <FieldGrid>
          <DiscountFields
            bind={key => wizard.field(key) as FieldBinding<string>}
            values={wizard.values}
            setupFee={offer?.pricing.setupFee ?? null}
          />
          {before && after ? (
            <div className="sm:col-span-12">
              <QuoteComparison before={before} after={after} title="Prévia: preço cheio × com o desconto pedido" />
            </div>
          ) : null}
        </FieldGrid>
      )}
      renderSuccess={() =>
        done ? (
          <WizardSuccess
            title="Pedido de desconto enviado para aprovação"
            description={
              done.proposal.linkStatus === 'sent'
                ? 'O cliente já tem o link. Se o superadmin aprovar, o desconto entra na proposta.'
                : `O link será enviado para ${done.proposal.applicant.email} quando o superadmin decidir.`
            }
            actions={
              <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            }
          />
        ) : null
      }
    />
  )
}
