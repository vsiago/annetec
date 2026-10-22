'use client'

import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Peças de formulário da jornada B2B (contratação, fatura, assinatura).
 * Rótulo, dica e erro inline acessíveis (`aria-invalid` + `aria-describedby`),
 * alvo de toque de 44 px e o erro sempre com a frase específica.
 */

interface FieldShellProps {
  id: string
  label: ReactNode
  error?: string
  hint?: ReactNode
  optional?: boolean
  className?: string
  children: ReactNode
}

function FieldShell({ id, label, error, hint, optional, className, children }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">(opcional)</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[13px] leading-snug text-destructive" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return [error ? `${id}-error` : null, !error && hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
}

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: ReactNode
  error?: string
  hint?: ReactNode
  optional?: boolean
  adornment?: ReactNode
  containerClassName?: string
  id?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, optional, adornment, containerClassName, className, id, ...props },
  ref,
) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} optional={optional} className={containerClassName}>
      <div className="relative">
        <Input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className={cn(
            'h-11 rounded-xl bg-background text-base shadow-none md:text-[15px]',
            adornment ? 'pr-12' : null,
            error ? 'border-destructive focus-visible:ring-destructive/25' : null,
            className,
          )}
          {...props}
        />
        {adornment ? (
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">{adornment}</div>
        ) : null}
      </div>
    </FieldShell>
  )
})

export interface TextAreaFieldProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: ReactNode
  error?: string
  hint?: ReactNode
  optional?: boolean
  containerClassName?: string
  id?: string
}

export function TextAreaField({ label, error, hint, optional, containerClassName, className, id, ...props }: TextAreaFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} optional={optional} className={containerClassName}>
      <Textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn('min-h-24 rounded-xl bg-background text-base md:text-[15px]', error ? 'border-destructive' : null, className)}
        {...props}
      />
    </FieldShell>
  )
}

export interface SelectFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  error?: string
  hint?: ReactNode
  optional?: boolean
  disabled?: boolean
  containerClassName?: string
  id?: string
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  error,
  hint,
  optional,
  disabled,
  containerClassName,
  id,
}: SelectFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} optional={optional} className={containerClassName}>
      {/* `''` mantém o Select controlado e mostra o placeholder (Radix trata string vazia como "sem seleção"). */}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className={cn('h-11 w-full rounded-xl bg-background text-base md:text-[15px]', error ? 'border-destructive' : null)}
        >
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
    </FieldShell>
  )
}

type Tone = 'error' | 'warning' | 'info' | 'success'

const TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  error: {
    box: 'border-destructive/30 bg-destructive/5 text-destructive dark:bg-destructive/10',
    icon: AlertCircle,
  },
  warning: {
    box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    icon: TriangleAlert,
  },
  info: {
    box: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100',
    icon: Info,
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    icon: CheckCircle2,
  },
}

/** Aviso em bloco. `error` anuncia para leitor de tela (`role="alert"`). */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { box, icon: Icon } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed [&_a]:underline">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Mensagem da server action + os erros de campo que não têm onde aparecer. */
export function ActionError({ message, details }: { message: string | null | undefined; details?: string[] }) {
  if (!message) return null
  const extra = (details ?? []).filter(item => item && item !== message)
  return (
    <Notice tone="error" title={message}>
      {extra.length ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {extra.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </Notice>
  )
}

/** Card de opção (rádio visual): seleção por clique, teclado e leitor de tela. */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  icon,
  badge,
  className,
  disabled,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  badge?: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-2xl border-2 bg-card p-4 text-left transition-all outline-none',
        'focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-primary shadow-[0_8px_24px_-12px_rgba(232,67,100,0.45)]'
          : 'border-border hover:border-primary/40 hover:shadow-sm',
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70 group-hover:text-primary',
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </span>
        {description ? <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{description}</span> : null}
      </span>
      <span
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          selected ? 'border-primary bg-primary' : 'border-border bg-background',
        )}
        aria-hidden
      >
        {selected ? <span className="size-2 rounded-full bg-primary-foreground" /> : null}
      </span>
    </button>
  )
}

/** Título de uma etapa/cartão com descrição. */
export function StepHeading({
  eyebrow,
  title,
  description,
  action,
  id,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  id?: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p> : null}
        <h2 id={id} tabIndex={-1} className="font-display text-xl font-bold tracking-tight text-foreground outline-none sm:text-2xl">
          {title}
        </h2>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl border bg-card p-5 shadow-sm sm:p-7', className)}>{children}</section>
}

export function SubPanel({ title, description, children, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-muted/25 p-4 sm:p-5', className)}>
      {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
      {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      <div className={cn(title || description ? 'mt-4' : null)}>{children}</div>
    </div>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-label={label} aria-hidden={label ? undefined : true} />
}

/** Estado de carregamento de página inteira. */
export function PageLoading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-muted-foreground" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'border-border bg-muted/60 text-foreground/80',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    danger: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    brand: 'border-primary/25 bg-primary/10 text-primary',
  } as const
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  )
}
