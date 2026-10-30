import {
  cancelClubChargeInput,
  cancelClubSubscriptionInput,
  connectClubReceivingAccountInput,
  createManualClubChargeInput,
  listClubChargesQuery,
  listClubReceiptsQuery,
  listClubSubscriptionsQuery,
  listPaymentEventsQuery,
  manualPaymentInput,
  reissueClubChargeInput,
  requestManagedAccountInput,
  updateBillingSettingsInput,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z, type ZodTypeAny } from 'zod'
import { AppError, zodIssues } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit, requestIp } from '@/lib/rate-limit'
import { listDebitsOf } from '@/modules/managed-account/queries'
import { managedAccountService } from '@/modules/managed-account/service'
import { runForTenant } from './automation.service'
import { chargesService, findChargeOfTenant } from './charges.service'
import { limitBody } from './http'
import { manualChargesService } from './manual-charges.service'
import { planStatsService } from './plan-stats.service'
import { queriesService } from './queries.service'
import { receiptsService } from './receipts.service'
import { receivingAccountService } from './receiving-account.service'
import { settingsService } from './settings.service'
import { subscriptionsService } from './subscriptions.service'
import { summaryService } from './summary.service'

/**
 * Faturamento e Cadastros do painel do inquilino —
 * `/api/v1/t/:tenantSlug/faturamento`, só admin (equipe Annetec passa pelo
 * `requireTenantRole` para suporte). Toda ação que muda estado vai para a
 * auditoria.
 */

const idParam = z.object({ id: z.string().uuid() })
/** `q` com teto de tamanho (o `paginationQuery` do contracts não limita). */
const q = { q: z.string().trim().min(1).max(100).optional() }

