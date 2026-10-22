import { describe, expect, it, vi } from 'vitest'
import { webBaseUrl } from '@/config/env'
import { PLANOS_COMPLETOS } from '@/db/planos-completos'
import { renderEmail, type ClubEmailTemplate } from '@/lib/email/templates'
import { deliverReminder, type ClubNotice, type NoticeDeps } from '@/modules/club-billing/automation.service'

/**
 * Avisos de cobrança do clube ao associado (white label): envio pelo provedor
 * de e-mail FALSO injetado, timeline com `delivered` correto (enviado, falhou,
 * sem e-mail) e template sem marca da plataforma nem do gateway. Sem banco.
 */

const sub: ClubNotice['sub'] = {
  id: 'sub-1',
  organizationId: 'org-1',
  holderName: 'Maria Souza',
  holderEmail: 'maria@exemplo.com',
  planName: 'Plus',
  gatewayProvider: 'asaas',
}

const charge: NonNullable<ClubNotice['charge']> = {
  id: 'chg-1',
  description: 'Clube Viva Mais · Plano Plus · Outubro de 2026',
  amount: '49.90',
  dueDate: '2026-10-15',
  method: 'pix',
  gatewayProvider: 'asaas',
  pixPayload: '00020126580014br.gov.bcb.pix0136chave-pix-teste520400005303986540549.905802BR6304ABCD',
  boletoIdentificationField: null,
}

function fakeDeps(sendResult: Awaited<ReturnType<NoticeDeps['send']>> | Error, production = false) {
  const send = vi.fn<NoticeDeps['send']>(async () => {
    if (sendResult instanceof Error) throw sendResult
    return sendResult
  })
  const record = vi.fn<NoticeDeps['record']>(async () => {})
  const loadTenant = vi.fn<NoticeDeps['loadTenant']>(async () => ({
    name: 'Clube Viva Mais',
    slug: 'vivamais',
    primaryColor: '#7c3aed',
    logoUrl: null,
  }))
  return { send, record, loadTenant, production }
}

const FORBIDDEN = /annetec|asaas/i

function renderedFrom(deps: ReturnType<typeof fakeDeps>) {
  const input = deps.send.mock.calls[0]![0]
  return renderEmail(input.template as unknown as ClubEmailTemplate, input.data)
}

describe('deliverReminder (lembrete ao associado)', () => {
  it('enviado: e-mail com a marca do clube e REMINDER_SENT delivered=true', async () => {
    const deps = fakeDeps({ id: 'email-1', status: 'sent' }, true)
    const outcome = await deliverReminder({ kind: 'reminder', sub, charge }, deps)

    expect(outcome).toBe('sent')
    expect(deps.send).toHaveBeenCalledTimes(1)
    const input = deps.send.mock.calls[0]![0]
    expect(input).toMatchObject({
      template: 'club_charge_reminder',
      to: { email: 'maria@exemplo.com', name: 'Maria Souza' },
      organizationId: 'org-1',
      relatedType: 'club_charge',
      relatedId: 'chg-1',
    })
    expect(input.data).toMatchObject({ clubName: 'Clube Viva Mais', portalUrl: `${webBaseUrl}/vivamais/cliente/faturas` })

    expect(deps.record).toHaveBeenCalledTimes(1)
    expect(deps.record.mock.calls[0]![0]).toMatchObject({
      type: 'REMINDER_SENT',
      source: 'automation',
      chargeId: 'chg-1',
      gatewayProvider: 'asaas',
      payload: { kind: 'reminder', delivered: true, emailId: 'email-1' },
    })

    const email = renderedFrom(deps)
    expect(email.subject).toBe('Clube Viva Mais: sua mensalidade de R$ 49,90 vence em 15/10/2026')
    expect(email.text.startsWith('Olá, Maria!\n\nEste é um lembrete do Clube Viva Mais: a mensalidade do plano Plus vence em 15/10/2026.')).toBe(true)
    expect(email.text).toContain(`Ver fatura e pagar: ${webBaseUrl}/vivamais/cliente/faturas`)
    expect(email.text).toContain('Pix copia e cola: 0002')
    expect(email.html).toContain('#7c3aed')
    expect(email.from).toMatch(/^Clube Viva Mais </)
    for (const part of [email.subject, email.text, email.html]) expect(part).not.toMatch(FORBIDDEN)
  })

  it('caixa de saída fora de produção conta como enviado', async () => {
    const deps = fakeDeps({ id: 'email-2', status: 'simulated' }, false)
    expect(await deliverReminder({ kind: 'reminder', sub, charge }, deps)).toBe('sent')
    expect(deps.record.mock.calls[0]![0].payload).toMatchObject({ delivered: true, emailStatus: 'simulated' })
  })

  it('falhou: provedor recusou → REMINDER_SENT delivered=false', async () => {
    const deps = fakeDeps({ id: 'email-3', status: 'failed' })
    expect(await deliverReminder({ kind: 'reminder', sub, charge }, deps)).toBe('failed')
    const event = deps.record.mock.calls[0]![0]
    expect(event.type).toBe('REMINDER_SENT')
    expect(event.payload).toMatchObject({ kind: 'reminder', delivered: false, emailStatus: 'failed' })
    expect(event.message).toContain('NÃO enviado')
  })

  it('falhou: só caixa de saída em produção não é entrega', async () => {
    const deps = fakeDeps({ id: 'email-4', status: 'simulated' }, true)
    expect(await deliverReminder({ kind: 'reminder', sub, charge }, deps)).toBe('failed')
    expect(deps.record.mock.calls[0]![0].payload).toMatchObject({ delivered: false, emailStatus: 'simulated' })
  })

  it('falhou: provedor lançou → não propaga, registra delivered=false', async () => {
    const deps = fakeDeps(new Error('timeout'))
    expect(await deliverReminder({ kind: 'reminder', sub, charge }, deps)).toBe('failed')
    expect(deps.record.mock.calls[0]![0].payload).toMatchObject({ delivered: false, reason: 'timeout' })
  })

  it('sem e-mail: não chama o provedor e registra pulado', async () => {
    const deps = fakeDeps({ id: 'never', status: 'sent' })
    const outcome = await deliverReminder({ kind: 'reminder', sub: { ...sub, holderEmail: '  ' }, charge }, deps)
    expect(outcome).toBe('skipped')
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.record.mock.calls[0]![0]).toMatchObject({
      type: 'REMINDER_SENT',
      payload: { kind: 'reminder', delivered: false, reason: 'no_email' },
    })
  })
})

