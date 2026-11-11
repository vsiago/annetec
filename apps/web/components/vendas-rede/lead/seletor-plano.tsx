'use client'

import { useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanoVendavel } from '@/lib/vendas-rede/tipos'
import { formatarMoeda } from '../ui/mascaras'
import { FOCUS_RING } from '../ui/tokens'

/** Escolha de plano em cartões (uma opção), com preço e adesão à vista. */
export function SeletorPlano({
  planos,
  valor,
  aoMudar,
  rotulo = 'Plano',
}: {
  planos: PlanoVendavel[]
  valor: string | null
  aoMudar: (id: string) => void
  rotulo?: string
}) {
  const idRotulo = useId()
  return (
    <div className="flex flex-col gap-2">
      <span id={idRotulo} className="text-sm font-medium text-foreground">
        {rotulo}
      </span>
      <div role="radiogroup" aria-labelledby={idRotulo} className="grid gap-2 sm:grid-cols-2">
        {planos.map(p => {
          const ativo = p.id === valor
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => aoMudar(p.id)}
              className={cn(
                'flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                ativo ? 'border-[#1E2A4A] bg-[#F4F7FB] ring-1 ring-[#1E2A4A]' : 'border-border bg-white hover:bg-[#F8F9FB]',
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border',
                  ativo ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white' : 'border-[#D0D5DD] bg-white',
                )}
              >
                {ativo ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">{p.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {formatarMoeda(p.precoMensal)} por mês{p.adesao > 0 ? ` · adesão ${formatarMoeda(p.adesao)}` : ''}
                </span>
                {p.descricao ? <span className="line-clamp-2 text-xs text-muted-foreground">{p.descricao}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
