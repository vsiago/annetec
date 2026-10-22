import { changePlatformPlanInput, paginationQuery, payPlatformChargeInput, reissuePlatformChargeInput } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { limitBody, remoteIpOf } from '@/modules/club-billing/http'
import { platformChargesService } from './charges.service'
import { listPlatformCharges, platformChargeDetail } from './console.service'
import { actorOf, optionalJson } from './http'
import { toPlatformCharge, type PlatformChargeRow } from './presenter'
import { buildPublicInvoice, freshPlatformInvoiceCharge } from './public-controller'
import { findSubscriptionByOrg, loadPlatformCharge, tenantRefOf } from './queries'
import { changePlatformPlan, mySubscription, tenantAccess } from './subscriptions.service'

/**
 * "Minha assinatura ANNETEC" — `/api/v1/t/:tenantSlug/assinatura-annetec`.
 * Fica FORA do guard de restrição (é daqui que o inquilino bloqueado
 * regulariza). Admin do inquilino (equipe da plataforma passa); `/acesso`
 * também para o vendedor (banner do painel).
 */

const chargeParam = z.object({ chargeId: z.string().uuid() })
const admin = requireTenantRole('admin')

/** Fatura do PRÓPRIO inquilino (outra → 404, como se não existisse). */
async function ownCharge(c: Context<AppEnv>): Promise<PlatformChargeRow> {
  const chargeId = c.req.param('chargeId') ?? ''
  const charge = await loadPlatformCharge(chargeId).catch(() => null)
  if (!charge || charge.organizationId !== tenantOf(c).id) throw AppError.notFound('Fatura')
  return charge
}

export const tenantPlatformSubscriptionController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth)

  .get('/', admin, async c => ok(c, await mySubscription(tenantOf(c).id)))

  .get('/acesso', requireTenantRole('admin', 'seller'), async c => ok(c, await tenantAccess(tenantOf(c).id)))

  .get('/faturas', admin, query(paginationQuery.extend({ q: z.string().trim().min(1).max(100).optional() })), async c => {
    const { items, meta } = await listPlatformCharges(c.req.valid('query'), { organizationId: tenantOf(c).id })
    return ok(c, items, meta)
  })

  .get('/faturas/:chargeId', admin, param(chargeParam), async c =>
    ok(c, await platformChargeDetail(c.req.valid('param').chargeId, { organizationId: tenantOf(c).id })),
  )

  // Pagamento DENTRO do painel (`/{slug}/admin/assinatura/faturas/<id>`): o
  // mesmo DTO e o mesmo fluxo da fatura pública, autenticado pela sessão do
  // admin em vez da chave — nenhuma chave de fatura sai daqui além da própria.
  .get('/faturas/:chargeId/pagamento', admin, param(chargeParam), async c => {
    const charge = await ownCharge(c)
    return ok(c, await buildPublicInvoice(await freshPlatformInvoiceCharge(charge, 'tenant')))
  })

  .post('/faturas/:chargeId/pagar', admin, param(chargeParam), limitBody(16), json(payPlatformChargeInput), async c => {
    const charge = await ownCharge(c)
    const input = c.req.valid('json')
    const updated = await platformChargesService.pay(charge, input, { source: 'tenant', remoteIp: remoteIpOf(c), actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'platform_charge.payment_started',
      resource: 'platform_charge',
      resourceId: charge.id,
      // Só o método e o resultado — nunca dado de cartão.
      metadata: { metodo: input.method, status: updated.status },
    })
    return ok(c, await buildPublicInvoice(updated))
  })

  .post('/faturas/:chargeId/simular', admin, param(chargeParam), async c => {
    const charge = await ownCharge(c)
    const updated = await platformChargesService.simulate(charge, actorOf(c))
    return ok(c, await buildPublicInvoice(updated))
  })

  .post('/faturas/:chargeId/segunda-via', admin, param(chargeParam), async c => {
    const tenant = tenantOf(c)
    const input = await optionalJson(c, reissuePlatformChargeInput)
    const charge = await loadPlatformCharge(c.req.valid('param').chargeId).catch(() => null)
    if (!charge || charge.organizationId !== tenant.id) throw AppError.notFound('Fatura')
    const updated = await platformChargesService.reissue(charge, input, { source: 'tenant', actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'platform_charge.reissued',
      resource: 'platform_charge',
      resourceId: charge.id,
      metadata: { vencimento: updated.dueDate, metodo: updated.method },
    })
    return ok(c, toPlatformCharge(updated, await tenantRefOf(tenant.id)))
  })

  .post('/plano', admin, json(changePlatformPlanInput), async c => {
    const tenant = tenantOf(c)
    const sub = await findSubscriptionByOrg(tenant.id)
    if (!sub) throw AppError.businessRule('Este inquilino tem contrato fora da cobrança automática: fale com a operadora para trocar de plano')
    const { planId } = c.req.valid('json')
    await changePlatformPlan(sub.id, planId, { source: 'tenant', actorUserId: actorOf(c), requireFullAccess: true })
    const result = await mySubscription(tenant.id)
    await recordAudit(c, {
      action: 'platform_subscription.plan_changed',
      resource: 'platform_subscription',
      resourceId: sub.id,
      metadata: { planId, plano: result.subscription?.planName ?? null, agendado: result.subscription?.scheduledPlanName ?? null },
    })
    return ok(c, result)
  })
