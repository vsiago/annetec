'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Copia texto com plano B: `navigator.clipboard` só existe em contexto seguro
 * (https/localhost) — no celular abrindo a demo por IP da rede ele some. O
 * `textarea` temporário entra DENTRO do diálogo aberto, porque o foco preso
 * do Radix/vaul devolveria o foco antes do `execCommand` se ele fosse para o body.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // segue para o plano B
  }

  try {
    const host = document.activeElement?.closest('[role="dialog"]') ?? document.body
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '0'
    area.style.opacity = '0'
    area.style.pointerEvents = 'none'
    host.appendChild(area)
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    host.removeChild(area)
    return ok
  } catch {
    return false
  }
}

interface CopyButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  /** Mensagem do toast de sucesso. */
  successMessage?: string
  className?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm'
  disabled?: boolean
}

export function CopyButton({
  value,
  label = 'Copiar',
  copiedLabel = 'Copiado!',
  successMessage = 'Copiado!',
  className,
  variant = 'outline',
  size = 'sm',
  disabled,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onClick = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const ok = await copyToClipboard(value)
    if (!ok) {
      toast.error('Não foi possível copiar. Toque e segure o texto para copiar manualmente.')
      return
    }
    toast.success(successMessage)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2500)
  }

  const iconOnly = size === 'icon' || size === 'icon-sm'

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || !value}
      className={cn(copied && 'border-emerald-300 text-emerald-700 dark:text-emerald-300', className)}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
    >
      {copied ? <Check /> : <Copy />}
      {!iconOnly && (copied ? copiedLabel : label)}
    </Button>
  )
}
