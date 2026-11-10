'use client'

import { useId, useState, type ReactNode } from 'react'
import { Building2, ChevronRight, MapPin, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AgenteCard, type AgenteResumo } from './agente-card'
import { EstadoVazio } from './estado-vazio'
import { CARD_SURFACE, FOCUS_RING } from './tokens'

export type NoEquipe = { id: string; nome: string; supervisor?: string; agentes: AgenteResumo[] }
export type NoUnidade = { id: string; nome: string; endereco?: string; equipes: NoEquipe[]; /** Balcões e agentes sem equipe. */ agentesDiretos?: AgenteResumo[] }
export type NoCorretora = { id: string; nome: string; cnpj?: string; gerente?: string; unidades: NoUnidade[] }

type Nivel = 'corretora' | 'unidade' | 'equipe'

const contar = (agentes: AgenteResumo[]) => ({ total: agentes.length, online: agentes.filter(a => a.online).length })
const agentesDaEquipe = (e: NoEquipe) => e.agentes
const agentesDaUnidade = (u: NoUnidade) => [...u.equipes.flatMap(agentesDaEquipe), ...(u.agentesDiretos ?? [])]
const agentesDaCorretora = (c: NoCorretora) => c.unidades.flatMap(agentesDaUnidade)

/** Cabeçalho expansível de um nó: botão com seta, ícone, título, contadores e ações opcionais. */
function No({
  nivel,
  icone,
  titulo,
  subtitulo,
  agentes,
  filhos,
  acoes,
  abertoInicial = false,
  children,
}: {
  nivel: Nivel
  icone: ReactNode
  titulo: string
  subtitulo?: string
  agentes: AgenteResumo[]
  filhos: number
  acoes?: ReactNode
  abertoInicial?: boolean
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  const id = useId()
  const { total, online } = contar(agentes)
  const unidadeFilhos = nivel === 'corretora' ? 'unidades' : nivel === 'unidade' ? 'equipes' : ''
  return (
    <div className={cn(nivel === 'corretora' ? CARD_SURFACE : 'rounded-xl border border-border bg-[#F8F9FB]')}>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto(v => !v)}
          className={cn('flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left', FOCUS_RING)}
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} aria-hidden="true" />
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-[#1E2A4A]" aria-hidden="true">
            {icone}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">{titulo}</span>
            {subtitulo ? <span className="truncate text-xs text-muted-foreground">{subtitulo}</span> : null}
          </span>
          <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
            {unidadeFilhos ? (
              <span>
                {filhos} {filhos === 1 ? unidadeFilhos.replace(/s$/, '') : unidadeFilhos}
              </span>
            ) : null}
            <span>
              {total} {total === 1 ? 'agente' : 'agentes'}
            </span>
            <span className={cn('inline-flex items-center gap-1 font-medium', online > 0 ? 'text-[#067647]' : '')}>
              <span aria-hidden="true" className={cn('size-2 rounded-full', online > 0 ? 'bg-[#17B26A]' : 'bg-[#98A2B3]')} />
              {online} online
            </span>
          </span>
        </button>
        {acoes ? <div className="shrink-0">{acoes}</div> : null}
      </div>
      {aberto ? (
        <div id={id} className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-3 sm:pl-12">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function Agentes({ agentes, aoAbrirAgente }: { agentes: AgenteResumo[]; aoAbrirAgente?: (a: AgenteResumo) => void }) {
  if (agentes.length === 0) return <p className="m-0 text-xs text-muted-foreground">Nenhum agente aqui ainda.</p>
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {agentes.map(a => (
        <AgenteCard key={a.id} agente={a} aoAbrir={aoAbrirAgente ? () => aoAbrirAgente(a) : undefined} />
      ))}
    </div>
  )
}

/**
 * Árvore da rede: Corretora → Unidades → Equipes → Agentes, em cartões
 * expansíveis (botão com `aria-expanded`). Cada nível mostra quantos filhos,
 * quantos agentes e quantos estão online. A primeira corretora abre sozinha.
 *
 * - `corretoras`: a árvore. `solos`: vendedores sem equipe nem corretora.
 *   `unidadesProprias`: unidades do escopo sem corretora (balcão).
 * - `acoes`: ações opcionais por nível (ex.: "Nova equipe").
 * - `vazio`: conteúdo para "nada cadastrado", normalmente a `AcaoPrincipal` "Nova corretora".
 */
export function ArvoreRede({
  corretoras,
  solos,
  unidadesProprias,
  aoAbrirAgente,
  acoes,
  acaoVazio,
}: {
  corretoras: NoCorretora[]
  solos?: AgenteResumo[]
  unidadesProprias?: NoUnidade[]
  aoAbrirAgente?: (agente: AgenteResumo) => void
  acoes?: { corretora?: (n: NoCorretora) => ReactNode; unidade?: (n: NoUnidade) => ReactNode; equipe?: (n: NoEquipe) => ReactNode }
  acaoVazio?: ReactNode
}) {
  const vazio = corretoras.length === 0 && !(solos?.length) && !(unidadesProprias?.length)
  if (vazio) {
    return (
      <EstadoVazio
        ilustracao="equipe"
        moldura
        titulo="Sua rede ainda está vazia"
        descricao="Comece cadastrando uma corretora parceira ou adicionando o primeiro agente."
        acao={acaoVazio}
      />
    )
  }

  const renderUnidade = (u: NoUnidade, aberto = false) => (
    <No
      key={u.id}
      nivel="unidade"
      icone={<MapPin className="size-[18px]" />}
      titulo={u.nome}
      subtitulo={u.endereco}
      agentes={agentesDaUnidade(u)}
      filhos={u.equipes.length}
      acoes={acoes?.unidade?.(u)}
      abertoInicial={aberto}
    >
      {u.equipes.map(e => (
        <No
          key={e.id}
          nivel="equipe"
          icone={<UsersRound className="size-[18px]" />}
          titulo={e.nome}
          subtitulo={e.supervisor ? `Supervisor: ${e.supervisor}` : 'Sem supervisor'}
          agentes={e.agentes}
          filhos={e.agentes.length}
          acoes={acoes?.equipe?.(e)}
        >
          <Agentes agentes={e.agentes} aoAbrirAgente={aoAbrirAgente} />
        </No>
      ))}
      {u.agentesDiretos && u.agentesDiretos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-medium text-muted-foreground">Atendimento da unidade</p>
          <Agentes agentes={u.agentesDiretos} aoAbrirAgente={aoAbrirAgente} />
        </div>
      ) : null}
      {u.equipes.length === 0 && !(u.agentesDiretos?.length) ? (
        <p className="m-0 text-xs text-muted-foreground">Nenhuma equipe nesta unidade ainda.</p>
      ) : null}
    </No>
  )

  return (
    <div className="flex flex-col gap-4">
      {corretoras.map((c, i) => (
        <No
          key={c.id}
          nivel="corretora"
          icone={<Building2 className="size-[18px]" />}
          titulo={c.nome}
          subtitulo={[c.cnpj, c.gerente ? `Gerente: ${c.gerente}` : null].filter(Boolean).join(' · ') || undefined}
          agentes={agentesDaCorretora(c)}
          filhos={c.unidades.length}
          acoes={acoes?.corretora?.(c)}
          abertoInicial={i === 0}
        >
          {c.unidades.length === 0 ? (
            <p className="m-0 text-xs text-muted-foreground">Nenhuma unidade cadastrada para esta corretora.</p>
          ) : (
            c.unidades.map(u => renderUnidade(u))
          )}
        </No>
      ))}
      {unidadesProprias && unidadesProprias.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Unidades próprias">
          <h3 className="m-0 text-sm font-semibold text-foreground">Unidades próprias (balcão)</h3>
          {unidadesProprias.map(u => renderUnidade(u))}
        </section>
      ) : null}
      {solos && solos.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Vendedores solo">
          <h3 className="m-0 text-sm font-semibold text-foreground">Solos</h3>
          <Agentes agentes={solos} aoAbrirAgente={aoAbrirAgente} />
        </section>
      ) : null}
    </div>
  )
}
