'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Confirmação com motivo opcional (ou obrigatório). Diferente do
 * `ConfirmDialog` do dashboard, fica aberta quando a API recusa e mostra a
 * frase dela ali mesmo — a pessoa corrige o motivo sem perder o que digitou.
 *
 * `onConfirm` devolve a mensagem de erro, ou nada quando deu certo.
 */
export function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = true,
  reason,
  children,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  /** Sem `reason`, é só confirmação. */
  reason?: { label: string; placeholder?: string; required?: boolean; minLength?: number }
  children?: ReactNode
  onConfirm: (reason: string) => Promise<string | void>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setError('')
    }
  }, [open])

  async function confirm() {
    const trimmed = text.trim()
    const min = reason?.minLength ?? (reason?.required ? 3 : 0)
    if (reason?.required && trimmed.length < min) {
      setError(`Informe o motivo (mínimo de ${min} caracteres).`)
      return
    }
    setError('')
    setWorking(true)
    try {
      const message = await onConfirm(trimmed)
      if (message) {
        setError(message)
        return
      }
      onOpenChange(false)
    } finally {
      setWorking(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={next => !working && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        {reason && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason" className="text-sm font-medium">
              {reason.label}
              {reason.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            <Textarea
              id="confirm-reason"
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={reason.placeholder}
              maxLength={500}
              className="min-h-20 resize-none"
              disabled={working}
            />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={working}
            className={cn(destructive && 'bg-destructive text-white hover:bg-destructive/90')}
            onClick={event => {
              event.preventDefault()
              void confirm()
            }}
          >
            {working && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
