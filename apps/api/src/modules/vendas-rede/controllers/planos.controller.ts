import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { listPlanOffers } from '@/modules/platform-billing/pricing.service'

/**
 * Planos ANNETEC vendáveis (somente escopo platform), para gerar proposta no funil.
 *
 * Qualquer papel que o `salesContext('platform')` deixa entrar (inclusive o master implícito:
 * `superadmin`/`platform_admin`) lê o catálogo. É a mesma fonte da rota antiga
 * `/platform/vendas/planos` (`listPlanOffers`, planos fora da vitrine incluídos), que só
 * aceitava `platform_seller` e deixava a equipe sem planos (403).
 */
export const planosController = new Hono<AppEnv>().get('/planos', async c => ok(c, await listPlanOffers()))
