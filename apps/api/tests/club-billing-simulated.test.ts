import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardDeclinedError } from '@/integrations/payments/gateway'
import {
  SimulatedGateway,
  parseSimulatedChargeId,
  simulatedCustomerId,
  type SimulatedOptions,
} from '@/integrations/payments/simulated'
import { crc16CcittFalse } from '@/integrations/payments/pix-brcode'

/**
 * Regras do gateway SIMULADO (blueprint §0.6) com relógio falso: Pix compensa
 * em 20 s, boleto em 120 s, `approveAt = 0` nunca compensa sozinho e cartão
 * final 0002 é recusado. Sem estado: tudo sai do id + relógio.
 */

const tenant = { orgId: 'org-1', name: 'Mapcard Benefícios', slug: 'mapcard2', city: 'Rio de Janeiro' }
const options: SimulatedOptions = {
  pixApproveSeconds: 20,
  boletoApproveSeconds: 120,
  pixKey: '7d9f0335-8dcc-4054-9bf9-0dbd61d36906',
  boletoUrl: ({ slug, subscriptionId, chargeId }) => `http://web/${slug}/assinar/boleto?assinatura=${subscriptionId}&cobranca=${chargeId}`,
}
const base = {
  customerId: 'sim_cus_x',
  amount: 79.7,
  dueDate: '2026-09-27',
  description: 'Mapcard · Plano Plus · 09/2026',
  externalReference: '6f1c2b1e-1111-4222-8333-944455556666',
  subscriptionId: '6f1c2b1e-1111-4222-8333-944455556667',
}
const card = {
  holderName: 'TESTE',
  expiryMonth: 12,
  expiryYear: 2030,
  ccv: '123',
  holderCpf: '52998224725',
  holderEmail: 'a@b.test',
  holderPostalCode: '20040020',
  holderAddressNumber: '10',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T15:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Pix simulado', () => {
  it('fica pendente e compensa em 20 s', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    const charge = await gateway.createCharge({ ...base, method: 'pix' })
    expect(charge.status).toBe('pending')
    expect(charge.id).toMatch(/^sim_pay_pix_\d+_[a-f0-9]{8}$/)
    expect(parseSimulatedChargeId(charge.id)?.approveAt).toBe(Date.now() + 20_000)
    expect(charge.pix?.qrCodeBase64).toMatch(/^iVBORw0KGgo/) // PNG sem prefixo data:
    expect(charge.pix?.expiresAt).toBe('2026-09-28T15:00:00.000Z')
    const payload = charge.pix!.payload
    expect(payload.slice(-4)).toBe(crc16CcittFalse(payload.slice(0, -4)))
    expect(payload).toContain('540579.70')

    vi.setSystemTime(new Date('2026-09-27T15:00:19Z'))
    expect((await gateway.getCharge(charge.id)).status).toBe('pending')
    vi.setSystemTime(new Date('2026-09-27T15:00:20Z'))
    const paid = await gateway.getCharge(charge.id)
    expect(paid.status).toBe('paid')
    expect(paid.paidAt?.toISOString()).toBe('2026-09-27T15:00:20.000Z')
  })

  it('com 0 segundos só compensa manualmente', async () => {
    const gateway = new SimulatedGateway(tenant, { ...options, pixApproveSeconds: 0 })
    const charge = await gateway.createCharge({ ...base, method: 'pix' })
    expect(charge.id).toMatch(/^sim_pay_pix_0_/)
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    expect((await gateway.getCharge(charge.id)).status).toBe('pending')
  })
})

describe('Boleto simulado', () => {
  it('compensa em 120 s e traz linha digitável + link da página imprimível', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    const charge = await gateway.createCharge({ ...base, method: 'boleto', dueDate: '2026-09-30' })
    expect(charge.status).toBe('pending')
    expect(charge.boleto?.identificationField).toMatch(/^\d{47}$/)
    expect(charge.boleto?.barCode).toMatch(/^\d{44}$/)
    expect(charge.boleto?.url).toBe(
      `http://web/mapcard2/assinar/boleto?assinatura=${base.subscriptionId}&cobranca=${base.externalReference}`,
    )
    vi.setSystemTime(new Date('2026-09-27T15:01:59Z'))
    expect((await gateway.getCharge(charge.id)).status).toBe('pending')
    vi.setSystemTime(new Date('2026-09-27T15:02:00Z'))
    expect((await gateway.getCharge(charge.id)).status).toBe('paid')
  })

  it('id com approveAt 0 (seed) nunca compensa sozinho', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    expect((await gateway.getCharge('sim_pay_boleto_0_abcdef12')).status).toBe('pending')
  })
})

describe('Cartão simulado', () => {
  it('aprova número válido na hora e devolve token com bandeira e finais', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    const charge = await gateway.createCharge({ ...base, method: 'credit_card', card: { ...card, number: '4111111111111111' } })
    expect(charge.status).toBe('paid')
    expect(charge.card?.brand).toBe('visa')
    expect(charge.card?.last4).toBe('1111')
    expect(charge.card?.token).toMatch(/^sim_tok_visa_1111_[a-f0-9]{8}$/)
    expect((await gateway.getCharge(charge.id)).status).toBe('paid')
  })

  it('recusa final 0002 e os cartões de recusa da sandbox do Asaas', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    await expect(
      gateway.createCharge({ ...base, method: 'credit_card', card: { ...card, number: '4000000000000002' } }),
    ).rejects.toBeInstanceOf(CardDeclinedError)
    await expect(
      gateway.createCharge({ ...base, method: 'credit_card', card: { ...card, number: '5184019740373151' } }),
    ).rejects.toThrow('Transação não autorizada')
  })

  it('cobra token salvo; token de final 0002 é recusado', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    const ok = await gateway.createCharge({ ...base, method: 'credit_card', cardToken: 'sim_tok_mastercard_4444_abcd1234' })
    expect(ok.status).toBe('paid')
    expect(ok.card).toEqual({ token: 'sim_tok_mastercard_4444_abcd1234', brand: 'mastercard', last4: '4444' })
    await expect(
      gateway.createCharge({ ...base, method: 'credit_card', cardToken: 'sim_tok_visa_0002_abcd1234' }),
    ).rejects.toBeInstanceOf(CardDeclinedError)
  })
})

describe('Cliente simulado', () => {
  it('id determinístico por inquilino + CPF', async () => {
    const gateway = new SimulatedGateway(tenant, options)
    const id = await gateway.ensureCustomer({ name: 'A', cpf: '529.982.247-25', email: 'a@b.test', externalReference: 'u1' })
    expect(id).toBe(simulatedCustomerId('org-1', '52998224725'))
    expect(id).toMatch(/^sim_cus_[a-f0-9]{16}$/)
    expect(gateway.canSimulate).toBe(true)
    expect(gateway.sandbox).toBe(false)
  })
})