describe('avisos de vencida e suspensão (white label)', () => {
  it('vencida: template próprio, sem marca da plataforma/gateway', async () => {
    const deps = fakeDeps({ id: 'email-5', status: 'sent' })
    const overdue = { ...charge, method: 'boleto' as const, pixPayload: null, boletoIdentificationField: '23790.00009 00000.000000 00000.000000 1 00000000004990' }
    expect(await deliverReminder({ kind: 'overdue', sub, charge: overdue, daysLate: 3 }, deps)).toBe('sent')
    expect(deps.send.mock.calls[0]![0].template).toBe('club_charge_overdue')
    const email = renderedFrom(deps)
    expect(email.subject).toBe('Clube Viva Mais: mensalidade vencida em 15/10/2026')
    expect(email.text).toContain('Linha digitável do boleto: 23790.00009')
    for (const part of [email.subject, email.text, email.html]) expect(part).not.toMatch(FORBIDDEN)
  })

  it('suspensão: avisa bloqueio das carteirinhas, mesmo sem cobrança', async () => {
    const deps = fakeDeps({ id: 'email-6', status: 'sent' })
    expect(await deliverReminder({ kind: 'suspended', sub, charge: null, daysLate: 20 }, deps)).toBe('sent')
    expect(deps.send.mock.calls[0]![0]).toMatchObject({ template: 'club_subscription_suspended', relatedType: 'club_subscription', relatedId: 'sub-1' })
    expect(deps.record.mock.calls[0]![0]).toMatchObject({ chargeId: null, gatewayProvider: 'asaas', payload: { kind: 'suspended', delivered: true } })
    const email = renderedFrom(deps)
    expect(email.subject).toBe('Clube Viva Mais: sua assinatura foi suspensa')
    expect(email.text).toContain('vencida há 20 dias')
    for (const part of [email.subject, email.text, email.html]) expect(part).not.toMatch(FORBIDDEN)
  })
})

describe('planos-modelo do inquilino novo', () => {
  it('nascem inativos (rascunho) para o admin ativar', () => {
    expect(PLANOS_COMPLETOS).toHaveLength(3)
    expect(PLANOS_COMPLETOS.map(plan => plan.priceMonthly)).toEqual([29.9, 49.9, 79.9])
    expect(PLANOS_COMPLETOS.every(plan => plan.status === 'inactive')).toBe(true)
  })
})
