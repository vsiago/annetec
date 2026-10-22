import { describe, expect, it } from 'vitest'
import {
  MAX_RECEIPTS_RANGE_DAYS,
  buildReceiptsTotals,
  decodeReceiptsCursor,
  encodeReceiptsCursor,
  resolveReceiptsPeriod,
} from '@/modules/club-billing/receipts.rules'

/** Financeiro → Recebimento: período, cursor e totais (regras puras, datas fixas). */

// 09/10/2026 10:00 em São Paulo.
const NOW = new Date('2026-10-09T13:00:00Z')

describe('resolveReceiptsPeriod', () => {
  it('sem datas vale o mês corrente inteiro', () => {
    expect(resolveReceiptsPeriod({}, NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('fevereiro termina no dia certo', () => {
    expect(resolveReceiptsPeriod({}, new Date('2028-02-10T15:00:00Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('só "from" vai até hoje; só "to" começa no 1º dia do mês', () => {
    expect(resolveReceiptsPeriod({ from: '2026-09-15' }, NOW)).toEqual({ from: '2026-09-15', to: '2026-10-09' })
    expect(resolveReceiptsPeriod({ to: '2026-09-20' }, NOW)).toEqual({ from: '2026-09-01', to: '2026-09-20' })
  })

  it('recusa período invertido ou longo demais', () => {
    expect(resolveReceiptsPeriod({ from: '2026-10-10', to: '2026-10-01' }, NOW)).toHaveProperty('error')
    expect(resolveReceiptsPeriod({ from: '2025-01-01', to: '2026-10-01' }, NOW)).toHaveProperty('error')
    expect(MAX_RECEIPTS_RANGE_DAYS).toBeGreaterThanOrEqual(366)
  })
})

describe('cursor de recebimentos', () => {
  it('ida e volta preservam microssegundos e chave', () => {
    const cursor = {
      at: '2026-10-09T13:00:00.123456Z',
      key: '0b6f1c1e-6f43-4d38-9a57-6f1f3b0f4d2a:received',
    }
    expect(decodeReceiptsCursor(encodeReceiptsCursor(cursor))).toEqual(cursor)
  })

  it('cursor adulterado vira null', () => {
    expect(decodeReceiptsCursor('nao-e-base64-json')).toBeNull()
    expect(
      decodeReceiptsCursor(Buffer.from(JSON.stringify(['2026-10-09', 'x:received'])).toString('base64url')),
    ).toBeNull()
  })
})

describe('buildReceiptsTotals', () => {
  it('soma, ticket médio e líquido com centavos', () => {
    expect(
      buildReceiptsTotals({
        received: '299.70',
        receivedCount: 3,
        refunded: '49.90',
        refundedCount: 1,
        receivable: '149.70',
        receivableCount: '3',
      }),
    ).toEqual({
      received: 299.7,
      count: 3,
      average: 99.9,
      refunded: 49.9,
      refundedCount: 1,
      net: 249.8,
      receivable: 149.7,
      receivableCount: 3,
    })
  })

  it('arredonda o ticket médio e não divide por zero', () => {
    expect(buildReceiptsTotals({ received: '100', receivedCount: 3 }).average).toBe(33.33)
    expect(buildReceiptsTotals({})).toEqual({
      received: 0,
      count: 0,
      average: 0,
      refunded: 0,
      refundedCount: 0,
      net: 0,
      receivable: 0,
      receivableCount: 0,
    })
  })
})
