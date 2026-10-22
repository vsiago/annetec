'use client'

import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Campo de texto do checkout: rótulo, dica e erro inline acessíveis
 * (`aria-invalid` + `aria-describedby`), alvo de toque de 48 px.
 */
export interface CheckoutFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string
  error?: string
  hint?: ReactNode
  optional?: boolean
  /** Conteúdo à direita dentro do campo (bandeira, spinner…). */
  adornment?: ReactNode
  /** Campo preenchido e válido: mostra um check discreto (quando não há adorno). */
  valid?: boolean
  containerClassName?: string
  id?: string
}

export const CheckoutField = forwardRef<HTMLInputElement, CheckoutFieldProps>(function CheckoutField(
  { label, error, hint, optional, adornment, valid, containerClassName, className, id, ...props },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  const trailing =
    adornment ??
    (valid && !error ? (
      <Check className="size-4 text-emerald-600 duration-150 animate-in fade-in zoom-in-75 dark:text-emerald-400 motion-reduce:animate-none" aria-hidden />
    ) : null)

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">(opcional)</span> : null}
      </Label>
      <div className="relative">
        <Input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-12 rounded-xl bg-background text-base shadow-none transition-[border-color,box-shadow] duration-150 md:text-[15px]',
            trailing ? 'pr-12' : null,
            error ? 'border-destructive focus-visible:ring-destructive/25' : null,
            className,
          )}
          {...props}
        />
        {trailing ? (
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">{trailing}</div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-snug text-destructive" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
