import { formatBoletoLine, quoteClubPlan } from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { buildBoletoNumbers, dueDateFactor, mod10, mod11Barcode } from '@/integrations/payments/boleto'
import { buildPixBrCode, crc16CcittFalse } from '@/integrations/payments/pix-brcode'
import {
  cyclePeriod,
  delinquencyAction,
  isAbandonedCheckout,
  isCardRetryDue,
  isReminderDue,
  shouldGenerateCycle,
  shouldMarkOverdue,
} from '@/modules/club-billing/automation.rules'
import {
  cardPrefixFromSlug,
  dependentCardNumber,
  holderCardNumber,
  holderCardPattern,
} from '@/modules/club-billing/card-number'
import { addMonthsOnDueDay, dueDayOf, lastMonths, todaySP } from '@/modules/club-billing/dates'
import { checkoutAccessKey, isValidCheckoutAccessKey } from '@/modules/club-billing/access-key'

/** Regras puras do clube: BR Code, boleto, preço, carteirinha, datas e transições da automação (datas fixas). */

describe('Pix BR Code', () => {
  it('CRC16-CCITT-FALSE confere com o vetor padrão', () => {
    expect(crc16CcittFalse('123456789')).toBe('29B1')
  })

  it('monta o payload EMV com os campos na ordem e CRC válido', () => {
    const payload = buildPixBrCode({
      key: 'chave',
      amount: 79.7,
      merchantName: 'Mapcard Benefícios Ltda',
      merchantCity: 'Rio de Janeiro',
      txid: 'abc-123',
    })
    expect(payload.startsWith('000201' + '010212' + '2627' + '0014br.gov.bcb.pix' + '0105chave')).toBe(true)
    expect(payload).toContain('52040000' + '5303986' + '540579.70' + '5802BR')
    expect(payload).toContain('5923MAPCARD BENEFICIOS LTDA')
    expect(payload).toContain('6014RIO DE JANEIRO')
    expect(payload).toContain('62100506abc123')
    const withoutCrc = payload.slice(0, -4)
    expect(withoutCrc.endsWith('6304')).toBe(true)
    expect(payload.slice(-4)).toBe(crc16CcittFalse(withoutCrc))
  })

  it('limita nome a 25 e cidade a 15 caracteres, sem acento', () => {
    const payload = buildPixBrCode({
      key: 'k',
      amount: 10,
      merchantName: 'Associação Beneficente de Saúde do Trabalhador',
      merchantCity: 'São José dos Campos',
      txid: 'x',
    })
    expect(payload).toContain('5925ASSOCIACAO BENEFICENTE DE6015SAO JOSE DOS CA62')
  })
})

describe('Boleto simulado', () => {
  it('fator de vencimento usa a base nova (22/02/2025 = 1000)', () => {
    expect(dueDateFactor('2025-02-22')).toBe('1000')
    expect(dueDateFactor('2025-02-23')).toBe('1001')
    expect(dueDateFactor('2026-09-30')).toBe('1585')
  })

  it('módulos 10 e 11 conferem com um boleto real (Banco do Brasil)', () => {
    expect(mod10('001905009')).toBe(5)
    expect(mod10('4014481606')).toBe(9)
    expect(mod10('0680935031')).toBe(4)
    const barCode = '00193373700000001000500940144816060680935031'
    expect(mod11Barcode(barCode.slice(0, 4) + barCode.slice(5))).toBe(Number(barCode[4]))
  })

  it('código de barras (44) e linha digitável (47) são coerentes', () => {
    const { barCode, identificationField: line } = buildBoletoNumbers({
      amount: 79.7,
      dueDate: '2026-09-30',
      seed: 'sim_pay_boleto_0_abcd1234',
    })
    expect(barCode).toMatch(/^\d{44}$/)
    expect(line).toMatch(/^\d{47}$/)
    expect(barCode.slice(0, 4)).toBe('9999')
    expect(barCode.slice(5, 9)).toBe('1585')
    expect(barCode.slice(9, 19)).toBe('0000007970')
    expect(Number(barCode[4])).toBe(mod11Barcode(barCode.slice(0, 4) + barCode.slice(5)))
    // Campos da linha com seus DVs
    expect(Number(line[9])).toBe(mod10(line.slice(0, 9)))
    expect(Number(line[20])).toBe(mod10(line.slice(10, 20)))
    expect(Number(line[31])).toBe(mod10(line.slice(21, 31)))
    expect(line[32]).toBe(barCode[4])
    expect(line.slice(33)).toBe(barCode.slice(5, 19))
    // Campo livre idêntico nos dois
    expect(line.slice(4, 9) + line.slice(10, 20) + line.slice(21, 31)).toBe(barCode.slice(19))
    expect(formatBoletoLine(line)).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/)
  })

  it('é determinístico pela semente', () => {
    const a = buildBoletoNumbers({ amount: 10, dueDate: '2026-10-01', seed: 'x' })
    const b = buildBoletoNumbers({ amount: 10, dueDate: '2026-10-01', seed: 'x' })
    expect(a).toEqual(b)
  })
})

