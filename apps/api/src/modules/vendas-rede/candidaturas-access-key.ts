import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { env, webBaseUrl } from '@/config/env'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'
import { isUuid } from '@/modules/platform-onboarding/http'

/**
 * Chave de acompanhamento da candidatura ("Seja um parceiro comercial"): o
 * candidato não tem conta; quem tem o link `/seja-parceiro/<id>?chave=<HMAC>`
 * vê e edita o rascunho. Chave errada = 404. Mesmo desenho de
 * `platform-onboarding/access-key.ts`: HMAC-SHA256(BETTER_AUTH_SECRET,
 * `candidatura:<id>`) em base64url, 32 caracteres.
 */
export function candidaturaAccessKey(candidaturaId: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(`candidatura:${candidaturaId}`).digest('base64url').slice(0, 32)
}

/** Compara em tempo constante; tamanho errado já é falso. */
export function isValidCandidaturaAccessKey(candidaturaId: string, key: string | null | undefined): boolean {
  if (!key || key.length !== 32) return false
  const expected = Buffer.from(candidaturaAccessKey(candidaturaId))
  const received = Buffer.from(key)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export interface EscopoAcompanhamento {
  scope: 'platform' | 'tenant'
  tenantSlug?: string | null
}

/** `/seja-parceiro/<id>?chave=` (plataforma) ou `/<slug>/seja-parceiro/<id>?chave=` (clube). */
export function acompanhamentoPath(escopo: EscopoAcompanhamento, candidaturaId: string, chave: string = candidaturaAccessKey(candidaturaId)): string {
  const base = escopo.scope === 'tenant' && escopo.tenantSlug ? `/${escopo.tenantSlug}/seja-parceiro` : '/seja-parceiro'
  return `${base}/${candidaturaId}?chave=${chave}`
}

export function acompanhamentoUrl(escopo: EscopoAcompanhamento, candidaturaId: string, chave?: string): string {
  return `${webBaseUrl}${acompanhamentoPath(escopo, candidaturaId, chave)}`
}

/** `:id` uuid + `?chave=` valida; senao 404, como se a candidatura nao existisse (molde de `proposalKeyGuard`). */
export const candidaturaKeyGuard = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id')
  if (!isUuid(id) || !isValidCandidaturaAccessKey(id, c.req.query('chave'))) throw AppError.notFound('Candidatura')
  await next()
})

/** Id da rota já conferido (uuid); senão 404 com o nome certo do recurso. */
export function candidaturaRouteId(c: Context<AppEnv>, name: 'id' | 'docId' = 'id'): string {
  const value = c.req.param(name)
  if (!isUuid(value)) throw AppError.notFound(name === 'docId' ? 'Documento' : 'Candidatura')
  return value
}
