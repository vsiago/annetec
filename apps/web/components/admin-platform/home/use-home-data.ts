'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { HoldingOverview, HoldingTenantRow, PlatformBillingSummary } from '@annetec/contracts'
import { getHoldingOverviewAction, listHoldingTenantsAction } from '@/lib/actions/holding-api'
import { getPlatformBillingSummaryAction, listPlatformChargesAction } from '@/lib/actions/platform-billing-api'
import { listOnboardingProposalsAction } from '@/lib/actions/platform-onboarding-api'
import { todaySaoPaulo } from '@/lib/adapters/holding'
import { endOfMonthOf } from './format'

/** Número de meses do gráfico de receita. */
export const HOME_CHART_MONTHS = 6

/** Dados que a tela precisa para abrir. Se algum faltar, a tela inteira vira erro. */
export interface HomeData {
  overview: HoldingOverview
  rows: HoldingTenantRow[]
  billing: PlatformBillingSummary
  /** Fila de aprovações: quantidade e o cadastro mais antigo (a API ordena por envio). */
  queue: { total: number; oldestSubmittedAt: string | null; oldestBreached: boolean }
}

/**
 * Detalhes que só enriquecem uma frase. Chegam depois da tela aberta e, se
 * falharem, a frase simplesmente fica sem o detalhe (`undefined` = não sei).
 */
export interface HomeExtras {
  /** Vencimento (`yyyy-MM-dd`) da fatura em atraso mais antiga; `null` = nenhuma. */
  oldestOverdueDue: string | null | undefined
  /** Faturas a vencer entre hoje e o fim do mês. */
  pendingCount: number | undefined
  /** Último dia do mês (`yyyy-MM-dd`), mesma referência do "A receber". */
  monthEnd: string
  /** Hoje em São Paulo (`yyyy-MM-dd`). */
  today: string
}

export type HomeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: HomeData; extras: HomeExtras | null }

type Result<T> = { success: true; data: T } | { success: false; error: string }

const PAGE = 200

/** Vencimento mais antigo entre as faturas de um status (a API lista do vencimento mais novo para o mais antigo). */
async function oldestDueOf(status: 'overdue' | 'failed', today: string): Promise<string | null | undefined> {
  const first = await listPlatformChargesAction({ status, perPage: PAGE })
  if (!first.success) return undefined
  let items = first.data.items
  const pages = first.data.meta.totalPages
  if (pages > 1) {
    const last = await listPlatformChargesAction({ status, perPage: PAGE, page: pages })
    if (!last.success) return undefined
    items = last.data.items
  }
  const dues = items.map(charge => charge.dueDate).filter(due => due < today)
  dues.sort()
  return dues[0] ?? null
}

async function loadExtras(): Promise<HomeExtras> {
  const today = todaySaoPaulo()
  const monthEnd = endOfMonthOf(today)
  const [overdue, failed, pending] = await Promise.all([
    oldestDueOf('overdue', today),
    oldestDueOf('failed', today),
    listPlatformChargesAction({ status: 'pending', from: today, to: monthEnd, perPage: 1 }),
  ])
  // O vencimento mais antigo só é confiável se as duas listas responderam.
  const known = overdue !== undefined && failed !== undefined
  const oldest = known ? ([overdue, failed].filter((due): due is string => due !== null).sort()[0] ?? null) : undefined
  return {
    oldestOverdueDue: oldest,
    pendingCount: pending.success ? pending.data.meta.total : undefined,
    monthEnd,
    today,
  }
}

function succeeded<T>(result: Result<T>): result is { success: true; data: T } {
  return result.success
}

/**
 * Carrega o Início em duas levas: primeiro o que sustenta a tela (visão geral,
 * clubes, resumo do financeiro e fila de aprovações); depois os detalhes das
 * frases. Resposta de uma busca antiga é descartada.
 */
export function useHomeData() {
  const [state, setState] = useState<HomeState>({ status: 'loading' })
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const id = ++sequence.current
    setState({ status: 'loading' })
    try {
      const [overview, rows, billing, queue] = await Promise.all([
        getHoldingOverviewAction({ meses: HOME_CHART_MONTHS }),
        listHoldingTenantsAction(),
        getPlatformBillingSummaryAction(),
        listOnboardingProposalsAction({ group: 'queue', perPage: 1 }),
      ])
      if (id !== sequence.current) return
      if (!succeeded(overview) || !succeeded(rows) || !succeeded(billing) || !succeeded(queue)) {
        setState({ status: 'error' })
        return
      }
      const oldest = queue.data.items[0]
      const data: HomeData = {
        overview: overview.data,
        rows: rows.data,
        billing: billing.data,
        queue: {
          total: queue.data.meta.total,
          oldestSubmittedAt: oldest?.submittedAt ?? null,
          oldestBreached: oldest?.slaBreached ?? false,
        },
      }
      setState({ status: 'ready', data, extras: null })
      const extras = await loadExtras().catch(() => null)
      if (id !== sequence.current) return
      setState({ status: 'ready', data, extras })
    } catch {
      if (id === sequence.current) setState({ status: 'error' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { state, reload: load }
}
