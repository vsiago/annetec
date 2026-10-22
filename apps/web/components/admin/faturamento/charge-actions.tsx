'use client'

import { useEffect, useState } from 'react'
import {
  Barcode,
  Ban,
  Copy,
  ExternalLink,
  Eye,
  FlaskConical,
  HandCoins,
  LoaderCircle,
  MoreHorizontal,
  QrCode,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { parseBRL, type ClubCharge } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormDialog, FormField, FormRow, FormSelect } from '@/components/dashboard/form-dialog'
import {
  cancelClubChargeAction,
  manualPaymentClubChargeAction,
  reissueClubChargeAction,
  simulateClubChargePaymentAction,
} from '@/lib/actions/faturamento-api'
import {
  chargeReference,
  chargeTitle,
  isOneOffCharge,
  formatBRL,
  formatDateBR,
  isChargeOpen,
  paymentMethodLabel,
  todaySP,
} from '@/lib/adapters/faturamento'
import { ReasonConfirmDialog } from './reason-confirm-dialog'
import { copyToClipboard } from './use-action-data'

export type ChargeAction =
  | 'detail'
  | 'copy-pix'
  | 'copy-boleto'
  | 'open-boleto'
  | 'open-invoice'
  | 'simulate'
  | 'reissue'
  | 'manual'
  | 'cancel'

/** O que cada cobrança permite agora — mesma regra no menu e no detalhe. */
export function chargeCapabilities(charge: ClubCharge, canSimulate: boolean) {
  const open = isChargeOpen(charge.status)
  return {
    copyPix: open && Boolean(charge.pix?.payload),
    copyBoleto: open && Boolean(charge.boleto?.identificationField),
    openBoleto: Boolean(charge.boleto?.url),
    openInvoice: Boolean(charge.invoiceUrl),
    simulate: open && canSimulate,
    reissue: open,
    manual: open,
    cancel: open,
  }
}

