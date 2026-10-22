import { reissueClubChargeInput, retryPaymentInput } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requireClubSubscription, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { loadClubAccess } from './access.service'
import { chargesService } from './charges.service'
import { limitBody, remoteIpOf } from './http'
import { queriesService } from './queries.service'

/**
 * Área do associado — `/api/v1/t/:tenantSlug/cliente`. Tudo filtrado pelo
 * usuário da sessão: cobrança de outra pessoa responde 404. Antes de ler,
 * sincroniza as cobranças abertas (máx. 1×/3 s cada) para o Pix confirmar no
 * portal no mesmo tempo que no checkout.
 *
 * Sem assinatura (`none`) só `/acesso` responde; o resto é 403
 * `SUBSCRIPTION_REQUIRED` (o portal manda para o onboarding). Aguardando o
 * 1º pagamento, assinatura e faturas continuam abertas — é por elas que ele
 * conclui o pagamento.
 */

const idParam = z.object({ id: z.string().uuid() })

function userIdOf(c: Context<AppEnv>): string {
  const userId = c.get('auth')?.user.id
  if (!userId) throw AppError.unauthenticated()
  return userId
}

export const clubPortalController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('client'))

  .get('/assinatura', requireClubSubscription({ allowPending: true }), async c => {
    const tenantId = tenantOf(c).id
    const userId = userIdOf(c)
    await queriesService.syncOpenChargesOfUser(tenantId, userId)
    return ok(c, await queriesService.myMembership(tenantId, userId))
  })

  /** Situação do associado frente à assinatura: decide onboarding e bloqueios do portal. */
  .get('/acesso', async c => ok(c, await loadClubAccess(tenantOf(c).id, userIdOf(c))))

  .get('/cobrancas', requireClubSubscription({ allowPending: true }), async c => {
    const tenantId = tenantOf(c).id
    const userId = userIdOf(c)
    await queriesService.syncOpenChargesOfUser(tenantId, userId)
    return ok(c, await queriesService.myCharges(tenantId, userId))
  })

  .post('/cobrancas/:id/segunda-via', requireClubSubscription({ allowPending: true }), limitBody(8), param(idParam), json(reissueClubChargeInput), async c => {
    const charge = await queriesService.myCharge(tenantOf(c).id, userIdOf(c), c.req.valid('param').id)
    const updated = await chargesService.reissue(charge, c.req.valid('json'), { source: 'manual', actorUserId: userIdOf(c) })
    await recordAudit(c, {
      action: 'club_charge.reissued',
      resource: 'club_charge',
      resourceId: charge.id,
      metadata: { portal: true, vencimento: updated.dueDate, metodo: updated.method },
    })
    return ok(c, await queriesService.chargeDto(updated))
  })

  .post('/cobrancas/:id/pagar', requireClubSubscription({ allowPending: true }), limitBody(16), param(idParam), json(retryPaymentInput), async c => {
    const charge = await queriesService.myCharge(tenantOf(c).id, userIdOf(c), c.req.valid('param').id)
    const input = c.req.valid('json')
    const updated = await chargesService.pay(charge, input, {
      source: 'manual',
      remoteIp: remoteIpOf(c),
      actorUserId: userIdOf(c),
    })
    await recordAudit(c, {
      action: 'club_charge.paid_by_member',
      resource: 'club_charge',
      resourceId: charge.id,
      metadata: { metodo: input.method, status: updated.status },
    })
    return ok(c, await queriesService.chargeDto(updated))
  })
