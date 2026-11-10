import { resultadosQuery } from '@annetec/contracts'
import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { query } from '@/http/validate'
import { requirePapel, vendasOf } from '../context'
import { hoje, resultados } from '../painel.service'

/**
 * Painel/BI (`docs/rede-comercial.md` 4.2). O balcão não vê funil nem pool: usa
 * o próprio `/balcao/hoje`. Os dados saem sempre limitados à visibilidade do papel.
 */
export const painelController = new Hono<AppEnv>()
  .use('/painel/*', requirePapel('master', 'gerente', 'supervisor', 'vendedor'))

  .get('/painel/hoje', async c => ok(c, await hoje(vendasOf(c))))

  .get('/painel/resultados', query(resultadosQuery), async c => ok(c, await resultados(vendasOf(c), c.req.valid('query'))))
