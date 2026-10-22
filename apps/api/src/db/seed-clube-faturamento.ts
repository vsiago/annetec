import {
  CARD_BRAND_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  formatCpf,
  formatDateBR,
  generateCpf,
  quoteClubPlan,
  type CardBrand,
  type ClubPaymentMethod,
  type DependentRelationship,
} from '@annetec/contracts'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, inArray, isNull, like, sql as dsql } from 'drizzle-orm'
import { db, sql } from './client'
import {
  account,
  clientProfiles,
  clubBillingSettings,
  clubCharges,
  clubPlans,
  clubSubscriptionDependents,
  clubSubscriptions,
  member,
  organization,
  paymentEvents,
  tenantProfiles,
  user,
} from './schema'
import { buildBoletoNumbers } from '@/integrations/payments/boleto'
import { buildPixBrCode } from '@/integrations/payments/pix-brcode'
import { simulatedOptionsFromEnv } from '@/integrations/payments/provider'
import {
  qrCodePngBase64,
  simulatedCardToken,
  simulatedChargeId,
  simulatedCustomerId,
} from '@/integrations/payments/simulated'
import { toClubPlan } from '@/modules/network/controller'
import { cardPrefixFromSlug, dependentCardNumber, holderCardNumber, holderCardPattern } from '@/modules/club-billing/card-number'
import { addDays, addMonthsOnDueDay, dueDayOf, monthLabel, noonSP, todaySP, yearSP } from '@/modules/club-billing/dates'

// Trava de produção: seeds/scripts de demonstração gravam contas com senha
// trivial e dados fictícios. Em produção só rodam com liberação explícita.
// (Avaliado depois dos imports — `./client` só conecta na primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[seed-clube-faturamento] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * Carteira de DEMONSTRAÇÃO do faturamento do clube, para UM inquilino:
 *
 *   pnpm --filter @annetec/api demo:billing mapcard2
 *   pnpm --filter @annetec/api demo:billing mapcard2 --limpar
 *
 * Cria 12 assinantes `assinante<n>@clube.<slug>.test` (senha `demo1234`,
 * CPF `generateCpf(1000+n)`) cobrindo todos os estados: 5 em dia, 1 com
 * cartão recusado, 2 em atraso, 1 suspenso, 1 cancelado por inadimplência,
 * 1 cancelado a pedido e 1 aguardando o Pix de hoje. Cobranças usam ids
 * `sim_pay_<m>_0_<rand>` (nunca compensam sozinhas) e os MESMOS helpers do
 * gateway simulado (BR Code, boleto, carteirinha).
 *
 * Idempotente: pula quem já tem assinatura; só mexe no inquilino informado e
 * nas contas `@clube.<slug>.test`. `--limpar` apaga essas contas (e a
 * timeline delas) antes de recriar.
 */

const PASSWORD = 'demo1234'

type Kind =
  | 'active'
  | 'active_next_pending'
  | 'active_card_failed'
  | 'past_due'
  | 'suspended'
  | 'canceled_delinquency'
  | 'canceled_request'
  | 'pending'

interface DependentSeed {
  name: string
  relationship: DependentRelationship
  birthDate: string
  withCpf: boolean
}

interface Scenario {
  n: number
  name: string
  phone: string
  birthDate: string
  method: ClubPaymentMethod
  kind: Kind
  paidCycles: number
  /** Dias até o próximo vencimento (ativos em dia). */
  nextInDays?: number
  /** Dias de atraso da cobrança aberta mais antiga. */
  lateDays?: number
  card?: { brand: CardBrand; last4: string; expiry: string }
  dependents: DependentSeed[]
}

