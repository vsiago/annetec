import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/http/errors'
import { ASAAS_BASE_URLS, AsaasApiError, createAsaasClient } from '@/integrations/asaas/client'
import { AsaasGateway } from '@/integrations/asaas/gateway'
import { checkAsaasWebhookToken, mapAsaasCardBrand, mapAsaasPaymentStatus } from '@/integrations/asaas/webhook'
import { CardDeclinedError } from '@/integrations/payments/gateway'

/**
 * Mini-SDK do Asaas contra um `fetch` falso: headers, GET sem corpo, erro
 * `{ errors }` → AppError, recusa de cartão → CardDeclinedError, retry só em
 * GET, consulta por `externalReference` antes de repetir. Nenhuma chamada real.
 */

type FetchArgs = Parameters<typeof fetch>
interface Call {
  url: URL
  init: RequestInit
}

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      const call = { url: input instanceof URL ? input : new URL(String(input)), init: (init ?? {}) as RequestInit }
      calls.push(call)
      return handler(call)
    }),
  )
  return calls
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const client = () =>
  createAsaasClient({ apiKey: '$aact_hmlg_teste', environment: 'sandbox', userAgent: 'ANNETEC-Clube/1.0', timeoutMs: 5_000 })

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('cliente Asaas', () => {
  it('autentica com access_token + User-Agent e manda GET sem corpo', async () => {
    const calls = stubFetch(() => json({ object: 'list', hasMore: false, totalCount: 0, limit: 10, offset: 0, data: [] }))
    await client().customers.list({ cpfCnpj: '52998224725', limit: 10 })
    const [call] = calls
    expect(call!.url.toString()).toBe(`${ASAAS_BASE_URLS.sandbox}/customers?cpfCnpj=52998224725&limit=10`)
    expect(call!.init.method).toBe('GET')
    expect(call!.init.body).toBeUndefined()
    expect(header(call!.init, 'access_token')).toBe('$aact_hmlg_teste')
    expect(header(call!.init, 'User-Agent')).toBe('ANNETEC-Clube/1.0')
    expect(header(call!.init, 'content-type')).toBeUndefined()
    expect(header(call!.init, 'authorization')).toBeUndefined()
  })

  it('POST vai com JSON e content-type', async () => {
    const calls = stubFetch(() => json({ id: 'cus_1' }))
    const created = await client().customers.create({ name: 'Ana', cpfCnpj: '52998224725', notificationDisabled: true })
    expect(created.id).toBe('cus_1')
    expect(calls[0]!.init.method).toBe('POST')
    expect(header(calls[0]!.init, 'content-type')).toBe('application/json')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: 'Ana', cpfCnpj: '52998224725', notificationDisabled: true })
  })

  it('erro { errors } vira AppError com a descrição do Asaas', async () => {
    stubFetch(() => json({ errors: [{ code: 'invalid_dueDate', description: 'A data de vencimento não pode ser anterior à data atual.' }] }, 400))
    const error = await client()
      .payments.create({ customer: 'cus_1', billingType: 'PIX', value: 10, dueDate: '2020-01-01' })
      .catch(e => e)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toBeInstanceOf(AsaasApiError)
    expect(error.message).toBe('A data de vencimento não pode ser anterior à data atual.')
    expect(error.status).toBe(422)
    expect(error.errorCodes).toEqual(['invalid_dueDate'])
  })

  it('400 em cobrança de cartão vira CardDeclinedError', async () => {
    stubFetch(() =>
      json({ errors: [{ code: 'invalid_creditCard', description: 'Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.' }] }, 400),
    )
    const error = await client()
      .payments.create({
        customer: 'cus_1',
        billingType: 'CREDIT_CARD',
        value: 10,
        dueDate: '2026-09-27',
        creditCard: { holderName: 'A', number: '5184019740373151', expiryMonth: '05', expiryYear: '2030', ccv: '318' },
      })
      .catch(e => e)
    expect(error).toBeInstanceOf(CardDeclinedError)
    expect(error.message).toContain('Transação não autorizada')
    expect(error.status).toBe(422)
  })

  it('401 vira UPSTREAM_UNAUTHORIZED sem vazar a chave', async () => {
    stubFetch(() => json({ errors: [{ code: 'invalid_access_token', description: 'x' }] }, 401))
    const error = await client().payments.get('pay_1').catch(e => e)
    expect(error.code).toBe('UPSTREAM_UNAUTHORIZED')
    expect(error.message).not.toContain('$aact')
  })

  it('reexecuta GET em 5xx, mas nunca POST', async () => {
    let count = 0
    stubFetch(() => (++count < 2 ? json({}, 503) : json({ id: 'pay_1', status: 'PENDING' })))
    const payment = await client().payments.get('pay_1')
    expect(payment.id).toBe('pay_1')
    expect(count).toBe(2)

    count = 0
    stubFetch(() => {
      count += 1
      return json({}, 503)
    })
    const error = await client()
      .payments.create({ customer: 'cus_1', billingType: 'PIX', value: 10, dueDate: '2026-09-27' })
      .catch(e => e)
    expect(count).toBe(1)
    expect(error).toBeInstanceOf(AsaasApiError)
    expect(error.inconclusive).toBe(true)
  })
})

