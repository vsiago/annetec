import { invoiceStatus, paginationQuery } from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { contractsService } from '@/modules/contracts/service'
import { billingService } from './service'

const codigoParam = z.object({ codigo: z.string().min(1) })
const contratoQuery = z.object({
  contratoCodigo: z.string().min(1),
  status: invoiceStatus.optional(),
  idStatusFatura: z.coerce.number().int().optional(),
})

/**
 * Financeiro. Montado em `/api/v1/t/:tenantSlug/financeiro`.
 *
 * Antes de devolver qualquer coisa de um contrato, `assertContractAccess`
 * confirma que quem pediu pode ver aquele contrato — sem isso, trocar o
 * `contratoCodigo` na query exporia o boleto de outro associado.
 */
export const billingController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get('/faturas', query(contratoQuery), async c => {
    const tenant = tenantOf(c)
    const { contratoCodigo, status, idStatusFatura } = c.req.valid('query')
    await assertContractAccess(c, contratoCodigo)
    return ok(
      c,
      await billingService.listInvoicesByContract(tenant.id, contratoCodigo, {
        status,
        upstreamStatusId: idStatusFatura,
      }),
    )
  })

  /**
   * Paginada de propósito: a carteira real tem centenas de vencidas e cada
   * uma exige uma chamada ao ERP, que limita por token. Sem página, a tela
   * de cobrança estourava o limite e vinha incompleta.
   */
  .get('/faturas/vencidas', requireTenantRole('admin'), query(paginationQuery), async c => {
    const { page, perPage } = c.req.valid('query')
    const { items, total } = await billingService.listOverdueInvoices(tenantOf(c).id, { page, perPage })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .get('/faturas/:codigo', param(codigoParam), requireTenantRole('admin', 'seller'), async c =>
    ok(c, await billingService.getInvoice(tenantOf(c).id, c.req.valid('param').codigo)),
  )

  .post(
    '/faturas/enviar-vencidas',
    json(z.object({ contratoCodigo: z.string().min(1) })),
    async c => {
      const tenant = tenantOf(c)
      const { contratoCodigo } = c.req.valid('json')
      await assertContractAccess(c, contratoCodigo)
      const message = await billingService.sendOverdueInvoicesByEmail(tenant.id, contratoCodigo)
      return ok(c, { message })
    },
  )

  .get('/demonstrativos', query(z.object({ contratoCodigo: z.string().min(1) })), async c => {
    const tenant = tenantOf(c)
    const { contratoCodigo } = c.req.valid('query')
    await assertContractAccess(c, contratoCodigo)
    return ok(c, await billingService.listPaymentStatements(tenant.id, contratoCodigo))
  })

  .get('/demonstrativos/:codigo', param(codigoParam), async c =>
    ok(c, await billingService.getPaymentStatement(tenantOf(c).id, c.req.valid('param').codigo)),
  )

  /**
   * Comissões. Vendedor vê só as suas; admin pode consultar as de qualquer
   * vendedor do inquilino informando `vendedorId`.
   */
  .get(
    '/comissoes',
    requireTenantRole('admin', 'seller'),
    query(z.object({ vendedorId: z.string().uuid().optional(), status: z.enum(['emitido', 'pago']).default('emitido') })),
    async c => {
      const tenant = tenantOf(c)
      const auth = c.get('auth')
      const { vendedorId, status } = c.req.valid('query')
      const sellerId = auth?.membership.tenantRole === 'seller' ? auth.user.id : vendedorId
      if (!sellerId) throw AppError.validation([{ path: 'vendedorId', message: 'Informe o vendedor' }])
      return ok(c, await billingService.listCommissionReceipts(tenant.id, sellerId, status))
    },
  )

  .get('/comissoes/:codigo', param(codigoParam), requireTenantRole('admin', 'seller'), async c =>
    ok(c, await billingService.getCommissionReceipt(tenantOf(c).id, c.req.valid('param').codigo)),
  )

/** Garante que o contrato consultado pertence a quem está pedindo. */
async function assertContractAccess(
  c: {
    get: (key: 'auth' | 'tenant') => AppEnv['Variables']['auth'] | AppEnv['Variables']['tenant']
  },
  contratoCodigo: string,
) {
  const auth = c.get('auth') as AppEnv['Variables']['auth']
  if (auth?.membership.scope !== 'tenant' || auth.membership.tenantRole !== 'client') return

  const tenant = c.get('tenant') as AppEnv['Variables']['tenant']
  if (!tenant) throw AppError.notFound('Inquilino')

  const contract = await contractsService.getByCodigo(tenant.id, contratoCodigo)
  if (contract.clientUserId !== auth.user.id) {
    throw AppError.forbidden('Este contrato não pertence à sua conta')
  }
}
