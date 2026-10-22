import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createManualClubChargeInput, formatBRL, type CreateManualClubChargeInput } from '@annetec/contracts'
import { webBaseUrl } from '@/config/env'
import { renderEmail, type ClubEmailTemplate } from '@/lib/email/templates'

/**
 * "Gerar cobrança" do admin (adiantar mensalidade / avulsa) com um banco FALSO
 * em memória que respeita o unique parcial `(subscription_id, period_start)
 * WHERE kind = 'cycle'` e o de `idempotency_key`. Gateway e e-mail são fakes
 * injetados no serviço. Nenhuma conexão real.
 */

const store = vi.hoisted(() => ({
  charges: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  seq: 0,
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }

  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve(ops)).then(onFulfilled, onRejected)
            } catch (error) {
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
          }
        }
        return (...args: unknown[]) => {
          ops.push({ name: String(prop), args })
          return proxy
        }
      },
    })
    return proxy
  }
  const arg = (ops: Op[], name: string) => ops.find(op => op.name === name)?.args[0] as Record<string, unknown>

  const db = {
    select: () => chain(() => []),
    insert: (table: unknown) =>
      chain(ops => {
        const values = arg(ops, 'values')
        if (table === schema.paymentEvents) {
          store.events.push(values)
          return []
        }
        if (table !== schema.clubCharges) return []
        const kind = (values.kind as string) ?? 'cycle'
        const periodClash =
          kind === 'cycle' &&
          store.charges.some(c => c.kind === 'cycle' && c.subscriptionId === values.subscriptionId && c.periodStart === values.periodStart)
        const keyClash =
          values.idempotencyKey != null &&
          store.charges.some(c => c.subscriptionId === values.subscriptionId && c.idempotencyKey === values.idempotencyKey)
        if (periodClash || keyClash) {
          if (ops.some(op => op.name === 'onConflictDoNothing')) return []
          throw new Error('duplicate key value violates unique constraint')
        }
        const row = {
          id: `00000000-0000-4000-8000-${String(++store.seq).padStart(12, '0')}`,
          kind,
          status: 'pending',
          attempts: 0,
          failureReason: null,
          gatewayChargeId: null,
          pixPayload: null,
          pixQrCode: null,
          pixExpiresAt: null,
          boletoIdentificationField: null,
          boletoBarCode: null,
          boletoUrl: null,
          invoiceUrl: null,
          cardBrand: null,
          cardLast4: null,
          paidAt: null,
          paidAmount: null,
          canceledAt: null,
          refundedAt: null,
          createdAt: new Date('2026-10-09T15:00:00Z'),
          updatedAt: new Date('2026-10-09T15:00:00Z'),
          ...values,
        }
        store.charges.push(row)
        return [row]
      }),
    update: () => chain(() => []),
    execute: async () => [],
    transaction: async (work: (tx: unknown) => unknown) => work(db),
  }
  return { db, sql: {} }
})

const { manualChargesService } = await import('@/modules/club-billing/manual-charges.service')
const { generateCycleCharge, nextCycleOf } = await import('@/modules/club-billing/cycle.service')
const { cyclePeriod } = await import('@/modules/club-billing/automation.rules')
const rules = await import('@/modules/club-billing/manual-charges.rules')
const { AppError } = await import('@/http/errors')
const { deliverReminder } = await import('@/modules/club-billing/automation.service')
type ManualChargeDeps = import('@/modules/club-billing/manual-charges.service').ManualChargeDeps
type SubscriptionRow = import('@/modules/club-billing/presenter').SubscriptionRow
type ChargeRow = import('@/modules/club-billing/presenter').ChargeRow

const ORG = 'org-1'
const SUB_ID = '6f1c2b1e-1111-4222-8333-944455556667'
const TODAY = '2026-10-09'

function subscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: SUB_ID,
    organizationId: ORG,
    clubPlanId: null,
    userId: 'user-1',
    planName: 'Plus',
    planPriceMonthly: '39.90',
    dependentPriceMonthly: '10.00',
    includedDependents: 0,
    enrollmentFee: '0',
    amount: '49.90',
    paymentMethod: 'pix',
    status: 'active',
    dueDay: 10,
    holderName: 'Maria Souza',
    holderCpf: '52998224725',
    holderEmail: 'maria@clube.mapcard2.test',
    holderPhone: null,
    holderBirthDate: null,
    cardNumber: 'MAP-2026-00001',
    startedAt: new Date('2026-09-10T12:00:00Z'),
    currentPeriodStart: '2026-10-10',
    currentPeriodEnd: '2026-11-10',
    nextDueDate: '2026-11-10',
    gatewayProvider: 'asaas',
    gatewayCustomerId: 'cus_1',
    cardToken: null,
    cardBrand: null,
    cardLast4: null,
    cardExpiry: null,
    suspendedAt: null,
    canceledAt: null,
    cancelReason: null,
    source: 'checkout',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    updatedAt: new Date('2026-09-10T12:00:00Z'),
    ...overrides,
  }
}

