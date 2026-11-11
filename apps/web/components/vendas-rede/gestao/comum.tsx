'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { LockKeyhole, type LucideIcon } from 'lucide-react'
import type { PapelComercial, VendasEu } from '@annetec/contracts'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { euAction } from '@/lib/actions/vendas-rede-gestao-api'
import { cn } from '@/lib/utils'
import { EstadoVazio } from '../ui/estado-vazio'
import { AcaoPrincipal } from '../ui/acao-principal'
import { ACCENT_BG } from '../ui/tokens'
import type { EscopoRede } from './tipos'

/**
 * Peças comuns das telas de gestão da Rede Comercial. Nada aqui depende da
 * casca (`ComercialShell`): as telas rodam igual dentro da casca comercial e
 * dentro do layout do console.
 */

/**
 * Rota de "início" no escopo. Dentro do console (`/admin/comercial/*`) e do
 * painel do clube (`/<slug>/admin/comercial/*`) leva ao funil do console;
 * fora deles, à tela "Hoje" da Rede Comercial.
 */
export function caminhoBase(escopo: EscopoRede, pathname?: string | null): string {
  const caminho = pathname ?? ''
  if (caminho.startsWith('/admin/comercial')) return '/admin/comercial/funil'
  if (escopo.kind === 'tenant' && caminho.includes('/admin/comercial')) return `/${escopo.slug}/admin/comercial/funil`
  return escopo.kind === 'platform' ? '/vendas' : `/${escopo.slug}/vendas`
}

export function useCaminhoBase(escopo: EscopoRede): string {
  return caminhoBase(escopo, usePathname())
}

/** Rota de uma tela irmã (ex.: `comissoes`) no mesmo escopo/casca. */
export function useCaminhoTela(escopo: EscopoRede, tela: string): string {
  const base = useCaminhoBase(escopo)
  return base.endsWith('/funil') ? `${base.slice(0, -'/funil'.length)}/${tela}` : `${base}/${tela}`
}

export type TelaGestao = 'equipe' | 'rede' | 'resultados' | 'comissoes' | 'regras'

const QUEM_VE: Record<TelaGestao, readonly PapelComercial[]> = {
  equipe: ['master', 'gerente', 'supervisor'],
  rede: ['master', 'gerente'],
  resultados: ['master', 'gerente', 'supervisor'],
  comissoes: ['master', 'gerente', 'supervisor', 'vendedor'],
  regras: ['master'],
}

const EXPLICACAO: Record<TelaGestao, string> = {
  equipe: 'A tela Equipe é de quem lidera vendedores: supervisor, gerente e administrador.',
  rede: 'A gestão da rede (corretoras, unidades, equipes e agentes) é do gerente e do administrador.',
  resultados: 'Os resultados da rede são de quem acompanha vendedores: supervisor, gerente e administrador.',
  comissoes: 'As comissões aparecem para vendedores, supervisores, gerentes e administradores. O balcão não tem comissão.',
  regras: 'As regras de comissão e de distribuição de leads só podem ser alteradas pelo administrador.',
}

export function podeVerTela(tela: TelaGestao, papel: PapelComercial): boolean {
  return QUEM_VE[tela].includes(papel)
}

/** Carrega o perfil comercial (`GET /eu`) do escopo. */
export function useEu(escopo: EscopoRede) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const dados = useConsoleData<VendasEu>(() => euAction(escopo), [chave])
  return dados
}

/**
 * Portão de papel: carrega o `eu`, mostra esqueleto/erro e, se o papel não
 * pode ver a tela, explica por quê com um caminho de volta.
 */
