import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { requireEscrita, vendasOf } from '../context'
import { listarOnline, registrarPresenca } from '../presenca.service'
import { obterEu } from '../rede.service'

/**
 * Rede (`docs/rede-comercial.md` 4.2). Já funcionam: `GET /eu`, `POST /presenca`
 * e `GET /presenca/online`. Corretoras, unidades, equipes e agentes entram aqui
 * nas próximas fases.
 */
export const redeController = new Hono<AppEnv>()
  .get('/eu', async c => ok(c, await obterEu(vendasOf(c))))

  .post('/presenca', requireEscrita, async c => ok(c, await registrarPresenca(vendasOf(c))))

  .get('/presenca/online', async c => ok(c, await listarOnline(vendasOf(c))))
