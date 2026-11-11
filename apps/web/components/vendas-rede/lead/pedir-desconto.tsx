'use client'

import { useMemo } from 'react'
import { BadgePercent } from 'lucide-react'
import type { SellerLinkResult } from '@annetec/contracts'
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
  toDiscountRequest,
  validateDiscount,
  type DiscountFormValues,
} from '@/components/sales/discount-fields'
import { pedirDescontoLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { useState } from 'react'

/**
 * "Pedir desconto" da proposta do lead (plataforma). Reaproveita os campos da
 * condição especial (`components/sales/discount-fields.tsx`); o pedido vai ao
 * superadmin e o vendedor recebe a decisão no sino.
 */
export function PedirDescontoDialog({
  aberto,
  aoMudarAberto,
  escopo,
  leadId,
  leadNome,
  setupFee,
  aoConcluir,
}: {
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  escopo: EscopoVendas
  leadId: string
  leadNome: string
  setupFee?: number | null
  aoConcluir: (resultado: SellerLinkResult) => void
}) {
  const [feito, setFeito] = useState<SellerLinkResult | null>(null)
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
      const r = await pedirDescontoLeadAction(escopo, leadId, toDiscountRequest(values))
      if (!r.success) {
        return {
          ok: false,
          message: r.error || 'Não foi possível enviar o pedido. Tente de novo.',
          fieldErrors: apiFieldErrors<DiscountFormValues>(r.fieldErrors, DISCOUNT_FIELDS, { setupFeePercent: 'setupPercent' }),
        }
      }
      setFeito(r.data)
      aoConcluir(r.data)
      return { ok: true }
    },
  })

  const mudar = (aberta: boolean) => {
    aoMudarAberto(aberta)
    if (!aberta) setFeito(null)
  }

  return (
    <WizardDialog
      open={aberto}
      onOpenChange={mudar}
      wizard={wizard}
      icon={BadgePercent}
      size="md"
      title="Pedir desconto"
      description={`Condição especial para ${leadNome}. A equipe ANNETEC decide e você recebe o aviso no sino.`}
      submitLabel="Enviar pedido de desconto"
      submittingLabel="Enviando…"
      discardTitle="Descartar o pedido?"
      renderStep={() => (
        <FieldGrid>
          <DiscountFields bind={key => wizard.field(key) as FieldBinding<string>} values={wizard.values} setupFee={setupFee ?? null} />
        </FieldGrid>
      )}
      renderSuccess={() =>
        feito ? (
          <WizardSuccess
            title="Pedido enviado para aprovação"
            description={
              feito.proposal.linkStatus === 'sent'
                ? 'O cliente já tem o link. Se a ANNETEC aprovar, o desconto entra na proposta.'
                : `O link vai para ${feito.proposal.applicant.email} quando a ANNETEC decidir.`
            }
            actions={
              <Button type="button" className={successButton.primary} onClick={() => mudar(false)}>
                Fechar
              </Button>
            }
          />
        ) : null
      }
    />
  )
}
