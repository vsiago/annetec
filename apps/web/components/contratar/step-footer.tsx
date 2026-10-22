'use client'

import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Rodapé de ações da etapa. No mobile gruda no fim da tela enquanto a etapa
 * rola (o botão principal está sempre ao alcance do polegar).
 */
export function StepFooter({
  onBack,
  onPrimary,
  primaryLabel = 'Salvar e continuar',
  busy,
  busyLabel = 'Salvando…',
  disabled,
  extra,
  primaryIcon,
}: {
  onBack?: (() => void) | null
  onPrimary: () => void
  primaryLabel?: string
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  extra?: ReactNode
  primaryIcon?: ReactNode
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-5 mt-8 flex items-center justify-between gap-3 border-t bg-card/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur',
        'sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-6 lg:backdrop-blur-none',
      )}
    >
      {onBack ? (
        <Button type="button" variant="ghost" className="h-11 gap-2 rounded-xl px-3" onClick={onBack} disabled={busy}>
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Voltar</span>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 items-center gap-2">
        {extra}
        <Button
          type="button"
          className="h-12 min-w-0 gap-2 rounded-xl px-5 text-base font-semibold shadow-md sm:min-w-48"
          onClick={onPrimary}
          disabled={busy || disabled}
        >
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
          <span className="truncate">{busy ? busyLabel : primaryLabel}</span>
          {!busy ? (primaryIcon ?? <ArrowRight className="size-5" aria-hidden />) : null}
        </Button>
      </div>
    </div>
  )
}