describe('quoteClubPlan', () => {
  it('soma dependentes pagos e respeita o teto', () => {
    const quote = quoteClubPlan({ priceMonthly: 49.9, priceDependentMonthly: 14.9, maxDependents: 3 }, 2)
    expect(quote.total).toBe(79.7)
    expect(quote.dependentsTotal).toBe(29.8)
    expect(quote.withinLimit).toBe(true)
    expect(quoteClubPlan({ priceMonthly: 49.9, priceDependentMonthly: 14.9, maxDependents: 3 }, 4).withinLimit).toBe(false)
  })

  it('null = dependentes inclusos e sem limite', () => {
    const quote = quoteClubPlan({ priceMonthly: 69.9, priceDependentMonthly: null, maxDependents: null }, 7)
    expect(quote.total).toBe(69.9)
    expect(quote.withinLimit).toBe(true)
  })

  it('0 dependentes permitidos = individual', () => {
    expect(quoteClubPlan({ priceMonthly: 19.9, priceDependentMonthly: 0, maxDependents: 0 }, 1).withinLimit).toBe(false)
  })
})

describe('Carteirinha', () => {
  it('prefixo sai das 3 primeiras letras do slug', () => {
    expect(cardPrefixFromSlug('mapcard2')).toBe('MAP')
    expect(cardPrefixFromSlug('12-34')).toBe('CLB')
    expect(cardPrefixFromSlug('m1e2p3card')).toBe('MEP')
  })

  it('titular e dependente no formato do mock', () => {
    const holder = holderCardNumber('MAP', 2026, 42)
    expect(holder).toBe('MAP-2026-00042')
    expect(dependentCardNumber(holder, 1)).toBe('MAP-2026-00042-01')
    expect(new RegExp(holderCardPattern('MAP', 2026)).test(holder)).toBe(true)
    expect(new RegExp(holderCardPattern('MAP', 2026)).test('MAP-2026-00042-01')).toBe(false)
  })
})

