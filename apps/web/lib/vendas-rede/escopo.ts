/**
 * Escopo da Rede Comercial: a MESMA tela serve a equipe de vendas da
 * plataforma (`/vendas`) e a do clube (`/<slug>/vendas`). Tudo que muda entre
 * os dois (prefixo da API, base das rotas) sai daqui.
 *
 * Fica fora de `lib/actions` porque um módulo `'use server'` só exporta
 * função async.
 */
export type EscopoVendas = { kind: 'platform' } | { kind: 'tenant'; slug: string }

/** Prefixo da API: `/api/v1/vendas` ou `/api/v1/t/:slug/vendas`. */
export function prefixoApi(escopo: EscopoVendas): string {
  return escopo.kind === 'tenant' ? `/api/v1/t/${encodeURIComponent(escopo.slug)}/vendas` : '/api/v1/vendas'
}

/** Raiz das rotas do app: `/vendas` ou `/<slug>/vendas`. */
export function basePath(escopo: EscopoVendas): string {
  return escopo.kind === 'tenant' ? `/${escopo.slug}/vendas` : '/vendas'
}

/** Escopo a partir dos params da rota (`[tenant]` presente = clube). */
export function escopoDaRota(params: { tenant?: string | string[] | undefined } | null | undefined): EscopoVendas {
  const slug = Array.isArray(params?.tenant) ? params?.tenant[0] : params?.tenant
  return slug ? { kind: 'tenant', slug } : { kind: 'platform' }
}

/** Chave estável do escopo (dependência de efeitos). */
export function chaveDoEscopo(escopo: EscopoVendas): string {
  return escopo.kind === 'tenant' ? `tenant:${escopo.slug}` : 'platform'
}