/** Corpo JSON opcional: vazio vale `{}` (ações cujo input é todo opcional). */
async function optionalJson<T extends ZodTypeAny>(c: Context<AppEnv>, schema: T): Promise<z.output<T>> {
  const text = await c.req.text()
  let raw: unknown = {}
  if (text.trim()) {
    try {
      raw = JSON.parse(text)
    } catch {
      throw AppError.validation([{ path: '(raiz)', message: 'JSON inválido' }])
    }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
  return parsed.data
}

function actorOf(c: Context<AppEnv>): string | null {
  return c.get('auth')?.user.id ?? null
}

/** Conectar/testar/desconectar o recebimento: 10 por hora POR CLUBE (cada um chama o Asaas). */
const receivingRateLimit = rateLimit({
  key: 'clube:recebimento',
  limit: 10,
  windowMs: 60 * 60 * 1000,
  keyOf: c => c.get('tenant')?.id ?? null,
})

/** Conta gerenciada (pedido, atualizar status): 30 por hora POR CLUBE. */
const managedRateLimit = rateLimit({
  key: 'clube:conta-gerenciada',
  limit: 30,
  windowMs: 60 * 60 * 1000,
  keyOf: c => c.get('tenant')?.id ?? null,
})

export const clubBillingAdminController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin'))

  .get('/resumo', async c => ok(c, await summaryService.get(tenantOf(c).id)))

  // Pessoas e receita por plano (aba Produtos e Planos). A lista de pessoas de
  // um plano é `GET /assinaturas?planId=&status=&q=`.
  .get('/planos/estatisticas', async c => ok(c, await planStatsService.report(tenantOf(c).id)))

  // ---- Cobranças ---------------------------------------------------------
  .get('/cobrancas', query(listClubChargesQuery.extend(q)), async c => {
    const { items, meta } = await queriesService.listCharges(tenantOf(c).id, c.req.valid('query'))
    return ok(c, items, meta)
  })

  // Financeiro → Recebimento: pagamentos e estornos por data do pagamento.
  .get('/recebimentos', query(listClubReceiptsQuery), async c =>
    ok(c, await receiptsService.list(tenantOf(c).id, c.req.valid('query'))),
  )

  .get('/cobrancas/:id', param(idParam), async c =>
    ok(c, await queriesService.chargeDetail(tenantOf(c).id, c.req.valid('param').id)),
  )

  .post('/cobrancas/:id/segunda-via', limitBody(8), param(idParam), async c => {
    const input = await optionalJson(c, reissueClubChargeInput)
    const charge = await findChargeOfTenant(tenantOf(c).id, c.req.valid('param').id)
    const updated = await chargesService.reissue(charge, input, { source: 'manual', actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'club_charge.reissued',
      resource: 'club_charge',
      resourceId: charge.id,
      metadata: { vencimento: updated.dueDate, metodo: updated.method },
    })
    return ok(c, await queriesService.chargeDto(updated))
  })

  .post('/cobrancas/:id/baixa-manual', limitBody(8), param(idParam), async c => {
    const input = await optionalJson(c, manualPaymentInput)
    const charge = await findChargeOfTenant(tenantOf(c).id, c.req.valid('param').id)
    const updated = await chargesService.manualPayment(charge, input, actorOf(c))
    await recordAudit(c, {
      action: 'club_charge.manual_payment',
      resource: 'club_charge',
      resourceId: charge.id,
      metadata: { valor: input.amount ?? Number(charge.amount), pagoEm: input.paidAt ?? null },
    })
    return ok(c, await queriesService.chargeDto(updated))
  })

  .post('/cobrancas/:id/cancelar', limitBody(8), param(idParam), async c => {
    const input = await optionalJson(c, cancelClubChargeInput)
    const charge = await findChargeOfTenant(tenantOf(c).id, c.req.valid('param').id)
    const updated = await chargesService.cancel(charge, input.reason, { source: 'manual', actorUserId: actorOf(c) })
    await recordAudit(c, {
      action: 'club_charge.canceled',
      resource: 'club_charge',
      resourceId: charge.id,
      metadata: { motivo: input.reason ?? null },
    })
    return ok(c, await queriesService.chargeDto(updated))
  })

  .post('/cobrancas/:id/simular-pagamento', param(idParam), async c => {
    const charge = await findChargeOfTenant(tenantOf(c).id, c.req.valid('param').id)
    const updated = await chargesService.simulate(charge)
    await recordAudit(c, { action: 'club_charge.payment_simulated', resource: 'club_charge', resourceId: charge.id })
    return ok(c, await queriesService.chargeDto(updated))
  })

  // ---- Assinaturas (Cadastros) -------------------------------------------
  .get('/assinaturas', query(listClubSubscriptionsQuery.extend(q)), async c => {
    const { items, meta } = await subscriptionsService.list(tenantOf(c).id, c.req.valid('query'))
    return ok(c, items, meta)
  })

  .get('/assinaturas/:id', param(idParam), async c =>
    ok(c, await subscriptionsService.detail(tenantOf(c).id, c.req.valid('param').id)),
  )

  .post('/assinaturas/:id/cancelar', limitBody(8), param(idParam), json(cancelClubSubscriptionInput), async c => {
    const { id } = c.req.valid('param')
    const { reason } = c.req.valid('json')
    const detail = await subscriptionsService.cancel(tenantOf(c).id, id, reason, actorOf(c))
    await recordAudit(c, {
      action: 'club_subscription.canceled',
      resource: 'club_subscription',
      resourceId: id,
      metadata: { motivo: reason },
    })
    return ok(c, detail)
  })

  // "Gerar cobrança": adiantar a próxima mensalidade ou lançar uma avulsa.
  .get('/assinaturas/:id/cobrancas/previa', param(idParam), async c =>
    ok(c, await manualChargesService.preview(tenantOf(c).id, c.req.valid('param').id)),
  )

  .post('/assinaturas/:id/cobrancas', limitBody(8), param(idParam), json(createManualClubChargeInput), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const result = await manualChargesService.create(tenantOf(c).id, id, input, { actorUserId: actorOf(c) })
    if (!result.reused) {
      await recordAudit(c, {
        action: 'club_charge.created_by_admin',
        resource: 'club_charge',
        resourceId: result.charge.id,
        metadata: {
          assinatura: id,
          tipo: input.type === 'advance' ? 'adiantamento' : 'avulsa',
          valor: result.charge.amount,
          metodo: input.method,
          cobradoNoCartao: input.method === 'credit_card' && input.chargeSavedCard,
          resultado: result.outcome,
          ...(input.type === 'one_off' ? { descricao: input.description, vencimento: input.dueDate } : {}),
        },
      })
    }
    return result.reused ? ok(c, result) : created(c, result)
  })

  .post('/assinaturas/:id/reativar', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const detail = await subscriptionsService.reactivate(tenantOf(c).id, id, actorOf(c))
    await recordAudit(c, {
      action: 'club_subscription.reactivated',
      resource: 'club_subscription',
      resourceId: id,
      metadata: { status: detail.status },
    })
    return ok(c, detail)
  })

  // ---- Régua / configurações ----------------------------------------------
  .get('/configuracoes', async c => ok(c, await settingsService.get(tenantOf(c).id)))

  .patch('/configuracoes', limitBody(8), json(updateBillingSettingsInput), async c => {
    const input = c.req.valid('json')
    const settings = await settingsService.update(tenantOf(c).id, input)
    await recordAudit(c, {
      action: 'billing_settings.updated',
      resource: 'billing_settings',
      resourceId: tenantOf(c).id,
      metadata: { campos: Object.keys(input) },
    })
    return ok(c, settings)
  })

  // ---- Recebimento: conta Asaas PRÓPRIA do clube ---------------------------
  // Admin do clube (ou superadmin, para suporte — `requireTenantRole`). A chave
  // nunca volta nem vai para a auditoria (só ambiente e 4 últimos caracteres).
  .get('/configuracoes/recebimento', async c => ok(c, await receivingAccountService.status(tenantOf(c).id)))

  .put('/configuracoes/recebimento', receivingRateLimit, limitBody(4), json(connectClubReceivingAccountInput), async c => {
    const result = await receivingAccountService.connect(tenantOf(c).id, c.req.valid('json'), { userId: actorOf(c) })
    await recordAudit(c, {
      action: result.replaced ? 'club_receiving_account.key_replaced' : 'club_receiving_account.connected',
      resource: 'club_receiving_account',
      resourceId: tenantOf(c).id,
      metadata: {
        ambiente: result.account.env,
        finalChave: result.account.keyHint,
        conta: result.account.accountName,
        trocaDeConta: result.accountChanged,
        webhook: result.account.webhookStatus,
      },
    })
    return ok(c, result.account)
  })

  .post('/configuracoes/recebimento/testar', receivingRateLimit, async c => {
    const account = await receivingAccountService.test(tenantOf(c).id)
    await recordAudit(c, {
      action: 'club_receiving_account.tested',
      resource: 'club_receiving_account',
      resourceId: tenantOf(c).id,
      metadata: { ambiente: account.env, webhook: account.webhookStatus, aprovada: account.accountStatus?.approved ?? null },
    })
    return ok(c, account)
  })

  .delete('/configuracoes/recebimento', receivingRateLimit, async c => {
    // Conta gerenciada pela ANNETEC: só o superadmin desconecta (o admin do clube recebe 403).
    const membership = c.get('auth')?.membership
    const allowManaged = membership?.scope === 'platform' && membership.platformRole === 'superadmin'
    const { account, removed, managed } = await receivingAccountService.disconnect(tenantOf(c).id, { allowManaged })
    if (removed) {
      await recordAudit(c, {
        action: managed ? 'managed_account.disconnected' : 'club_receiving_account.disconnected',
        resource: managed ? 'managed_account' : 'club_receiving_account',
        resourceId: tenantOf(c).id,
      })
    }
    return ok(c, account)
  })

  // ---- Conta gerenciada pela ANNETEC (subconta Asaas do clube) -------------
  .get('/configuracoes/recebimento/gerenciada', async c => ok(c, await managedAccountService.clubStatus(tenantOf(c).id)))

  // Pedido + aceite do termo: só o ADMIN DO CLUBE (o aceite é do clube; a equipe ANNETEC não pede por ele).
  .post('/configuracoes/recebimento/gerenciada', managedRateLimit, limitBody(8), json(requestManagedAccountInput), async c => {
    const session = c.get('auth')
    if (!session || session.membership.scope !== 'tenant') {
      throw AppError.forbidden('O pedido e o aceite do termo são feitos pelo administrador do clube.')
    }
    const status = await managedAccountService.submitRequest(tenantOf(c).id, c.req.valid('json'), {
      userId: session.user.id,
      userName: session.user.name ?? null,
      ip: requestIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    })
    await recordAudit(c, {
      action: 'managed_account.requested',
      resource: 'managed_account',
      resourceId: status.request?.id ?? tenantOf(c).id,
      metadata: { termo: status.request?.terms.version ?? null, natureza: status.request?.companyType ?? null },
    })
    return created(c, status)
  })

  .post('/configuracoes/recebimento/gerenciada/atualizar-status', managedRateLimit, async c =>
    ok(c, await managedAccountService.refreshStatus(tenantOf(c).id)),
  )

  .get('/configuracoes/recebimento/gerenciada/debitos', async c => ok(c, await listDebitsOf(tenantOf(c).id, 100)))

  // ---- Timeline e automação ------------------------------------------------
  .get('/eventos', query(listPaymentEventsQuery.extend(q)), async c => {
    const { items, meta } = await queriesService.listEvents(tenantOf(c).id, c.req.valid('query'))
    return ok(c, items, meta)
  })

  .post('/automacao/executar', async c => {
    const report = await runForTenant(tenantOf(c).id, new Date(), { throwIfBusy: true })
    await recordAudit(c, {
      action: 'billing_automation.executed',
      resource: 'billing_settings',
      resourceId: tenantOf(c).id,
      metadata: { erros: report.errors.length, geradas: report.generated, vencidas: report.markedOverdue },
    })
    return ok(c, report)
  })
