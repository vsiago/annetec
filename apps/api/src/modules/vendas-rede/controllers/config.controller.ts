import { updateConfigInput, type VendasConfigResposta } from '@annetec/contracts'
import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { getOrCreateConfig, toConfigPublica, toVendasConfig, updateConfig } from '../config.service'
import { requireEscrita, requirePapel, vendasOf } from '../context'

/**
 * Config da Rede Comercial. `GET /config`: todo agente lê a parte pública; o
 * master recebe também a regra completa. `PUT /config`: só master, com auditoria.
 */
export const configController = new Hono<AppEnv>()
  .get('/config', async c => {
    const ctx = vendasOf(c)
    const row = await getOrCreateConfig(ctx.scope, ctx.tenantId)
    const resposta: VendasConfigResposta = {
      publica: toConfigPublica(row),
      completa: ctx.papel === 'master' ? toVendasConfig(row) : null,
    }
    return ok(c, resposta)
  })

  .put('/config', requirePapel('master'), requireEscrita, json(updateConfigInput), async c => {
    const ctx = vendasOf(c)
    const { antes, depois } = await updateConfig({ scope: ctx.scope, tenantId: ctx.tenantId }, c.req.valid('json'), ctx.userId)
    await recordAudit(c, {
      action: 'vendas.config_updated',
      resource: 'vendas_config',
      resourceId: depois.id,
      organizationId: ctx.tenantId,
      metadata: { scope: ctx.scope, antes: toVendasConfig(antes), depois: toVendasConfig(depois) },
    })
    const resposta: VendasConfigResposta = { publica: toConfigPublica(depois), completa: toVendasConfig(depois) }
    return ok(c, resposta)
  })