const SCENARIOS: Scenario[] = [
  {
    n: 1, name: 'Ana Beatriz Moura', phone: '21987650001', birthDate: '1986-03-14', method: 'pix',
    kind: 'active_next_pending', paidCycles: 6, nextInDays: 5,
    dependents: [
      { name: 'Paulo Henrique Moura', relationship: 'conjuge', birthDate: '1984-07-02', withCpf: true },
      { name: 'Laura Moura', relationship: 'filho', birthDate: '2014-11-20', withCpf: false },
    ],
  },
  {
    n: 2, name: 'Carlos Eduardo Lima', phone: '21987650002', birthDate: '1979-08-30', method: 'boleto',
    kind: 'active_next_pending', paidCycles: 4, nextInDays: 5,
    dependents: [{ name: 'Sofia Lima', relationship: 'filho', birthDate: '2011-05-09', withCpf: true }],
  },
  {
    n: 3, name: 'Fernanda Oliveira Santos', phone: '21987650003', birthDate: '1992-01-22', method: 'credit_card',
    kind: 'active', paidCycles: 5, nextInDays: 18, card: { brand: 'visa', last4: '1111', expiry: '08/2029' },
    dependents: [],
  },
  {
    n: 4, name: 'João Pedro Almeida', phone: '21987650004', birthDate: '1983-10-05', method: 'pix',
    kind: 'active', paidCycles: 3, nextInDays: 21,
    dependents: [
      { name: 'Renata Almeida', relationship: 'conjuge', birthDate: '1985-02-17', withCpf: true },
      { name: 'Miguel Almeida', relationship: 'filho', birthDate: '2012-06-30', withCpf: false },
      { name: 'Helena Almeida', relationship: 'filho', birthDate: '2016-09-12', withCpf: false },
    ],
  },
  {
    n: 5, name: 'Mariana Costa Ribeiro', phone: '21987650005', birthDate: '1995-12-01', method: 'boleto',
    kind: 'active', paidCycles: 4, nextInDays: 15, dependents: [],
  },
  {
    n: 6, name: 'Ricardo Nunes Ferreira', phone: '21987650006', birthDate: '1977-04-18', method: 'credit_card',
    kind: 'active_card_failed', paidCycles: 3, card: { brand: 'mastercard', last4: '0002', expiry: '11/2028' },
    dependents: [{ name: 'Clara Nunes Ferreira', relationship: 'conjuge', birthDate: '1980-12-24', withCpf: true }],
  },
  {
    n: 7, name: 'Patrícia Gomes Carvalho', phone: '21987650007', birthDate: '1989-06-11', method: 'pix',
    kind: 'past_due', paidCycles: 3, lateDays: 5,
    dependents: [{ name: 'Bruno Carvalho', relationship: 'filho', birthDate: '2010-03-03', withCpf: false }],
  },
  {
    n: 8, name: 'Lucas Martins Rocha', phone: '21987650008', birthDate: '1990-09-27', method: 'boleto',
    kind: 'past_due', paidCycles: 4, lateDays: 12,
    dependents: [
      { name: 'Aline Rocha', relationship: 'conjuge', birthDate: '1991-01-15', withCpf: true },
      { name: 'Davi Rocha', relationship: 'filho', birthDate: '2019-08-08', withCpf: false },
    ],
  },
  {
    n: 9, name: 'Juliana Pereira Dias', phone: '21987650009', birthDate: '1987-02-02', method: 'credit_card',
    kind: 'suspended', paidCycles: 2, lateDays: 20, card: { brand: 'elo', last4: '4242', expiry: '03/2028' },
    dependents: [],
  },
  {
    n: 10, name: 'Roberto Silva Barbosa', phone: '21987650010', birthDate: '1972-11-09', method: 'boleto',
    kind: 'canceled_delinquency', paidCycles: 2, lateDays: 70,
    dependents: [{ name: 'Marta Barbosa', relationship: 'conjuge', birthDate: '1974-05-21', withCpf: true }],
  },
  {
    n: 11, name: 'Camila Teixeira Souza', phone: '21987650011', birthDate: '1998-07-16', method: 'pix',
    kind: 'canceled_request', paidCycles: 3, dependents: [],
  },
  {
    n: 12, name: 'Gabriel Araújo Mendes', phone: '21987650012', birthDate: '1994-05-03', method: 'pix',
    kind: 'pending', paidCycles: 0,
    dependents: [
      { name: 'Luiza Araújo Mendes', relationship: 'conjuge', birthDate: '1995-10-10', withCpf: true },
      { name: 'Theo Araújo Mendes', relationship: 'filho', birthDate: '2021-02-14', withCpf: false },
    ],
  },
]

