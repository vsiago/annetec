'use client'

import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { VendasPlanoBalcao } from '@annetec/contracts'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from '../ui/acao-principal'
import { SimuladorEconomia, type PlanoSimulavel } from '../ui/simulador-economia'
import { FOCUS_RING } from '../ui/tokens'
import { BotaoTexto, Campo } from './campo'

const SUGESTOES = ['Consulta', 'Exame', 'Procedimento']

export function PassoOferta({
  planos,
  erroPlanos,
  recarregarPlanos,
  servico,
  aoMudarServico,
  valor,
  aoMudarValor,
  planoId,
  erros,
  aoEscolher,
  aoSeguirSemPlano,
}: {
  planos: VendasPlanoBalcao[] | null
  erroPlanos: string | null
  recarregarPlanos: () => void
  servico: string
  aoMudarServico: (s: string) => void
  valor: number
  aoMudarValor: (v: number) => void
  planoId: string | null
  erros: Record<string, string>
  aoEscolher: (plano: PlanoSimulavel, valor: number) => void
  aoSeguirSemPlano: () => void
}) {
  const campoServico = useRef<HTMLInputElement>(null)
  const [aviso, setAviso] = useState(false)
  const vendaveis: PlanoSimulavel[] = (planos ?? [])
    .filter(p => p.vendavel)
    .map(p => ({ id: p.id, nome: p.nome, precoMensal: p.precoMensal, descontoPercentual: p.descontoPercentual, adesao: p.adesao }))
  const escolhido = planos?.find(p => p.id === planoId)

  function escolher(plano: PlanoSimulavel, v: number) {
    if (servico.trim().length < 2) {
      campoServico.current?.focus()
      setAviso(true)
      return
    }
    aoEscolher(plano, v)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold text-foreground">Qual serviço e quanto custa hoje?</h1>
        <p className="m-0 text-base text-muted-foreground">Mostre à pessoa quanto ela economiza com cada plano.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Campo
          rotulo="Serviço"
          inputRef={campoServico}
          autoComplete="off"
          placeholder="Ex.: Consulta cardiologia"
          value={servico}
          onChange={e => aoMudarServico(e.target.value)}
          erro={erros.servico}
        />
        {aviso && servico.trim().length < 2 ? (
          <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">
            Informe o serviço antes de escolher o plano.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sugestões de serviço">
          {SUGESTOES.map(s => (
            <button
              key={s}
              type="button"
              aria-pressed={servico.trim().toLowerCase() === s.toLowerCase()}
              onClick={() => {
                aoMudarServico(s)
              }}
              className={cn(
                'min-h-12 rounded-full border px-5 text-base font-semibold',
                servico.trim().toLowerCase() === s.toLowerCase()
                  ? 'border-[var(--vr-accent,#1E2A4A)] bg-[#E5EDF5] text-[#1E2A4A]'
                  : 'border-border bg-white text-foreground',
                FOCUS_RING,
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {escolhido ? (
        <p role="status" className="m-0 rounded-xl bg-[#E3F6EA] px-4 py-3 text-sm font-medium text-[#067647]">
          Plano escolhido: {escolhido.nome}. Escolha outro abaixo para trocar.
        </p>
      ) : null}
      {erros.planoId ? (
        <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">{erros.planoId}</p>
      ) : null}
      {erros.valorTabela ? (
        <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">{erros.valorTabela}</p>
      ) : null}

      {planos === null && !erroPlanos ? (
        <p role="status" className="m-0 flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Carregando planos…
        </p>
      ) : erroPlanos ? (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-[#FEF3F2] p-4 text-[#B42318]">
          <p className="m-0 text-base">{erroPlanos}</p>
          <AcaoPrincipal tamanho="lg" variante="secundaria" onClick={recarregarPlanos}>Tentar de novo</AcaoPrincipal>
        </div>
      ) : (
        <SimuladorEconomia planos={vendaveis} valorInicial={valor} aoMudarValor={aoMudarValor} aoEscolher={escolher} planoSelecionadoId={planoId} />
      )}

      <BotaoTexto onClick={aoSeguirSemPlano}>Seguir sem escolher plano</BotaoTexto>
    </div>
  )
}
