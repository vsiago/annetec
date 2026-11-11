import { atendimentoBalcaoInput, listAtendimentosBalcaoQuery, pessoaBalcaoQuery, simularBalcaoInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { tenantOf } from '@/http/middleware/tenant'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { requestIp } from '@/lib/rate-limit'
import { buscarPessoa, hoje, listarAtendimentos, listarPlanos, registrarAtendimento, simular } from '../balcao.service'
import { requireEscrita, requirePapel, vendasOf } from '../context'

/** Balcão (somente escopo tenant; papel balcao ou master). */
export const balcaoController = new Hono<AppEnv>()
  .use('*', requirePapel('balcao', 'master'))

  .get('/hoje', async c => ok(c, await hoje(vendasOf(c))))

  .get('/planos', async c => ok(c, await listarPlanos(vendasOf(c))))

  .post('/simular', json(simularBalcaoInput), async c => ok(c, await simular(vendasOf(c), c.req.valid('json'))))

  .get('/pessoa', query(pessoaBalcaoQuery), async c => ok(c, await buscarPessoa(vendasOf(c), c.req.valid('query'))))

  .get('/atendimentos', query(listAtendimentosBalcaoQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listarAtendimentos(vendasOf(c), q)
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .post('/atendimentos', requireEscrita, json(atendimentoBalcaoInput), async c => {
    const ctx = vendasOf(c)
    const input = c.req.valid('json')
    const resultado = await registrarAtendimento(ctx, tenantOf(c), input, requestIp(c) ?? undefined)
    await recordAudit(c, {
      action: 'vendas.balcao_atendimento',
      resource: 'vendas_atendimento_balcao',
      resourceId: resultado.atendimento.id,
      organizationId: ctx.tenantId,
      metadata: {
        resultado: input.resultado,
        planoId: resultado.atendimento.planoId,
        leadId: resultado.atendimento.leadId,
        assinaturaId: resultado.atendimento.assinaturaId,
      },
    })
    return created(c, resultado)
  })
