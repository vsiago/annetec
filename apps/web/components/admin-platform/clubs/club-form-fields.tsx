'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Campos do "Cadastrar clube": rótulo, marca de obrigatório, ajuda e erro
 * junto ao campo, sempre ligados por `aria-describedby`. A cor nunca é o único
 * sinal: o erro tem texto e o campo ganha `aria-invalid`.
 */

const CONTROL =
  'min-h-11 w-full rounded-[10px] border bg-white px-3.5 text-sm text-foreground outline-none placeholder:text-[#667085] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]'
const CONTROL_OK = 'border-[#D0D5DD] focus-visible:border-secondary focus-visible:ring-secondary/25'
const CONTROL_ERROR = 'border-[#B42318] focus-visible:border-[#B42318] focus-visible:ring-[#B42318]/25'

interface BaseProps {
  id: string
  label: string
  /** Campo exigido pela API: ganha o asterisco e `aria-required`. */
  required?: boolean
  /** Campo opcional: o rótulo diz "(opcional)". */
  optional?: boolean
  hint?: ReactNode
  /** Só é passado quando a mensagem já deve aparecer. */
  error?: string
  className?: string
}

function Shell({
  id,
  label,
  required,
  optional,
  hint,
  error,
  className,
  children,
}: BaseProps & { children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-[#344054]">
        {label}
        {required ? (
          <span className="ml-0.5 text-[#B42318]" aria-hidden="true">
            *
          </span>
        ) : null}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">(opcional)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-ajuda`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-erro`} className="text-[13px] font-medium text-[#B42318]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, hint: ReactNode, error?: string) {
  const ids = [hint ? `${id}-ajuda` : null, error ? `${id}-erro` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

export function TextField({
  value,
  onChange,
  onBlur,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  maxLength,
  ...base
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  type?: 'text' | 'email' | 'url' | 'tel'
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url'
  autoComplete?: string
  placeholder?: string
  maxLength?: number
}) {
  const { id, required, hint, error } = base
  return (
    <Shell {...base}>
      <input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={event => onChange(event.target.value)}
        onBlur={onBlur}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, error ? CONTROL_ERROR : CONTROL_OK)}
      />
    </Shell>
  )
}

export function SelectField({
  value,
  onChange,
  onBlur,
  placeholder,
  options,
  autoComplete,
  ...base
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder: string
  options: { value: string; label: string }[]
  autoComplete?: string
}) {
  const { id, required, hint, error } = base
  return (
    <Shell {...base}>
      <select
        id={id}
        name={id}
        value={value}
        autoComplete={autoComplete}
        onChange={event => onChange(event.target.value)}
        onBlur={onBlur}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(CONTROL, error ? CONTROL_ERROR : CONTROL_OK)}
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Shell>
  )
}

/** Seletor de cor do navegador + o código hexadecimal, que a pessoa também pode digitar. */
export function ColorField({
  value,
  pickerValue,
  onChange,
  onBlur,
  ...base
}: BaseProps & {
  value: string
  /** Valor `#rrggbb` para o seletor (o campo de texto aceita `#rgb` também). */
  pickerValue: string
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  const { id, hint, error } = base
  return (
    <Shell {...base}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${base.label}: escolher no seletor`}
          value={pickerValue}
          onChange={event => onChange(event.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-[10px] border border-[#D0D5DD] bg-white p-1"
        />
        <input
          id={id}
          name={id}
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder="#26365F"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(CONTROL, 'font-mono', error ? CONTROL_ERROR : CONTROL_OK)}
        />
      </div>
    </Shell>
  )
}

/** Cabeçalho numerado de cada passo. */
export function StepSection({
  step,
  title,
  description,
  children,
}: {
  step: number
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  const headingId = `passo-${step}`
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-white p-6">
      <div className="mb-5 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-secondary"
        >
          {step}
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id={headingId} className="text-lg font-semibold text-foreground">
            <span className="sr-only">Passo {step}: </span>
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}
