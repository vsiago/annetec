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
import { Button } from '@/components/admin-platform/ui/button'
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
import { ConfirmDialog, copyToClipboard, runCommand, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import {
  cancelPlatformChargeAction,
  manualPaymentPlatformChargeAction,
  reissuePlatformChargeAction,
  simulatePlatformChargePaymentAction,
} from '@/lib/actions/platform-billing-api'
import { addDays, formatBRL, formatDateBR, isChargeOpen, todaySP } from '@/lib/adapters/platform-console'

/**
 * Ações sobre uma fatura da plataforma: segunda via, marcar como paga,
 * cancelar e simular o pagamento (só quando o servidor diz que é
 * demonstração: `canSimulate`). Cancelar e marcar como paga pedem confirmação
 * explícita; todas avisam com a frase da própria API. Marcar como paga e
 * cancelar são só do superadmin — para os outros ficam desativadas.
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
  const { isSuperadmin } = usePlatformRole()

  const copyLink = async () => {
    const ok = await copyToClipboard(charge.publicUrl)
    if (ok) toast.success('Link da fatura copiado')
    else toast.error('Não foi possível copiar o link', { description: `Copie manualmente: ${charge.publicUrl}` })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-[10px]"
          aria-label="Mais ações para esta fatura"
          onClick={event => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onClick={event => event.stopPropagation()}>
        {onDetail && (
          <DropdownMenuItem onClick={() => onDetail(charge)}>
            <PanelRightOpen className="mr-2 h-4 w-4" aria-hidden="true" />
            Ver histórico da fatura
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={charge.publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            Abrir página da fatura
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          Copiar link de pagamento
        </DropdownMenuItem>
        {(can.reissue || can.manual || can.simulate || can.cancel) && <DropdownMenuSeparator />}
        {can.reissue && (
          <DropdownMenuItem onClick={() => onAction('reissue', charge)}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Emitir segunda via
          </DropdownMenuItem>
        )}
        {can.manual && (
          <DropdownMenuItem
            onClick={() => onAction('manual', charge)}
            disabled={!isSuperadmin}
            title={isSuperadmin ? undefined : 'Somente o superadmin pode marcar uma fatura como paga.'}
          >
            <HandCoins className="mr-2 h-4 w-4" aria-hidden="true" />
            Marcar como pago
          </DropdownMenuItem>
        )}
        {can.simulate && (
          <DropdownMenuItem
            onClick={() => onAction('simulate', charge)}
            disabled={!isSuperadmin}
            title={isSuperadmin ? undefined : 'Somente o superadmin pode simular um pagamento.'}
          >
            <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />
            Simular pagamento
          </DropdownMenuItem>
        )}
        {can.cancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onAction('cancel', charge)}
              disabled={!isSuperadmin}
              title={isSuperadmin ? undefined : 'Somente o superadmin pode cancelar uma fatura.'}
              className="text-[#B42318] focus:text-[#B42318]"
            >
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
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
      `Segunda via emitida — vence em ${formatDateBR(dueDate)}`,
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
          <DialogTitle>Emitir segunda via</DialogTitle>
          <DialogDescription>
            {charge ? `${charge.tenantName ?? 'Fatura'} · ${formatBRL(charge.amount)} · venceu em ${formatDateBR(charge.dueDate)}` : ''}
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
        <p className="text-xs text-muted-foreground">
          O link da fatura continua o mesmo. Nenhum e-mail sai agora, mas o lembrete automático e o aviso de atraso voltam a valer para o novo vencimento. Para avisar o clube já, copie o link no menu da fatura.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!valid || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Emitir segunda via
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
      'Fatura marcada como paga',
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
          <AlertDialogTitle>Marcar esta fatura como paga?</AlertDialogTitle>
          <AlertDialogDescription>
            Use quando o clube pagou por fora, por exemplo com uma transferência. A fatura passa a paga e, se era a última em
            atraso, o painel do clube volta ao normal. Fica registrado no histórico.
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
              placeholder="Ex.: transferência recebida em 27/09, comprovante no e-mail do financeiro"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
          <Button onClick={submit} disabled={!valid || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Marcar como pago
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
        ? 'Pagamento simulado — o clube será liberado'
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
            ? `${current.charge.tenantName ?? 'Fatura'} · ${formatBRL(current.charge.amount)} · vence em ${formatDateBR(current.charge.dueDate)}. A cobrança deixa de valer e não gera mais lembretes nem bloqueios. Não dá para desfazer.`
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
        description="Só para demonstração: o pagamento é confirmado como se tivesse chegado do banco. Se era a última fatura em atraso, o painel do clube volta ao normal."
        confirmLabel="Simular pagamento"
        onConfirm={simulate}
      />
    </>
  )

  return { open: (action: ChargeAction, charge: PlatformCharge) => setCurrent({ action, charge }), dialogs }
}
