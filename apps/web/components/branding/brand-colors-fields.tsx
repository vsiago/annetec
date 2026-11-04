'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Cor completa (`#rgb` ou `#rrggbb`), o que a API aceita. */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** O `<input type="color">` só entende `#rrggbb`. */
function pickerValue(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
  return '#000000'
}

/** Seletor + campo de texto de uma cor, com erro quando o hexadecimal está incompleto. */
export function BrandColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const invalid = !HEX_COLOR.test(value)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (escolher cor)`}
          value={pickerValue(value)}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-input disabled:cursor-not-allowed"
        />
        <Input
          id={id}
          value={value}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          onChange={event => {
            const next = event.target.value.trim()
            onChange(next.startsWith('#') || next === '' ? next : `#${next}`)
          }}
          className={cn('font-mono uppercase', invalid && 'border-destructive')}
        />
      </div>
      {invalid ? (
        <p className="text-[12px] text-destructive" role="alert">
          Use uma cor como #E84364.
        </p>
      ) : null}
    </div>
  )
}