const findCharge = (id: string) => store.charges.find(c => c.id === id) as ChargeRow

function deps(sub: SubscriptionRow, overrides: Partial<ManualChargeDeps> = {}) {
  const submit = vi.fn<ManualChargeDeps['submit']>(async (chargeId, attempt) => {
    const row = findCharge(chargeId)
    if (attempt.method === 'pix') Object.assign(row, { gatewayChargeId: `pay_${chargeId.slice(-4)}`, pixPayload: '000201pix-teste' })
    if (attempt.method === 'boleto') Object.assign(row, { gatewayChargeId: `pay_${chargeId.slice(-4)}`, boletoIdentificationField: '1'.repeat(47) })
    return { ...row }
  })
  const notify = vi.fn<ManualChargeDeps['notify']>(async () => 'sent')
  const record = vi.fn<ManualChargeDeps['record']>(async input => {
    store.events.push(input as unknown as Record<string, unknown>)
  })
  const markReminded = vi.fn<ManualChargeDeps['markReminded']>(async chargeId => {
    Object.assign(findCharge(chargeId), { reminderSentAt: new Date() })
  })
  const all: Partial<ManualChargeDeps> = {
    loadSubscription: async () => sub,
    loadSettings: async () => ({ enabledMethods: ['pix', 'boleto', 'credit_card'], boletoDueDays: 3, reminderDaysBefore: 3 }),
    resolveProvider: async () => 'asaas',
    loadOrgName: async () => 'Mapcard Benefícios',
    findCycleCharge: async (subscriptionId, periodStart) =>
      (store.charges.find(c => c.kind === 'cycle' && c.subscriptionId === subscriptionId && c.periodStart === periodStart) as ChargeRow) ?? null,
    findByIdempotencyKey: async (subscriptionId, key) =>
      (store.charges.find(c => c.subscriptionId === subscriptionId && c.idempotencyKey === key) as ChargeRow) ?? null,
    insertOneOff: async values => {
      const { db } = await import('@/db/client')
      const { clubCharges } = await import('@/db/schema')
      const [row] = await db.insert(clubCharges).values(values).onConflictDoNothing().returning()
      return row ?? null
    },
    record,
    submit,
    notify,
    markReminded,
    today: () => TODAY,
    ...overrides,
  }
  return { all, submit, notify, record, markReminded }
}

const advance = (extra: Partial<CreateManualClubChargeInput> = {}): CreateManualClubChargeInput =>
  ({ type: 'advance', method: 'pix', chargeSavedCard: false, ...extra }) as CreateManualClubChargeInput

const oneOff = (extra: Record<string, unknown> = {}): CreateManualClubChargeInput =>
  ({
    type: 'one_off',
    method: 'pix',
    chargeSavedCard: false,
    description: '2ª via da carteirinha física',
    amount: 5,
    dueDate: '2026-10-12',
    ...extra,
  }) as CreateManualClubChargeInput

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as InstanceType<typeof AppError>
  }
  throw new Error('esperava erro')
}

beforeEach(() => {
  store.charges = []
  store.events = []
  store.seq = 0
})

