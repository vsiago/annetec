'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, Handshake } from 'lucide-react'
import {
  CANDIDATURA_ATUACAO_LABELS,
  CANDIDATURA_TIPO_PESSOA_LABELS,
  PAPEL_COMERCIAL_LABELS,
  type CandidaturaResumo,
  type ListarCandidaturasQuery,
} from '@annetec/contracts'
import { LoadError, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { listarCandidaturasAction } from '@/lib/actions/vendas-candidaturas-gestao-api'
import { cn } from '@/lib/utils'
import { EstadoVazio } from '../ui/estado-vazio'
import { pluralizar } from '../ui/mascaras'
import { CandidaturaDetalheSheet, StatusCandidatura, dataSimples } from './candidatura-detalhe'
import { CabecalhoTela, PortaoDePapel, Segmentado } from './comum'
import type { EscopoRede } from './tipos'

/**
 * Tela Candidaturas (só master): quem se candidatou a parceiro comercial pelo
 * site. Abas Em análise / Aprovadas / Recusadas / Todas; clicar numa linha abre
 * a ficha em gaveta, de onde o master aprova ou recusa. `?id=<uuid>` abre a
 * ficha direto (link da notificação).
 */

type Filtro = ListarCandidaturasQuery['status']

const ABAS: ReadonlyArray<{ value: Filtro; label: string }> = [
  { value: 'recebida', label: 'Em análise' },
  { value: 'aprovada', label: 'Aprovadas' },
  { value: 'recusada', label: 'Recusadas' },
  { value: 'todas', label: 'Todas' },
]

const VAZIO: Record<Filtro, { titulo: string; descricao: string }> = {
  recebida: {
    titulo: 'Nenhuma candidatura em análise',
    descricao: 'Quando alguém se candidatar pela página “Seja um parceiro comercial”, a candidatura aparece aqui para você decidir.',
  },
  aprovada: { titulo: 'Nenhuma candidatura aprovada ainda', descricao: 'As candidaturas aprovadas ficam registradas aqui.' },
  recusada: { titulo: 'Nenhuma candidatura recusada', descricao: 'As candidaturas recusadas ficam registradas aqui, com o motivo.' },
  todas: { titulo: 'Nenhuma candidatura recebida ainda', descricao: 'Divulgue o link “Seja um parceiro comercial” para começar a receber candidatos.' },
}

export function CandidaturasPage({ escopo }: { escopo: EscopoRede }) {
  return (
    <Suspense fallback={<TableSkeleton rows={5} />}>
      <PortaoDePapel escopo={escopo} tela="candidaturas">
        {() => <CandidaturasConteudo escopo={escopo} />}
      </PortaoDePapel>
    </Suspense>
  )
}

export function CandidaturasConteudo({ escopo }: { escopo: EscopoRede }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [filtro, setFiltro] = useState<Filtro>('recebida')
  const [versao, setVersao] = useState(0)
  const idUrl = params.get('id')
  const [aberta, setAberta] = useState<string | null>(idUrl)
  useEffect(() => {
    setAberta(idUrl)
  }, [idUrl])

  const lista = useConsoleData(() => listarCandidaturasAction(escopo, filtro), [chave, filtro, versao])
  const itens = lista.data?.itens ?? []
  const pendentes = lista.data?.pendentes

  const abrir = (id: string) => {
    setAberta(id)
    router.replace(`${pathname}?id=${encodeURIComponent(id)}`, { scroll: false })
  }
  const fechar = () => {
    setAberta(null)
    if (params.get('id')) router.replace(pathname, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoTela
        titulo="Candidaturas"
        icone={Handshake}
        descricao={
          pendentes
            ? `${pluralizar(pendentes, 'candidatura')} ${pendentes === 1 ? 'aguarda' : 'aguardam'} a sua decisão.`
            : 'Quem quer ser parceiro comercial: confira os dados e aprove ou recuse.'
        }
        acao={<RefreshButton loading={lista.loading} onClick={() => setVersao(v => v + 1)} />}
      />

      <Segmentado rotulo="Situação da candidatura" valor={filtro} opcoes={ABAS} aoMudar={setFiltro} className="self-start" />

      {lista.loading && !lista.data ? (
        <TableSkeleton rows={5} />
      ) : lista.error && !lista.data ? (
        <LoadError message={lista.error} onRetry={() => void lista.reload()} />
      ) : itens.length === 0 ? (
        <EstadoVazio ilustracao="equipe" moldura titulo={VAZIO[filtro].titulo} descricao={VAZIO[filtro].descricao} />
      ) : (
        <SectionCard padded={false}>
          <ul className="m-0 flex list-none flex-col p-0">
            {itens.map(c => (
              <LinhaCandidatura key={c.id} c={c} mostrarStatus={filtro === 'todas'} aoAbrir={() => abrir(c.id)} />
            ))}
          </ul>
        </SectionCard>
      )}

      <CandidaturaDetalheSheet
        escopo={escopo}
        id={aberta}
        aoFechar={fechar}
        aoDecidir={() => setVersao(v => v + 1)}
      />
    </div>
  )
}

function LinhaCandidatura({ c, mostrarStatus, aoAbrir }: { c: CandidaturaResumo; mostrarStatus: boolean; aoAbrir: () => void }) {
  const local = c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : null
  const data = c.status === 'recebida' ? c.enviadaEm : (c.decididaEm ?? c.enviadaEm)
  return (
    <li className="border-b border-[#EEF0F3] last:border-b-0">
      <button
        type="button"
        onClick={aoAbrir}
        className={cn(
          'flex w-full min-w-0 items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/40',
          'outline-none focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary/40',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-foreground">{c.nome}</span>
            {mostrarStatus ? <StatusCandidatura status={c.status} /> : null}
          </div>
          <p className="m-0 flex flex-wrap gap-x-2 text-[13px] text-muted-foreground">
            <span>{CANDIDATURA_TIPO_PESSOA_LABELS[c.tipoPessoa]}</span>
            <span aria-hidden="true">·</span>
            <span>{CANDIDATURA_ATUACAO_LABELS[c.atuacao]}</span>
            {local ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{local}</span>
              </>
            ) : null}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {c.indicadoPor ? `Indicado por ${c.indicadoPor.nome} (${PAPEL_COMERCIAL_LABELS[c.indicadoPor.papel]})` : 'Sem indicação'}
            {data ? ` · ${c.status === 'recebida' ? 'Enviada' : c.status === 'aprovada' ? 'Aprovada' : 'Recusada'} em ${dataSimples(data)}` : ''}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  )
}
