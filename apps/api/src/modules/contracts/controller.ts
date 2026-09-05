import {
  attachDocumentInput,
  contractStatus,
  createContractInput,
  cpf as cpfSchema,
  declarePathologyInput,
  paginationQuery,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { recordAudit } from '@/lib/audit'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { contractsService } from './service'

const codigoParam = z.object({ codigo: z.string().min(1) })
const listQuery = paginationQuery.extend({ status: contractStatus.optional() })

/**
 * Contratos do inquilino. Montado em `/api/v1/t/:tenantSlug/contratos`.
 *
 * A visibilidade é decidida aqui, uma vez, e o service só recebe os filtros já
 * resolvidos: cliente vê os próprios contratos, vendedor vê os que produziu,
 * admin vê todos.
 */
export const contractsController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get('/', query(listQuery), async c => {
    const tenant = tenantOf(c)
    const { page, perPage, status, q } = c.req.valid('query')
    const { items, total } = await contractsService.list({
      tenantId: tenant.id,
      page,
      perPage,
      status,
      search: q,
      ...visibilityFilter(c),
    })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .get('/:codigo', param(codigoParam), async c => {
    const tenant = tenantOf(c)
    const contract = await contractsService.getByCodigo(tenant.id, c.req.valid('param').codigo)
    assertCanSee(c, contract)
    return ok(c, contract)
  })

  .post('/:codigo/sync', param(codigoParam), requireTenantRole('admin', 'seller'), async c => {
    const tenant = tenantOf(c)
    const { codigo } = c.req.valid('param')
    const contract = await contractsService.refreshFromUpstream(tenant.id, codigo)
    await recordAudit(c, {
      action: 'contract.synced',
      resource: 'contract',
      resourceId: codigo,
      metadata: { status: contract.status, vidas: contract.beneficiaries?.length ?? 0 },
    })
    return ok(c, contract)
  })

  .post('/', requireTenantRole('admin', 'seller'), json(createContractInput), async c => {
    const tenant = tenantOf(c)
    const auth = c.get('auth')
    const contract = await contractsService.create(tenant.id, c.req.valid('json'), {
      sellerUserId: auth?.membership.tenantRole === 'seller' ? auth.user.id : null,
    })
    // Adesão é a escrita mais consequente do sistema: cria contrato e cobrança
    // reais no ERP, e a Digital Saúde não tem desfazer.
    await recordAudit(c, {
      action: 'contract.created',
      resource: 'contract',
      resourceId: contract.upstreamCodigo,
      metadata: {
        proposalNumber: contract.proposalNumber,
        holderName: contract.holderName,
        planCodigo: contract.planCodigo,
        convenioCodigo: contract.convenioCodigo,
      },
    })
    return created(c, contract)
  })

  .post('/:codigo/produzido', param(codigoParam), requireTenantRole('admin'), async c => {
    const tenant = tenantOf(c)
    const { codigo } = c.req.valid('param')
    const contract = await contractsService.markAsProduced(tenant.id, codigo)
    await recordAudit(c, { action: 'contract.marked_produced', resource: 'contract', resourceId: codigo })
    return ok(c, contract)
  })

  .post('/:codigo/carteirinha/email', param(codigoParam), async c => {
    const tenant = tenantOf(c)
    const contract = await contractsService.getByCodigo(tenant.id, c.req.valid('param').codigo)
    assertCanSee(c, contract)
    const message = await contractsService.sendMembershipCardByEmail(tenant.id, contract.upstreamCodigo)
    // Dispara e-mail para o titular — sai da plataforma, então entra na trilha.
    await recordAudit(c, {
      action: 'contract.membership_card_emailed',
      resource: 'contract',
      resourceId: contract.upstreamCodigo,
    })
    return ok(c, { message })
  })

  .post('/anexos', requireTenantRole('admin', 'seller'), json(attachDocumentInput), async c => {
    const tenant = tenantOf(c)
    return created(c, await contractsService.attachDocument(tenant.id, c.req.valid('json')))
  })

  .post('/patologias', requireTenantRole('admin', 'seller'), json(declarePathologyInput), async c => {
    const tenant = tenantOf(c)
    return created(c, await contractsService.declarePathology(tenant.id, c.req.valid('json')))
  })

  .post(
    '/pendencias',
    requireTenantRole('admin'),
    json(z.object({ contractCodigo: z.string().min(1), pendencyCode: z.string().min(1) })),
    async c => {
      const tenant = tenantOf(c)
      const { contractCodigo, pendencyCode } = c.req.valid('json')
      return created(c, await contractsService.registerPendency(tenant.id, contractCodigo, pendencyCode))
    },
  )

  /** Busca por CPF do titular direto no ERP — só admin, é rota de central. */
  .get(
    '/busca/cpf',
    requireTenantRole('admin'),
    query(z.object({ cpf: cpfSchema })),
    async c => {
      const tenant = tenantOf(c)
      const result = await contractsService.findUpstreamByCpf(tenant.id, c.req.valid('query').cpf)
      return ok(c, result)
    },
  )

/** Carteirinhas do associado autenticado. */
export const membershipCardsController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('client'))
  .get('/', async c => {
    const tenant = tenantOf(c)
    const auth = c.get('auth')
    if (!auth) throw AppError.unauthenticated()
    return ok(c, await contractsService.membershipCards(tenant.id, auth.user.id))
  })

function visibilityFilter(c: { get: (key: 'auth') => AppEnv['Variables']['auth'] }) {
  const auth = c.get('auth')
  if (auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'client') return { clientUserId: auth.user.id }
  if (auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'seller') return { sellerUserId: auth.user.id }
  return {}
}

function assertCanSee(
  c: { get: (key: 'auth') => AppEnv['Variables']['auth'] },
  contract: { clientUserId?: string | null; upstreamCodigo: string },
) {
  const auth = c.get('auth')
  if (auth?.membership.scope !== 'tenant' || auth.membership.tenantRole !== 'client') return
  // O espelho local liga contrato ao associado; sem esse vínculo, negamos.
  if (!contract.clientUserId || contract.clientUserId !== auth.user.id) {
    throw AppError.forbidden('Este contrato não pertence à sua conta')
  }
}