describe('Adiantar mensalidade', () => {
  it('gera o PRÓXIMO período com o mesmo cálculo da automação, e a automação não duplica', async () => {
    const sub = subscription()
    const { all, submit, notify } = deps(sub)

    const result = await manualChargesService.create(ORG, SUB_ID, advance(), { actorUserId: 'admin-1' }, all)

    expect(result.outcome).toBe('created')
    expect(result.reused).toBe(false)
    const expected = cyclePeriod('2026-11-10', 10)
    expect(result.charge).toMatchObject({
      kind: 'cycle',
      periodStart: expected.periodStart,
      periodEnd: '2026-12-10',
      dueDate: '2026-11-10', // vencimento do ciclo não muda
      amount: 49.9,
      method: 'pix',
      description: 'Mapcard Benefícios · Plano Plus · 11/2026',
    })
    // Mesmo período/descrição que a automação calcularia para esta assinatura.
    expect(nextCycleOf(sub, 'Mapcard Benefícios')).toMatchObject({
      periodStart: result.charge.periodStart,
      description: result.charge.description,
    })
    expect(submit).toHaveBeenCalledWith(result.charge.id, expect.objectContaining({ method: 'pix', source: 'manual' }))
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'charge_created', advance: true, source: 'manual' }))
    // Vence em 32 dias: o lembrete da régua continua valendo.
    expect(findCharge(result.charge.id).reminderSentAt ?? null).toBeNull()

    // A automação roda o MESMO gerador: o período já existe → null, sem 2ª linha nem 2º evento.
    const again = await generateCycleCharge(sub, { orgName: 'Mapcard Benefícios', provider: 'asaas', source: 'automation' })
    expect(again).toBeNull()
    expect(store.charges.filter(c => c.kind === 'cycle')).toHaveLength(1)
    expect(store.events.filter(e => e.type === 'CHARGE_GENERATED')).toHaveLength(1)
    expect(String(store.events[0]!.message)).toContain('adiantada pelo administrador')
  })

  it('indisponível quando a próxima mensalidade já existe (prévia e criação)', async () => {
    const sub = subscription()
    await generateCycleCharge(sub, { orgName: 'Mapcard Benefícios', provider: 'asaas', source: 'automation' })
    const existing = store.charges[0]!
    const { all, submit } = deps(sub)

    const preview = await manualChargesService.preview(ORG, SUB_ID, all)
    expect(preview.advance.available).toBe(false)
    expect(preview.advance.unavailableReason).toBe('A próxima mensalidade (vence 10/11) já foi gerada')
    expect(preview.advance.existingCharge).toMatchObject({ id: existing.id, dueDate: '2026-11-10' })

    const error = await rejection(manualChargesService.create(ORG, SUB_ID, advance(), { actorUserId: 'admin-1' }, all))
    expect(error.status).toBe(409)
    expect(error.message).toBe('A próxima mensalidade (vence 10/11) já foi gerada')
    expect(submit).not.toHaveBeenCalled()
  })

  it('prévia traz preferência, métodos do clube e cartão salvo mascarado', async () => {
    const sub = subscription({ paymentMethod: 'credit_card', cardToken: 'tok_x', cardBrand: 'visa', cardLast4: '4444', cardExpiry: '12/2030' })
    const { all } = deps(sub, { loadSettings: async () => ({ enabledMethods: ['pix', 'credit_card'], boletoDueDays: 3, reminderDaysBefore: 3 }) })
    const preview = await manualChargesService.preview(ORG, SUB_ID, all)
    expect(preview).toMatchObject({
      eligible: true,
      preferredMethod: 'credit_card',
      enabledMethods: ['pix', 'credit_card'],
      savedCard: { brand: 'visa', last4: '4444', expiry: '12/2030' },
      advance: { available: true, amount: 49.9, label: 'Mensalidade 11/2026', dueDate: '2026-11-10' },
      oneOff: { minDueDate: TODAY, maxDueDate: '2026-12-08', defaultDueDate: '2026-10-12', maxAmount: 10000 },
    })
    expect(JSON.stringify(preview)).not.toContain('tok_x')
  })
})

