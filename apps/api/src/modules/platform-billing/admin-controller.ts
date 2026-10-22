import {
  cancelPlatformChargeInput,
  cancelPlatformSubscriptionInput,
  changePlatformPlanInput,
  demoTimeTravelInput,
  listPlatformBillingEventsQuery,
  listPlatformChargesQuery,
  listPlatformSubscriptionsQuery,
  platformManualPaymentInput,
  reissuePlatformChargeInput,
  updatePlatformBillingSettingsInput,
  updateTenantPlanPricingInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { demoToolsAllowed } from '@/config/env'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { invalidateHoldingCache } from '@/modules/holding/cache'
import { runPlatformAutomation } from './automation.service'
import { platformChargesService } from './charges.service'
import { listPlatformCharges, listPlatformEvents, platformChargeDetail } from './console.service'
import { actorOf, idParam, optionalJson, qLimit } from './http'
import { listPlanOffers, updatePlanPricing } from './pricing.service'
import { loadPlatformCharge } from './queries'
import { loadPlatformSettings, toPlatformSettingsDto, updatePlatformSettings } from './settings.service'
import {
  cancelPlatformSubscription,
  changePlatformPlan,
  demoTimeTravel,
  listSubscriptions,
  reactivatePlatformSubscription,
  subscriptionDetail,
} from './subscriptions.service'
import { getPlatformBillingSummary } from './summary.service'

/**
 * Console da cobrança ANNETEC → inquilinos — `/api/v1/platform/billing`.
 * Equipe da plataforma (qualquer papel) lê e opera; cancelar assinatura,
 * régua, preços e "avançar dias" são só do superadmin. Toda mudança vai para
 * a auditoria.
 */

const planIdParam = z.object({ planId: z.string().trim().min(1).max(100) })
const superadmin = requirePlatformRole('superadmin')

export const platformBillingController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/resumo', async c => ok(c, await getPlatformBillingSummary()))

  // ---- Assinaturas ---------------------------------------------------------
  .get('/assinaturas', query(listPlatformSubscriptionsQuery.extend(qLimit)), async c => {
    const { items, meta } = await listSubscriptions(c.req.valid('query'))
    return ok(c, items, meta)
  })

  .get('/assinaturas/:id', param(idParam), async c => ok(c, await subscriptionDetail(c.req.valid('param').id)))

  .post('/assinaturas/:id/plano', param(idParam), json(changePlatformPlanInput), async c => {
    const { id } = c.req.valid('param')
    const { planId } = c.req.valid('json')
    await changePlatformPlan(id, planId, { source: 'manual', actorUserId: actorOf(c) })
    const detail = await subscriptionDetail(id)
    await recordAudit(c, {
      action: 'platform_subscription.plan_changed',
      resource: 'platform_subscription',
      resourceId: id,
      organizationId: detail.organizationId,
      metadata: { planId, plano: detail.planName, agendado: detail.scheduledPlanName },
    })
    return ok(c, detail)
  })

  .post('/assinaturas/:id/reativar', param(idParam), async c => {
    const { id } = c.req.valid('param')
    await reactivatePlatformSubscription(id, actorOf(c))
    const detail = await subscriptionDetail(id)
    await recordAudit(c, {
      action: 'platform_subscription.reactivated',
      resource: 'platform_subscription',
      resourceId: id,
      organizationId: detail.organizationId,
    })
    return ok(c, detail)
  })

  .post('/assinaturas/:id/cancelar', superadmin, param(idParam), json(cancelPlatformSubscriptionInput), async c => {
    const { id } = c.req.valid('param')
    const { reason } = c.req.valid('json')
    await cancelPlatformSubscription(id, reason, actorOf(c))
    const detail = await subscriptionDetail(id)
    await recordAudit(c, {
      action: 'platform_subscription.canceled',
      resource: 'platform_subscription',
      resourceId: id,
      organizationId: detail.organizationId,
      metadata: { motivo: reason },
    })
    return ok(c, detail)
  })

  // ---- Faturas -------------------------------------------------------------
  .get('/faturas', query(listPlatformChargesQuery.extend(qLimit)), async c => {
    const { items, meta } = await listPlatformCharges(c.req.valid('query'))
    return ok(c, items, meta)
  })

  .get('/faturas/:id', param(idParam), async c => ok(c, await platformChargeDetail(c.req.valid('param').id)))

  .post('/faturas/:id/segunda-via', param(idParam), async c => {
    const input = await optionalJson(c, reissuePlatformChargeInput)
    const charge = await loadPlatformCharge(c.req.valid('param').id)
    const updated = await platformChargesService.reissue(charge, input, { source: 'manual', actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'platform_charge.reissued',
      resource: 'platform_charge',
      resourceId: charge.id,
      organizationId: charge.organizationId,
      metadata: { vencimento: updated.dueDate, metodo: updated.method },
    })
    return ok(c, await platformChargeDetail(updated))
  })

  .post('/faturas/:id/baixa-manual', param(idParam), async c => {
    const input = await optionalJson(c, platformManualPaymentInput)
    const charge = await loadPlatformCharge(c.req.valid('param').id)
    const updated = await platformChargesService.manualPayment(charge, input, actorOf(c))
    await recordAudit(c, {
      action: 'platform_charge.manual_payment',
      resource: 'platform_charge',
      resourceId: charge.id,
      organizationId: charge.organizationId,
      metadata: { valor: input.amount ?? Number(charge.amount), pagoEm: input.paidAt ?? null },
    })
    return ok(c, await platformChargeDetail(updated))
  })

  .post('/faturas/:id/cancelar', param(idParam), async c => {
    const input = await optionalJson(c, cancelPlatformChargeInput)
    const charge = await loadPlatformCharge(c.req.valid('param').id)
    const updated = await platformChargesService.cancel(charge, input, { source: 'manual', actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'platform_charge.canceled',
      resource: 'platform_charge',
      resourceId: charge.id,
      organizationId: charge.organizationId,
      metadata: { motivo: input.reason ?? null },
    })
    return ok(c, await platformChargeDetail(updated))
  })

  // Só superadmin, e o serviço recusa em produção (`canSimulatePlatformCharge`).
  .post('/faturas/:id/simular-pagamento', superadmin, param(idParam), async c => {
    const charge = await loadPlatformCharge(c.req.valid('param').id)
    const updated = await platformChargesService.simulate(charge, actorOf(c))
    await recordAudit(c, {
      action: 'platform_charge.simulated_payment',
      resource: 'platform_charge',
      resourceId: charge.id,
      organizationId: charge.organizationId,
      metadata: { gateway: charge.gatewayProvider, metodo: charge.method, status: updated.status },
    })
    return ok(c, await platformChargeDetail(updated))
  })

  // ---- Eventos, régua, automação e preços -----------------------------------
  .get('/eventos', query(listPlatformBillingEventsQuery.extend(qLimit)), async c => {
    const { items, meta } = await listPlatformEvents(c.req.valid('query'))
    return ok(c, items, meta)
  })

  .get('/configuracoes', async c => ok(c, toPlatformSettingsDto(await loadPlatformSettings())))

  .patch('/configuracoes', superadmin, json(updatePlatformBillingSettingsInput), async c => {
    const input = c.req.valid('json')
    const settings = await updatePlatformSettings(input)
    await recordAudit(c, {
      action: 'platform_billing.settings_updated',
      resource: 'platform_billing_settings',
      resourceId: 'default',
      organizationId: null,
      metadata: { campos: Object.keys(input) },
    })
    return ok(c, settings)
  })

  .post('/automacao/executar', async c => {
    const report = await runPlatformAutomation(new Date(), { throwIfBusy: true })
    await recordAudit(c, {
      action: 'platform_billing.automation_run',
      resource: 'platform_billing_settings',
      resourceId: 'default',
      organizationId: null,
      metadata: { gerou: report.generated, venceu: report.markedOverdue, erros: report.errors.length },
    })
    return ok(c, report)
  })

  .get('/precos', async c => ok(c, await listPlanOffers()))

  .put('/precos/:planId', superadmin, param(planIdParam), json(updateTenantPlanPricingInput), async c => {
    const { planId } = c.req.valid('param')
    const input = c.req.valid('json')
    const offer = await updatePlanPricing(planId, input)
    invalidateHoldingCache()
    await recordAudit(c, {
      action: 'tenant_plan.pricing_updated',
      resource: 'tenant_plan',
      resourceId: planId,
      organizationId: null,
      metadata: { campos: Object.keys(input) },
    })
    return ok(c, offer)
  })

/**
 * "Avançar N dias" (demonstração): a rota nem existe em produção
 * (`demoToolsAllowed`). Registrada depois da cadeia — o `use('*', …)` lá do
 * topo continua valendo para ela.
 */
if (demoToolsAllowed) {
  platformBillingController.post(
    '/assinaturas/:id/demo/avancar-dias',
    superadmin,
    param(idParam),
    json(demoTimeTravelInput),
    async c => {
      const { id } = c.req.valid('param')
      const { days } = c.req.valid('json')
      const report = await demoTimeTravel(id, days, actorOf(c))
      const detail = await subscriptionDetail(id)
      await recordAudit(c, {
        action: 'platform_subscription.demo_time_travel',
        resource: 'platform_subscription',
        resourceId: id,
        organizationId: detail.organizationId,
        metadata: { dias: days, status: detail.status, gerou: report.generated, erros: report.errors.length },
      })
      return ok(c, detail)
    },
  )
}
