'use client'

import { useState, type ReactNode } from 'react'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Diálogo de formulário do painel: cuida do estado de envio, do erro geral e
 * do rodapé, para cada tela só declarar os campos. `onSubmit` devolve uma
 * mensagem quando falha e `void` quando dá certo — quem chama não precisa
 * mexer em `open`, o diálogo fecha sozinho no sucesso.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = 'Salvar',
  size = 'md',
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel?: string
  size?: 'md' | 'lg'
  onSubmit: () => Promise<string | void>
  children: ReactNode
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const message = await onSubmit()
      if (message) {
        setError(message)
        return
      }
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setError('')
        onOpenChange(next)
      }}
    >
      <DialogContent className={cn(size === 'lg' ? 'sm:max-w-160' : 'sm:max-w-125')}>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto py-4">
            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {children}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Campo com rótulo, marcação de obrigatório e mensagem de erro embaixo. */
export function FormField({
  label,
  htmlFor,
  error,
  required = false,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  required?: boolean
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Duas colunas no desktop, empilhado no mobile. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>
}

/** Select já ligado ao par valor/erro do `useZodForm`. */
export function FormSelect({
  value,
  onChange,
  placeholder,
  options,
  invalid = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: { value: string; label: string }[]
  invalid?: boolean
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full', invalid && 'border-destructive')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Confirmação de ação destrutiva. Toda exclusão do painel passa por aqui —
 * apagar registro de beneficiário ou parceiro não pode ser um clique só.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Excluir',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
}) {
  const [working, setWorking] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={working}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={async event => {
              event.preventDefault()
              setWorking(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } finally {
                setWorking(false)
              }
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