describe('Cobrança avulsa', () => {
  it('cria avulsa com período vazio na emissão, sem tocar no ciclo, e avisa o associado', async () => {
    const sub = subscription()
    const { all, submit, notify, record } = deps(sub)
    const result = await manualChargesService.create(ORG, SUB_ID, oneOff(), { actorUserId: 'admin-1' }, all)

    expect(result.outcome).toBe('created')
    expect(result.charge).toMatchObject({
      kind: 'one_off',
      description: '2ª via da carteirinha física',
      amount: 5,
      dueDate: '2026-10-12',
      periodStart: TODAY,
      periodEnd: TODAY,
    })
    expect(result.charge.pix?.payload).toBe('000201pix-teste')
    expect(submit).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'charge_created', advance: false }))
    expect(record.mock.calls[0]![0]).toMatchObject({ type: 'CHARGE_GENERATED', source: 'manual', actorUserId: 'admin-1' })
    // Vence em 3 dias (dentro da janela do lembrete): o aviso de criação já conta como lembrete.
    expect(findCharge(result.charge.id).reminderSentAt).toBeInstanceOf(Date)
    // Avulsa fica fora do unique de período: o adiantamento continua disponível.
    const preview = await manualChargesService.preview(ORG, SUB_ID, all)
    expect(preview.advance.available).toBe(true)
  })

  it('valida descrição, valor e vencimento (schema e serviço)', async () => {
    const parse = (extra: Record<string, unknown>) => createManualClubChargeInput.safeParse({ ...oneOff(), ...extra })
    expect(parse({}).success).toBe(true)
    expect(parse({ description: '   ' }).success).toBe(false)
    expect(parse({ description: 'x'.repeat(81) }).success).toBe(false)
    expect(parse({ amount: 0 }).success).toBe(false)
    expect(parse({ amount: 10_000.01 }).success).toBe(false)
    expect(parse({ amount: 10_000 }).success).toBe(true)
    expect(parse({ amount: 1.234 }).success).toBe(false)
    expect(parse({ chargeSavedCard: true }).success).toBe(false) // cartão salvo só com método cartão

    const { all, submit } = deps(subscription())
    const past = await rejection(manualChargesService.create(ORG, SUB_ID, oneOff({ dueDate: '2026-10-08' }), { actorUserId: null }, all))
    expect(past.status).toBe(400)
    expect(past.issues?.[0]).toMatchObject({ path: 'dueDate' })
    const far = await rejection(manualChargesService.create(ORG, SUB_ID, oneOff({ dueDate: '2026-12-09' }), { actorUserId: null }, all))
    expect(far.issues?.[0]?.message).toContain('60 dias')
    expect(await manualChargesService.create(ORG, SUB_ID, oneOff({ dueDate: '2026-12-08' }), { actorUserId: null }, all)).toMatchObject({
      outcome: 'created',
    })

    const disabled = deps(subscription(), { loadSettings: async () => ({ enabledMethods: ['pix'], boletoDueDays: 3, reminderDaysBefore: 3 }) })
    const methodError = await rejection(
      manualChargesService.create(ORG, SUB_ID, oneOff({ method: 'boleto' }), { actorUserId: null }, disabled.all),
    )
    expect(methodError.issues?.[0]).toMatchObject({ path: 'method' })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(disabled.submit).not.toHaveBeenCalled()
  })

  it('regras puras: elegibilidade, janela e cartão utilizável', () => {
    expect(rules.manualChargeIneligibility('active')).toBeNull()
    expect(rules.manualChargeIneligibility('past_due')).toBeNull()
    expect(rules.manualChargeIneligibility('suspended')).toContain('suspensa')
    expect(rules.oneOffDueDateIssue('2026-10-09', TODAY)).toBeNull()
    expect(rules.oneOffDueDateIssue('2026-12-08', TODAY)).toBeNull()
    expect(rules.oneOffDueDateIssue('2026-12-09', TODAY)).not.toBeNull()
    const card = { cardToken: 'tok', cardBrand: 'mastercard', cardLast4: '4444', cardExpiry: null, gatewayProvider: 'asaas' as const }
    expect(rules.usableSavedCard(card, 'asaas')).toEqual({ brand: 'mastercard', last4: '4444', expiry: null })
    expect(rules.usableSavedCard(card, 'simulated')).toBeNull() // token de outro gateway não vale
    expect(rules.usableSavedCard({ ...card, cardToken: null }, 'asaas')).toBeNull()
  })
})

