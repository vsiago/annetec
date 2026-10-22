'use server'

import type {
  ChangePlatformPlanInput,
  MyPlatformSubscription,
  PayPlatformChargeInput,
  PlatformPublicInvoice,
  PlatformCharge,
  PlatformChargeDetail,
  ReissuePlatformChargeInput,
  TenantPlatformAccess,
} from '@annetec/contracts'
import { api, apiFetch, tenantPath } from '@/lib/api/client'
import { clientIpHeaders } from '@/lib/api/client-ip'
import type { Paged } from '@/lib/adapters/contratacao'
import type { ActionResult } from './_api-result'
import { run } from './_api-result'

/**
 * "Minha assinatura ANNETEC" — o inquilino vendo e pagando a própria
 * assinatura da plataforma (`/t/:slug/assinatura-annetec`). Admin do
 * inquilino; o `acesso` também responde ao vendedor (banner do painel).
 *
 * Estas rotas passam pelo guard de restrição mesmo com o painel bloqueado:
 * é por aqui que o inquilino regulariza.
 */

const base = (slug: string, suffix = '') => tenantPath(slug, `/assinatura-annetec${suffix}`)

export async function getMyPlatformSubscriptionAction(slug: string): Promise<ActionResult<MyPlatformSubscription>> {
  return run(() => api<MyPlatformSubscription>(base(slug)))
}

/** O que o banner do painel precisa (nível de acesso, frase pronta, link para pagar). */
export async function getTenantPlatformAccessAction(slug: string): Promise<ActionResult<TenantPlatformAccess>> {
  return run(() => api<TenantPlatformAccess>(base(slug, '/acesso')))
}

export async function listMyPlatformChargesAction(
  slug: string,
  query: { page?: number; perPage?: number } = {},
): Promise<ActionResult<Paged<PlatformCharge>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<PlatformCharge[]>(base(slug, '/faturas'), {
      query: { page: query.page ?? 1, perPage: query.perPage ?? 12 },
    })
    return { items: data, meta: meta ?? null }
  })
}

export async function getMyPlatformChargeAction(
  slug: string,
  chargeId: string,
): Promise<ActionResult<PlatformChargeDetail>> {
  return run(() => api<PlatformChargeDetail>(base(slug, `/faturas/${encodeURIComponent(chargeId)}`)))
}

/** Segunda via: novo vencimento e, se quiser, troca Pix ↔ boleto. */
export async function reissueMyPlatformChargeAction(
  slug: string,
  chargeId: string,
  input: ReissuePlatformChargeInput,
): Promise<ActionResult<PlatformCharge>> {
  return run(() =>
    api<PlatformCharge>(base(slug, `/faturas/${encodeURIComponent(chargeId)}/segunda-via`), {
      method: 'POST',
      body: input,
    }),
  )
}

/** Upgrade vale na hora (+ proporcional na próxima fatura); downgrade agenda para o próximo ciclo. */
export async function changeMyPlatformPlanAction(
  slug: string,
  input: ChangePlatformPlanInput,
): Promise<ActionResult<MyPlatformSubscription>> {
  return run(() => api<MyPlatformSubscription>(base(slug, '/plano'), { method: 'POST', body: input }))
}

// ---------------------------------------------------------------------------
// Pagamento dentro do painel (`/{slug}/admin/assinatura/faturas/<id>`): mesmo
// DTO e fluxo da fatura pública, autenticado pela sessão do admin (sem chave).
// Dados de cartão só atravessam (browser → API → gateway); nada aqui loga.
// ---------------------------------------------------------------------------

const paymentPath = (slug: string, chargeId: string, suffix: string) =>
  base(slug, `/faturas/${encodeURIComponent(chargeId)}${suffix}`)

/** A API sincroniza com o gateway antes de responder (polling da tela). */
export async function getMyPlatformInvoiceAction(slug: string, chargeId: string): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () => api<PlatformPublicInvoice>(paymentPath(slug, chargeId, '/pagamento'), { headers: await clientIpHeaders() }))
}

export async function payMyPlatformInvoiceAction(
  slug: string,
  chargeId: string,
  input: PayPlatformChargeInput,
): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () =>
    api<PlatformPublicInvoice>(paymentPath(slug, chargeId, '/pagar'), { method: 'POST', body: input, headers: await clientIpHeaders() }),
  )
}

export async function simulateMyPlatformInvoiceAction(slug: string, chargeId: string): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () => api<PlatformPublicInvoice>(paymentPath(slug, chargeId, '/simular'), { method: 'POST', headers: await clientIpHeaders() }))
}
