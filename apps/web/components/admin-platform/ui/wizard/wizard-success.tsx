'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { cn } from '@/lib/utils'

/**
 * Tela de sucesso, dentro do próprio modal: ícone de confirmação animado
 * (sutil; parado para quem pede menos movimento), a frase do que aconteceu,
 * algum conteúdo extra (senha, código) e as próximas ações no rodapé.
 */

function SuccessMark() {
  const reduce = useReducedMotion()
  return (
    <motion.span
      aria-hidden="true"
      initial={reduce ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className="relative grid size-[72px] place-items-center rounded-full bg-[#ECFDF3] text-[#067647] ring-[10px] ring-[#ECFDF3]/60"
    >
      <svg viewBox="0 0 24 24" className="size-9" fill="none">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.18, duration: 0.42, ease: 'easeOut' }}
        />
      </svg>
    </motion.span>
  )
}

export function WizardSuccess({
  title,
  description,
  children,
  actions,
}: {
  /** O que aconteceu: "Clube cadastrado". */
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Próximas ações (o primeiro botão, a principal). */
  actions?: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10">
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <SuccessMark />
          <h3 ref={headingRef} tabIndex={-1} className="m-0 mt-7 text-xl font-bold text-foreground outline-none">
            {title}
          </h3>
          {description ? <p className="m-0 mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          <p role="status" className="sr-only">
            {title}. {typeof description === 'string' ? description : ''}
          </p>
        </div>
        {children ? <div className="mx-auto mt-8 flex w-full max-w-lg flex-col gap-4">{children}</div> : null}
      </div>
      {actions ? (
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-[#F9FAFB] px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 sm:flex-row sm:justify-end sm:px-7">
          {actions}
        </footer>
      ) : null}
    </div>
  )
}

/** Classes dos botões do rodapé de sucesso. */
export const successButton = {
  primary: 'h-11 rounded-[10px] px-5 text-sm font-semibold',
  secondary: 'h-11 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]',
}

/**
 * Valor que só aparece uma vez (senha provisória, código), com "Copiar".
 * Se a área de transferência estiver bloqueada, explica como copiar à mão.
 */
export function SecretValue({ label, value, caption }: { label: string; value: string; caption?: ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
      window.setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('failed')
    }
  }
  return (
    <div className="rounded-2xl border border-border bg-[#F9FAFB] p-4 text-left">
      <p className="m-0 text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-border bg-white px-3 py-2.5 font-mono text-base font-semibold tracking-wide text-foreground">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          className={cn(successButton.secondary, state === 'copied' && 'border-[#067647] text-[#067647]')}
        >
          {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {state === 'copied' ? 'Copiada' : 'Copiar'}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {state === 'copied' ? 'Copiada para a área de transferência.' : ''}
      </p>
      {state === 'failed' ? (
        <p role="alert" className="m-0 mt-2 text-[13px] font-medium text-[#B42318]">
          Não foi possível copiar. Selecione o texto acima e copie com Ctrl+C.
        </p>
      ) : null}
      {caption ? <div className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{caption}</div> : null}
    </div>
  )
}
