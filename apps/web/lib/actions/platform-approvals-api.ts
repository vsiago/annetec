'use server'

import type { ApprovalsSummary } from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Central de Aprovações — `/api/v1/platform/aprovacoes`: quantos pedidos
 * esperam a equipe em cada fila (novos clubes, contas gerenciadas, descontos de
 * vendedores). Alimenta o contador do menu e as pílulas das abas.
 */
export async function getApprovalsSummaryAction(): Promise<ActionResult<ApprovalsSummary>> {
  return run(async () => {
    const { data } = await apiFetch<ApprovalsSummary>('/api/v1/platform/aprovacoes/resumo')
    return data
  })
}
