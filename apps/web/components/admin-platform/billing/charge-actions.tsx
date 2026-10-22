'use client'

import { useEffect, useState } from 'react'
import {
  Ban,
  Copy,
  ExternalLink,
  FlaskConical,
  HandCoins,
  Loader2,
  MoreHorizontal,
  PanelRightOpen,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PlatformCharge, PlatformChargeDetail } from '@annetec/contracts'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog, copyToClipboard, runCommand } from '@/components/admin-platform/billing/console-kit'
import {
  cancelPlatformChargeAction,
  manualPaymentPlatformChargeAction,
  reissuePlatformChargeAction,
  simulatePlatformChargePaymentAction,
} from '@/lib/actions/platform-billing-api'
import { addDays, formatBRL, formatDateBR, isChargeOpen, todaySP } from '@/lib/adapters/platform-console'

/**
 * Ações sobre uma fatura da plataforma: 2ª via, baixa manual, cancelar e
 * simular o pagamento (só no gateway simulado/sandbox). Cancelar e dar baixa
 * pedem confirmação explícita; todas avisam com a frase da própria API.
 */

export type ChargeAction = 'reissue' | 'manual' | 'cancel' | 'simulate'

export function chargeCapabilities(charge: Pick<PlatformCharge, 'status' | 'method'>, canSimulate: boolean) {
  const open = isChargeOpen(charge.status)
  return {
    reissue: open && charge.method !== 'credit_card',
    manual: open,
    cancel: open,
    simulate: open && canSimulate,
  }
}