describe('Datas (America/Sao_Paulo)', () => {
  it('"hoje" é o dia de São Paulo, não o de UTC', () => {
    expect(todaySP(new Date('2026-09-28T02:30:00Z'))).toBe('2026-09-27')
    expect(todaySP(new Date('2026-09-28T03:30:00Z'))).toBe('2026-09-28')
  })

  it('+1 mês preso ao dia de vencimento (≤ 28)', () => {
    expect(dueDayOf('2026-01-31')).toBe(28)
    expect(addMonthsOnDueDay('2026-01-31', 1, 28)).toBe('2026-02-28')
    expect(addMonthsOnDueDay('2026-12-10', 1, 10)).toBe('2027-01-10')
    expect(addMonthsOnDueDay('2026-03-10', -3, 10)).toBe('2025-12-10')
  })

  it('últimos meses, do mais antigo ao atual', () => {
    expect(lastMonths('2026-02-15', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('Automação — transições com datas fixas', () => {
  const settings = {
    generateDaysBefore: 10,
    reminderDaysBefore: 3,
    maxCardRetries: 3,
    cardRetryIntervalHours: 24,
    suspendAfterDays: 15,
    cancelAfterDays: 60,
  }
  const today = '2026-09-27'
  const now = new Date('2026-09-27T15:00:00Z')

  it('gera o ciclo só dentro da janela e para assinatura viva', () => {
    expect(shouldGenerateCycle('active', '2026-10-07', today, settings)).toBe(true)
    expect(shouldGenerateCycle('active', '2026-10-08', today, settings)).toBe(false)
    expect(shouldGenerateCycle('past_due', '2026-09-20', today, settings)).toBe(true)
    expect(shouldGenerateCycle('suspended', '2026-09-20', today, settings)).toBe(false)
    expect(cyclePeriod('2026-10-07', 7)).toEqual({ periodStart: '2026-10-07', periodEnd: '2026-11-07', dueDate: '2026-10-07' })
  })

  it('checkout abandonado depois de 7 dias', () => {
    expect(isAbandonedCheckout('2026-09-20', today)).toBe(false)
    expect(isAbandonedCheckout('2026-09-19', today)).toBe(true)
  })

  it('retentativa de cartão respeita vencimento, limite e intervalo', () => {
    const base = {
      method: 'credit_card' as const,
      status: 'failed' as const,
      dueDate: '2026-09-27',
      attempts: 1,
      lastAttemptAt: new Date('2026-09-26T14:00:00Z'),
      gatewayChargeId: null,
    }
    expect(isCardRetryDue(base, today, now, settings)).toBe(true)
    expect(isCardRetryDue({ ...base, lastAttemptAt: new Date('2026-09-27T01:00:00Z') }, today, now, settings)).toBe(false)
    expect(isCardRetryDue({ ...base, attempts: 3 }, today, now, settings)).toBe(false)
    expect(isCardRetryDue({ ...base, dueDate: '2026-09-28' }, today, now, settings)).toBe(false)
    expect(isCardRetryDue({ ...base, status: 'pending', attempts: 0, lastAttemptAt: null }, today, now, settings)).toBe(true)
    expect(isCardRetryDue({ ...base, method: 'pix' }, today, now, settings)).toBe(false)
  })

  it('lembrete na janela de 3 dias, uma vez só', () => {
    const charge = { status: 'pending' as const, dueDate: '2026-09-30', reminderSentAt: null }
    expect(isReminderDue(charge, today, settings)).toBe(true)
    expect(isReminderDue({ ...charge, dueDate: '2026-10-01' }, today, settings)).toBe(false)
    expect(isReminderDue({ ...charge, dueDate: '2026-09-26' }, today, settings)).toBe(false)
    expect(isReminderDue({ ...charge, reminderSentAt: now }, today, settings)).toBe(false)
  })

  it('vence Pix/boleto no dia seguinte e cartão só sem tentativas', () => {
    expect(shouldMarkOverdue({ method: 'pix', status: 'pending', dueDate: '2026-09-26', attempts: 0 }, today, settings)).toBe(true)
    expect(shouldMarkOverdue({ method: 'boleto', status: 'pending', dueDate: '2026-09-27', attempts: 0 }, today, settings)).toBe(false)
    expect(shouldMarkOverdue({ method: 'credit_card', status: 'failed', dueDate: '2026-09-20', attempts: 2 }, today, settings)).toBe(false)
    expect(shouldMarkOverdue({ method: 'credit_card', status: 'failed', dueDate: '2026-09-20', attempts: 3 }, today, settings)).toBe(true)
  })

  it('suspende aos 15 dias e cancela aos 60 (cancelar vence)', () => {
    expect(delinquencyAction('past_due', '2026-09-13', today, settings)).toBe(null)
    expect(delinquencyAction('past_due', '2026-09-12', today, settings)).toBe('suspend')
    expect(delinquencyAction('suspended', '2026-09-12', today, settings)).toBe(null)
    expect(delinquencyAction('suspended', '2026-07-29', today, settings)).toBe('cancel')
    expect(delinquencyAction('past_due', '2026-07-01', today, settings)).toBe('cancel')
    expect(delinquencyAction('active', '2026-07-01', today, settings)).toBe(null)
    expect(delinquencyAction('past_due', null, today, settings)).toBe(null)
  })
})

describe('Chave das rotas públicas do checkout', () => {
  it('HMAC com 32 caracteres, válida só para a própria assinatura', () => {
    const id = '6f1c2b1e-1111-4222-8333-944455556666'
    const key = checkoutAccessKey(id)
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(isValidCheckoutAccessKey(id, key)).toBe(true)
    expect(isValidCheckoutAccessKey('6f1c2b1e-1111-4222-8333-944455556667', key)).toBe(false)
    expect(isValidCheckoutAccessKey(id, key.slice(0, 31))).toBe(false)
    expect(isValidCheckoutAccessKey(id, undefined)).toBe(false)
  })
})
