'use client'

import { useMemo } from 'react'
import { BadgePercent, CircleCheck, MessageSquareText } from 'lucide-react'
import type { DiscountRequest } from '@annetec/contracts'
import {
  FieldGrid,
  FieldSection,
  Notice,
  SwitchField,
  TextareaField,
  WizardDialog,
  apiFieldErrors,
  useWizard,
  type FieldBinding,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import {
  DISCOUNT_FIELDS,
  DiscountFields,
  applyDiscountToQuote,
  discountFormFrom,
  discountPercentsOf,
  validateDiscount,
  type DiscountFormValues,
} from '@/components/sales/discount-fields'
import { QuoteComparison, discountSummary } from '@/components/sales/sales-ui'
import { approveDiscountAction } from '@/lib/actions/comercial-api'

/**
 * Aprovar um pedido de desconto (superadmin): como o vendedor pediu ou com
 * ajuste, mais uma observação opcional. Aprovar aplica o desconto na
 * proposta e manda o link ao cliente (se ainda estava guardado).
 */

interface ApproveValues extends DiscountFormValues {
  adjust: boolean
  note: string
}

const FIELDS = ['adjust', ...DISCOUNT_FIELDS, 'note'] as const

export function ApproveDiscountWizard({
  request,
  onOpenChange,
  onDone,
}: {
  request: DiscountRequest | null
  onOpenChange: (open: boolean) => void
  onDone: (request: DiscountRequest) => void
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo<ApproveValues>(
    () => ({ ...discountFormFrom(request?.requested ?? null), adjust: false, note: '' }),
    [request?.id],
  )
  const steps = useMemo<WizardStep<ApproveValues>[]>(
    () => [
      {
        id: 'aprovar',
        title: 'Aprovar',
        icon: CircleCheck,
        fields: FIELDS,
        validate: values => (values.adjust ? validateDiscount(values, { required: true, requireJustification: false }) : {}),
      },
    ],
    [],
  )
  const wizard = useWizard<ApproveValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      if (!request) return { ok: false }
      const note = values.note.trim() || undefined
      let body: Parameters<typeof approveDiscountAction>[1] = { note }
      if (values.adjust) {
        const d = discountPercentsOf(values)
        body = {
          note,
          setupFeePercent: d.setupFeePercent,
          monthlyPercent: d.monthlyPercent,
          ...(d.monthlyPercent > 0 ? { monthlyMonths: d.monthlyMonths } : {}),
        }
      }
      const result = await approveDiscountAction(request.id, body)
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível aprovar. Tente de novo.',
          fieldErrors: apiFieldErrors<ApproveValues>(result.fieldErrors, FIELDS, { setupFeePercent: 'setupPercent' }),
        }
      }
      onDone(result.data)
      return { ok: true }
    },
  })
  const { values } = wizard
  const adjusted = values.adjust ? discountPercentsOf(values) : null
  const preview = request?.quote ? (adjusted ? applyDiscountToQuote(request.quote, adjusted) : request.quoteWithDiscount) : null

  return (
    <WizardDialog
      open={request !== null}
      onOpenChange={onOpenChange}
      wizard={wizard}
      icon={CircleCheck}
      title={request ? `Aprovar desconto para ${request.customerName}` : 'Aprovar desconto'}
      description={request ? `Pedido de ${request.sellerName ?? 'vendedor'}: ${discountSummary(request.requested)}.` : undefined}
      submitLabel={values.adjust ? 'Aprovar com ajuste' : 'Aprovar desconto'}
      submittingLabel="Aprovando…"
      discardTitle="Descartar a aprovação?"
      renderStep={() => (
        <FieldGrid>
          <SwitchField
            {...wizard.field('adjust')}
            label="Ajustar a condição antes de aprovar"
            description={values.adjust ? 'Vale o que você definir abaixo.' : 'Aprova exatamente como o vendedor pediu.'}
          />
          {values.adjust ? (
            <DiscountFields
              bind={key => wizard.field(key) as FieldBinding<string>}
              values={values}
              justification={false}
              setupFee={request?.quote?.setupFee ?? null}
            />
          ) : null}
          {request?.quote && preview ? (
            <div className="sm:col-span-12">
              <QuoteComparison before={request.quote} after={preview} title="Cotação cheia × com o desconto aprovado" />
            </div>
          ) : null}
          <FieldSection title="Observação" icon={MessageSquareText}>
            <TextareaField
              {...wizard.field('note')}
              label="Observação para o histórico"
              optional
              span={12}
              rows={2}
              maxLength={2000}
              placeholder="Ex.: aprovado por ser o maior clube da região."
            />
          </FieldSection>
          <Notice tone="info" icon={BadgePercent}>
            Ao aprovar, o desconto entra na proposta e o link de contratação vai para o e-mail do cliente, se ainda estava guardado.
          </Notice>
        </FieldGrid>
      )}
    />
  )
}