describe('AsaasGateway', () => {
  it('Pix: cria a cobrança e busca o QR pronto', async () => {
    const calls = stubFetch(({ url }) => {
      if (url.pathname.endsWith('/pixQrCode')) {
        return json({ encodedImage: 'iVBORw0KGgoAAA', payload: '000201...6304ABCD', expirationDate: '2026-09-28 23:59:59' })
      }
      return json({ id: 'pay_123', status: 'PENDING', billingType: 'PIX', value: 79.7, invoiceUrl: 'https://sandbox.asaas.com/i/123' })
    })
    const gateway = new AsaasGateway(client(), 'sandbox')
    const charge = await gateway.createCharge({
      customerId: 'cus_1',
      method: 'pix',
      amount: 79.7,
      dueDate: '2026-09-27',
      description: 'Plano Plus',
      externalReference: 'ref-1',
      finePercent: 2,
      interestMonthlyPercent: 1,
    })
    expect(charge).toMatchObject({ id: 'pay_123', status: 'pending', invoiceUrl: 'https://sandbox.asaas.com/i/123' })
    expect(charge.pix).toEqual({ payload: '000201...6304ABCD', qrCodeBase64: 'iVBORw0KGgoAAA', expiresAt: '2026-09-29T02:59:59.000Z' })
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body).toMatchObject({ customer: 'cus_1', billingType: 'PIX', value: 79.7, externalReference: 'ref-1', fine: { value: 2 }, interest: { value: 1 } })
    expect(gateway.canSimulate).toBe(true)
  })

  it('cartão aprovado devolve token/bandeira/finais', async () => {
    stubFetch(() =>
      json({
        id: 'pay_9',
        status: 'CONFIRMED',
        billingType: 'CREDIT_CARD',
        value: 49.9,
        confirmedDate: '2026-09-27',
        creditCard: { creditCardNumber: '4444', creditCardBrand: 'MASTERCARD', creditCardToken: 'tok_abc' },
      }),
    )
    const gateway = new AsaasGateway(client(), 'production')
    const charge = await gateway.createCharge({
      customerId: 'cus_1',
      method: 'credit_card',
      amount: 49.9,
      dueDate: '2026-09-27',
      description: 'x',
      externalReference: 'ref-2',
      card: {
        holderName: 'A',
        number: '5555 5555 5555 4444',
        expiryMonth: 5,
        expiryYear: 2030,
        ccv: '123',
        holderCpf: '52998224725',
        holderEmail: 'a@b.test',
        holderPostalCode: '20040-020',
        holderAddressNumber: '10',
      },
    })
    expect(charge.status).toBe('paid')
    expect(charge.card).toEqual({ token: 'tok_abc', brand: 'mastercard', last4: '4444' })
    expect(gateway.canSimulate).toBe(false)
  })

  it('resposta inconclusiva: consulta por externalReference antes de repetir', async () => {
    const calls = stubFetch(({ init, url }) => {
      if (init.method === 'POST') return json({}, 504)
      if (url.pathname.endsWith('/payments')) {
        return json({ object: 'list', hasMore: false, totalCount: 1, limit: 10, offset: 0, data: [{ id: 'pay_77', status: 'PENDING', billingType: 'BOLETO', bankSlipUrl: 'https://x/b.pdf' }] })
      }
      return json({ identificationField: '23793.38128 60000.000003 00000.000400 1 99990000010000', barCode: '1'.repeat(44) })
    })
    const gateway = new AsaasGateway(client(), 'sandbox')
    const charge = await gateway.createCharge({
      customerId: 'cus_1',
      method: 'boleto',
      amount: 100,
      dueDate: '2026-09-30',
      description: 'x',
      externalReference: 'ref-3',
    })
    expect(charge.id).toBe('pay_77')
    expect(charge.boleto?.identificationField).toBe('23793381286000000000300000000400199990000010000')
    expect(charge.boleto?.url).toBe('https://x/b.pdf')
    expect(calls.filter(call => call.init.method === 'POST')).toHaveLength(1)
    expect(calls[1]!.url.searchParams.get('externalReference')).toBe('ref-3')
  })
})