describe('Cartão salvo (gateway fake)', () => {
  const withCard = () => subscription({ paymentMethod: 'credit_card', cardToken: 'tok_1', cardBrand: 'visa', cardLast4: '4444' })

  it('aprovado: cobra o token na hora e manda o comprovante', async () => {
    const sub = withCard()
    const { all, submit, notify } = deps(sub, {
      submit: vi.fn(async (chargeId: string) => {
        const row = findCharge(chargeId)
        Object.assign(row, { status: 'paid', paidAt: new Date(), paidAmount: row.amount, cardBrand: 'visa', cardLast4: '4444', gatewayChargeId: 'pay_card' })
        return { ...row }
      }),
    })
    const result = await manualChargesService.create(
      ORG,
      SUB_ID,
      oneOff({ method: 'credit_card', chargeSavedCard: true, amount: 49.9 }),
      { actorUserId: 'admin-1' },
      all,
    )
    expect(result.outcome).toBe('card_approved')
    expect(result.charge.status).toBe('paid')
    expect(all.submit).toHaveBeenCalledWith(result.charge.id, expect.objectContaining({ method: 'credit_card', useSavedCard: true }))
    expect(submit).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'payment_confirmed' }))
  })

  it('recusado: devolve o motivo e não avisa o associado', async () => {
    const sub = withCard()
    const { all, notify } = deps(sub, {
      submit: vi.fn(async (chargeId: string) => {
        const row = findCharge(chargeId)
        Object.assign(row, { status: 'failed', attempts: 1, failureReason: 'Transação não autorizada' })
        return { ...row }
      }),
    })
    const result = await manualChargesService.create(ORG, SUB_ID, advance({ method: 'credit_card', chargeSavedCard: true }), { actorUserId: null }, all)
    expect(result).toMatchObject({ outcome: 'card_declined', message: 'Transação não autorizada', notice: 'skipped' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('sem cartão salvo: "cobrar agora" é recusado (422) e o link não cobra nada', async () => {
    const sub = subscription({ paymentMethod: 'credit_card' })
    const { all, submit, notify } = deps(sub)
    const error = await rejection(
      manualChargesService.create(ORG, SUB_ID, oneOff({ method: 'credit_card', chargeSavedCard: true }), { actorUserId: null }, all),
    )
    expect(error.status).toBe(422)
    const link = await manualChargesService.create(ORG, SUB_ID, oneOff({ method: 'credit_card' }), { actorUserId: null }, all)
    expect(link).toMatchObject({ outcome: 'created', charge: { method: 'credit_card', status: 'pending' } })
    expect(submit).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'charge_created' }))
  })
})

describe('Elegibilidade e idempotência', () => {
  it('assinatura cancelada (ou suspensa) → 422, nada gravado', async () => {
    for (const status of ['canceled', 'suspended', 'pending_payment'] as const) {
      const { all, submit } = deps(subscription({ status }))
      const error = await rejection(manualChargesService.create(ORG, SUB_ID, oneOff(), { actorUserId: null }, all))
      expect(error.status).toBe(422)
      expect(submit).not.toHaveBeenCalled()
      const preview = await manualChargesService.preview(ORG, SUB_ID, all)
      expect(preview.eligible).toBe(false)
      expect(preview.advance.available).toBe(false)
    }
    expect(store.charges).toHaveLength(0)
  })

  it('mesma chave de idempotência devolve a mesma cobrança, sem 2º envio nem 2º e-mail', async () => {
    const { all, submit, notify } = deps(subscription())
    const input = oneOff({ idempotencyKey: 'gc-chave-unica-123' })
    const first = await manualChargesService.create(ORG, SUB_ID, input, { actorUserId: null }, all)
    const second = await manualChargesService.create(ORG, SUB_ID, input, { actorUserId: null }, all)
    expect(second.reused).toBe(true)
    expect(second.charge.id).toBe(first.charge.id)
    expect(store.charges).toHaveLength(1)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)

    const advanceInput = advance({ idempotencyKey: 'gc-chave-adiantamento' })
    const a1 = await manualChargesService.create(ORG, SUB_ID, advanceInput, { actorUserId: null }, all)
    const a2 = await manualChargesService.create(ORG, SUB_ID, advanceInput, { actorUserId: null }, all)
    expect(a2).toMatchObject({ reused: true, charge: { id: a1.charge.id } })
  })

  it('clique duplo simultâneo: o segundo pedido recebe 409 enquanto o primeiro gera', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const { all } = deps(subscription(), {
      submit: vi.fn(async (chargeId: string) => {
        await gate
        return { ...findCharge(chargeId) }
      }),
    })
    const first = manualChargesService.create(ORG, SUB_ID, oneOff(), { actorUserId: null }, all)
    await new Promise(resolve => setTimeout(resolve, 0))
    const error = await rejection(manualChargesService.create(ORG, SUB_ID, oneOff(), { actorUserId: null }, all))
    expect(error.status).toBe(409)
    release()
    await expect(first).resolves.toMatchObject({ outcome: 'created' })
    expect(store.charges).toHaveLength(1)
  })
})

