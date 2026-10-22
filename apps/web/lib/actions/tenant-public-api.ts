'use server'

import type { Benefit, ClubPlan, Partner, Tenant } from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { clientIpHeaders } from '@/lib/api/client-ip'
import type { Tenant as LegacyTenant } from '@/lib/types'
import { run, type ActionResult } from './_api-result'

/**
 * Info pública do inquilino — fala com `/api/v1/t/:tenantSlug/public`, sem
 * sessão. É o que resolve `/[tenant]/...` antes de qualquer login existir
 * (branding, contato). Sem mock.
 */

function toLegacyTenant(tenant: Tenant): LegacyTenant {
  return {
    ...tenant,
    branding: {
      primaryColor: tenant.branding.primaryColor,
      secondaryColor: tenant.branding.secondaryColor,
      logoUrl: tenant.branding.logoUrl,
    },
    createdAt: new Date(tenant.createdAt),
    trialEndsAt: tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : undefined,
  }
}

export async function getTenantPublicAction(slug: string): Promise<ActionResult<LegacyTenant>> {
  return run(async () => {
    const { data } = await apiFetch<Tenant>(`/api/v1/t/${encodeURIComponent(slug)}/public`, { token: null })
    return toLegacyTenant(data)
  })
}
/**
 * Vitrine da landing: rede credenciada e clube de benefícios sem sessão.
 *
 * Passa `token: null` de propósito. Sem isso o cliente anexaria o cookie de
 * quem por acaso estivesse logado, e a mesma URL pública responderia coisas
 * diferentes conforme a sessão do visitante — inclusive furando o cache de
 * borda com resposta personalizada.
 */
export async function listPublicPartnersAction(slug: string): Promise<ActionResult<Partner[]>> {
  return run(async () => {
    const { data } = await apiFetch<Partner[]>(
      `/api/v1/t/${encodeURIComponent(slug)}/public/parceiros`,
      { token: null },
    )
    return data
  })
}

export async function listPublicBenefitsAction(slug: string): Promise<ActionResult<Benefit[]>> {
  return run(async () => {
    const { data } = await apiFetch<Benefit[]>(
      `/api/v1/t/${encodeURIComponent(slug)}/public/beneficios`,
      { token: null },
    )
    return data
  })
}

/**
 * Plano do clube como a vitrine recebe. Os dois campos de dependente estão
 * entrando no contrato; enquanto não chegam, ficam opcionais aqui para a
 * vitrine já exibi-los quando a API passar a mandá-los.
 */
export type PublicClubPlan = ClubPlan & {
  /** R$/mês por dependente; `null`/0 = dependentes inclusos na mensalidade. */
  priceDependentMonthly?: number | null
  /** Teto de dependentes; `null` = sem limite. */
  maxDependents?: number | null
}

/** Só planos ativos, destaque primeiro e depois do mais barato ao mais caro. */
export async function listPublicClubPlansAction(slug: string): Promise<ActionResult<PublicClubPlan[]>> {
  return run(async () => {
    const { data } = await apiFetch<PublicClubPlan[]>(
      `/api/v1/t/${encodeURIComponent(slug)}/public/planos`,
      { token: null },
    )
    return data
  })
}

/** Corpo de `POST /t/:slug/public/leads` — o formulário da vitrine, sem sessão. */
export type PublicLeadInput = {
  name: string
  phone: string
  email?: string
  origin: 'cadastro' | 'empresas' | 'contato'
  subject?: string
  message?: string
  planId?: string
  company?: {
    name: string
    document?: string
    employees?: string
    role?: string
  }
  /** Honeypot: fica escondido na tela; preenchido, a API descarta o envio. */
  website?: string
}

/**
 * Lead da vitrine (cadastro e proposta para empresas). Não usa a rota do CRM
 * porque ela exige sessão de admin/vendedor — o visitante anônimo recebia 401.
 * `token: null` pelo mesmo motivo das leituras acima.
 */
export async function createPublicLeadAction(
  slug: string,
  input: PublicLeadInput,
): Promise<ActionResult<{ received: true }>> {
  return run(async () => {
    const { data } = await apiFetch<{ received: true }>(
      `/api/v1/t/${encodeURIComponent(slug)}/public/leads`,
      // IP do navegador: a API limita envios da vitrine por IP.
      { method: 'POST', body: input, token: null, headers: await clientIpHeaders() },
    )
    return data
  })
}