/** Menu "⋯" da linha de cobrança. */
export function ChargeActionsMenu({
  charge,
  canSimulate,
  busy = false,
  onAction,
}: {
  charge: ClubCharge
  canSimulate: boolean
  busy?: boolean
  onAction: (action: ChargeAction, charge: ClubCharge) => void
}) {
  const can = chargeCapabilities(charge, canSimulate)
  const hasPaymentData = can.copyPix || can.copyBoleto || can.openBoleto || can.openInvoice
  const hasOperations = can.simulate || can.reissue || can.manual

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          <span className="sr-only">Ações da cobrança</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={() => onAction('detail', charge)}>
          <Eye className="mr-2 h-4 w-4" />
          Ver detalhes
        </DropdownMenuItem>

        {hasPaymentData && <DropdownMenuSeparator />}
        {can.copyPix && (
          <DropdownMenuItem onClick={() => onAction('copy-pix', charge)}>
            <QrCode className="mr-2 h-4 w-4" />
            Copiar Pix copia e cola
          </DropdownMenuItem>
        )}
        {can.copyBoleto && (
          <DropdownMenuItem onClick={() => onAction('copy-boleto', charge)}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar linha digitável
          </DropdownMenuItem>
        )}
        {can.openBoleto && (
          <DropdownMenuItem onClick={() => onAction('open-boleto', charge)}>
            <Barcode className="mr-2 h-4 w-4" />
            Abrir boleto
          </DropdownMenuItem>
        )}
        {can.openInvoice && (
          <DropdownMenuItem onClick={() => onAction('open-invoice', charge)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir fatura no gateway
          </DropdownMenuItem>
        )}

        {hasOperations && <DropdownMenuSeparator />}
        {can.simulate && (
          <DropdownMenuItem onClick={() => onAction('simulate', charge)}>
            <FlaskConical className="mr-2 h-4 w-4" />
            Simular pagamento
          </DropdownMenuItem>
        )}
        {can.reissue && (
          <DropdownMenuItem onClick={() => onAction('reissue', charge)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Emitir segunda via
          </DropdownMenuItem>
        )}
        {can.manual && (
          <DropdownMenuItem onClick={() => onAction('manual', charge)}>
            <HandCoins className="mr-2 h-4 w-4" />
            Dar baixa manual
          </DropdownMenuItem>
        )}

        {can.cancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction('cancel', charge)}>
              <Ban className="mr-2 h-4 w-4" />
              Cancelar cobrança
            </DropdownMenuItem>
          </>
        )}

        {!isChargeOpen(charge.status) && (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Cobrança encerrada — sem ações pendentes.
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Executa as ações de cobrança e desenha os diálogos delas. Cada tela chama
 * uma vez, liga `run` no menu/detalhe e põe `dialogs` na árvore.
 *
 * `onChanged` recebe a cobrança devolvida pela API — quem chama atualiza a
 * lista e os indicadores.
 */
export function useChargeActions({
  tenantSlug,
  onChanged,
  onOpenDetail,
}: {
  tenantSlug: string
  onChanged?: (charge: ClubCharge) => void
  onOpenDetail?: (charge: ClubCharge) => void
}) {
  const [manualFor, setManualFor] = useState<ClubCharge | null>(null)
  const [cancelFor, setCancelFor] = useState<ClubCharge | null>(null)
  const [reissueFor, setReissueFor] = useState<ClubCharge | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function simulate(charge: ClubCharge) {
    setBusyId(charge.id)
    try {
      const result = await simulateClubChargePaymentAction(tenantSlug, charge.id)
      if (!result.success) {
        toast.error('Não foi possível simular o pagamento', { description: result.error })
        return
      }
      toast.success('Pagamento simulado e confirmado', {
        description: `${charge.holderName} · ${formatBRL(result.data.amount)} — processado como se o gateway tivesse avisado.`,
      })
      onChanged?.(result.data)
    } finally {
      setBusyId(null)
    }
  }

  async function copy(text: string, label: string) {
    const ok = await copyToClipboard(text)
    if (ok) toast.success(`${label} copiado`)
    else toast.error('Não foi possível copiar', { description: 'Selecione o texto no detalhe e copie manualmente.' })
  }

  function run(action: ChargeAction, charge: ClubCharge) {
    switch (action) {
      case 'detail':
        onOpenDetail?.(charge)
        return
      case 'copy-pix':
        if (charge.pix?.payload) void copy(charge.pix.payload, 'Pix copia e cola')
        return
      case 'copy-boleto':
        if (charge.boleto?.identificationField) void copy(charge.boleto.identificationField, 'Linha digitável')
        return
      case 'open-boleto':
        if (charge.boleto?.url) window.open(charge.boleto.url, '_blank', 'noopener,noreferrer')
        return
      case 'open-invoice':
        if (charge.invoiceUrl) window.open(charge.invoiceUrl, '_blank', 'noopener,noreferrer')
        return
      case 'simulate':
        void simulate(charge)
        return
      case 'reissue':
        setReissueFor(charge)
        return
      case 'manual':
        setManualFor(charge)
        return
      case 'cancel':
        setCancelFor(charge)
        return
    }
  }

  const dialogs = (
    <>
      <ManualPaymentDialog
        charge={manualFor}
        onOpenChange={open => !open && setManualFor(null)}
        onSubmit={async (charge, input) => {
          const result = await manualPaymentClubChargeAction(tenantSlug, charge.id, input)
          if (!result.success) {
            toast.error('Não foi possível dar baixa', { description: result.error })
            return result.error
          }
          toast.success('Baixa manual registrada', {
            description: `${charge.holderName} · ${formatBRL(result.data.paidAmount ?? result.data.amount)}`,
          })
          onChanged?.(result.data)
        }}
      />

      <ReissueDialog
        charge={reissueFor}
        onOpenChange={open => !open && setReissueFor(null)}
        onSubmit={async (charge, input) => {
          const result = await reissueClubChargeAction(tenantSlug, charge.id, input)
          if (!result.success) {
            toast.error('Não foi possível emitir a segunda via', { description: result.error })
            return result.error
          }
          toast.success('Segunda via emitida', {
            description: `${paymentMethodLabel(result.data.method)} com vencimento em ${formatDateBR(result.data.dueDate)}.`,
          })
          onChanged?.(result.data)
        }}
      />

      <ReasonConfirmDialog
        open={cancelFor !== null}
        onOpenChange={open => !open && setCancelFor(null)}
        title="Cancelar esta cobrança?"
        confirmLabel="Cancelar cobrança"
        description={
          cancelFor && (
            <>
              <p>
                A cobrança de <strong className="text-foreground">{cancelFor.holderName}</strong> (
                {chargeReference(cancelFor)}, {formatBRL(cancelFor.amount)}) será cancelada também no gateway — o
                Pix e o boleto dela deixam de valer.
              </p>
              <p>
                {isOneOffCharge(cancelFor)
                  ? 'É uma cobrança avulsa: a assinatura e as mensalidades não mudam.'
                  : 'A assinatura continua ativa e o próximo ciclo é gerado normalmente pela automação.'}
              </p>
            </>
          )
        }
        reason={{ label: 'Motivo (opcional)', placeholder: 'Ex.: cobrança em duplicidade' }}
        onConfirm={async reason => {
          if (!cancelFor) return
          const charge = cancelFor
          const result = await cancelClubChargeAction(tenantSlug, charge.id, reason ? { reason } : {})
          if (!result.success) {
            toast.error('Não foi possível cancelar a cobrança', { description: result.error })
            return result.error
          }
          toast.success('Cobrança cancelada', { description: `${charge.holderName} · ${chargeTitle(charge)}` })
          onChanged?.(result.data)
        }}
      />
    </>
  )

  return { run, dialogs, busyId }
}

function ManualPaymentDialog({
  charge,
  onOpenChange,
  onSubmit,
}: {
  charge: ClubCharge | null
  onOpenChange: (open: boolean) => void
  onSubmit: (
    charge: ClubCharge,
    input: { paidAt?: string; amount?: number; note?: string },
  ) => Promise<string | void>
}) {
  const [paidAt, setPaidAt] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ paidAt?: string; amount?: string }>({})

  useEffect(() => {
    if (!charge) return
    setPaidAt(todaySP())
    setAmount(charge.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    setNote('')
    setErrors({})
  }, [charge])

  return (
    <FormDialog
      open={charge !== null}
      onOpenChange={onOpenChange}
      title="Dar baixa manual"
      description={
        charge
          ? `Registra que ${charge.holderName} pagou por fora do gateway (dinheiro, transferência). A assinatura é atualizada na hora.`
          : undefined
      }
      submitLabel="Registrar pagamento"
      onSubmit={async () => {
        if (!charge) return
        const nextErrors: typeof errors = {}
        const value = parseBRL(amount)
        if (!paidAt) nextErrors.paidAt = 'Informe a data do pagamento.'
        else if (paidAt > todaySP()) nextErrors.paidAt = 'A data não pode ser futura.'
        if (value === null || value <= 0) nextErrors.amount = 'Informe um valor maior que zero.'
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return 'Confira os campos destacados abaixo.'
        return onSubmit(charge, {
          paidAt,
          amount: value ?? undefined,
          note: note.trim() || undefined,
        })
      }}
    >
      {charge && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          {chargeTitle(charge)} · vencimento {formatDateBR(charge.dueDate)} ·{' '}
          <strong className="text-foreground">{formatBRL(charge.amount)}</strong>
        </p>
      )}
      <FormRow>
        <FormField label="Data do pagamento" htmlFor="manual-paid-at" error={errors.paidAt} required>
          <Input
            id="manual-paid-at"
            type="date"
            value={paidAt}
            max={todaySP()}
            onChange={event => setPaidAt(event.target.value)}
            aria-invalid={!!errors.paidAt}
          />
        </FormField>
        <FormField label="Valor recebido (R$)" htmlFor="manual-amount" error={errors.amount} required>
          <Input
            id="manual-amount"
            inputMode="decimal"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            aria-invalid={!!errors.amount}
          />
        </FormField>
      </FormRow>
      <FormField label="Observação" htmlFor="manual-note" hint="Fica registrada no histórico da cobrança.">
        <Textarea
          id="manual-note"
          value={note}
          maxLength={500}
          onChange={event => setNote(event.target.value)}
          placeholder="Ex.: pago em dinheiro na sede"
          className="min-h-20 resize-none"
        />
      </FormField>
    </FormDialog>
  )
}

function ReissueDialog({
  charge,
  onOpenChange,
  onSubmit,
}: {
  charge: ClubCharge | null
  onOpenChange: (open: boolean) => void
  onSubmit: (charge: ClubCharge, input: { dueDate?: string; method?: 'pix' | 'boleto' }) => Promise<string | void>
}) {
  const [dueDate, setDueDate] = useState('')
  const [method, setMethod] = useState<'pix' | 'boleto'>('pix')
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!charge) return
    setDueDate('')
    setMethod(charge.method === 'boleto' ? 'boleto' : 'pix')
    setError(undefined)
  }, [charge])

  return (
    <FormDialog
      open={charge !== null}
      onOpenChange={onOpenChange}
      title="Emitir segunda via"
      description={
        charge
          ? `Reemite a cobrança de ${charge.holderName} (${chargeReference(charge)}) com novo vencimento. O Pix/boleto anterior é cancelado no gateway.`
          : undefined
      }
      submitLabel="Emitir segunda via"
      onSubmit={async () => {
        if (!charge) return
        if (dueDate && dueDate < todaySP()) {
          setError('O novo vencimento não pode ser no passado.')
          return 'Confira os campos destacados abaixo.'
        }
        setError(undefined)
        const input: { dueDate?: string; method?: 'pix' | 'boleto' } = {}
        if (dueDate) input.dueDate = dueDate
        if (charge.method === 'credit_card' || method !== charge.method) input.method = method
        return onSubmit(charge, input)
      }}
    >
      <FormRow>
        <FormField
          label="Novo vencimento"
          htmlFor="reissue-due"
          error={error}
          hint="Em branco: hoje + prazo do boleto da régua."
        >
          <Input
            id="reissue-due"
            type="date"
            value={dueDate}
            min={todaySP()}
            onChange={event => setDueDate(event.target.value)}
          />
        </FormField>
        <FormField label="Forma de pagamento" hint={charge?.method === 'credit_card' ? 'Cartão recusado vira Pix ou boleto.' : undefined}>
          <FormSelect
            value={method}
            onChange={value => setMethod(value === 'boleto' ? 'boleto' : 'pix')}
            placeholder="Escolha"
            options={[
              { value: 'pix', label: 'Pix' },
              { value: 'boleto', label: 'Boleto' },
            ]}
          />
        </FormField>
      </FormRow>
    </FormDialog>
  )
}
