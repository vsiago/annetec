import { ERROR_CODES, checkoutInput, retryPaymentInput, uuid } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { AppError } from '@/http/errors'
import { optionalAuth } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { isValidCheckoutAccessKey } from './access-key'
import { checkoutService } from './checkout.service'
import { limitBody, remoteIpOf } from './http'

/**
 * Checkout público do clube — `/api/v1/t/:tenantSlug/public/checkout`, sem
 * sessão. As rotas por assinatura exigem `?chave=` (HMAC do id, devolvido no
 * `POST /`); chave ausente/errada responde 404 como se a assinatura não existisse.
 */

/** Valida `:subscriptionId` + `?chave=`; qualquer falha → 404. */
function guardedSubscriptionId(c: Context<AppEnv>): string {
  const subscriptionId = c.req.param('subscriptionId') ?? ''
  if (!uuid.safeParse(subscriptionId).success) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  if (!isValidCheckoutAccessKey(subscriptionId, c.req.query('chave'))) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  return subscriptionId
}

export const clubCheckoutController = new Hono<AppEnv>()
  .use('*', resolveTenant)

  /** Planos ativos (com dependentes), meios habilitados, gateway e regras da simulação. */
  .get('/contexto', async c => ok(c, await checkoutService.context(tenantOf(c))))

  // Sessão opcional: associado logado NESTE clube compra com a própria conta
  // (e-mail travado no da sessão). Qualquer outra sessão é ignorada.
  .post('/', limitBody(64), optionalAuth, json(checkoutInput), async c => {
    const tenant = tenantOf(c)
    const session = c.get('auth')
    const viewer =
      session &&
      session.membership.scope === 'tenant' &&
      session.membership.tenantRole === 'client' &&
      session.membership.tenantId === tenant.id
        ? { userId: session.user.id, email: session.user.email }
        : null
    const result = await checkoutService.checkout(tenant, c.req.valid('json'), remoteIpOf(c), viewer)
    await recordAudit(c, {
      action: 'club_subscription.checkout',
      resource: 'club_subscription',
      resourceId: result.subscriptionId,
      metadata: {
        plano: result.planName,
        metodo: result.paymentMethod,
        status: result.status,
        cobranca: result.charge.status,
        contaCriada: result.accountCreated,
        associadoLogado: viewer !== null,
      },
    })
    return created(c, result)
  })

  .get('/:subscriptionId', async c => ok(c, await checkoutService.status(tenantOf(c), guardedSubscriptionId(c))))

  .post('/:subscriptionId/pagamento', limitBody(16), json(retryPaymentInput), async c => {
    const subscriptionId = guardedSubscriptionId(c)
    const status = await checkoutService.retry(tenantOf(c), subscriptionId, c.req.valid('json'), remoteIpOf(c))
    await recordAudit(c, {
      action: 'club_subscription.payment_retried',
      resource: 'club_subscription',
      resourceId: subscriptionId,
      metadata: { metodo: c.req.valid('json').method, cobranca: status.charge.status },
    })
    return ok(c, status)
  })

  .post('/:subscriptionId/simular-pagamento', async c =>
    ok(c, await checkoutService.simulate(tenantOf(c), guardedSubscriptionId(c))),
  )

  .get('/:subscriptionId/cobrancas/:chargeId', async c => {
    const subscriptionId = guardedSubscriptionId(c)
    const chargeId = c.req.param('chargeId')
    if (!uuid.safeParse(chargeId).success) throw AppError.notFound('Boleto')
    return ok(c, await checkoutService.boletoView(tenantOf(c), subscriptionId, chargeId))
  })