export function ChargeActionsMenu({
  charge,
  canSimulate,
  onAction,
  onDetail,
}: {
  charge: PlatformCharge
  canSimulate: boolean
  onAction: (action: ChargeAction, charge: PlatformCharge) => void
  onDetail?: (charge: PlatformCharge) => void
}) {
  const can = chargeCapabilities(charge, canSimulate)

  const copyLink = async () => {
    const ok = await copyToClipboard(charge.publicUrl)
    if (ok) toast.success('Link da fatura copiado')
    else toast.error('Não foi possível copiar', { description: charge.publicUrl })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ações da fatura" onClick={event => event.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={event => event.stopPropagation()}>
        {onDetail && (
          <DropdownMenuItem onClick={() => onDetail(charge)}>
            <PanelRightOpen className="mr-2 h-4 w-4" />
            Ver detalhe
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={charge.publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir fatura pública
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar link de pagamento
        </DropdownMenuItem>
        {(can.reissue || can.manual || can.simulate || can.cancel) && <DropdownMenuSeparator />}
        {can.reissue && (
          <DropdownMenuItem onClick={() => onAction('reissue', charge)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Emitir 2ª via
          </DropdownMenuItem>
        )}
        {can.manual && (
          <DropdownMenuItem onClick={() => onAction('manual', charge)}>
            <HandCoins className="mr-2 h-4 w-4" />
            Dar baixa manual
          </DropdownMenuItem>
        )}
        {can.simulate && (
          <DropdownMenuItem onClick={() => onAction('simulate', charge)}>
            <FlaskConical className="mr-2 h-4 w-4" />
            Simular pagamento
          </DropdownMenuItem>
        )}
        {can.cancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction('cancel', charge)} className="text-red-600 focus:text-red-700">
              <Ban className="mr-2 h-4 w-4" />
              Cancelar fatura
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ReissueDialog({
  charge,
  defaultDueDays,
  onClose,
  onChanged,
}: {
  charge: PlatformCharge | null
  defaultDueDays: number
  onClose: () => void
  onChanged: (detail: PlatformChargeDetail) => void
}) {
  const [dueDate, setDueDate] = useState('')
  const [method, setMethod] = useState<'keep' | 'pix' | 'boleto'>('keep')
  const [busy, setBusy] = useState(false)
  const today = todaySP()

  useEffect(() => {
    if (charge) {
      setDueDate(addDays(today, defaultDueDays))
      setMethod('keep')
      setBusy(false)
    }
  }, [charge, defaultDueDays, today])

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= today

  const submit = async () => {
    if (!charge || !valid || busy) return
    setBusy(true)
    const detail = await runCommand(
      reissuePlatformChargeAction(charge.id, { dueDate, ...(method === 'keep' ? {} : { method }) }),
      `2ª via emitida — vence em ${formatDateBR(dueDate)}`,
    )
    setBusy(false)
    if (detail) {
      onChanged(detail)
      onClose()
    }
  }

  return (
    <Dialog open={!!charge} onOpenChange={open => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Emitir 2ª via</DialogTitle>
          <DialogDescription>
            {charge ? `${charge.tenantName ?? 'Fatura'} · ${formatBRL(charge.amount)} · vencia em ${formatDateBR(charge.dueDate)}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reissue-due">Novo vencimento</Label>
            <Input id="reissue-due" type="date" min={today} value={dueDate} onChange={event => setDueDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <Select value={method} onValueChange={value => setMethod(value as 'keep' | 'pix' | 'boleto')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Manter a atual</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">O link público da fatura continua o mesmo; o e-mail do inquilino não é reenviado.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!valid || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Emitir 2ª via
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManualPaymentDialog({
  charge,
  onClose,
  onChanged,
}: {
  charge: PlatformCharge | null
  onClose: () => void
  onChanged: (detail: PlatformChargeDetail) => void
}) {
  const [paidAt, setPaidAt] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const today = todaySP()

  useEffect(() => {
    if (charge) {
      setPaidAt(today)
      setAmount(charge.amount.toFixed(2).replace('.', ','))
      setNote('')
      setBusy(false)
    }
  }, [charge, today])

  const parsed = Number(amount.replace(/\./g, '').replace(',', '.'))
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(paidAt) && paidAt <= today && Number.isFinite(parsed) && parsed > 0

  const submit = async () => {
    if (!charge || !valid || busy) return
    setBusy(true)
    const detail = await runCommand(
      manualPaymentPlatformChargeAction(charge.id, {
        paidAt,
        amount: Math.round(parsed * 100) / 100,
        note: note.trim() || undefined,
      }),
      'Baixa manual registrada',
    )
    setBusy(false)
    if (detail) {
      onChanged(detail)
      onClose()
    }
  }

  return (
    <AlertDialog open={!!charge} onOpenChange={open => !open && !busy && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Dar baixa manual?</AlertDialogTitle>
          <AlertDialogDescription>
            Registra um pagamento recebido fora do gateway. A fatura vira paga e, se era a última em atraso, o painel do inquilino é
            reativado. Fica na trilha de auditoria.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="manual-date">Data do pagamento</Label>
            <Input id="manual-date" type="date" max={today} value={paidAt} onChange={event => setPaidAt(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-amount">Valor recebido (R$)</Label>
            <Input id="manual-amount" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="manual-note">Observação</Label>
            <Textarea
              id="manual-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex.: TED recebida em 27/09, comprovante no e-mail do financeiro"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
          <Button onClick={submit} disabled={!valid || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar baixa
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Estado e diálogos das ações de fatura. Quem usa chama `open(acao, fatura)`
 * e renderiza `dialogs` uma vez; `onChanged` recebe o detalhe atualizado.
 */
export function useChargeActions({
  defaultDueDays = 5,
  onChanged,
}: {
  defaultDueDays?: number
  onChanged: (detail: PlatformChargeDetail) => void
}) {
  const [current, setCurrent] = useState<{ action: ChargeAction; charge: PlatformCharge } | null>(null)
  const close = () => setCurrent(null)
  const chargeFor = (action: ChargeAction) => (current?.action === action ? current.charge : null)

  const cancel = async (reason: string) => {
    if (!current) return false
    const detail = await runCommand(
      cancelPlatformChargeAction(current.charge.id, { reason: reason || undefined }),
      'Fatura cancelada',
    )
    if (detail) onChanged(detail)
    return !!detail
  }

  const simulate = async () => {
    if (!current) return false
    const detail = await runCommand(
      simulatePlatformChargePaymentAction(current.charge.id),
      current.charge.kind === 'activation'
        ? 'Pagamento simulado — a ativação dispara o provisionamento'
        : 'Pagamento simulado — fatura paga',
    )
    if (detail) onChanged(detail)
    return !!detail
  }

  const dialogs = (
    <>
      <ReissueDialog charge={chargeFor('reissue')} defaultDueDays={defaultDueDays} onClose={close} onChanged={onChanged} />
      <ManualPaymentDialog charge={chargeFor('manual')} onClose={close} onChanged={onChanged} />
      <ConfirmDialog
        open={current?.action === 'cancel'}
        onOpenChange={open => !open && close()}
        title="Cancelar esta fatura?"
        description={
          current
            ? `${current.charge.tenantName ?? 'Fatura'} · ${formatBRL(current.charge.amount)} · vence ${formatDateBR(current.charge.dueDate)}. A cobrança sai do gateway e deixa de contar para a régua. Não há como desfazer.`
            : undefined
        }
        confirmLabel="Cancelar fatura"
        destructive
        reason={{ label: 'Motivo (opcional)', placeholder: 'Ex.: cobrança duplicada', minLength: 0 }}
        onConfirm={cancel}
      />
      <ConfirmDialog
        open={current?.action === 'simulate'}
        onOpenChange={open => !open && close()}
        title="Simular o pagamento?"
        description="Só no gateway simulado (demonstração): o pagamento é confirmado como se viesse do webhook — reativa o painel se era a última fatura em atraso."
        confirmLabel="Simular pagamento"
        onConfirm={simulate}
      />
    </>
  )

  return { open: (action: ChargeAction, charge: PlatformCharge) => setCurrent({ action, charge }), dialogs }
}