/** P3 dos planos — só grava onde ainda está nulo. */
const PLAN_P3: Record<string, { price: number; max: number | null }> = {
  essencial: { price: 9.9, max: 2 },
  plus: { price: 14.9, max: 3 },
  familia: { price: 0, max: 4 },
  odonto: { price: 7.9, max: null },
}

function planKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Instante `date` às `hh:mm` de São Paulo. */
function atSP(date: string, hh: number, mm = 0): Date {
  return new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`)
}

function minTime(a: Date, b: Date): Date {
  return a.getTime() < b.getTime() ? a : b
}

async function ensureAccount(orgId: string, scenario: Scenario, email: string) {
  let [row] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (!row) {
    const id = crypto.randomUUID()
    ;[row] = await db
      .insert(user)
      .values({ id, name: scenario.name, email, emailVerified: true, role: 'user', phone: scenario.phone })
      .returning()
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: 'credential',
      issuer: 'local:credential',
      password: await hashPassword(PASSWORD),
    })
  }
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, row!.id)))
    .limit(1)
  if (!membership) {
    await db.insert(member).values({ id: crypto.randomUUID(), organizationId: orgId, userId: row!.id, role: 'client' })
  }
  await db
    .insert(clientProfiles)
    .values({ userId: row!.id, organizationId: orgId, cpf: generateCpf(1000 + scenario.n) })
    .onConflictDoNothing()
  return row!
}

async function limpar(orgId: string, slug: string) {
  const pattern = `%@clube.${slug}.test`
  const users = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, orgId), like(user.email, pattern)))
  const ids = users.map(u => u.id)
  if (ids.length === 0) return
  const subs = await db
    .select({ id: clubSubscriptions.id })
    .from(clubSubscriptions)
    .where(and(eq(clubSubscriptions.organizationId, orgId), inArray(clubSubscriptions.userId, ids)))
  if (subs.length > 0) {
    await db.delete(paymentEvents).where(inArray(paymentEvents.subscriptionId, subs.map(s => s.id)))
  }
  await db.delete(user).where(inArray(user.id, ids))
  console.log(`Removidas ${ids.length} contas @clube.${slug}.test (e ${subs.length} assinaturas)`)
}

interface ChargePlan {
  periodStart: string
  status: 'paid' | 'pending' | 'overdue' | 'failed' | 'canceled'
}

async function main() {
  const slug = process.argv[2]?.toLowerCase()
  if (!slug) {
    console.error('Uso: demo:billing <slug-do-inquilino> [--limpar]')
    process.exit(1)
  }
  const [org] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug, address: tenantProfiles.address })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.slug, slug))
    .limit(1)
  if (!org) {
    console.error(`Inquilino "${slug}" não encontrado.`)
    process.exit(1)
  }
  const orgId = org.id
  if (process.argv.includes('--limpar')) await limpar(orgId, slug)

  // 1. Régua padrão.
  await db.insert(clubBillingSettings).values({ organizationId: orgId }).onConflictDoNothing()

  // 2. P3 nos planos, só onde ainda está nulo.
  const plansRows = await db.select().from(clubPlans).where(eq(clubPlans.organizationId, orgId))
  for (const plan of plansRows) {
    const p3 = PLAN_P3[planKey(plan.name)]
    if (!p3) continue
    await db
      .update(clubPlans)
      .set({ priceDependentMonthly: String(p3.price), maxDependents: p3.max, updatedAt: new Date() })
      .where(and(eq(clubPlans.id, plan.id), isNull(clubPlans.priceDependentMonthly), isNull(clubPlans.maxDependents)))
  }
  const plans = (await db.select().from(clubPlans).where(and(eq(clubPlans.organizationId, orgId), eq(clubPlans.status, 'active'))))
    .sort((a, b) => Number(a.priceMonthly) - Number(b.priceMonthly))
  if (plans.length === 0) {
    console.error('O inquilino não tem planos ativos do clube (rode demo:seed antes).')
    process.exit(1)
  }

  const options = simulatedOptionsFromEnv()
  const now = new Date()
  const today = todaySP(now)
  const prefix = cardPrefixFromSlug(org.slug)
  const merchantCity = org.address?.city ?? 'Sao Paulo'
  let created = 0
  let skipped = 0

  for (const scenario of SCENARIOS) {
    const email = `assinante${scenario.n}@clube.${slug}.test`
    const holderCpf = generateCpf(1000 + scenario.n)
    const person = await ensureAccount(orgId, scenario, email)

    const [already] = await db
      .select({ id: clubSubscriptions.id })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, orgId), eq(clubSubscriptions.userId, person.id)))
      .limit(1)
    if (already) {
      skipped += 1
      continue
    }

    // Plano: gira pela lista, respeitando o teto de dependentes.
    const ordered = [...plans.slice(scenario.n % plans.length), ...plans.slice(0, scenario.n % plans.length)]
    const plan = ordered.find(p => quoteClubPlan(toClubPlan(p), scenario.dependents.length).withinLimit) ?? ordered[0]!
    const quote = quoteClubPlan(toClubPlan(plan), scenario.dependents.length)

    // ---- Linha do tempo do cenário --------------------------------------
    let dueDay: number
    const charges: ChargePlan[] = []
    let status: 'pending_payment' | 'active' | 'past_due' | 'suspended' | 'canceled'
    let nextDueDate: string | null = null
    let openStart: string | null = null

    if (scenario.kind === 'pending') {
      dueDay = dueDayOf(today)
      charges.push({ periodStart: today, status: 'pending' })
      status = 'pending_payment'
    } else if (scenario.kind === 'active' || scenario.kind === 'active_next_pending') {
      const target = addDays(today, scenario.nextInDays ?? 15)
      dueDay = dueDayOf(target)
      nextDueDate = addMonthsOnDueDay(target, 0, dueDay)
      for (let i = scenario.paidCycles; i >= 1; i--) {
        charges.push({ periodStart: addMonthsOnDueDay(nextDueDate, -i, dueDay), status: 'paid' })
      }
      if (scenario.kind === 'active_next_pending') charges.push({ periodStart: nextDueDate, status: 'pending' })
      status = 'active'
    } else if (scenario.kind === 'active_card_failed') {
      dueDay = dueDayOf(today)
      openStart = addMonthsOnDueDay(today, 0, dueDay)
      for (let i = scenario.paidCycles; i >= 1; i--) {
        charges.push({ periodStart: addMonthsOnDueDay(openStart, -i, dueDay), status: 'paid' })
      }
      charges.push({ periodStart: openStart, status: 'failed' })
      nextDueDate = openStart
      status = 'active'
    } else if (scenario.kind === 'canceled_request') {
      const target = addDays(today, -8)
      dueDay = dueDayOf(target)
      const lastStart = addMonthsOnDueDay(target, -1, dueDay)
      for (let i = scenario.paidCycles - 1; i >= 0; i--) {
        charges.push({ periodStart: addMonthsOnDueDay(lastStart, -i, dueDay), status: 'paid' })
      }
      nextDueDate = addMonthsOnDueDay(lastStart, 1, dueDay)
      status = 'canceled'
    } else {
      const lateStart = addDays(today, -(scenario.lateDays ?? 5))
      dueDay = dueDayOf(lateStart)
      openStart = addMonthsOnDueDay(lateStart, 0, dueDay)
      for (let i = scenario.paidCycles; i >= 1; i--) {
        charges.push({ periodStart: addMonthsOnDueDay(openStart, -i, dueDay), status: 'paid' })
      }
      charges.push({
        periodStart: openStart,
        status: scenario.kind === 'canceled_delinquency' ? 'canceled' : 'overdue',
      })
      nextDueDate = openStart
      status = scenario.kind === 'past_due' ? 'past_due' : scenario.kind === 'suspended' ? 'suspended' : 'canceled'
    }

    const firstStart = charges[0]!.periodStart
    const paid = charges.filter(c => c.status === 'paid')
    const lastPaid = paid[paid.length - 1]
    const startedAt = paid.length > 0 ? atSP(firstStart, 10, 15) : null
    const suspendedAt =
      (scenario.kind === 'suspended' || scenario.kind === 'canceled_delinquency') && openStart
        ? atSP(addDays(openStart, 15), 6)
        : null
    const canceledAt =
      scenario.kind === 'canceled_delinquency' && openStart
        ? atSP(addDays(openStart, 60), 6)
        : scenario.kind === 'canceled_request'
          ? atSP(addDays(today, -8), 15, 30)
          : null
    const cancelReason =
      scenario.kind === 'canceled_delinquency'
        ? 'inadimplencia'
        : scenario.kind === 'canceled_request'
          ? 'Mudança de cidade (pedido do associado)'
          : null
    const cardToken = scenario.card ? simulatedCardToken(scenario.card.brand, scenario.card.last4) : null
    const createdAtSub = atSP(firstStart, 10, 0)

    await db.transaction(async tx => {
      // Carteirinha pelo mesmo gerador da ativação (sequencial por prefixo/ano).
      let holderCard: string | null = null
      if (startedAt) {
        const year = yearSP(startedAt)
        await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`club_card:${orgId}`}))`)
        const rows = await tx.execute(dsql`
          select coalesce(max(split_part(card_number, '-', 3)::int), 0) as max
          from club_subscriptions
          where organization_id = ${orgId} and card_number ~ ${holderCardPattern(prefix, year)}`)
        const max = Number((rows as unknown as { max: number | string }[])[0]?.max ?? 0)
        holderCard = holderCardNumber(prefix, year, max + 1)
      }

      const [sub] = await tx
        .insert(clubSubscriptions)
        .values({
          organizationId: orgId,
          clubPlanId: plan.id,
          userId: person.id,
          planName: plan.name,
          planPriceMonthly: String(quote.basePrice),
          dependentPriceMonthly: String(quote.dependentUnitPrice),
          amount: String(quote.total),
          paymentMethod: scenario.method,
          status,
          dueDay,
          holderName: scenario.name,
          holderCpf,
          holderEmail: email,
          holderPhone: scenario.phone,
          holderBirthDate: scenario.birthDate,
          cardNumber: holderCard,
          startedAt,
          currentPeriodStart: lastPaid?.periodStart ?? null,
          currentPeriodEnd: lastPaid ? addMonthsOnDueDay(lastPaid.periodStart, 1, dueDay) : null,
          nextDueDate,
          gatewayProvider: 'simulated',
          gatewayCustomerId: simulatedCustomerId(orgId, holderCpf),
          cardToken,
          cardBrand: scenario.card?.brand ?? null,
          cardLast4: scenario.card?.last4 ?? null,
          cardExpiry: scenario.card?.expiry ?? null,
          suspendedAt,
          canceledAt,
          cancelReason,
          source: 'seed',
          createdAt: createdAtSub,
          updatedAt: now,
        })
        .returning()

      if (scenario.dependents.length > 0) {
        await tx.insert(clubSubscriptionDependents).values(
          scenario.dependents.map((dependent, index) => ({
            subscriptionId: sub!.id,
            organizationId: orgId,
            name: dependent.name,
            cpf: dependent.withCpf ? generateCpf(5000 + scenario.n * 10 + index) : null,
            birthDate: dependent.birthDate,
            relationship: dependent.relationship,
            position: index + 1,
            cardNumber: holderCard ? dependentCardNumber(holderCard, index + 1) : null,
            createdAt: createdAtSub,
          })),
        )
      }

      const events: (typeof paymentEvents.$inferInsert)[] = []
      const event = (
        type: string,
        at: Date,
        message: string,
        chargeId: string | null,
        source: 'checkout' | 'automation' | 'manual' | 'simulation' | 'webhook' = 'automation',
      ) =>
        events.push({
          organizationId: orgId,
          subscriptionId: sub!.id,
          chargeId,
          type,
          source,
          gatewayProvider: 'simulated',
          message,
          createdAt: minTime(at, now),
        })

      event(
        'CHECKOUT_STARTED',
        atSP(firstStart, 10, 0),
        `Checkout do plano ${plan.name}: ${formatBRL(quote.total)}/mês, ${quote.dependentsCount} dependente(s), ${CLUB_PAYMENT_METHOD_LABELS[scenario.method]}`,
        null,
        'checkout',
      )

      for (const [index, plannedCharge] of charges.entries()) {
        const periodStart = plannedCharge.periodStart
        const periodEnd = addMonthsOnDueDay(periodStart, 1, dueDay)
        const isFirst = index === 0
        const dueDate = isFirst && scenario.method === 'boleto' ? addDays(periodStart, 3) : periodStart
        const methodKey = scenario.method === 'credit_card' ? 'card' : scenario.method
        const gatewayChargeId =
          scenario.method === 'credit_card' && (plannedCharge.status === 'failed' || plannedCharge.status === 'overdue')
            ? null
            : simulatedChargeId(methodKey, 0)
        const amount = quote.total
        const chargeUuid = crypto.randomUUID()

        let pixPayload: string | null = null
        let pixQrCode: string | null = null
        let pixExpiresAt: Date | null = null
        let boletoIdentificationField: string | null = null
        let boletoBarCode: string | null = null
        let boletoUrl: string | null = null
        if (scenario.method === 'pix') {
          pixPayload = buildPixBrCode({
            key: options.pixKey,
            amount,
            merchantName: org.name,
            merchantCity,
            txid: chargeUuid.replace(/-/g, ''),
          })
          pixQrCode = await qrCodePngBase64(pixPayload)
          pixExpiresAt = new Date(atSP(dueDate, 10).getTime() + 24 * 3_600_000)
        } else if (scenario.method === 'boleto') {
          const numbers = buildBoletoNumbers({ amount, dueDate, seed: gatewayChargeId ?? chargeUuid })
          boletoIdentificationField = numbers.identificationField
          boletoBarCode = numbers.barCode
          boletoUrl = options.boletoUrl({ slug: org.slug, subscriptionId: sub!.id, chargeId: chargeUuid })
        }

        const generatedAt = isFirst ? atSP(periodStart, 10, 1) : atSP(addDays(periodStart, -10), 6)
        const paidAt =
          plannedCharge.status === 'paid'
            ? scenario.method === 'boleto'
              ? atSP(addDays(dueDate, isFirst ? -2 : 0), 14, 20)
              : scenario.method === 'pix'
                ? atSP(isFirst ? periodStart : addDays(dueDate, -1), isFirst ? 10 : 19, isFirst ? 3 : 42)
                : atSP(dueDate, isFirst ? 10 : 8, 2)
            : null
        const isCardCharge = scenario.method === 'credit_card'

        await tx.insert(clubCharges).values({
          id: chargeUuid,
          organizationId: orgId,
          subscriptionId: sub!.id,
          periodStart,
          periodEnd,
          dueDate,
          amount: String(amount),
          method: scenario.method,
          status: plannedCharge.status,
          description: `${org.name} · Plano ${plan.name} · ${monthLabel(periodStart)}`,
          gatewayProvider: 'simulated',
          gatewayChargeId,
          pixPayload,
          pixQrCode,
          pixExpiresAt,
          boletoIdentificationField,
          boletoBarCode,
          boletoUrl,
          cardBrand: isCardCharge ? scenario.card!.brand : null,
          cardLast4: isCardCharge ? scenario.card!.last4 : null,
          attempts: isCardCharge
            ? plannedCharge.status === 'failed'
              ? 1
              : plannedCharge.status === 'overdue'
                ? 3
                : 1
            : 0,
          lastAttemptAt: isCardCharge
            ? plannedCharge.status === 'failed'
              ? new Date(now.getTime() - 2 * 3_600_000)
              : paidAt ?? atSP(addDays(dueDate, 2), 8)
            : null,
          failureReason:
            plannedCharge.status === 'failed' || (isCardCharge && plannedCharge.status === 'overdue')
              ? 'Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.'
              : null,
          lastSyncedAt: minTime(paidAt ?? generatedAt, now),
          paidAt,
          paidAmount: paidAt ? String(amount) : null,
          canceledAt: plannedCharge.status === 'canceled' ? canceledAt : null,
          createdAt: minTime(generatedAt, now),
          updatedAt: minTime(paidAt ?? generatedAt, now),
        })

        const label = CLUB_PAYMENT_METHOD_LABELS[scenario.method]
        if (!isFirst) {
          event(
            'CHARGE_GENERATED',
            generatedAt,
            `Cobrança de ${formatBRL(amount)} do período ${monthLabel(periodStart)} gerada — ${label}, vence em ${formatDateBR(dueDate)}`,
            chargeUuid,
          )
        }
        if (!isCardCharge) {
          event(
            'PAYMENT_CREATED',
            new Date(generatedAt.getTime() + 1_000),
            `Cobrança de ${formatBRL(amount)} criada — ${label}, vence em ${formatDateBR(dueDate)}`,
            chargeUuid,
            isFirst ? 'checkout' : 'automation',
          )
        }
        if (paidAt) {
          const cardText = isCardCharge
            ? ` — cartão ${CARD_BRAND_LABELS[scenario.card!.brand]} final ${scenario.card!.last4}`
            : ''
          event(
            isCardCharge ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECEIVED',
            paidAt,
            `Pagamento de ${formatBRL(amount)} ${isCardCharge ? 'confirmado' : 'recebido'} via ${label}${cardText}`,
            chargeUuid,
            isFirst ? 'checkout' : 'automation',
          )
          if (isFirst && holderCard) {
            event(
              'SUBSCRIPTION_ACTIVATED',
              new Date(paidAt.getTime() + 1_000),
              scenario.dependents.length > 0
                ? `Assinatura ativada — carteirinhas emitidas: ${holderCard} (titular) + ${scenario.dependents.length} dependente(s)`
                : `Assinatura ativada — carteirinha ${holderCard} emitida`,
              chargeUuid,
              isFirst ? 'checkout' : 'automation',
            )
          }
        }
        if (plannedCharge.status === 'failed') {
          event(
            'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
            new Date(now.getTime() - 2 * 3_600_000),
            'Cartão recusado: Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.',
            chargeUuid,
          )
        }
        if (plannedCharge.status === 'overdue' || plannedCharge.status === 'canceled') {
          if (isCardCharge) {
            for (let attempt = 0; attempt < 3; attempt++) {
              event(
                'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
                atSP(addDays(dueDate, attempt), 8, 5),
                'Cartão recusado: Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.',
                chargeUuid,
              )
            }
          }
          event(
            'PAYMENT_OVERDUE',
            atSP(addDays(dueDate, isCardCharge ? 3 : 1), 0, 5),
            `Cobrança de ${formatBRL(amount)} venceu em ${formatDateBR(dueDate)}`,
            chargeUuid,
          )
          event(
            'SUBSCRIPTION_PAST_DUE',
            atSP(addDays(dueDate, isCardCharge ? 3 : 1), 0, 6),
            `Assinatura em atraso: cobrança de ${formatBRL(amount)} venceu em ${formatDateBR(dueDate)}`,
            null,
          )
          if (suspendedAt) {
            event(
              'SUBSCRIPTION_SUSPENDED',
              suspendedAt,
              `Assinatura suspensa: cobrança vencida há 15 dias — carteirinhas bloqueadas`,
              null,
            )
          }
        }
      }

      if (canceledAt) {
        event(
          'SUBSCRIPTION_CANCELED',
          canceledAt,
          scenario.kind === 'canceled_delinquency'
            ? 'Assinatura cancelada: inadimplência (1 cobrança(s) em aberto cancelada(s))'
            : `Assinatura cancelada: ${cancelReason}`,
          null,
          scenario.kind === 'canceled_request' ? 'manual' : 'automation',
        )
      }

      if (events.length > 0) await tx.insert(paymentEvents).values(events)
    })

    created += 1
    console.log(`  assinante${scenario.n} · ${scenario.kind} · ${plan.name} · ${CLUB_PAYMENT_METHOD_LABELS[scenario.method]}`)
  }

  console.log(`\nFaturamento do clube (${slug}): ${created} assinatura(s) criada(s), ${skipped} já existia(m).`)
  const logins = [SCENARIOS[0]!, SCENARIOS[6]!, SCENARIOS[11]!]
  console.log('\nLogins de teste do portal (CPF + e-mail, sem senha):')
  for (const scenario of logins) {
    console.log(
      `  ${formatCpf(generateCpf(1000 + scenario.n))}  ${`assinante${scenario.n}@clube.${slug}.test`.padEnd(32)} (${scenario.kind})`,
    )
  }
  console.log(`  (a senha dessas contas é "${PASSWORD}" se precisar do login com senha)`)
}

main()
  .then(() => sql.end())
  .catch(async error => {
    console.error(error)
    await sql.end()
    process.exit(1)
  })
