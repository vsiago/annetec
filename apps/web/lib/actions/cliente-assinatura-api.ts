'use server'

import type { ClubCharge, MyClubAccess, MyClubMembership, ReissueClubChargeInput, RetryPaymentInput } from '@annetec/contracts'
import { ApiError, apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { clientIpHeaders } from '@/lib/api/client-ip'
import { run, type ActionResult } from './_api-result'

/**
 * Portal do associado — assinatura do Clube de Benefícios
 * (`/api/v1/t/:tenantSlug/cliente`, papel `client`).
 *
 * O recorte é do servidor: toda rota filtra pela sessão, então o associado só
 * enxerga a própria assinatura, as carteirinhas da família e as próprias
 * faturas. Nada aqui é mock — sem assinatura, a API devolve `null` e a tela
 * cai no comportamento de sempre.
 */

/** Assinatura do clube + carteirinhas + cobranças em aberto; `null` = a pessoa não assina o clube. */
export async function getMyClubMembershipAction(
  tenantSlug: string,
): Promise<ActionResult<MyClubMembership | null>> {
  return run(async () => {
    try {
      const { data } = await apiFetch<MyClubMembership | null>(tenantPath(tenantSlug, '/cliente/assinatura'))
      return data ?? null
    } catch (error) {
      // Sem assinatura nenhuma (`none`) a API recusa com SUBSCRIPTION_REQUIRED:
      // para o portal isso é o mesmo "não assina o clube" de sempre (`null`),
      // não uma falha a mostrar.
      if (error instanceof ApiError && error.code === 'SUBSCRIPTION_REQUIRED') return null
      throw error
    }
  })
}

/**
 * Situação do associado frente à assinatura do clube (`none`,
 * `pending_payment`, `subscribed`, `contract`): decide o onboarding "assine
 * um plano" e o que fica bloqueado no portal.
 */
export async function getMyClubAccessAction(tenantSlug: string): Promise<ActionResult<MyClubAccess>> {
  return run(async () => {
    const { data } = await apiFetch<MyClubAccess>(tenantPath(tenantSlug, '/cliente/acesso'))
    return data
  })
}

/** Faturas do associado (vencimento mais recente primeiro). */
export async function listMyClubChargesAction(tenantSlug: string): Promise<ActionResult<ClubCharge[]>> {
  return run(async () => {
    const path = tenantPath(tenantSlug, '/cliente/cobrancas')
    const first = await apiFetch<ClubCharge[]>(path)
    // Se um dia a rota passar a paginar, a lista não pode sair truncada.
    if ((first.meta?.totalPages ?? 1) > 1) return apiFetchAll<ClubCharge>(path)
    return first.data ?? []
  })
}

/** Segunda via: vencimento novo (padrão do inquilino) e, opcionalmente, troca Pix↔boleto. */
export async function reissueMyClubChargeAction(
  tenantSlug: string,
  chargeId: string,
  input: ReissueClubChargeInput = {},
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(
      tenantPath(tenantSlug, `/cliente/cobrancas/${encodeURIComponent(chargeId)}/segunda-via`),
      { method: 'POST', body: input },
    )
    return data
  })
}

/**
 * Paga (ou tenta de novo) uma fatura em aberto com a forma escolhida — gera o
 * Pix/boleto na hora ou cobra o cartão digitado. Dados de cartão só trafegam:
 * nunca são logados aqui.
 */
export async function payMyClubChargeAction(
  tenantSlug: string,
  chargeId: string,
  input: RetryPaymentInput,
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(
      tenantPath(tenantSlug, `/cliente/cobrancas/${encodeURIComponent(chargeId)}/pagar`),
      // IP do associado vai para o antifraude do cartão (o Asaas pede o IP de quem paga, não o do servidor).
      { method: 'POST', body: input, headers: await clientIpHeaders() },
    )
    return data
  })
}