export function PortaoDePapel({
  escopo,
  tela,
  children,
}: {
  escopo: EscopoRede
  tela: TelaGestao
  children: (eu: VendasEu) => ReactNode
}) {
  const { data: eu, error, loading, reload } = useEu(escopo)
  if (loading && !eu) return <TableSkeleton rows={5} />
  if (!eu) return <LoadError message={error ?? 'Não foi possível carregar seu perfil comercial.'} onRetry={() => void reload()} />
  if (!podeVerTela(tela, eu.papel)) return <SemAcesso escopo={escopo} mensagem={EXPLICACAO[tela]} />
  return <>{children(eu)}</>
}

export function SemAcesso({ escopo, mensagem }: { escopo: EscopoRede; mensagem: string }) {
  const base = useCaminhoBase(escopo)
  return (
    <EstadoVazio
      ilustracao="busca"
      moldura
      titulo="Esta tela não está liberada para o seu perfil"
      descricao={mensagem}
      acao={<AcaoPrincipal href={base}>Voltar para o início</AcaoPrincipal>}
    />
  )
}

/** Cabeçalho de tela: título, frase de apoio e, no máximo, a ação principal. */
export function CabecalhoTela({
  titulo,
  descricao,
  acao,
  icone: Icone,
  className,
}: {
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
  /** Ícone da seção no selo da cor do clube (padrão das páginas do console). */
  icone?: LucideIcon
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-4">
        {Icone ? (
          <span
            aria-hidden="true"
            className={cn('mt-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.12)] sm:size-12', ACCENT_BG)}
          >
            <Icone className="size-5" strokeWidth={2} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className={cn('m-0 font-bold leading-tight text-foreground', Icone ? 'text-[24px] tracking-tight sm:text-[30px]' : 'text-2xl')}>{titulo}</h1>
          {descricao ? <p className="m-0 mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{descricao}</p> : null}
        </div>
      </div>
      {acao ? <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">{acao}</div> : null}
    </header>
  )
}

/** Selo de papel de acesso restrito (exibido em dicas). */
export function DicaRestrita({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
      <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** Papéis que o criador pode cadastrar (espelha as regras da API). */
export function papeisCriaveis(papel: PapelComercial): PapelComercial[] {
  if (papel === 'master') return ['gerente', 'supervisor', 'vendedor', 'balcao']
  if (papel === 'gerente') return ['supervisor', 'vendedor', 'balcao']
  if (papel === 'supervisor') return ['vendedor']
  return []
}


/** Referência de mês `yyyy-MM` no fuso de São Paulo. */
export function mesAtual(): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const ano = partes.find(p => p.type === 'year')?.value ?? String(new Date().getFullYear())
  const mes = partes.find(p => p.type === 'month')?.value ?? '01'
  return `${ano}-${mes}`
}

/** Últimos `n` meses (inclui o atual), do mais recente ao mais antigo. */
export function ultimosMeses(n = 12): { value: string; label: string }[] {
  const [ano, mes] = mesAtual().split('-').map(Number) as [number, number]
  const itens: { value: string; label: string }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    itens.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return itens
}

/**
 * Seletor segmentado (poucas opções mutuamente exclusivas: período, agrupamento).
 * Radiogrupo acessível: setas movem a seleção, o texto repete a escolha.
 */
export function Segmentado<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  className,
}: {
  rotulo: string
  valor: T
  opcoes: ReadonlyArray<{ value: T; label: string }>
  aoMudar: (valor: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className={cn('inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-white p-1', className)}
    >
      {opcoes.map((o, i) => {
        const ativo = o.value === valor
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => aoMudar(o.value)}
            onKeyDown={e => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const passo = e.key === 'ArrowRight' ? 1 : -1
              const proximo = opcoes[(i + passo + opcoes.length) % opcoes.length]
              if (proximo) aoMudar(proximo.value)
            }}
            className={cn(
              'min-h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1E2A4A]',
              ativo ? 'bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#FFFFFF)]' : 'text-muted-foreground hover:bg-[#F2F4F7] hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export const PERIODOS = [
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Trimestre' },
] as const

/** "12 de nov." a partir de ISO (ou data yyyy-MM-dd). */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
