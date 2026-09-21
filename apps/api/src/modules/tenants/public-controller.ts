import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/db/client'
import { benefits, partners } from '@/db/schema'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { query } from '@/http/validate'
import { toBenefit, toPartner } from '@/modules/network/controller'
import { tenantsService } from './service'

/**
 * Dados públicos do inquilino (nome, marca, contato) — sem autenticação.
 * Montado em `/api/v1/t/:tenantSlug/public`, usado pela página institucional
 * `/[tenant]` e pelo contexto de tenant do frontend antes de qualquer sessão
 * existir (ex.: para montar o login com a marca do clube).
 *
 * Nunca inclui credenciais de integração — isso fica em
 * `tenantsService.getIntegration`, sempre atrás de `requirePlatformRole`.
 *
 * A rede credenciada e o clube de benefícios também moram aqui: são material
 * de vitrine. A landing do clube existe justamente para mostrar quais
 * parceiros e descontos o associado ganha — exigir sessão para ler isso
 * esvaziaria a própria página de venda. Só entra parceiro ATIVO: inativo é
 * credenciamento encerrado, e anunciá-lo é prometer desconto que não existe.
 */

/** Teto da vitrine: a landing exibe uma seleção, não a base inteira. */
const VITRINE_MAX = 200

const vitrineQuery = z.object({
  limite: z.coerce.number().int().min(1).max(VITRINE_MAX).default(VITRINE_MAX),
})

export const tenantPublicController = new Hono<AppEnv>()
  .get('/', async c => ok(c, await tenantPublico(c.req.param('tenantSlug'))))

  .get('/parceiros', query(vitrineQuery), async c => {
    const tenant = await tenantPublico(c.req.param('tenantSlug'))
    const rows = await db
      .select()
      .from(partners)
      .where(and(eq(partners.organizationId, tenant.id), eq(partners.status, 'active')))
      .orderBy(asc(partners.name))
      .limit(c.req.valid('query').limite)
    return ok(c, rows.map(toPartner))
  })

  .get('/beneficios', query(vitrineQuery), async c => {
    const tenant = await tenantPublico(c.req.param('tenantSlug'))
    const rows = await db
      .select()
      .from(benefits)
      .where(eq(benefits.organizationId, tenant.id))
      .orderBy(asc(benefits.name))
      .limit(c.req.valid('query').limite)
    return ok(c, rows.map(toBenefit))
  })

/**
 * Resolve o inquilino da URL sem passar por `resolveTenant`, que exige sessão.
 * Reusa `getPublicBySlug` para herdar a mesma recusa de inquilino cancelado —
 * um clube encerrado não deve continuar anunciando rede credenciada.
 */
async function tenantPublico(slug: string | undefined) {
  if (!slug) throw AppError.notFound('Inquilino')
  return tenantsService.getPublicBySlug(slug)
}
