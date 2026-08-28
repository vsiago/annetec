import { listVisitorsQuery, trackEventInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { optionalAuth, requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { activityService } from './service'

/**
 * Ingestão de eventos — montada em `/api/v1/activity`, sem exigir sessão
 * (`optionalAuth`): tem que aceitar visitante anônimo (alguém navegando
 * antes de logar) além de usuário autenticado. Quem chama nunca declara
 * quem é — isso vem da própria sessão, quando existe.
 */
export const activityIngestController = new Hono<AppEnv>()
  .use('*', optionalAuth)
  .post('/events', json(trackEventInput), async c => {
    const input = c.req.valid('json')
    const auth = c.get('auth')
    const membership = auth?.membership

    await activityService.record(
      input,
      {
        userId: auth?.user.id ?? null,
        name: auth?.user.name ?? null,
        scope: membership?.scope ?? null,
        role: membership?.scope === 'platform' ? membership.platformRole : (membership?.tenantRole ?? null),
        tenantId: membership?.tenantId ?? null,
        tenantSlug: membership?.tenantSlug ?? null,
      },
      {
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
      },
    )

    return ok(c, { recorded: true })
  })

/**
 * Leitura — exclusiva da equipe Annetec (`/admin/logs`). Montada em
 * `/api/v1/platform/activity`.
 */
export const activityAdminController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/overview', async c => ok(c, await activityService.overview()))

  .get('/visitors', query(listVisitorsQuery), async c =>
    ok(c, await activityService.listVisitors(c.req.valid('query').q)),
  )
