'use server'

import type { LeadPublicoInput, RefPublicaResponse } from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { clientIpHeaders } from '@/lib/api/client-ip'
import { run, type ActionResult } from './_api-result'

/**
 * Rede Comercial, lado público (sem sessão): lead do site da ANNETEC e
 * consulta do nome de quem atende por um link de indicação.
 */

/** `POST /api/v1/public/vendas/leads`. `website` é o honeypot: preenchido, a API descarta o envio. */
export async function enviarLeadPlataformaAction(input: LeadPublicoInput): Promise<ActionResult<{ received: true }>> {
  return run(async () => {
    const { data } = await apiFetch<{ received: true }>('/api/v1/public/vendas/leads', {
      method: 'POST',
      body: input,
      token: null,
      // IP do navegador: a API limita envios públicos por IP.
      headers: await clientIpHeaders(),
    })
    return data
  })
}

/** `GET /api/v1/public/vendas/ref/:codigo` → nome de quem indicou. Código inválido devolve erro (a tela ignora). */
export async function nomeDoVendedorPorRefAction(codigo: string): Promise<ActionResult<RefPublicaResponse>> {
  return run(async () => {
    const { data } = await apiFetch<RefPublicaResponse>(`/api/v1/public/vendas/ref/${encodeURIComponent(codigo)}`, { token: null })
    return data
  })
}
