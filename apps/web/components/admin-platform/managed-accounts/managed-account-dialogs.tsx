'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { PlatformCharge } from '@annetec/contracts'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/admin-platform/ui/button'
import { ConfirmDialog, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { listPlatformChargesAction } from '@/lib/actions/platform-billing-api'
import { formatBRL, formatDateBR } from '@/lib/adapters/platform-console'

/** Confirmação forte: só habilita depois de digitar o endereço (slug) do clube. */
export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  expected,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  expected: string
  confirmLabel: string
  onConfirm: () => Promise<boolean>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setText('')
  }, [open])
  const ok = text.trim().toLowerCase() === expected.toLowerCase()
  return (
    <AlertDialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="typed-confirm">
            Para confirmar, digite <strong>{expected}</strong>
          </Label>
          <Input id="typed-confirm" value={text} onChange={event => setText(event.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!ok || busy}
            className="gap-2"
            onClick={async () => {
              setBusy(true)
              const done = await onConfirm()
              setBusy(false)
              if (done) onOpenChange(false)
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Escolha da fatura vencida para o "Debitar agora" (padrão: a mais antiga). */
export function DebitNowDialog({
  open,
  onOpenChange,
  orgId,
  balance,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  balance: number | null
  onConfirm: (chargeId: string | undefined) => Promise<boolean>
}) {
  const [chargeId, setChargeId] = useState('oldest')
  const charges = useConsoleData(
    open ? () => listPlatformChargesAction({ organizationId: orgId, status: 'overdue', perPage: 25 }) : null,
    [open, orgId],
  )
  useEffect(() => {
    if (open) setChargeId('oldest')
  }, [open])
  const rows: PlatformCharge[] = charges.data?.items ?? []

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Debitar a fatura do saldo agora"
      confirmLabel="Debitar agora"
      description={
        <p className="text-sm text-muted-foreground">
          Transfere o valor da fatura do saldo da subconta do clube para a carteira da ANNETEC e dá baixa na fatura.
          {balance !== null ? ` Saldo atual: ${formatBRL(balance)}.` : ''} Se o saldo não cobrir, nada é transferido e a
          tentativa fica registrada como não realizada.
        </p>
      }
      onConfirm={() => onConfirm(chargeId === 'oldest' ? undefined : chargeId)}
    >
      <div className="space-y-2">
        <Label htmlFor="debit-charge">Fatura</Label>
        {charges.loading && !charges.data ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={chargeId} onValueChange={setChargeId}>
            <SelectTrigger id="debit-charge" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">A fatura vencida mais antiga</SelectItem>
              {rows.map(charge => (
                <SelectItem key={charge.id} value={charge.id}>
                  {charge.description} · venceu em {formatDateBR(charge.dueDate)} · {formatBRL(charge.amount)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {charges.error && <p className="text-xs text-[#B42318]">{charges.error}</p>}
        {!charges.loading && !charges.error && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma fatura vencida em aberto para este clube agora.</p>
        )}
      </div>
    </ConfirmDialog>
  )
}
