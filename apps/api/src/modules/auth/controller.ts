import {
  changePasswordInput,
  clientPortalLoginInput,
  googleLoginInput,
  loginInput,
  loginMethodInput,
  registerInput,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { optionalAuth, requireAuth } from '@/http/middleware/auth'
import { created, noContent, ok } from '@/http/respond'
import type { AppEnv, AuthContext } from '@/http/types'
import { json } from '@/http/validate'
import { googleLoginEnabled } from '@/config/env'
import { auth } from '@/lib/auth'
import { activityService } from '@/modules/activity/service'
import { runInBackground } from '@/lib/background'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { recordAudit } from '@/lib/audit'
import { notifyClientSignup } from '@/lib/notifications'
import { sendOnboardingWelcome } from '@/modules/club-billing/onboarding.service'
import { authService } from './service'
import { presentSessionUser } from './presenter'

/**
 * Rotas de autenticação. Montadas em `/api/v1/auth`.
 *
 * O token sai no corpo (não em cookie desta API): quem guarda cookie é o
 * Next.js, no seu próprio domínio — ver apps/web/lib/api/session.ts. Esta API
 * só entende `Authorization: Bearer <token>` (plugin `bearer` do Better Auth).
 */
const MINUTE = 60_000

export const authController = new Hono<AppEnv>()

  // Limite por IP (o Next repassa o IP de quem digitou em `x-forwarded-for`).
  // Baldes separados: cada tentativa na tela do inquilino passa por /login/method
  // e depois por /login ou /login/portal.
  .post('/login', rateLimit({ key: 'auth:login', limit: 10, windowMs: MINUTE }), json(loginInput), async c => {
    const { token, session } = await authService.login(c.req.valid('json'))
    trackAuthAction(c, session, 'login')
    return ok(c, { token, user: await presentSessionUser(session) })
  })

  // Descoberta do método (senha ou CPF) da tela de login do inquilino. Pública,
  // como o próprio /login.
  .post(
    '/login/method',
    rateLimit({ key: 'auth:login-method', limit: 10, windowMs: MINUTE }),
    json(loginMethodInput),
    async c => ok(c, await authService.loginMethod(c.req.valid('json'))),
  )

  .post(
    '/login/portal',
    rateLimit({ key: 'auth:login-portal', limit: 10, windowMs: MINUTE }),
    json(clientPortalLoginInput),
    async c => {
      const { token, session } = await authService.loginClientPortal(c.req.valid('json'))
      trackAuthAction(c, session, 'login')
      return ok(c, { token, user: await presentSessionUser(session) })
    },
  )

  // Login com Google (ID token do Google Identity Services). Mesmo limite dos
  // outros logins, em balde próprio. Na tela de um clube, também cadastra o
  // associado (ver `authService.loginGoogle`). Como em todo login de associado,
  // `user.needsSubscription` diz à tela se ele ainda precisa assinar um plano.
  .post(
    '/login/google',
    rateLimit({ key: 'auth:login-google', limit: 10, windowMs: MINUTE }),
    json(googleLoginInput),
    async c => {
      const { token, session, onboarding } = await authService.loginGoogle(c.req.valid('json'))
      trackAuthAction(c, session, 'login')

      const joinedOrganizationId = onboarding.joinedOrganizationId
      if (joinedOrganizationId) {
        await recordAudit(c, {
          action: onboarding.accountCreated ? 'client.signed_up_with_google' : 'client.joined_with_google',
          resource: 'member',
          resourceId: session.user.id,
          organizationId: joinedOrganizationId,
          metadata: { userId: session.user.id, email: session.user.email, papel: 'client', contaCriada: onboarding.accountCreated },
        })
        // Associado novo NESTE clube (conta nova ou conta existente que entrou agora).
        await notifyClientSignup({
          organizationId: joinedOrganizationId,
          userId: session.user.id,
          via: 'google',
          personName: session.user.name,
        })
        // Boas-vindas (D0 da régua "assine seu plano") na hora — nunca atrasa o login.
        runInBackground(sendOnboardingWelcome(joinedOrganizationId, session.user.id), error =>
          logger.error({ err: error, tenantId: joinedOrganizationId }, 'Falha ao enviar boas-vindas do associado'),
        )
      }

      return ok(c, { token, user: await presentSessionUser(session) })
    },
  )

  // Pública: a tela de login pergunta, ao montar, se mostra o botão do Google.
  .get('/login/google/config', c => ok(c, { googleEnabled: googleLoginEnabled }))

  .post('/register', json(registerInput), async c => {
    const { token, session } = await authService.register(c.req.valid('json'))
    trackAuthAction(c, session, 'login')
    if (session.membership.tenantId) {
      await notifyClientSignup({
        organizationId: session.membership.tenantId,
        userId: session.user.id,
        via: 'password',
        personName: session.user.name,
      })
    }
    return created(c, { token, user: await presentSessionUser(session) })
  })

  // `optionalAuth`: sessão cujo vínculo foi cortado (401 no resto) ainda
  // consegue se encerrar.
  .post('/logout', optionalAuth, async c => {
    const session = c.get('auth')
    if (session) trackAuthAction(c, session, 'logout')
    const token = bearerToken(c.req.header('authorization'))
    if (token) await authService.logout(token)
    return noContent(c)
  })

  .get('/me', requireAuth, async c => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()
    return ok(c, await presentSessionUser(session))
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
