'use client'

import { useState } from 'react'
import { Flame, Snowflake, Thermometer, type LucideIcon } from 'lucide-react'
import { TEMPERATURA_LEAD_LABELS, type TemperaturaLead } from '@annetec/contracts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TEMPERATURA_ESTILO } from '@/lib/vendas-rede/funil'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '../ui/tokens'

const ICONES: Record<TemperaturaLead, LucideIcon> = {
  quente: Flame,
  morna: Thermometer,
  fria: Snowflake,
}

/**
 * Temperatura do lead (sentimento por regra): chip com ícone + texto (a cor nunca é o único sinal) e
 * tooltip com o porquê ("Reagiu com interesse há 2 dias"). Toque ou Enter abre o tooltip no celular.
 * Sem temperatura (lead novo sem contato, fechado) não desenha nada.
 */
export function TemperaturaChip({
  temperatura,
  motivo,
  tamanho = 'sm',
  className,
}: {
  temperatura?: TemperaturaLead | null
  motivo?: string | null
  tamanho?: 'sm' | 'md'
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  if (!temperatura) return null
  const Icone = ICONES[temperatura]
  const rotulo = TEMPERATURA_LEAD_LABELS[temperatura]
  const descricao = motivo ? `${rotulo}. ${motivo}` : rotulo
  return (
    <Tooltip open={aberto} onOpenChange={setAberto}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Temperatura: ${descricao}`}
          onClick={e => {
            e.stopPropagation()
            setAberto(o => !o)
          }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold transition-colors',
            tamanho === 'md' ? 'min-h-7 px-2.5 text-xs' : 'px-2 py-0.5 text-[11px]',
            TEMPERATURA_ESTILO[temperatura].chip,
            FOCUS_RING,
            className,
          )}
        >
          <Icone className={tamanho === 'md' ? 'size-3.5' : 'size-3'} aria-hidden="true" />
          {rotulo}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56">
        {motivo ?? rotulo}
      </TooltipContent>
    </Tooltip>
  )
}
