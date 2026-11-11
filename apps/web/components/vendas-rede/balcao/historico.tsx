'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { RESULTADOS_BALCAO, RESULTADO_BALCAO_LABELS, type ResultadoBalcao, type VendasAtendimentoBalcao, type VendasPlanoBalcao } from '@annetec/contracts'
import type { Paged } from '@/lib/adapters/platform-console'
import { balcaoAtendimentosAction, balcaoPlanosAction } from '@/lib/actions/vendas-balcao-api'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { FOCUS_RING } from '../ui/tokens'
import { AtendimentoLinha } from './atendimento-linha'
import { BotaoTexto } from './campo'
import { useBalcao } from './contexto'

const POR_PAGINA = 15

/** Data local no formato AAAA-MM-DD (o `toISOString` daria o dia em UTC). */
function hojeLocal(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function HistoricoPagina() {
  const { slug } = useBalcao()
  const [dia, setDia] = useState(hojeLocal)
  const [resultado, setResultado] = useState<ResultadoBalcao | ''>('')
  const [pagina, setPagina] = useState(1)
  const [lista, setLista] = useState<Paged<VendasAtendimentoBalcao> | null>(null)
  const [planos, setPlanos] = useState<VendasPlanoBalcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void balcaoPlanosAction(slug).then(r => {
      if (r.success) setPlanos(r.data)
    })
  }, [slug])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const r = await balcaoAtendimentosAction(slug, {
      dia: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined,
      resultado: resultado || undefined,
      page: pagina,
      perPage: POR_PAGINA,
    })
    setCarregando(false)
    if (r.success) setLista(r.data)
    else setErro(r.error)
  }, [slug, dia, resultado, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const total = lista?.meta.totalPages ?? 1
  const ehHoje = dia === hojeLocal()
  const controle = cn('min-h-14 w-full rounded-2xl border border-border bg-white px-4 text-lg text-foreground', FOCUS_RING)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-2xl font-bold text-foreground">Histórico</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-dia" className="text-base font-semibold text-foreground">Dia</label>
          <input
            id="hist-dia"
            type="date"
            max={hojeLocal()}
            value={dia}
            onChange={e => {
              setDia(e.target.value)
              setPagina(1)
            }}
            className={controle}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hist-res" className="text-base font-semibold text-foreground">Resultado</label>
          <select
            id="hist-res"
            value={resultado}
            onChange={e => {
              setResultado(e.target.value as ResultadoBalcao | '')
              setPagina(1)
            }}
            className={controle}
          >
            <option value="">Todos</option>
            {RESULTADOS_BALCAO.map(r => (
              <option key={r} value={r}>{RESULTADO_BALCAO_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>
      {!ehHoje ? (
        <BotaoTexto onClick={() => { setDia(hojeLocal()); setPagina(1) }} className="self-start">Voltar para hoje</BotaoTexto>
      ) : null}

      <div aria-live="polite">
        {erro ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-[#FEF3F2] p-5 text-[#B42318]">
            <p className="m-0 text-base">{erro}</p>
            <AcaoPrincipal tamanho="xl" variante="secundaria" onClick={() => void carregar()}>Tentar de novo</AcaoPrincipal>
          </div>
        ) : !lista ? (
          <p role="status" className="m-0 flex items-center gap-2 py-10 text-base text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Carregando…
          </p>
        ) : lista.items.length === 0 ? (
          <EstadoVazio
            moldura
            ilustracao="busca"
            titulo="Nenhum atendimento encontrado."
            descricao={resultado ? 'Tente outro resultado ou outro dia.' : ehHoje ? 'Quando você atender alguém hoje, aparece aqui.' : 'Neste dia não houve atendimentos. Tente outra data.'}
          />
        ) : (
          <>
            <p className="m-0 mb-3 text-sm text-muted-foreground">
              {lista.meta.total} {lista.meta.total === 1 ? 'atendimento' : 'atendimentos'}
              {carregando ? ' · atualizando…' : ''}
            </p>
            <ul className={cn('m-0 flex list-none flex-col gap-3 p-0', carregando && 'opacity-60')}>
              {lista.items.map(a => (
                <AtendimentoLinha key={a.id} item={a} mostrarData={!ehHoje} nomePlano={planos.find(p => p.id === a.planoId)?.nome} />
              ))}
            </ul>
          </>
        )}
      </div>

      {lista && total > 1 ? (
        <nav aria-label="Páginas" className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <AcaoPrincipal variante="secundaria" tamanho="xl" icone={<ChevronLeft />} disabled={pagina <= 1 || carregando} onClick={() => setPagina(p => p - 1)}>
            Anterior
          </AcaoPrincipal>
          <span className="text-sm font-medium text-muted-foreground">{pagina} de {total}</span>
          <AcaoPrincipal variante="secundaria" tamanho="xl" disabled={pagina >= total || carregando} onClick={() => setPagina(p => p + 1)}>
            Próxima <ChevronRight className="size-5" aria-hidden="true" />
          </AcaoPrincipal>
        </nav>
      ) : null}
    </div>
  )
}
