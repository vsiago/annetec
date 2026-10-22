'use client'

import { useState } from 'react'
import { Ban, Eye, FilePlus2, MoreHorizontal, ReceiptText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ClubSubscription,
  ClubSubscriptionDetail,
  ClubSubscriptionStatus,
  ManualChargeResult,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  cancelClubSubscriptionAction,
  reactivateClubSubscriptionAction,
} from '@/lib/actions/faturamento-api'
import { formatBRL, subscriptionStatusMeta } from '@/lib/adapters/faturamento'
import { GenerateChargeDialog, type GenerateChargeTarget } from './generate-charge-dialog'
import { ReasonConfirmDialog } from './reason-confirm-dialog'

export function canCancelSubscription(status: ClubSubscriptionStatus): boolean {
  return status !== 'canceled'
}

/** Cancelada volta a aguardar pagamento; em atraso/suspensa volta a ativa. */
export function canReactivateSubscription(status: ClubSubscriptionStatus): boolean {
  return status === 'canceled' || status === 'past_due' || status === 'suspended'
}

/** "Gerar cobrança" (adiantar mensalidade / avulsa): só assinatura ativa ou em atraso. */
export function canGenerateCharge(status: ClubSubscriptionStatus): boolean {
  return status === 'active' || status === 'past_due'
}

export type SubscriptionAction = 'detail' | 'charges' | 'generate_charge' | 'cancel' | 'reactivate'

