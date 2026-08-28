import { changePasswordInput, clientPortalLoginInput, loginInput, registerInput } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth } from '@/http/middleware/auth'
import { created, noContent, ok } from '@/http/respond'
import type { AppEnv, AuthContext } from '@/http/types'
import { json } from '@/http/validate'
import { auth } from '@/lib/auth'
import { activityService } from '@/modules/activity/service'
import { runInBackground } from '@/lib/background'
import { logger } from '@/lib/logger'
import { authService } from './service'
import { toSessionUser } from './presenter'

/**
 * Rotas de autenticação. Montadas em `/api/v1/auth`.
 *
 * O token sai no corpo (não em cookie desta API): quem guarda cookie é o
 * Next.js, no seu próprio domínio — ver apps/web/lib/api/session.ts. Esta API
 * só entende `Authorization: Bearer <token>` (plugin `bearer` do Better Auth).
 */
export const authController = new Hono<AppEnv>()

  .post('/login', json(loginInput), async c => {
    const { token, session } = await authService.login(c.req.valid('json'))
    trackAuthAction(c, session, 'login')
    return ok(c, { token, user: toSessionUser(session) })
  })

  .post('/login/portal', json(clientPortalLoginInput), async c => {
    const { token, session } = await authService.loginClientPortal(c.req.valid('json'))
    trackAuthAction(c, session, 'login')
    return ok(c, { token, user: toSessionUser(session) })
  })

  .post('/register', json(registerInput), async c => {
    const { token, session } = await authService.register(c.req.valid('json'))
    trackAuthAction(c, session, 'login')
    return created(c, { token, user: toSessionUser(session) })
  })

  .post('/logout', requireAuth, async c => {
    const session = c.get('auth')
    if (session) trackAuthAction(c, session, 'logout')
    const token = bearerToken(c.req.header('authorization'))
    if (token) await authService.logout(token)
    return noContent(c)
  })

  .get('/me', requireAuth, async c => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()
    return ok(c, toSessionUser(session))
  })

  .post('/password', requireAuth, json(changePasswordInput), async c => {
    const token = bearerToken(c.req.header('authorization'))
    if (!token) throw AppError.unauthenticated()
    const { currentPassword, newPassword } = c.req.valid('json')
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    })
    return noContent(c)
  })

  .post('/password/forgot', json(z.object({ email: z.string().email() })), async c => {
    // O Better Auth só dispara o e-mail se `emailAndPassword.sendResetPassword`
    // estiver configurado (fora do escopo deste MVP); a rota já existe para
    // quando o envio de e-mail transacional for plugado.
    await auth.api.requestPasswordReset({ body: { email: c.req.valid('json').email } }).catch(() => null)
    return noContent(c)
  })

function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

/** Registra login/logout na rastreabilidade — nunca atrasa nem derruba a resposta real. */
function trackAuthAction(c: Context<AppEnv>, session: AuthContext, action: 'login' | 'logout') {
  const membership = session.membership
  runInBackground(
    activityService.record(
      { kind: 'action', path: `/api/v1/auth/${action}`, action },
      {
        userId: session.user.id,
        name: session.user.name,
        scope: membership.scope,
        role: membership.scope === 'platform' ? membership.platformRole : membership.tenantRole,
        tenantId: membership.tenantId,
        tenantSlug: membership.tenantSlug,
      },
      {
        ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
      },
    ),
    error => logger.error({ err: error }, 'Falha ao registrar atividade de autenticação'),
  )
}
