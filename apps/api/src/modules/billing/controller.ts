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
import { sellersService } from '@/modules/users/service'
import { billingService } from './service'

const codigoParam = z.object({ codigo: z.string().min(1) })
/** Detalhe por código: associado e vendedor dizem de qual contrato (ver `scopedContract`). */
const detailQuery = z.object({ contratoCodigo: z.string().min(1).optional() })
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

  /**
   * Detalhe por código. Admin consulta direto; vendedor precisa dizer de qual
   * contrato (`contratoCodigo`, um que ele produziu) e a fatura tem de estar
   * nele — o código da fatura sozinho não diz de quem ela é.
   */
  .get(
    '/faturas/:codigo',
    param(codigoParam),
    query(detailQuery),
    requireTenantRole('admin', 'seller'),
    async c => {
      const tenant = tenantOf(c)
      const { codigo } = c.req.valid('param')
      const contratoCodigo = await scopedContract(c, c.req.valid('query').contratoCodigo)
      if (!contratoCodigo) return ok(c, await billingService.getInvoice(tenant.id, codigo))
      const invoices = await billingService.listInvoicesByContract(tenant.id, contratoCodigo)
      const invoice = invoices.find(item => item.upstreamCodigo === codigo)
      if (!invoice) throw AppError.notFound('Fatura')
      return ok(c, invoice)
    },
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

  /** Mesma regra do detalhe de fatura: fora do admin, só dentro de um contrato que a pessoa pode ver. */
  .get('/demonstrativos/:codigo', param(codigoParam), query(detailQuery), async c => {
    const tenant = tenantOf(c)
    const { codigo } = c.req.valid('param')
    const contratoCodigo = await scopedContract(c, c.req.valid('query').contratoCodigo)
    if (!contratoCodigo) return ok(c, await billingService.getPaymentStatement(tenant.id, codigo))
    const statements = await billingService.listPaymentStatements(tenant.id, contratoCodigo)
    const statement = statements.find(item => item.upstreamCodigo === codigo)
    if (!statement) throw AppError.notFound('Demonstrativo de pagamento')
    return ok(c, statement)
  })

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

  /** Vendedor só abre recibo do PRÓPRIO produtor; admin abre qualquer um do inquilino. */
  .get('/comissoes/:codigo', param(codigoParam), requireTenantRole('admin', 'seller'), async c => {
    const tenant = tenantOf(c)
    const auth = c.get('auth')
    const { codigo } = c.req.valid('param')
    if (auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'seller') {
      const produtor = await sellersService.upstreamProdutorCodigo(tenant.id, auth.user.id)
      if (!produtor) throw AppError.notFound('Recibo')
      return ok(c, await billingService.getCommissionReceipt(tenant.id, codigo, { produtorCodigo: produtor }))
    }
    return ok(c, await billingService.getCommissionReceipt(tenant.id, codigo))
  })

type BillingContext = {
  get: (key: 'auth' | 'tenant') => AppEnv['Variables']['auth'] | AppEnv['Variables']['tenant']
}

/** Quem não é admin do inquilino (associado, vendedor) só vê o que é de um contrato seu. */
function isScopedViewer(auth: AppEnv['Variables']['auth']): boolean {
  return auth?.membership.scope === 'tenant' && (auth.membership.tenantRole === 'client' || auth.membership.tenantRole === 'seller')
}

/**
 * Garante que o contrato consultado pertence a quem está pedindo: associado
 * só os próprios, vendedor só os que produziu (a mesma regra da listagem de
 * contratos); admin e equipe Annetec passam.
 */
async function assertContractAccess(c: BillingContext, contratoCodigo: string) {
  const auth = c.get('auth') as AppEnv['Variables']['auth']
  if (!auth || !isScopedViewer(auth)) return

  const tenant = c.get('tenant') as AppEnv['Variables']['tenant']
  if (!tenant) throw AppError.notFound('Inquilino')

  const contract = await contractsService.getByCodigo(tenant.id, contratoCodigo)
  const owner = auth.membership.tenantRole === 'client' ? contract.clientUserId : contract.sellerUserId
  if (!owner || owner !== auth.user.id) {
    throw AppError.forbidden('Este contrato não pertence à sua conta')
  }
}

/**
 * Para as rotas de detalhe por código: `null` = quem pede vê tudo do
 * inquilino (admin/equipe); senão exige o `contratoCodigo`, confere o acesso
 * a ele e o devolve — o chamador procura o item DENTRO desse contrato.
 */
async function scopedContract(c: BillingContext, contratoCodigo: string | undefined): Promise<string | null> {
  const auth = c.get('auth') as AppEnv['Variables']['auth']
  if (!auth || !isScopedViewer(auth)) return null
  if (!contratoCodigo) {
    throw AppError.validation([{ path: 'contratoCodigo', message: 'Informe o contrato' }])
  }
  await assertContractAccess(c, contratoCodigo)
  return contratoCodigo
}
