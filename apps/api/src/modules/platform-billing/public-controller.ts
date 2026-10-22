import { ERROR_CODES, payPlatformChargeInput, uuid, type PlatformEventSource, type PlatformPublicInvoice } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { rateLimit } from '@/lib/rate-limit'
import { limitBody, remoteIpOf } from '@/modules/club-billing/http'
import { isValidPlatformChargeAccessKey } from './access-key'
import {
  canSimulatePlatformCharge,
  isPlatformPixExpired,
  platformChargesService,
  refreshPlatformPixIfExpired,
  syncPlatformChargeIfStale,
} from './charges.service'
import { platformGatewayFor } from './gateway'
import { formatCnpj, toPlatformCharge, type PlatformChargeRow } from './presenter'
import { loadPlatformCharge, proposalBasics, proposalDisplayName, tenantRefOf } from './queries'
import { loadPlatformSettings } from './settings.service'

/**
 * Fatura pública da plataforma — `/api/v1/public/faturas-annetec/:chargeId?chave=`
 * (sem sessão). Serve a ativação e as mensalidades; é o link dos e-mails e
 * funciona com o painel do inquilino bloqueado. Chave ausente/errada → 404.
 */

const PUBLIC_SYNC_INTERVAL_MS = 3_000

async function guardedCharge(c: Context<AppEnv>): Promise<PlatformChargeRow> {
  const chargeId = c.req.param('chargeId') ?? ''
  if (!uuid.safeParse(chargeId).success || !isValidPlatformChargeAccessKey(chargeId, c.req.query('chave'))) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Fatura não encontrada')
  }
  try {
    return await loadPlatformCharge(chargeId)
  } catch {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Fatura não encontrada')
  }
}

export async function buildPublicInvoice(charge: PlatformChargeRow): Promise<PlatformPublicInvoice> {
  const [tenant, settings, proposal, sub] = await Promise.all([
    tenantRefOf(charge.organizationId),
    loadPlatformSettings(),
    charge.proposalId ? proposalBasics(charge.proposalId) : Promise.resolve(null),
    charge.subscriptionId
      ? db
          .select({ name: platformSubscriptions.billingName, document: platformSubscriptions.billingDocument })
          .from(platformSubscriptions)
          .where(eq(platformSubscriptions.id, charge.subscriptionId))
          .limit(1)
          .then(rows => rows[0] ?? null)
      : Promise.resolve(null),
  ])
  const payerName = sub?.name ?? (proposal ? proposal.company?.legalName || proposal.legalName || proposalDisplayName(proposal) : (tenant?.name ?? ''))
  const payerDocument = sub?.document ?? proposal?.cnpj ?? ''
  let sandbox = false
  try {
    sandbox = charge.gatewayProvider === 'asaas' && platformGatewayFor('asaas').sandbox
  } catch {
    sandbox = false
  }
  return {
    charge: toPlatformCharge(charge, tenant),
    payerName,
    payerDocument: formatCnpj(payerDocument),
    tenantName: tenant?.name ?? (proposal ? proposalDisplayName(proposal) : null),
    proposalCode: proposal?.code ?? null,
    enabledMethods: settings.enabledMethods,
    canSimulatePayment: canSimulatePlatformCharge(charge),
    simulated: charge.gatewayProvider === 'simulated',
    sandbox,
    pixExpired: isPlatformPixExpired(charge),
    beneficiaryName: env.PLATFORM_MERCHANT_NAME,
  }
}

/** Sincroniza (no máx. a cada 3 s) e atualiza Pix expirado — o GET da fatura pública e do painel. */
export async function freshPlatformInvoiceCharge(charge: PlatformChargeRow, source: PlatformEventSource): Promise<PlatformChargeRow> {
  if (await syncPlatformChargeIfStale(charge, PUBLIC_SYNC_INTERVAL_MS, source)) {
    charge = await loadPlatformCharge(charge.id)
  }
  return refreshPlatformPixIfExpired(charge)
}

function sourceFor(charge: PlatformChargeRow) {
  return charge.kind === 'activation' ? ('onboarding' as const) : ('tenant' as const)
}

export const platformPublicInvoiceController = new Hono<AppEnv>()
  /**
   * Sincroniza com o gateway antes de responder (no máx. a cada 3 s — polling
   * da página). Pix guardado expirado em fatura aberta: tenta o QR atual do
   * mesmo pagamento (leitura, sem criar cobrança); se não houver, a página
   * oferece "Gerar novo Pix".
   */
  .get('/:chargeId', async c => {
    const charge = await guardedCharge(c)
    return ok(c, await buildPublicInvoice(await freshPlatformInvoiceCharge(charge, sourceFor(charge))))
  })

  .post('/:chargeId/pagar', limitBody(16), json(payPlatformChargeInput), async c => {
    const charge = await guardedCharge(c)
    const updated = await platformChargesService.pay(charge, c.req.valid('json'), {
      source: sourceFor(charge),
      remoteIp: remoteIpOf(c),
    })
    return ok(c, await buildPublicInvoice(updated))
  })

  // Botão "Simular pagamento" (só fora de produção — o serviço recusa lá).
  // Rota pública: limitada por IP como as demais da contratação.
  .post('/:chargeId/simular', rateLimit({ key: 'fatura-annetec:simular', limit: 10, windowMs: 60_000 }), async c => {
    const charge = await guardedCharge(c)
    const updated = await platformChargesService.simulate(charge)
    return ok(c, await buildPublicInvoice(updated))
  })