describe('webhook do Asaas', () => {
  it('confere o token em tempo constante', () => {
    const token = 'token-de-webhook-com-mais-de-32-caracteres'
    expect(checkAsaasWebhookToken(token, token)).toBe('ok')
    expect(checkAsaasWebhookToken('outro', token)).toBe('invalid')
    expect(checkAsaasWebhookToken(undefined, token)).toBe('invalid')
    expect(checkAsaasWebhookToken('qualquer', undefined)).toBe('unconfigured')
  })

  it('mapeia status e bandeira do Asaas', () => {
    expect(mapAsaasPaymentStatus('PENDING')).toBe('pending')
    expect(mapAsaasPaymentStatus('AWAITING_RISK_ANALYSIS')).toBe('pending')
    expect(mapAsaasPaymentStatus('CONFIRMED')).toBe('paid')
    expect(mapAsaasPaymentStatus('RECEIVED_IN_CASH')).toBe('paid')
    expect(mapAsaasPaymentStatus('OVERDUE')).toBe('overdue')
    expect(mapAsaasPaymentStatus('CHARGEBACK_REQUESTED')).toBe('refunded')
    expect(mapAsaasPaymentStatus('REFUNDED')).toBe('refunded')
    expect(mapAsaasPaymentStatus('CREDIT_CARD_CAPTURE_REFUSED')).toBe('failed')
    expect(mapAsaasPaymentStatus('RECEIVED', true)).toBe('canceled')
    expect(mapAsaasCardBrand('VISA')).toBe('visa')
    expect(mapAsaasCardBrand('AMERICAN_EXPRESS')).toBe('amex')
    expect(mapAsaasCardBrand('CABAL')).toBe('outra')
  })
})

describe('cartão: nova tentativa sem cobrança dupla (reuseExistingCardPayment)', () => {
  const cardInput = {
    customerId: 'cus_1',
    method: 'credit_card' as const,
    amount: 49.9,
    dueDate: '2026-09-27',
    description: 'x',
    externalReference: 'ref-card',
    cardToken: 'tok_salvo',
    reuseExistingCardPayment: true,
  }
  const list = (data: unknown[]) => json({ object: 'list', hasMore: false, totalCount: data.length, limit: 20, offset: 0, data })

  it('pagamento no cartão já aprovado para a cobrança → devolve ele e NÃO cobra de novo', async () => {
    const calls = stubFetch(({ init }) => {
      if (init.method === 'POST') throw new Error('não deveria cobrar')
      return list([
        { id: 'pay_pix_velho', status: 'PENDING', billingType: 'PIX' },
        { id: 'pay_card_ok', status: 'CONFIRMED', billingType: 'CREDIT_CARD', value: 49.9, creditCard: { creditCardNumber: '4444', creditCardBrand: 'VISA', creditCardToken: 'tok_salvo' } },
      ])
    })
    const charge = await new AsaasGateway(client(), 'production').createCharge(cardInput)
    expect(charge).toMatchObject({ id: 'pay_card_ok', status: 'paid' })
    expect(calls.filter(call => call.init.method === 'POST')).toHaveLength(0)
    expect(calls[0]!.url.searchParams.get('externalReference')).toBe('ref-card')
  })

  it('só recusas anteriores → cobra normalmente', async () => {
    const calls = stubFetch(({ init }) => {
      if (init.method === 'POST') return json({ id: 'pay_novo', status: 'CONFIRMED', billingType: 'CREDIT_CARD', value: 49.9 })
      return list([{ id: 'pay_recusado', status: 'CREDIT_CARD_CAPTURE_REFUSED', billingType: 'CREDIT_CARD' }])
    })
    const charge = await new AsaasGateway(client(), 'production').createCharge(cardInput)
    expect(charge.id).toBe('pay_novo')
    expect(calls.filter(call => call.init.method === 'POST')).toHaveLength(1)
  })

  it('consulta falhou → lança sem cobrar', async () => {
    const calls = stubFetch(() => json({ errors: [{ code: 'x', description: 'fora do ar' }] }, 503))
    await expect(new AsaasGateway(client(), 'production').createCharge(cardInput)).rejects.toBeInstanceOf(AppError)
    expect(calls.filter(call => call.init.method === 'POST')).toHaveLength(0)
  })

  it('resposta inconclusiva no cartão não confunde com um Pix antigo da mesma cobrança', async () => {
    stubFetch(({ init }) => {
      if (init.method === 'POST') return json({}, 504)
      return list([{ id: 'pay_pix_velho', status: 'PENDING', billingType: 'PIX' }])
    })
    const { reuseExistingCardPayment: _ignored, ...firstAttempt } = cardInput
    await expect(new AsaasGateway(client(), 'production').createCharge(firstAttempt)).rejects.toMatchObject({ inconclusive: true })
  })
})
