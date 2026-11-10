'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from './tokens'

/**
 * Botão "Copiar" com feedback: o ícone vira um check por 2 s e um toast
 * confirma ("Copiado"). Se o navegador bloquear a área de transferência,
 * avisa em toast de erro, para a pessoa copiar na mão.
 *
 * `variante="icone"` é o quadrado de 44 px; `"texto"` é o botão com rótulo.
 */
export function CopiarBotao({
  texto,
  rotulo = 'Copiar',
  mensagem = 'Copiado',
  variante = 'texto',
  className,
}: {
  texto: string
  rotulo?: string
  mensagem?: string
  variante?: 'texto' | 'icone'
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success(mensagem)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  const Icone = copiado ? Check : Copy
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={variante === 'icone' ? rotulo : undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold text-foreground transition-colors hover:bg-[#F2F4F7]',
        variante === 'icone' ? 'size-11' : 'px-4',
        FOCUS_RING,
        className,
      )}
    >
      <Icone className={cn('size-4', copiado && 'text-[#067647]')} aria-hidden="true" />
      {variante === 'texto' ? (copiado ? 'Copiado' : rotulo) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {copiado ? mensagem : ''}
      </span>
    </button>
  )
}
