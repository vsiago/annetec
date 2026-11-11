'use client'

import { useCallback, useEffect, useState } from 'react'
import { Handshake, Loader2, PiggyBank, Target, Timer, UsersRound, BadgeCheck } from 'lucide-react'
import type { VendasBalcaoHoje, VendasPlanoBalcao } from '@annetec/contracts'
import { balcaoHojeAction, balcaoPlanosAction } from '@/lib/actions/vendas-balcao-api'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { KpiGrid, type KpiItem } from '../ui/kpi-grid'
import { dataPorExtenso } from '../ui/mascaras'
import { ValorMoeda } from '../ui/valor-moeda'
import { AtendimentoLinha } from './atendimento-linha'
import { useBalcao } from './contexto'

export function HojePagina() {
  const { slug } = useBalcao()
  const [dados, setDados] = useState<VendasBalcaoHoje | null>(null)
  const [planos, setPlanos] = useState<VendasPlanoBalcao[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    const [h, p] = await Promise.all([balcaoHojeAction(slug), balcaoPlanosAction(slug)])
    if (h.success) setDados(h.data)
    else setErro(h.error)
    if (p.success) setPlanos(p.data)
  }, [slug])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (erro && !dados) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-[#FEF3F2] p-5 text-[#B42318]">
        <p className="m-0 text-base">{erro}</p>
        <AcaoPrincipal tamanho="xl" variante="secundaria" onClick={() => void carregar()}>Tentar de novo</AcaoPrincipal>
      </div>
    )
  }
  if (!dados) {
    return (
      <p role="status" className="m-0 flex items-center gap-2 py-10 text-base text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Carregando o dia…
      </p>
    )
  }

  const t = dados.totais
  const itens: KpiItem[] = [
    { rotulo: 'Atendimentos', valor: t.atendimentos, icone: UsersRound, tom: 'navy' },
    { rotulo: 'Ofertas', valor: t.ofertas, icone: Handshake, tom: 'blue', dica: 'Planos apresentados' },
    { rotulo: 'Adesões', valor: t.adesoes, icone: BadgeCheck, tom: 'green' },
    { rotulo: 'Vai pensar', valor: t.vaiPensar, icone: Timer, tom: 'amber', dica: 'Retorno anotado para 2 dias' },
    { rotulo: 'Economia média apresentada', valor: <ValorMoeda valor={t.economiaMedia} />, icone: PiggyBank, tom: 'violet', dica: 'Por consulta' },
  ]
  if (dados.metaDia !== null) {
    itens.push({
      rotulo: 'Meta do dia',
      valor: `${t.adesoes} de ${Math.ceil(dados.metaDia)}`,
      icone: Target,
      tom: t.adesoes >= dados.metaDia ? 'green' : 'coral',
      dica: t.adesoes >= dados.metaDia ? 'Meta batida' : 'Adesões',
    })
  }

  const nomePlano = (id: string | null) => planos.find(p => p.id === id)?.nome

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold text-foreground">Hoje</h1>
        <p className="m-0 text-base first-letter:uppercase text-muted-foreground">{dataPorExtenso()}</p>
      </div>

      <KpiGrid itens={itens} colunas={2} className="sm:grid-cols-2 xl:grid-cols-2" />

      <section aria-labelledby="lista-hoje" className="flex flex-col gap-3">
        <h2 id="lista-hoje" className="m-0 text-xl font-bold text-foreground">Atendimentos do dia</h2>
        {dados.atendimentos.length === 0 ? (
          <EstadoVazio
            moldura
            ilustracao="historico"
            titulo="Nenhum atendimento hoje"
            descricao="Toque em Atender para começar."
            acao={<AcaoPrincipal href={`/${slug}/balcao`} tamanho="xl">Atender</AcaoPrincipal>}
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {dados.atendimentos.map(a => (
              <AtendimentoLinha key={a.id} item={a} nomePlano={nomePlano(a.planoId)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
