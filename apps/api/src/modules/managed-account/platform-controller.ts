import {
  forceManagedDebitInput,
  listManagedAccountsQuery,
  refuseManagedAccountInput,
  updateManagedAccountRequestInput,
  updateManagedAutoDebitInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { actorOf, optionalJson } from '@/modules/platform-billing/http'
import { forceDebit } from './debit.service'
import { managedAccountService } from './service'

/**
 * Contas gerenciadas (console da plataforma) — `/api/v1/platform/contas-gerenciadas`.
 * Equipe lê (superadmin e platform_admin); TODA ação é do superadmin (cria
 * subconta, mexe no saldo do clube). Vendedor ANNETEC nunca entra
 * (`requirePlatformRole()` só aceita a equipe). Toda ação vai para a auditoria.
 */

const orgParam = z.object({ orgId: z.string().trim().min(1).max(100) })
const superadmin = requirePlatformRole('superadmin')

/** Ações que chamam o Asaas: 60 por hora por clube. */
const asaasRateLimit = rateLimit({
  key: 'plataforma:contas-gerenciadas',
  limit: 60,
  windowMs: 60 * 60 * 1000,
  keyOf: c => c.req.param('orgId') ?? null,
})

export const managedAccountsPlatformController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', query(listManagedAccountsQuery), async c => ok(c, await managedAccountService.list(c.req.valid('query'))))

  .get('/:orgId', param(orgParam), async c => ok(c, await managedAccountService.detail(c.req.valid('param').orgId)))

  .post('/:orgId/aprovar', superadmin, asaasRateLimit, param(orgParam), async c => {
    const { orgId } = c.req.valid('param')
    const detail = await managedAccountService.approve(orgId, { userId: actorOf(c) })
    await recordAudit(c, {
      action: 'managed_account.approved',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
      metadata: { subconta: detail.asaasAccountId, carteira: detail.walletId, webhook: detail.account.webhookStatus },
    })
    return ok(c, detail)
  })

  // Correção dos dados do pedido antes de aprovar (tipo de empresa, faturamento,
  // contatos, endereço). O aceite do termo continua o original; o antes/depois
  // de cada campo vai para a auditoria.
  .patch('/:orgId/pedido', superadmin, param(orgParam), json(updateManagedAccountRequestInput), async c => {
    const { orgId } = c.req.valid('param')
    const session = c.get('auth')
    const { detail, requestId, changes } = await managedAccountService.updateRequest(orgId, c.req.valid('json'), {
      userId: session?.user.id ?? null,
      name: session?.user.name ?? null,
    })
    if (Object.keys(changes).length > 0) {
      await recordAudit(c, {
        action: 'managed_account.request_corrected',
        resource: 'managed_account',
        resourceId: orgId,
        organizationId: orgId,
        metadata: { pedido: requestId, alteracoes: changes },
      })
    }
    return ok(c, detail)
  })

  .post('/:orgId/recusar', superadmin, param(orgParam), json(refuseManagedAccountInput), async c => {
    const { orgId } = c.req.valid('param')
    const { reason } = c.req.valid('json')
    const detail = await managedAccountService.refuse(orgId, reason, { userId: actorOf(c) })
    await recordAudit(c, {
      action: 'managed_account.refused',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
      metadata: { motivo: reason },
    })
    return ok(c, detail)
  })

  .post('/:orgId/recuperar-chave', superadmin, asaasRateLimit, param(orgParam), async c => {
    const { orgId } = c.req.valid('param')
    const detail = await managedAccountService.recoverKey(orgId, { userId: actorOf(c) })
    await recordAudit(c, {
      action: 'managed_account.key_recovered',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
      metadata: { subconta: detail.asaasAccountId, finalChave: detail.account.keyHint },
    })
    return ok(c, detail)
  })

  .post('/:orgId/atualizar-status', superadmin, asaasRateLimit, param(orgParam), async c => {
    const { orgId } = c.req.valid('param')
    await managedAccountService.refreshStatus(orgId)
    return ok(c, await managedAccountService.detail(orgId))
  })

  .patch('/:orgId/debito-automatico', superadmin, param(orgParam), json(updateManagedAutoDebitInput), async c => {
    const { orgId } = c.req.valid('param')
    const { enabled } = c.req.valid('json')
    const detail = await managedAccountService.setAutoDebit(orgId, enabled)
    await recordAudit(c, {
      action: enabled ? 'managed_account.auto_debit_enabled' : 'managed_account.auto_debit_disabled',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
    })
    return ok(c, detail)
  })

  .post('/:orgId/debitar-agora', superadmin, asaasRateLimit, param(orgParam), async c => {
    const { orgId } = c.req.valid('param')
    const input = await optionalJson(c, forceManagedDebitInput)
    const result = await forceDebit(orgId, input.chargeId, actorOf(c))
    await recordAudit(c, {
      action: 'managed_account.debit_forced',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
      metadata: {
        fatura: result.debit?.chargeId ?? input.chargeId ?? null,
        resultado: result.outcome,
        transferencia: result.debit?.transferId ?? null,
      },
    })
    return ok(c, result)
  })

  .post('/:orgId/desconectar', superadmin, param(orgParam), async c => {
    const { orgId } = c.req.valid('param')
    const detail = await managedAccountService.disconnect(orgId)
    await recordAudit(c, {
      action: 'managed_account.disconnected',
      resource: 'managed_account',
      resourceId: orgId,
      organizationId: orgId,
      metadata: { subconta: detail.asaasAccountId },
    })
    return ok(c, detail)
  })
