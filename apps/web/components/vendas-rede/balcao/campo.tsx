'use client'

import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '../ui/tokens'

/** Campo grande do balcão: rótulo visível, ajuda, erro (aria-live) e input de 56 px. */
export function Campo({
  rotulo,
  erro,
  ajuda,
  grande,
  className,
  inputRef,
  ...input
}: {
  rotulo: ReactNode
  erro?: string
  ajuda?: ReactNode
  grande?: boolean
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
} & Omit<ComponentProps<'input'>, 'className'>) {
  const id = useId()
  const idMsg = `${id}-msg`
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-base font-semibold text-foreground">
        {rotulo}
      </label>
      <input
        id={id}
        ref={inputRef}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro || ajuda ? idMsg : undefined}
        className={cn(
          'w-full min-w-0 rounded-2xl border bg-white px-4 text-foreground outline-none placeholder:text-[#98A2B3]',
          grande ? 'min-h-16 text-2xl font-semibold' : 'min-h-14 text-lg',
          erro ? 'border-[#D92D20]' : 'border-border',
          FOCUS_RING,
        )}
        {...input}
      />
      <p id={idMsg} aria-live="polite" className={cn('m-0 text-sm', erro ? 'font-medium text-[#B42318]' : 'text-muted-foreground', !erro && !ajuda && 'hidden')}>
        {erro ?? ajuda}
      </p>
    </div>
  )
}

/** Botão discreto (texto) de 48 px, para ações secundárias. */
export function BotaoTexto({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold text-[#475467] hover:bg-[#F2F4F7] disabled:opacity-50',
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  )
}
