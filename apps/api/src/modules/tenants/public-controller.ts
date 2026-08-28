import { Hono } from 'hono'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { tenantsService } from './service'

/**
 * Dados públicos do inquilino (nome, marca, contato) — sem autenticação.
 * Montado em `/api/v1/t/:tenantSlug/public`, usado pela página institucional
 * `/[tenant]` e pelo contexto de tenant do frontend antes de qualquer sessão
 * existir (ex.: para montar o login com a marca do clube).
 *
 * Nunca inclui credenciais de integração — isso fica em
 * `tenantsService.getIntegration`, sempre atrás de `requirePlatformRole`.
 */
export const tenantPublicController = new Hono<AppEnv>().get('/', async c => {
  const slug = c.req.param('tenantSlug')
  if (!slug) throw AppError.notFound('Inquilino')
  return ok(c, await tenantsService.getPublicBySlug(slug))
})
