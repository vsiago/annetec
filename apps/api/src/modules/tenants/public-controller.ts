import { ERROR_CODES } from '@annetec/contracts'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { db } from '@/db/client'
import { benefits, partners } from '@/db/schema'
import { AppError } from '@/http/errors'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { toBenefit, toPartner } from '@/modules/network/controller'
import { listPublicClubPlans } from './public-club-plans'
import { capturePublicLead, PUBLIC_LEAD_BODY_MAX, publicLeadInput } from './public-leads'
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
 *
 * Pelo mesmo motivo, os planos do clube (`/planos`) e a captura de contato
 * (`POST /leads`) também são públicos: são a oferta e o formulário da página
 * de venda.
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
   * Planos do clube à venda: só os ativos, destaque primeiro e depois do mais
   * barato ao mais caro — a ordem em que a vitrine os exibe.
   */
  .get('/planos', async c => {
    const tenant = await tenantPublico(c.req.param('tenantSlug'))
    return ok(c, await listPublicClubPlans(tenant.id))
  })

  /**
   * "Quero ser associado" / "Proposta para empresas" da vitrine. Sem sessão:
   * quem preenche é justamente o visitante. A resposta não devolve o lead —
   * id e observações são do funil do inquilino, não de quem mandou.
   */
  .post(
    '/leads',
    // Formulário anônimo: sem limite, um robô enche o funil do clube.
    rateLimit({ key: 'vitrine:leads', limit: 10, windowMs: 60 * 60_000 }),
    bodyLimit({
      maxSize: PUBLIC_LEAD_BODY_MAX,
      onError: () => {
        throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Conteúdo grande demais para um cadastro', {
          status: 413,
        })
      },
    }),
    json(publicLeadInput),
    async c => {
      const tenant = await tenantPublico(c.req.param('tenantSlug'))
      const input = c.req.valid('json')
      const { leadId } = await capturePublicLead(tenant.id, input)
      if (leadId) {
        await recordAudit(c, {
          action: 'lead.captured',
          resource: 'lead',
          resourceId: leadId,
          organizationId: tenant.id,
          metadata: { canal: 'vitrine', origem: input.origin },
        })
      }
      return created(c, { received: true as const })
    },
  )

/**
 * Resolve o inquilino da URL sem passar por `resolveTenant`, que exige sessão.
 * Reusa `getPublicBySlug` para herdar a mesma recusa de inquilino cancelado —
 * um clube encerrado não deve continuar anunciando rede credenciada.
 */
async function tenantPublico(slug: string | undefined) {
  if (!slug) throw AppError.notFound('Inquilino')
  return tenantsService.getPublicBySlug(slug)
}
