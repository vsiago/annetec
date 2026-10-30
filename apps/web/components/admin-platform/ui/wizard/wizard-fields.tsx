'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, Plus, X, type LucideIcon } from 'lucide-react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'
import type { FieldBinding } from './use-wizard'

/**
 * Campos do assistente. Todos recebem `{...wizard.field('chave')}` e cuidam
 * do resto: rótulo com "*" (obrigatório) ou "(opcional)", ajuda abaixo, erro
 * em vermelho com ícone, ✓ verde quando o campo preenchido está válido,
 * contador de caracteres e máscara. Erro, ajuda e contador ficam ligados ao
 * controle por `aria-describedby`; a cor nunca é o único sinal.
 *
 * Largura: os campos vivem num `FieldGrid` de 12 colunas (`span`), que vira 1
 * coluna no celular.
 */

export type FieldSpan = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12

const SPAN: Record<FieldSpan, string> = {
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
  5: 'sm:col-span-5',
  6: 'sm:col-span-6',
  7: 'sm:col-span-7',
  8: 'sm:col-span-8',
  9: 'sm:col-span-9',
  12: 'sm:col-span-12',
}

/** Grade de 12 colunas das etapas (1 coluna no celular). */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-12', className)}>{children}</div>
}

/** Bloco com título dentro de uma etapa ("Endereço", "Contato"). Ocupa a linha inteira da grade. */
export function FieldSection({
  title,
  description,
  icon: Icon,
  aside,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-4 sm:col-span-12', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF0F3] pb-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-secondary" aria-hidden="true">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h4 id={id} className="m-0 text-[15px] font-semibold text-foreground">
              {title}
            </h4>
            {description ? <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {aside}
      </div>
      <FieldGrid>{children}</FieldGrid>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Moldura comum
// ---------------------------------------------------------------------------

interface ShellProps {
  id: string
  label: ReactNode
  /** Exigido pela API: asterisco e `aria-required`. */
  required?: boolean
  /** Opcional: o rótulo diz "(opcional)". */
  optional?: boolean
  hint?: ReactNode
  error?: string
  span?: FieldSpan
  className?: string
  /** Texto à direita do rótulo (ex.: link "Usar sugestão"). */
  labelAside?: ReactNode
  /** Contador "23/120". */
  counter?: { length: number; max: number }
  /** O rótulo é de um grupo (radio, chips): vira `<p>`/legend em vez de `<label for>`. */
  groupLabelId?: string
}

function describedBy(id: string, hint?: ReactNode, error?: string, counter?: ShellProps['counter']) {
  const ids = [hint ? `${id}-ajuda` : null, error ? `${id}-erro` : null, counter ? `${id}-contador` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function FieldShell({
  id,
  label,
  required,
  optional,
  hint,
  error,
  span = 12,
  className,
  labelAside,
  counter,
  groupLabelId,
  children,
}: ShellProps & { children: ReactNode }) {
  const labelContent = (
    <>
      {label}
      {required ? (
        <>
          <span className="ml-0.5 text-[#B42318]" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (obrigatório)</span>
        </>
      ) : null}
      {optional ? <span className="ml-1 font-normal text-muted-foreground">(opcional)</span> : null}
    </>
  )
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', SPAN[span], className)}>
      <div className="flex items-baseline justify-between gap-3">
        {groupLabelId ? (
          <p id={groupLabelId} className="m-0 text-sm font-medium text-[#344054]">
            {labelContent}
          </p>
        ) : (
          <label htmlFor={id} className="text-sm font-medium text-[#344054]">
            {labelContent}
          </label>
        )}
        {labelAside}
      </div>
      {children}
      {hint || error || counter ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {hint ? (
              <p id={`${id}-ajuda`} className="m-0 text-[13px] leading-relaxed text-muted-foreground">
                {hint}
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-erro`} className="m-0 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-[#B42318]">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            ) : null}
          </div>
          {counter ? (
            <span
              id={`${id}-contador`}
              className={cn(
                'shrink-0 text-xs tabular-nums',
                counter.length > counter.max ? 'font-semibold text-[#B42318]' : 'text-muted-foreground',
              )}
            >
              {counter.length}/{counter.max}
              <span className="sr-only"> caracteres</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const GROUP =
  'flex min-h-11 w-full items-center overflow-hidden rounded-[10px] border bg-white text-sm transition-[border-color,box-shadow] focus-within:ring-[3px]'
const GROUP_OK = 'border-[#D0D5DD] focus-within:border-secondary focus-within:ring-secondary/20'
const GROUP_ERROR = 'border-[#B42318] focus-within:border-[#B42318] focus-within:ring-[#B42318]/20'
const GROUP_DISABLED = 'has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-[#F9FAFB]'
const BARE =
  'h-11 min-w-0 flex-1 bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-[#667085] disabled:cursor-not-allowed'

function ValidMark({ show }: { show: boolean }) {
  if (!show) return null
  return <CheckCircle2 className="mr-3 size-4 shrink-0 text-[#067647]" aria-hidden="true" />
}

type BaseFieldProps = Omit<ShellProps, 'id' | 'error' | 'counter' | 'groupLabelId'> & {
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export type TextFieldProps = BaseFieldProps &
  FieldBinding<string> & {
    type?: 'text' | 'email' | 'url' | 'tel' | 'password' | 'date' | 'search'
    inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url'
    autoComplete?: string
    placeholder?: string
    maxLength?: number
    /** Mostra "23/120" (precisa de `maxLength`). */
    showCounter?: boolean
    /** Máscara aplicada a cada tecla (ex.: `maskCnpj`). */
    mask?: (value: string) => string
    /** Texto fixo antes do valor ("R$"). */
    prefix?: ReactNode
    /** Texto fixo depois do valor ("%", "vidas"). */
    suffix?: ReactNode
    /** Indicador à direita (ex.: "Verificando…"). */
    status?: ReactNode
    /** Fonte monoespaçada (códigos, cores). */
    mono?: boolean
    autoFocus?: boolean
    min?: string
    max?: string
  }

export function TextField({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  error,
  valid,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  maxLength,
  showCounter,
  mask,
  prefix,
  suffix,
  status,
  mono,
  disabled,
  autoFocus,
  min,
  max,
  ...shell
}: TextFieldProps) {
  const counter = showCounter && maxLength ? { length: value.length, max: maxLength } : undefined
  return (
    <FieldShell id={id} error={error} counter={counter} {...shell}>
      <div className={cn(GROUP, error ? GROUP_ERROR : GROUP_OK, GROUP_DISABLED)}>
        {prefix ? (
          <span className="shrink-0 pl-3.5 text-sm font-medium text-muted-foreground" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          name={name}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={maxLength}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          min={min}
          max={max}
          onChange={event => onValueChange(mask ? mask(event.target.value) : event.target.value)}
          onBlur={onBlur}
          aria-required={shell.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, shell.hint, error, counter)}
          className={cn(BARE, prefix ? 'pl-2' : undefined, mono && 'font-mono tracking-tight')}
        />
        {status ? <span className="mr-3 flex shrink-0 items-center">{status}</span> : null}
        <ValidMark show={valid && !status} />
        {suffix ? (
          <span className="shrink-0 pr-3.5 text-sm font-medium text-muted-foreground" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  )
}

export type TextareaFieldProps = BaseFieldProps &
  FieldBinding<string> & {
    placeholder?: string
    maxLength?: number
    showCounter?: boolean
    rows?: number
  }

export function TextareaField({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  error,
  valid,
  placeholder,
  maxLength,
  showCounter = true,
  rows = 4,
  disabled,
  ...shell
}: TextareaFieldProps) {
  const counter = showCounter && maxLength ? { length: value.length, max: maxLength } : undefined
  return (
    <FieldShell id={id} error={error} counter={counter} {...shell}>
      <div className="relative">
        <textarea
          id={id}
          name={name}
          value={value}
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={event => onValueChange(event.target.value)}
          onBlur={onBlur}
          aria-required={shell.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, shell.hint, error, counter)}
          className={cn(
            'block min-h-24 w-full resize-y rounded-[10px] border bg-white px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-[#667085] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-[#F9FAFB]',
            error
              ? 'border-[#B42318] focus-visible:border-[#B42318] focus-visible:ring-[#B42318]/20'
              : 'border-[#D0D5DD] focus-visible:border-secondary focus-visible:ring-secondary/20',
            valid && 'pr-10',
          )}
        />
        {valid ? (
          <CheckCircle2 className="pointer-events-none absolute right-3 top-3 size-4 text-[#067647]" aria-hidden="true" />
        ) : null}
      </div>
    </FieldShell>
  )
}

// ---------------------------------------------------------------------------
// Lista de opções
// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export type SelectFieldProps = BaseFieldProps &
  FieldBinding<string> & {
    options: readonly SelectOption[]
    /** Primeira linha, sem valor ("Escolha um plano"). */
    placeholder?: string
    autoComplete?: string
  }

export function SelectField({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  error,
  valid,
  options,
  placeholder = 'Escolha uma opção',
  autoComplete,
  disabled,
  ...shell
}: SelectFieldProps) {
  return (
    <FieldShell id={id} error={error} {...shell}>
      <div className={cn(GROUP, 'relative', error ? GROUP_ERROR : GROUP_OK, GROUP_DISABLED)}>
        <select
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={event => {
            onValueChange(event.target.value)
          }}
          onBlur={onBlur}
          aria-required={shell.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, shell.hint, error)}
          className={cn(BARE, 'cursor-pointer appearance-none pr-16', !value && 'text-[#667085]')}
        >
          <option value="">{placeholder}</option>
          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled} className="text-foreground">
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 flex items-center gap-2">
          {valid ? <CheckCircle2 className="size-4 text-[#067647]" aria-hidden="true" /> : null}
          <ChevronDown className="size-4 text-[#667085]" aria-hidden="true" />
        </span>
      </div>
    </FieldShell>
  )
}

/** Opção em cartão (radio): plano, nível de acesso, forma de vínculo. */
export interface ChoiceOption {
  value: string
  title: ReactNode
  description?: ReactNode
  /** Texto à direita (preço, selo). */
  aside?: ReactNode
  icon?: LucideIcon
  disabled?: boolean
}

export type ChoiceFieldProps = BaseFieldProps &
  FieldBinding<string> & {
    options: readonly ChoiceOption[]
    /** Colunas no desktop. */
    columns?: 1 | 2 | 3
  }

export function ChoiceField({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  error,
  options,
  columns = 2,
  disabled,
  ...shell
}: ChoiceFieldProps) {
  const labelId = `${id}-rotulo`
  const focusIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  )
  return (
    <FieldShell id={id} error={error} groupLabelId={labelId} {...shell}>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-required={shell.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, shell.hint, error)}
        className={cn(
          'grid grid-cols-1 gap-3',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-3',
        )}
      >
        {options.map((option, i) => {
          const checked = option.value === value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition-[border-color,box-shadow,background-color]',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-secondary/25',
                checked ? 'border-secondary bg-accent/50 shadow-[inset_0_0_0_1px_var(--secondary)]' : 'border-[#D0D5DD] hover:border-[#98A2B3]',
                error && !checked && 'border-[#FDA29B]',
                (disabled || option.disabled) && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                id={i === focusIndex ? id : undefined}
                name={name}
                value={option.value}
                checked={checked}
                disabled={disabled || option.disabled}
                onChange={() => onValueChange(option.value)}
                onBlur={onBlur}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2',
                  checked ? 'border-secondary' : 'border-[#98A2B3]',
                )}
              >
                {checked ? <span className="size-2.5 rounded-full bg-secondary" /> : null}
              </span>
              {Icon ? (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-secondary" aria-hidden="true">
                  <Icon className="size-4" />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">{option.title}</span>
                  {option.aside ? <span className="text-sm font-semibold text-secondary">{option.aside}</span> : null}
                </span>
                {option.description ? (
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{option.description}</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}

// ---------------------------------------------------------------------------
// Liga/desliga
// ---------------------------------------------------------------------------

export type SwitchFieldProps = Omit<BaseFieldProps, 'required' | 'optional'> &
  FieldBinding<boolean> & {
    /** Explica o que muda com a chave ligada. */
    description?: ReactNode
  }

export function SwitchField({
  id,
  value,
  onValueChange,
  onBlur,
  label,
  description,
  hint,
  span = 12,
  className,
  disabled,
}: SwitchFieldProps) {
  const descId = description ? `${id}-descricao` : undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', SPAN[span], className)}>
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border bg-white p-4 transition-colors',
          'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-secondary/25',
          value ? 'border-secondary/40 bg-accent/40' : 'border-[#D0D5DD]',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {description ? (
            <span id={descId} className="text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[13px] font-medium text-muted-foreground" aria-hidden="true">
            {value ? 'Sim' : 'Não'}
          </span>
          <SwitchPrimitive.Root
            id={id}
            checked={value}
            disabled={disabled}
            onCheckedChange={checked => onValueChange(checked)}
            onBlur={onBlur}
            aria-describedby={descId}
            className="inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-[#D0D5DD] p-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-secondary/30 disabled:cursor-not-allowed data-[state=checked]:bg-secondary"
          >
            <SwitchPrimitive.Thumb className="block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
          </SwitchPrimitive.Root>
        </span>
      </label>
      {hint ? <p className="m-0 text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lista de itens (chips)
// ---------------------------------------------------------------------------

export type ChipsFieldProps = BaseFieldProps &
  FieldBinding<string[]> & {
    placeholder?: string
    /** Tamanho máximo de cada item. */
    maxItemLength?: number
    maxItems?: number
    /** Sugestões que entram com um clique. */
    suggestions?: readonly string[]
  }

export function ChipsField({
  id,
  value,
  onValueChange,
  onBlur,
  error,
  valid,
  placeholder = 'Digite e aperte Enter',
  maxItemLength = 80,
  maxItems = 30,
  suggestions = [],
  disabled,
  ...shell
}: ChipsFieldProps) {
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')

  const add = (raw: string) => {
    const items = raw
      .split(/[,;\n]/)
      .map(item => item.trim())
      .filter(Boolean)
    if (items.length === 0) return
    const next = [...value]
    let skipped = 0
    for (const item of items) {
      if (next.length >= maxItems) {
        skipped++
        continue
      }
      if (next.some(existing => existing.toLowerCase() === item.toLowerCase())) {
        skipped++
        continue
      }
      next.push(item.slice(0, maxItemLength))
    }
    onValueChange(next)
    setDraft('')
    setNotice(
      skipped > 0
        ? next.length >= maxItems
          ? `Limite de ${maxItems} itens.`
          : 'Esse item já está na lista.'
        : `${items.length === 1 ? 'Item adicionado' : `${items.length} itens adicionados`}.`,
    )
  }

  const remove = (index: number) => {
    const removed = value[index]
    onValueChange(value.filter((_, i) => i !== index))
    setNotice(`${removed} removido.`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter aqui adiciona o item — não avança a etapa.
      event.preventDefault()
      event.stopPropagation()
      add(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value.length - 1)
    }
  }

  const available = suggestions.filter(item => !value.some(existing => existing.toLowerCase() === item.toLowerCase()))

  return (
    <FieldShell id={id} error={error} {...shell}>
      <div
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-2 rounded-[10px] border bg-white p-1.5 pl-2 transition-[border-color,box-shadow] focus-within:ring-[3px]',
          error ? GROUP_ERROR : GROUP_OK,
        )}
      >
        <ul className="m-0 contents list-none p-0" aria-label="Itens adicionados">
          {value.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-accent py-1 pl-2.5 pr-1 text-[13px] font-medium text-secondary"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(i)}
                className="grid size-7 shrink-0 place-items-center rounded-md text-secondary outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-secondary/40"
                aria-label={`Remover ${item}`}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={draft}
          disabled={disabled}
          maxLength={maxItemLength}
          placeholder={value.length === 0 ? placeholder : 'Adicionar outro'}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={event => {
            const text = event.clipboardData.getData('text')
            if (/[,;\n]/.test(text)) {
              event.preventDefault()
              add(text)
            }
          }}
          onBlur={() => {
            if (draft.trim()) add(draft)
            onBlur()
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, shell.hint, error)}
          className="h-8 min-w-[10rem] flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-[#667085]"
        />
        {draft.trim() ? (
          <button
            type="button"
            onClick={() => add(draft)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-secondary px-2.5 text-[13px] font-semibold text-white outline-none hover:bg-secondary/90 focus-visible:ring-2 focus-visible:ring-secondary/40 focus-visible:ring-offset-1"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Adicionar
          </button>
        ) : valid ? (
          <CheckCircle2 className="mr-1.5 size-4 shrink-0 text-[#067647]" aria-hidden="true" />
        ) : null}
      </div>
      {available.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[13px] text-muted-foreground">Sugestões:</span>
          {available.map(item => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => add(item)}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-[#98A2B3] px-3 text-[13px] text-[#344054] outline-none hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-secondary/40"
            >
              <Plus className="size-3" aria-hidden="true" />
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {notice}
      </span>
    </FieldShell>
  )
}

// ---------------------------------------------------------------------------
// Cor
// ---------------------------------------------------------------------------

export type ColorFieldProps = BaseFieldProps &
  FieldBinding<string> & {
    /** Cor do seletor quando o texto ainda não é uma cor completa. */
    fallback: string
  }

function longHex(value: string, fallback: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return fallback
}

export function ColorField({ id, name, value, onValueChange, onBlur, error, valid, fallback, disabled, ...shell }: ColorFieldProps) {
  return (
    <FieldShell id={id} error={error} {...shell}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${typeof shell.label === 'string' ? shell.label : 'Cor'}: escolher no seletor`}
          value={longHex(value, fallback)}
          disabled={disabled}
          onChange={event => onValueChange(event.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-[10px] border border-[#D0D5DD] bg-white p-1"
        />
        <div className={cn(GROUP, error ? GROUP_ERROR : GROUP_OK, GROUP_DISABLED)}>
          <input
            id={id}
            name={name}
            value={value}
            disabled={disabled}
            maxLength={7}
            onChange={event => {
              const hex = event.target.value.replace(/[^0-9a-fA-F#]/g, '').replace(/(?!^)#/g, '')
              onValueChange(hex && !hex.startsWith('#') ? `#${hex}`.toUpperCase() : hex.toUpperCase())
            }}
            onBlur={onBlur}
            placeholder={fallback}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, shell.hint, error)}
            className={cn(BARE, 'font-mono uppercase')}
          />
          <ValidMark show={valid} />
        </div>
      </div>
    </FieldShell>
  )
}

// ---------------------------------------------------------------------------
// Avisos dentro da etapa
// ---------------------------------------------------------------------------

const NOTICE_TONE = {
  info: 'border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]',
  success: 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]',
  warning: 'border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]',
  danger: 'border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]',
  neutral: 'border-border bg-accent/60 text-foreground',
} as const

export function Notice({
  tone = 'info',
  icon: Icon,
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof NOTICE_TONE
  icon?: LucideIcon
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
  role?: 'status' | 'alert' | 'note'
}) {
  return (
    <div
      role={role}
      className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-sm leading-relaxed sm:col-span-12', NOTICE_TONE[tone], className)}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="m-0 font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'text-[13px] [&_p]:m-0')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
