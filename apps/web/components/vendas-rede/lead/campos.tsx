'use client'

import { useId, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { paraDatetimeLocal } from '@/lib/vendas-rede/adaptadores'
import { FOCUS_RING } from '../ui/tokens'

/** Grupo de opções em pílulas (uma escolha), acessível como `radiogroup`. */
export function Chips<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  className,
}: {
  rotulo: string
  valor: T
  opcoes: ReadonlyArray<{ id: T; rotulo: string; icone?: ReactNode }>
  aoMudar: (id: T) => void
  className?: string
}) {
  const idRotulo = useId()
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span id={idRotulo} className="text-sm font-medium text-foreground">
        {rotulo}
      </span>
      <div role="radiogroup" aria-labelledby={idRotulo} className="flex flex-wrap gap-2">
        {opcoes.map(o => {
          const ativo = o.id === valor
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => aoMudar(o.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                ativo ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white' : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
                FOCUS_RING,
              )}
            >
              {o.icone ? (
                <span aria-hidden="true" className="inline-flex [&>svg]:size-4">
                  {o.icone}
                </span>
              ) : null}
              {o.rotulo}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type OpcaoQuando = 'nenhum' | 'amanha' | 'tres_dias' | 'semana' | 'escolher'

export interface PassoForm {
  texto: string
  quando: OpcaoQuando
  /** Valor de `datetime-local` quando `quando === 'escolher'`. */
  escolhido: string
}

export const PASSO_VAZIO: PassoForm = { texto: '', quando: 'nenhum', escolhido: '' }

function amanhaAs9(dias: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  d.setHours(9, 0, 0, 0)
  return d
}

/** ISO do próximo passo, ou `null` se não há (ou a data é inválida). */
export function dataDoPasso(passo: PassoForm): string | null {
  switch (passo.quando) {
    case 'amanha':
      return amanhaAs9(1).toISOString()
    case 'tres_dias':
      return amanhaAs9(3).toISOString()
    case 'semana':
      return amanhaAs9(7).toISOString()
    case 'escolher': {
      if (!passo.escolhido) return null
      const d = new Date(passo.escolhido)
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    default:
      return null
  }
}

/** Erro de validação do próximo passo (ou `null`). `obrigatorio` = não pode ficar em branco. */
export function erroDoPasso(passo: PassoForm, obrigatorio: boolean): string | null {
  const temTexto = passo.texto.trim().length > 0
  const temData = passo.quando !== 'nenhum'
  if (!obrigatorio && !temTexto && !temData) return null
  if (passo.texto.trim().length < 2) return 'Escreva o que você vai fazer.'
  if (!temData) return 'Escolha quando.'
  if (!dataDoPasso(passo)) return 'Informe a data e a hora.'
  return null
}

/** "O que fazer" + "quando" com atalhos (amanhã, em 3 dias, em 1 semana, escolher). */
export function SeletorProximoPasso({
  passo,
  aoMudar,
  erro,
  opcional = false,
  idBase,
}: {
  passo: PassoForm
  aoMudar: (p: PassoForm) => void
  erro?: string | null
  opcional?: boolean
  idBase: string
}) {
  const opcoes: Array<{ id: OpcaoQuando; rotulo: string }> = [
    ...(opcional ? [{ id: 'nenhum' as const, rotulo: 'Sem data' }] : []),
    { id: 'amanha', rotulo: 'Amanhã, 9h' },
    { id: 'tres_dias', rotulo: 'Em 3 dias' },
    { id: 'semana', rotulo: 'Em 1 semana' },
    { id: 'escolher', rotulo: 'Escolher' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-passo`}>
          Próximo passo {opcional ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
        </Label>
        <Input
          id={`${idBase}-passo`}
          value={passo.texto}
          maxLength={300}
          placeholder="Ex.: ligar para confirmar a proposta"
          onChange={e => aoMudar({ ...passo, texto: e.target.value })}
          aria-invalid={Boolean(erro) || undefined}
          className="min-h-11"
        />
      </div>
      <Chips rotulo="Quando" valor={passo.quando} opcoes={opcoes} aoMudar={quando => aoMudar({ ...passo, quando })} />
      {passo.quando === 'escolher' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idBase}-data`}>Data e hora</Label>
          <Input
            id={`${idBase}-data`}
            type="datetime-local"
            min={paraDatetimeLocal(new Date())}
            value={passo.escolhido}
            onChange={e => aoMudar({ ...passo, escolhido: e.target.value })}
            className="min-h-11"
          />
        </div>
      ) : null}
      {erro ? (
        <p role="alert" className="m-0 text-sm text-[#B42318]">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

/** Seleção nativa estilizada (boa no celular), com rótulo acessível. */
export function SelectFiltro<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  className,
}: {
  rotulo: string
  valor: T | ''
  opcoes: ReadonlyArray<{ id: T; rotulo: string }>
  aoMudar: (id: T | '') => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={e => aoMudar(e.target.value as T | '')}
        className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Todos</option>
        {opcoes.map(o => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}