export function SubscriptionActionsMenu({
  subscription,
  onAction,
  showCharges = true,
}: {
  subscription: ClubSubscription
  onAction: (action: SubscriptionAction, subscription: ClubSubscription) => void
  showCharges?: boolean
}) {
  const cancel = canCancelSubscription(subscription.status)
  const reactivate = canReactivateSubscription(subscription.status)
  const generate = canGenerateCharge(subscription.status)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações da assinatura</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onAction('detail', subscription)}>
          <Eye className="mr-2 h-4 w-4" />
          Ver detalhes
        </DropdownMenuItem>
        {showCharges && (
          <DropdownMenuItem onClick={() => onAction('charges', subscription)}>
            <ReceiptText className="mr-2 h-4 w-4" />
            Ver cobranças
          </DropdownMenuItem>
        )}
        {generate && (
          <DropdownMenuItem onClick={() => onAction('generate_charge', subscription)}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            Gerar cobrança
          </DropdownMenuItem>
        )}
        {(cancel || reactivate) && <DropdownMenuSeparator />}
        {reactivate && (
          <DropdownMenuItem onClick={() => onAction('reactivate', subscription)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reativar assinatura
          </DropdownMenuItem>
        )}
        {cancel && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onAction('cancel', subscription)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Cancelar assinatura
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Cancelar (com motivo, exigido pela API) e reativar assinatura, com os
 * diálogos de confirmação. `onChanged` recebe o detalhe atualizado.
 */
export function useSubscriptionActions({
  tenantSlug,
  onChanged,
  onChargeCreated,
  onViewCharge,
}: {
  tenantSlug: string
  onChanged?: (detail: ClubSubscriptionDetail) => void
  /** "Gerar cobrança" concluído (criada, aprovada ou recusada): recarregar lista/detalhe. */
  onChargeCreated?: (result: ManualChargeResult) => void
  /** "Ver cobrança" no diálogo; sem isto, o link abre o Faturamento com a cobrança. */
  onViewCharge?: (chargeId: string) => void
}) {
  const [cancelFor, setCancelFor] = useState<ClubSubscription | null>(null)
  const [reactivateFor, setReactivateFor] = useState<ClubSubscription | null>(null)
  const [generateFor, setGenerateFor] = useState<GenerateChargeTarget | null>(null)

  const viewCharge = (chargeId: string) => {
    setGenerateFor(null)
    if (onViewCharge) onViewCharge(chargeId)
    else window.location.assign(`/${tenantSlug}/admin/faturamento?cobranca=${encodeURIComponent(chargeId)}`)
  }

  const dialogs = (
    <>
      <GenerateChargeDialog
        tenantSlug={tenantSlug}
        target={generateFor}
        onOpenChange={open => !open && setGenerateFor(null)}
        // O resultado (aprovado, recusado, Pix gerado) aparece no próprio diálogo.
        onCreated={result => onChargeCreated?.(result)}
        onViewCharge={viewCharge}
      />

      <ReasonConfirmDialog
        open={cancelFor !== null}
        onOpenChange={open => !open && setCancelFor(null)}
        title="Cancelar esta assinatura?"
        confirmLabel="Cancelar assinatura"
        description={
          cancelFor && (
            <>
              <p>
                <strong className="text-foreground">{cancelFor.holder.name}</strong> deixa de ser assinante do plano{' '}
                {cancelFor.planName} ({formatBRL(cancelFor.amount)}/mês).
              </p>
              <p>
                As cobranças em aberto são canceladas no gateway e as carteirinhas do titular e dos dependentes deixam
                de valer. Dá para reativar depois.
              </p>
            </>
          )
        }
        reason={{
          label: 'Motivo do cancelamento',
          placeholder: 'Ex.: pedido do associado por telefone',
          required: true,
          minLength: 3,
        }}
        onConfirm={async reason => {
          if (!cancelFor) return
          const subscription = cancelFor
          const result = await cancelClubSubscriptionAction(tenantSlug, subscription.id, { reason })
          if (!result.success) {
            toast.error('Não foi possível cancelar a assinatura', { description: result.error })
            return result.error
          }
          toast.success('Assinatura cancelada', { description: subscription.holder.name })
          onChanged?.(result.data)
        }}
      />

      <ReasonConfirmDialog
        open={reactivateFor !== null}
        onOpenChange={open => !open && setReactivateFor(null)}
        title="Reativar esta assinatura?"
        confirmLabel="Reativar"
        destructive={false}
        description={
          reactivateFor &&
          (reactivateFor.status === 'canceled' ? (
            <>
              <p>
                A assinatura de <strong className="text-foreground">{reactivateFor.holder.name}</strong> volta como{' '}
                <em>Aguardando pagamento</em> e uma nova cobrança de {formatBRL(reactivateFor.amount)} é gerada agora
                (período começando hoje).
              </p>
              <p>
                {reactivateFor.paymentMethod === 'credit_card'
                  ? 'Com cartão salvo, a cobrança é feita na hora; aprovada, a assinatura ativa sozinha.'
                  : 'Quando o pagamento for confirmado pelo gateway, a assinatura ativa sozinha.'}
              </p>
            </>
          ) : (
            <>
              <p>
                A assinatura de <strong className="text-foreground">{reactivateFor.holder.name}</strong> está{' '}
                {subscriptionStatusMeta(reactivateFor.status).label.toLowerCase()} e volta para <em>Ativa</em> agora,
                liberando as carteirinhas.
              </p>
              <p>As cobranças em aberto continuam abertas e seguem na régua de cobrança.</p>
            </>
          ))
        }
        onConfirm={async () => {
          if (!reactivateFor) return
          const subscription = reactivateFor
          const result = await reactivateClubSubscriptionAction(tenantSlug, subscription.id)
          if (!result.success) {
            toast.error('Não foi possível reativar a assinatura', { description: result.error })
            return result.error
          }
          toast.success('Assinatura reativada', {
            description: `${subscription.holder.name} · ${subscriptionStatusMeta(result.data.status).label}`,
          })
          onChanged?.(result.data)
        }}
      />
    </>
  )

  return {
    requestGenerateCharge: (subscription: ClubSubscription) =>
      setGenerateFor({ id: subscription.id, holderName: subscription.holder.name, planName: subscription.planName }),
    requestCancel: (subscription: ClubSubscription) => setCancelFor(subscription),
    requestReactivate: (subscription: ClubSubscription) => setReactivateFor(subscription),
    dialogs,
  }
}
