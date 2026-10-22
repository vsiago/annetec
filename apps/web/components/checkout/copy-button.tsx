'use client'

import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Copia para a área de transferência. `navigator.clipboard` só existe em
 * contexto seguro (https/localhost) — na demo pelo celular via IP da rede o
 * fallback com `execCommand` é o que funciona.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // cai no fallback
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

interface CopyButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> {
  value: string
  label?: string
  copiedLabel?: string
  successMessage?: string
}

export function CopyButton({
  value,
  label = 'Copiar',
  copiedLabel = 'Copiado!',
  successMessage,
  className,
  variant = 'outline',
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const handleClick = async () => {
    const ok = await copyText(value)
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
      return
    }
    setCopied(true)
    if (successMessage) toast.success(successMessage)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Button type="button" variant={variant} onClick={handleClick} className={cn('gap-2', className)} {...props}>
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
