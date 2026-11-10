import { listNotificationsQuery, markNotificationsReadInput, sendTestNotificationInput } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { demoToolsAllowed } from '@/config/env'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformRole, requirePlatformSeller, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import {
  listNotifications,
  markNotificationsRead,
  notificationStoreDb,
  parseStreamCursor,
  runNotificationStream,
  type NotificationScope,
} from './service'
import { vendasOf } from '@/modules/vendas-rede/context'
import { sendTestNotification } from './test-samples'

/**
 * Notificações em tempo real.
 *
 *   /api/v1/t/:tenantSlug/notificacoes   → admin do clube (só o clube da rota)
 *   /api/v1/platform/notificacoes        → equipe Annetec (todos os clubes)
 *
 * Mesmas quatro rotas nos dois espaços:
 *   GET  /            últimas N + não lidas + cursor para abrir o stream
 *   GET  /stream      SSE (`event: notification`); fecha sozinho em ~25 s e o
 *                     EventSource reconecta com `Last-Event-ID` (cabe numa
 *                     função serverless: nada de conexão eterna)
 *   POST /lidas       `{ ids? }` — sem ids, todas
 *   POST /teste       `{ kind: 'payment' | 'signup' }` — só fora de produção
 *
 * Vendedor NÃO recebe: pagamento e cadastro são dado financeiro/comercial do
 * clube inteiro, e o painel do vendedor não tem tela de destino para eles.
 * A autenticação é a de sempre (Bearer): o navegador não fala com esta API
 * direto — o stream passa por um route handler do Next que lê o cookie
 * httpOnly e repassa o token no cabeçalho (nunca na URL).
 */

function tenantScope(c: Context<AppEnv>): NotificationScope {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { audience: 'tenant', organizationId: tenantOf(c).id, userId: session.user.id }
}

function platformScope(c: Context<AppEnv>): NotificationScope {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { audience: 'platform', organizationId: null, userId: session.user.id }
}

/** Vendedor ANNETEC: só as notificações destinadas a ELE. */
function sellerScope(c: Context<AppEnv>): NotificationScope {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { audience: 'seller', organizationId: null, userId: session.user.id }
}

function buildController(scopeOf: (c: Context<AppEnv>) => NotificationScope, options: { allowTest?: boolean } = {}) {
  const allowTest = options.allowTest ?? true
  const controller = new Hono<AppEnv>()
    .get('/', query(listNotificationsQuery), async c =>
      ok(c, await listNotifications(scopeOf(c), c.req.valid('query').limit, demoToolsAllowed)),
    )

    .get('/stream', async c => {
      const scope = scopeOf(c)
      const localBefore = Date.now()
      const dbNow = await notificationStoreDb.now()
      const dbClockOffsetMs = dbNow.getTime() - Math.round((localBefore + Date.now()) / 2)
      // `Last-Event-ID` (reconexão automática) vence o `?after=` da URL original.
      const start =
        parseStreamCursor(c.req.header('last-event-id'), dbNow) ?? parseStreamCursor(c.req.query('after'), dbNow) ?? dbNow

      const response = streamSSE(c, stream => runNotificationStream(stream, scope, start, { dbClockOffsetMs }).then(() => undefined))
      // `no-transform`: proxy/compressão não podem segurar os pedaços.
      response.headers.set('cache-control', 'no-cache, no-transform')
      response.headers.set('x-accel-buffering', 'no')
      return response
    })

    .post('/lidas', json(markNotificationsReadInput), async c => {
      const { ids } = c.req.valid('json')
      return ok(c, await markNotificationsRead(scopeOf(c), ids ?? null))
    })

    .post('/teste', json(sendTestNotificationInput), async c => {
      if (!demoToolsAllowed || !allowTest) throw AppError.notFound('Rota')
      const scope = scopeOf(c)
      return created(c, await sendTestNotification(scope.audience, scope.organizationId, c.req.valid('json')))
    })
  return controller
}

export const tenantNotificationsController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin'))
  .route('/', buildController(tenantScope))

export const platformNotificationsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())
  .route('/', buildController(platformScope))

/** `/api/v1/platform/vendas/notificacoes` — o sino do vendedor (sem rota de teste). */
export const sellerNotificationsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformSeller)
  .route('/', buildController(sellerScope, { allowTest: false }))

/** Agente da Rede Comercial: só as notificações `sales` endereçadas a ELE, no escopo da rota (clube ou plataforma). */
function salesScope(c: Context<AppEnv>): NotificationScope {
  const ctx = vendasOf(c)
  return { audience: 'sales', organizationId: ctx.tenantId, userId: ctx.userId }
}

/**
 * `/vendas/notificacoes` (platform) e `/t/:slug/vendas/notificacoes` (tenant), montado
 * dentro do `leadsController` da Rede Comercial: o `salesContext` do escopo já autenticou
 * e resolveu quem é a pessoa (sem rota de teste).
 */
export const salesNotificationsController = buildController(salesScope, { allowTest: false })
