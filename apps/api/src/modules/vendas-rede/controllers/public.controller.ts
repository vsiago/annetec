import { ERROR_CODES, leadPublicoInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { rateLimit } from '@/lib/rate-limit'
import { nomeDoVendedorPorCodigo, receberLeadPublicoPlatform } from '../intake.service'

/**
 * Público sem login: `/api/v1/public/vendas/*`.
 *
 *  - `POST /leads`: site ANNETEC (platform). 10 pedidos/h por IP; honeypot `website`
 *    preenchido responde igual ao sucesso e não grava nada (não ensina o robô a desviar);
 *  - `GET /ref/:codigo`: `{ nomeVendedor }` para "Atendido por" (404 `VENDAS_CODIGO_INVALIDO`).
 */
export const publicController = new Hono<AppEnv>()
  .post(
    '/leads',
    rateLimit({ key: 'vendas:publico:leads', limit: 10, windowMs: 60 * 60_000 }),
    bodyLimit({
      maxSize: 16 * 1024,
      onError: () => {
        throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Conteúdo grande demais para um pedido de contato', { status: 413 })
      },
    }),
    json(leadPublicoInput),
    async c => {
      await receberLeadPublicoPlatform(c.req.valid('json'))
      return ok(c, { recebido: true as const })
    },
  )

  .get('/ref/:codigo', rateLimit({ key: 'vendas:publico:ref', limit: 120, windowMs: 60 * 60_000 }), async c =>
    ok(c, await nomeDoVendedorPorCodigo(c.req.param('codigo'))),
  )