describe('E-mails ao associado (white label)', () => {
  const FORBIDDEN = /annetec|asaas/i
  const sub = {
    id: SUB_ID,
    organizationId: ORG,
    holderName: 'Maria Souza',
    holderEmail: 'maria@clube.mapcard2.test',
    planName: 'Plus',
    gatewayProvider: 'asaas' as const,
  }
  const charge = {
    id: 'chg-1',
    kind: 'one_off' as const,
    description: '2ª via da carteirinha física',
    amount: '5.00',
    dueDate: '2026-10-12',
    periodStart: TODAY,
    method: 'pix' as const,
    gatewayProvider: 'asaas' as const,
    pixPayload: '000201pix-copia-e-cola',
    boletoIdentificationField: null,
  }

  async function sent(notice: Parameters<typeof deliverReminder>[0]) {
    const send = vi.fn(async () => ({ id: 'email-1', status: 'simulated' as const }))
    const record = vi.fn(async () => {})
    const outcome = await deliverReminder(notice, {
      send,
      record,
      loadTenant: async () => ({ name: 'Mapcard Benefícios', slug: 'mapcard2', primaryColor: '#0f766e', logoUrl: null }),
      production: false,
    })
    const input = (send.mock.calls[0] as unknown as [{ template: string; data: Record<string, unknown> }])[0]
    return { outcome, input, rendered: renderEmail(input.template as ClubEmailTemplate, input.data), record }
  }

  it('avulsa: "nova cobrança de R$ X" com Pix copia e cola e link da fatura', async () => {
    const { outcome, input, rendered, record } = await sent({ kind: 'charge_created', sub, charge, source: 'manual', actorUserId: 'admin-1' })
    expect(outcome).toBe('sent')
    expect(input.template).toBe('club_charge_created')
    expect(rendered.subject).toBe(`Mapcard Benefícios: nova cobrança de ${formatBRL(5)}`)
    expect(rendered.text).toContain('2ª via da carteirinha física')
    expect(rendered.text).toContain('000201pix-copia-e-cola')
    expect(rendered.text).toContain(`${webBaseUrl}/mapcard2/cliente/faturas?cobranca=chg-1`)
    expect(rendered.from).toMatch(/^Mapcard Benefícios </)
    expect(`${rendered.subject}\n${rendered.text}\n${rendered.html}`).not.toMatch(FORBIDDEN)
    expect(record.mock.calls[0]).toEqual([expect.objectContaining({ source: 'manual', actorUserId: 'admin-1', payload: expect.objectContaining({ kind: 'charge_created' }) })])
  })

  it('adiantamento: "sua mensalidade de {mês} já está disponível"; cartão leva "Pagar com cartão"', async () => {
    const { rendered } = await sent({
      kind: 'charge_created',
      sub,
      advance: true,
      charge: { ...charge, kind: 'cycle', periodStart: '2026-11-10', dueDate: '2026-11-10', method: 'credit_card', pixPayload: null, amount: '49.90' },
    })
    expect(rendered.subject).toBe('Mapcard Benefícios: sua mensalidade de novembro de 2026 já está disponível')
    expect(rendered.html).toContain('Pagar com cartão')
    expect(rendered.html).toContain('/mapcard2/cliente/faturas?cobranca=chg-1')
    expect(rendered.text).toContain('não muda')
  })

  it('comprovante do cartão salvo: "pagamento de R$ X confirmado"', async () => {
    const { input, rendered } = await sent({
      kind: 'payment_confirmed',
      sub,
      charge: { ...charge, method: 'credit_card', pixPayload: null, paidAt: new Date('2026-10-09T15:00:00Z'), paidAmount: '5.00', cardBrand: 'visa', cardLast4: '4444' },
    })
    expect(input.template).toBe('club_payment_confirmed')
    expect(rendered.subject).toBe(`Mapcard Benefícios: pagamento de ${formatBRL(5)} confirmado`)
    expect(rendered.text).toContain('Visa •••• 4444')
    expect(`${rendered.subject}\n${rendered.text}\n${rendered.html}`).not.toMatch(FORBIDDEN)
  })

  it('lembrete da avulsa fala da cobrança, não da mensalidade', () => {
    const rendered = renderEmail('club_charge_reminder', {
      clubName: 'Mapcard Benefícios',
      holderName: 'Maria',
      chargeKind: 'one_off',
      description: '2ª via da carteirinha física',
      amount: 5,
      dueDate: '2026-10-12',
      method: 'pix',
      payUrl: 'http://web/mapcard2/cliente/faturas?cobranca=chg-1',
    })
    expect(rendered.subject).toBe(`Mapcard Benefícios: sua cobrança de ${formatBRL(5)} vence em 12/10/2026`)
    expect(rendered.text).not.toContain('mensalidade')
  })
})
