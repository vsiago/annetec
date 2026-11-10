import {
  cancelarComissaoInput,
  listComissoesQuery,
  pagarComissoesInput,
  resumoComissoesQuery,
  vendasIdParam,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { cancelar, listar, pagar, resumo } from '../comissoes.service'
import { requireEscrita, requirePapel, vendasOf } from '../context'

/**
 * Comissões (`docs/rede-comercial.md` 4.2). Leitura por papel (vendedor as suas,
 * supervisor/gerente as da hierarquia, master tudo); repasse e cancelamento só do master.
 */
export const comissoesController = new Hono<AppEnv>()
  .get('/comissoes', query(listComissoesQuery), async c => ok(c, await listar(vendasOf(c), c.req.valid('query'))))

  .get('/comissoes/resumo', query(resumoComissoesQuery), async c => ok(c, await resumo(vendasOf(c), c.req.valid('query').mes)))

  .post('/comissoes/pagar', requirePapel('master'), requireEscrita, json(pagarComissoesInput), async c =>
    ok(c, await pagar(vendasOf(c), c.req.valid('json'))),
  )

  .post(
    '/comissoes/:id/cancelar',
    requirePapel('master'),
    requireEscrita,
    param(vendasIdParam),
    json(cancelarComissaoInput),
    async c => ok(c, await cancelar(vendasOf(c), c.req.valid('param').id, c.req.valid('json').motivo)),
  )
