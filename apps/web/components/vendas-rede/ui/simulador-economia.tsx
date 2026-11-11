'use client'

import { useId, useState } from 'react'
import { PiggyBank } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from './acao-principal'
import { formatarMoeda } from './mascaras'

export type PlanoSimulavel = {
  id: string
  nome: string
  precoMensal: number
  /** Desconto da consulta com o plano (%). */
  descontoPercentual: number
  adesao?: number
}

export type ResultadoSimulacao = {
  valorComPlano: number
  economiaNaConsulta: number
  /** Quantas consultas até a economia cobrir a mensalidade; null se não há economia. */
  consultasParaCompensar: number | null
}

/** Mesma conta do backend (`simularEconomiaBalcao`), só para pré-visualizar na tela. */
export function simularEconomia(valorTabela: number, plano: Pick<PlanoSimulavel, 'precoMensal' | 'descontoPercentual'>): ResultadoSimulacao {
  const valor = Number.isFinite(valorTabela) && valorTabela > 0 ? valorTabela : 0
  const valorComPlano = Math.round(valor * (1 - plano.descontoPercentual / 100) * 100) / 100
  const economiaNaConsulta = Math.round((valor - valorComPlano) * 100) / 100
  return {
    valorComPlano,
    economiaNaConsulta,
    consultasParaCompensar: economiaNaConsulta > 0 ? Math.max(1, Math.ceil(plano.precoMensal / economiaNaConsulta)) : null,
  }
}

function lerValor(texto: string): number {
  const limpo = texto.replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number.parseFloat(limpo)
  return Number.isFinite(n) ? n : 0
}

/**
 * Simulador do balcão: "Quanto custa a consulta hoje?" + um cartão por plano
 * com o valor com desconto, a mensalidade, a economia já nesta consulta e em
 * quantas consultas o plano se paga. Campo e botões grandes (toque).
 *
 * - `valorInicial`/`aoMudarValor`: valor da consulta (R$).
 * - `aoEscolher(plano, valor)`: "Escolher este plano" (a ação principal do cartão).
 */
export function SimuladorEconomia({
  planos,
  valorInicial = 0,
  aoMudarValor,
  aoEscolher,
  planoSelecionadoId,
  className,
}: {
  planos: PlanoSimulavel[]
  valorInicial?: number
  aoMudarValor?: (valor: number) => void
  aoEscolher?: (plano: PlanoSimulavel, valorConsulta: number) => void
  /** Plano já escolhido: o cartão ganha borda na cor de ação e o selo "Escolhido". */
  planoSelecionadoId?: string | null
  className?: string
}) {
  const campo = useId()
  const [texto, setTexto] = useState(valorInicial > 0 ? String(valorInicial).replace('.', ',') : '')
  const valor = lerValor(texto)

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2">
        <label htmlFor={campo} className="text-base font-semibold text-foreground">
          Quanto custa a consulta hoje?
        </label>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 focus-within:ring-2 focus-within:ring-[var(--vr-accent,#1E2A4A)]">
          <span className="text-2xl font-semibold text-muted-foreground" aria-hidden="true">R$</span>
          <input
            id={campo}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={texto}
            onChange={e => {
              setTexto(e.target.value)
              aoMudarValor?.(lerValor(e.target.value))
            }}
            className="min-h-16 w-full min-w-0 bg-transparent text-3xl font-bold tabular-nums text-foreground outline-none placeholder:text-[#D0D5DD]"
          />
        </div>
      </div>

      {valor <= 0 ? (
        <p className="m-0 rounded-xl bg-[#F2F4F7] px-4 py-3 text-sm text-muted-foreground">
          Digite o valor da consulta para ver quanto a pessoa economiza com cada plano.
        </p>
      ) : planos.length === 0 ? (
        <p className="m-0 rounded-xl bg-[#FEF3DC] px-4 py-3 text-sm text-[#B54708]">
          Nenhum plano ativo para simular. Peça ao administrador para ativar um plano.
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {planos.map(plano => {
            const r = simularEconomia(valor, plano)
            const escolhido = planoSelecionadoId === plano.id
            return (
              <li
                key={plano.id}
                aria-current={escolhido ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4',
                  escolhido ? 'border-2 border-[var(--vr-accent,#1E2A4A)]' : 'border-border',
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="m-0 min-w-0 truncate text-base font-semibold text-foreground">{plano.nome}</h3>
                  {escolhido ? (
                    <span className="shrink-0 rounded-full bg-[var(--vr-accent,#1E2A4A)] px-2.5 py-0.5 text-xs font-semibold text-white">Escolhido</span>
                  ) : null}
                  <span className="shrink-0 rounded-full bg-[#E3F6EA] px-2.5 py-0.5 text-xs font-semibold text-[#067647]">
                    −{plano.descontoPercentual} %
                  </span>
                </div>
                <p className="m-0 text-sm text-muted-foreground">
                  Com o plano {plano.nome}:{' '}
                  <span className="text-2xl font-bold tabular-nums text-foreground">{formatarMoeda(r.valorComPlano)}</span>
                </p>
                <p className="m-0 inline-flex items-start gap-2 rounded-xl bg-[#E3F6EA] px-3 py-2 text-sm font-medium text-[#067647]">
                  <PiggyBank className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Economia de {formatarMoeda(r.economiaNaConsulta)} já nesta consulta
                </p>
                <p className="m-0 text-sm text-muted-foreground">
                  Mensalidade {formatarMoeda(plano.precoMensal)}
                  {plano.adesao ? ` · adesão ${formatarMoeda(plano.adesao)}` : ''}
                  {r.consultasParaCompensar !== null
                    ? r.consultasParaCompensar === 1
                      ? ' · se paga já na 1ª consulta'
                      : ` · se paga em ${r.consultasParaCompensar} consultas`
                    : ''}
                </p>
                {aoEscolher ? (
                  <AcaoPrincipal tamanho="lg" bloco onClick={() => aoEscolher(plano, valor)}>
                    Escolher este plano
                  </AcaoPrincipal>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
