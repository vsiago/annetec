'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { APPROVAL_KINDS, APPROVAL_KIND_LABELS, type ApprovalKind, type ApprovalsSummary } from '@annetec/contracts'
import { Tabs } from '@/components/ui/tabs'
import { SectionTab, SectionTabsList } from '@/components/admin-platform/ui/section-tabs'
import { getApprovalsSummaryAction } from '@/lib/actions/platform-approvals-api'
import { cn } from '@/lib/utils'

/**
 * Peças da central de Aprovações (`/admin/compliance`): as situações de cada
 * tipo de pedido (abas da ESQUERDA do cartão), o seletor de tipo (à DIREITA,
 * na mesma linha) e o contador de pendentes por tipo.
 *
 * URL: `?tipo=clubes|contas-gerenciadas|descontos&situacao=<slug>` + o foco
 * (`clube=<orgId>`, `pedido=<id>`, `proposta=<id>`).
 */

export interface Situation<V extends string = string> {
  value: V
  label: string
}

/** Situações (abas da esquerda) de cada tipo — a 1ª é a padrão. */
export const SITUATIONS = {
  clubes: [
    { value: 'para-analisar', label: 'Para analisar' },
    { value: 'esperando-o-clube', label: 'Esperando o clube' },
    { value: 'aguardando-pagamento', label: 'Aguardando pagamento' },
    { value: 'concluidas', label: 'Concluídas' },
    { value: 'todas', label: 'Todas' },
  ],
  'contas-gerenciadas': [
    { value: 'para-analisar', label: 'Para analisar' },
    { value: 'aguardando-documentos', label: 'Aguardando documentos' },
    { value: 'ativas', label: 'Ativas' },
    { value: 'recusadas', label: 'Recusadas' },
    { value: 'todas', label: 'Todas' },
  ],
  descontos: [
    { value: 'aguardando', label: 'Aguardando' },
    { value: 'aprovados', label: 'Aprovados' },
    { value: 'recusados', label: 'Recusados' },
    { value: 'todos', label: 'Todos' },
  ],
} as const satisfies Record<ApprovalKind, readonly Situation[]>

export type SituationOf<K extends ApprovalKind> = (typeof SITUATIONS)[K][number]['value']
export type ClubSituation = SituationOf<'clubes'>
export type ManagedSituation = SituationOf<'contas-gerenciadas'>
export type DiscountSituation = SituationOf<'descontos'>

/** Situação válida para o tipo (a da URL) ou a padrão. */
export function situationOf<K extends ApprovalKind>(kind: K, value: string | null): SituationOf<K> {
  const options = SITUATIONS[kind] as readonly Situation[]
  return (options.find(option => option.value === value) ?? options[0]!).value as SituationOf<K>
}

/** Pendentes de cada tipo no resumo da API. */
export function pendingOf(summary: ApprovalsSummary | null | undefined, kind: ApprovalKind): number | null {
  if (!summary) return null
  if (kind === 'clubes') return summary.clubs
  if (kind === 'contas-gerenciadas') return summary.managedAccounts
  return summary.discounts
}

/** "1 pedido" / "3 pedidos". */
export function requestsText(count: number): string {
  return count === 1 ? '1 pedido' : `${count} pedidos`
}

/**
 * Resumo das três filas. Recarrega quando `version` muda (a tela soma 1 depois
 * de cada decisão) e a cada minuto com a aba visível.
 */
export function useApprovalsSummary(version: number) {
  const [summary, setSummary] = useState<ApprovalsSummary | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const result = await getApprovalsSummaryAction()
        if (cancelled) return
        if (result.success) {
          setSummary(result.data)
          setFailed(false)
        } else setFailed(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [version])

  return { summary, failed }
}

/**
 * Seletor do tipo de pedido (segmentado, à direita da linha de abas). Cada
 * tipo leva a pílula de pendentes à direita do nome; o ativo fica destacado.
 */
export function ApprovalKindSwitcher({
  value,
  onChange,
  summary,
}: {
  value: ApprovalKind
  onChange: (kind: ApprovalKind) => void
  summary: ApprovalsSummary | null
}) {
  return (
    <div className="scrollbar-none overflow-x-auto">
      <div role="group" aria-label="Tipo de pedido" className="inline-flex min-w-max items-center gap-1 rounded-xl bg-[#F2F4F7] p-1">
        {APPROVAL_KINDS.map(kind => {
          const active = kind === value
          const count = pendingOf(summary, kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(kind)}
              className={cn(
                'inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-secondary/50',
                active
                  ? 'bg-white font-semibold text-secondary shadow-[0_1px_2px_rgba(16,24,40,0.1),0_1px_3px_rgba(16,24,40,0.08)]'
                  : 'font-medium text-[#475467] hover:bg-white/70 hover:text-foreground',
              )}
            >
              {APPROVAL_KIND_LABELS[kind]}
              {count !== null ? (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums',
                    active
                      ? 'bg-secondary text-secondary-foreground'
                      : count > 0
                        ? 'bg-[#FEF3DC] text-[#B54708]'
                        : 'bg-[#E4E7EC] text-[#475467]',
                  )}
                >
                  <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
                  <span className="sr-only">{count === 1 ? '1 pendente' : `${count} pendentes`}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Linha de abas do cartão: situações do tipo à ESQUERDA e o seletor de tipo à
 * DIREITA, na mesma linha. Quando não cabem lado a lado (celular, tela
 * estreita), o seletor sobe para cima das situações (`flex-wrap-reverse`, sem
 * depender de breakpoint) e as duas faixas rolam na horizontal.
 */
export function ApprovalsTabsRow<V extends string>({
  situations,
  value,
  onChange,
  counts,
  kindSwitcher,
}: {
  situations: readonly Situation<V>[]
  value: V
  onChange: (value: V) => void
  /** Contador de cada situação (sem valor = sem pílula). */
  counts?: Partial<Record<V, number | undefined>>
  kindSwitcher: ReactNode
}) {
  return (
    // wrap-reverse: a 2ª linha (o seletor) fica EM CIMA; `items-start` = rente à borda de baixo.
    <div className="flex flex-wrap-reverse items-start justify-between gap-x-6 gap-y-2 border-b border-border px-4 pt-3 sm:px-6">
      <Tabs value={value} onValueChange={next => onChange(next as V)} className="min-w-0 max-w-full flex-auto gap-0">
        <SectionTabsList className="border-b-0">
          {situations.map(item => (
            <SectionTab key={item.value} value={item.value} badge={counts?.[item.value]}>
              {item.label}
            </SectionTab>
          ))}
        </SectionTabsList>
      </Tabs>
      <div className="min-w-0 max-w-full pb-1.5">{kindSwitcher}</div>
    </div>
  )
}

/** Frase de contexto abaixo dos filtros (ex.: indicadores da fila). */
export function QueueNote({ children }: { children: ReactNode }) {
  return <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-4 text-[13px] text-muted-foreground sm:px-6">{children}</p>
}
