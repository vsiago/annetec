import {
  ERROR_CODES,
  changePasswordInput,
  clientPortalLoginInput,
  googleLoginInput,
  loginInput,
  loginMethodInput,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { optionalAuth, requireAuth } from '@/http/middleware/auth'
import { noContent, ok } from '@/http/respond'
import type { AppEnv, AuthContext } from '@/http/types'
import { json } from '@/http/validate'
import { googleLoginEnabled } from '@/config/env'
import { auth } from '@/lib/auth'
import { activityService } from '@/modules/activity/service'
import { runInBackground } from '@/lib/background'
import { rateLimit, requestIp } from '@/lib/rate-limit'
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
    const input = c.req.valid('json')
    const { token, session } = await auditFailedLogin(c, 'password', { email: input.email, tenantSlug: input.tenantSlug }, () =>
      authService.login(input),
    )
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
      const input = c.req.valid('json')
      const { token, session } = await auditFailedLogin(
        c,
        'portal',
        { email: input.email, tenantSlug: input.tenantSlug },
        () => authService.loginClientPortal(input),
      )
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
      const input = c.req.valid('json')
      const { token, session, onboarding } = await auditFailedLogin(c, 'google', { tenantSlug: input.tenantSlug }, () =>
        authService.loginGoogle(input),
      )
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

  // Sem `/register`: o autocadastro público por e-mail + senha (sem
  // verificação de e-mail) permitia criar conta com o e-mail de outra pessoa
  // antes dela. O associado entra pelo checkout do clube ou pelo Google.

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

  // Troca da própria senha: confere a senha atual, então é alvo de tentativa
  // e erro com uma sessão roubada — mesmo limite por IP dos logins.
  .post('/password', rateLimit({ key: 'auth:password', limit: 10, windowMs: 15 * MINUTE }), requireAuth, json(changePasswordInput), async c => {
    const token = bearerToken(c.req.header('authorization'))
    if (!token) throw AppError.unauthenticated()
    const { currentPassword, newPassword } = c.req.valid('json')
    await auth.api.changePassword({
      headers: c.req.raw.headers,
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    })
    return noContent(c)
  })

  .post('/password/forgot', rateLimit({ key: 'auth:password-forgot', limit: 5, windowMs: 15 * MINUTE }), json(z.object({ email: z.string().email() })), async c => {
    // O Better Auth só dispara o e-mail se `emailAndPassword.sendResetPassword`
    // estiver configurado (fora do escopo deste MVP); a rota já existe para
    // quando o envio de e-mail transacional for plugado.
    await auth.api.requestPasswordReset({ body: { email: c.req.valid('json').email } }).catch(() => null)
    return noContent(c)
  })

/** Erros que são "login recusado" (vale trilha); o resto (ERP fora, bug) segue só para o log. */
const FAILED_LOGIN_CODES = new Set<string>([ERROR_CODES.INVALID_CREDENTIALS, ERROR_CODES.ACCESS_UNAVAILABLE])

/**
 * Roda o login e, se ele for RECUSADO, grava `auth.login_failed` na trilha —
 * com o e-mail tentado, o método e o motivo (código do erro). Nunca a senha,
 * nem CPF, nem o token do Google. Relança o erro original.
 */
async function auditFailedLogin<T>(
  c: Context<AppEnv>,
  via: 'password' | 'portal' | 'google',
  attempt: { email?: string; tenantSlug?: string },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof AppError && FAILED_LOGIN_CODES.has(error.code)) {
      await recordAudit(c, {
        action: 'auth.login_failed',
        resource: 'auth',
        resourceId: null,
        metadata: {
          via,
          email: attempt.email ? attempt.email.trim().toLowerCase() : null,
          tenantSlug: attempt.tenantSlug ?? null,
          motivo: error.code,
          userAgent: c.req.header('user-agent') ?? null,
        },
      })
    }
    throw error
  }
}

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
        ip: requestIp(c),
        userAgent: c.req.header('user-agent') ?? null,
      },
    ),
    error => logger.error({ err: error }, 'Falha ao registrar atividade de autenticação'),
  )
}
