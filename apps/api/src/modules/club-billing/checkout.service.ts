import { randomBytes } from 'node:crypto'
import {
  ERROR_CODES,
  cardNumberIssue,
  maskCpfPartially,
  onlyDigits,
  sortClubPlansForDisplay,
  type CheckoutBoletoView,
  type CheckoutContext,
  type CheckoutHolderInput,
  type CheckoutInput,
  type CheckoutResult,
  type CheckoutStatus,
  type RetryPaymentInput,
} from '@annetec/contracts'
import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { demoToolsAllowed, env } from '@/config/env'
import { db } from '@/db/client'
import {
  clientProfiles,
  clubCharges,
  clubPlans,
  clubSubscriptionDependents,
  clubSubscriptions,
  member,
  user,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import type { ResolvedTenant } from '@/http/types'
import { assertGatewayReady, describeGateway, effectiveProvider, getGatewayFor } from '@/integrations/payments/provider'
import { SIMULATED_DECLINED_SUFFIX } from '@/integrations/payments/simulated'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { notifyClientSignup } from '@/lib/notifications'
import { presentSessionUser } from '@/modules/auth/presenter'
import { getSessionByToken, setActiveOrganization } from '@/modules/auth/service'
import { accessUnavailable, admitLogin } from '@/modules/users/member-access'
import { toClubPlan } from '@/modules/network/controller'
import { checkoutAccessKey } from './access-key'
import { assertCardAttemptsAllowed } from './card-attempts'
import { assertCheckoutEligible, checkoutStartedMessage, firstChargeDescription } from './checkout-rules'
import { chargesService, submitChargeToGateway, syncChargeIfStale } from './charges.service'
import { addDays, addMonthsOnDueDay, dueDayOf, monthLabel, todaySP } from './dates'
import { recordPaymentEvent } from './events.service'
import { OPEN_CHARGE_STATUSES, toClubCharge, type ChargeRow, type SubscriptionRow } from './presenter'
import { loadBillingSettings } from './settings.service'
import { cancelSubscription } from './subscriptions.service'

/**
 * Checkout público do clube (blueprint §B "Checkout" e §0.9). Sem sessão; as
 * rotas por assinatura exigem a chave HMAC (`access-key.ts`).
 *
 * Conta do titular, pelo e-mail informado:
 *  - e-mail novo → conta criada aqui (senha aleatória nunca exibida) e a
 *    sessão dela devolvida em `session` — quem acabou de criar a conta é quem
 *    está no navegador;
 *  - associado logado no próprio clube (`viewer`) → o e-mail do titular
 *    precisa ser o da sessão (senão 422; a tela trava o campo) e a assinatura
 *    nasce na conta da sessão; como a posse está provada, o CPF do perfil pode
 *    ser corrigido enquanto não houver assinatura viva. Sessão nova não é
 *    devolvida (ele já tem a dele);
 *  - e-mail que já existe, SEM sessão → só REUTILIZA a conta (nunca
 *    `signUpEmail` de novo, nunca devolve sessão) quando ela já é associada
 *    deste clube, com perfil de MESMO CPF e alguma assinatura aqui — ou seja,
 *    quando e-mail + CPF já abriam o portal do associado (`client-portal`).
 *    Qualquer outra conta existente (sem vínculo ou sem perfil aqui, só
 *    cadastro pelo Google/senha, equipe de algum clube, plataforma) é recusada
 *    com 409 e a orientação de entrar na conta: senão, quem só sabe o e-mail
 *    de alguém gravaria o PRÓPRIO CPF no perfil dessa pessoa e entraria na
 *    conta dela pelo portal (CPF + e-mail).
 */

/** Associado logado no clube do checkout (sessão `client` do mesmo inquilino). */
export interface CheckoutViewer {
  userId: string
  email: string
}

const STATUS_SYNC_INTERVAL_MS = 3_000
const LIVE_STATUSES = ['active', 'past_due', 'suspended'] as const

interface CheckoutAccount {
  userId: string
  created: boolean
  /** Entrou no clube agora (conta nova ou conta existente sem vínculo aqui) → sino do admin. */
  joined: boolean
  /** Token da sessão criada pelo cadastro (só conta nova). */
  token: string | null
}

async function findUserByEmail(email: string) {
  const [row] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1)
  return row ?? null
}

/**
 * Conta do titular (fora da transação): e-mail novo → cadastro com senha
 * aleatória nunca exibida + vínculo `client` + CPF; e-mail existente (já
 * liberado por `assertCanSubscribe`) → só garante vínculo e perfil, sem sessão.
 */
async function resolveAccount(
  tenant: ResolvedTenant,
  holder: CheckoutHolderInput,
  existing: { id: string; role: string } | null,
  isOwner: boolean,
): Promise<CheckoutAccount> {
  if (!existing) {
    const signUp = await auth.api.signUpEmail({
      body: { name: holder.name, email: holder.email, password: randomBytes(18).toString('base64url') },
    })
    const userId = signUp.user.id
    await auth.api.addMember({ body: { userId, organizationId: tenant.id, role: 'client' } })
    await db
      .insert(clientProfiles)
      .values({ userId, organizationId: tenant.id, cpf: holder.cpf })
      .onConflictDoNothing()
    await db.update(user).set({ phone: holder.phone, updatedAt: new Date() }).where(eq(user.id, userId))
    return { userId, created: true, joined: true, token: signUp.token ?? null }
  }

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, tenant.id), eq(member.userId, existing.id)))
    .limit(1)
  if (!membership) {
    await auth.api.addMember({ body: { userId: existing.id, organizationId: tenant.id, role: 'client' } })
  } else {
    // Associado excluído assinando de novo (e-mail + CPF, como no portal):
    // o mesmo vínculo volta a `active` — com auditoria e régua nova.
    await admitLogin(tenant.id, existing.id, 'checkout')
  }
  const profile = db.insert(clientProfiles).values({ userId: existing.id, organizationId: tenant.id, cpf: holder.cpf })
  if (isOwner) {
    // Dono logado (posse provada): o CPF do perfil acompanha o do titular e o
    // telefone da conta é preenchido se ainda não existir.
    await profile.onConflictDoUpdate({ target: [clientProfiles.userId, clientProfiles.organizationId], set: { cpf: holder.cpf } })
    await db
      .update(user)
      .set({ phone: holder.phone, updatedAt: new Date() })
      .where(and(eq(user.id, existing.id), isNull(user.phone)))
  } else {
    await profile.onConflictDoNothing()
  }
  return { userId: existing.id, created: false, joined: !membership, token: null }
}

const EXISTING_ACCOUNT_MESSAGE =
  'Já existe uma conta com este e-mail. Entre na área do associado para assinar com ela, ou use outro e-mail.'

/**
 * Sem sessão, uma conta existente só é reaproveitada se e-mail + CPF já
 * abriam o portal dela (ver o topo do arquivo): associada deste clube, com
 * perfil aqui (o CPF já foi conferido) e alguma assinatura neste clube — e
 * sem papel de equipe em NENHUM clube (mesma regra do cadastro pelo Google).
 */
async function canReuseWithoutSession(tenantId: string, userId: string, isMember: boolean, hasProfile: boolean): Promise<boolean> {
  if (!isMember || !hasProfile) return false
  const [[staff], [previous]] = await Promise.all([
    db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.userId, userId), inArray(member.role, ['admin', 'seller'])))
      .limit(1),
    db
      .select({ id: clubSubscriptions.id })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, tenantId), eq(clubSubscriptions.userId, userId)))
      .limit(1),
  ])
  return !staff && Boolean(previous)
}

/** Regras do e-mail/CPF antes de qualquer efeito colateral (409 cedo). */
async function assertCanSubscribe(
  tenant: ResolvedTenant,
  holder: CheckoutHolderInput,
  existing: { id: string; role: string } | null,
  isOwner: boolean,
) {
  if (existing) {
    if (existing.role === 'superadmin' || existing.role === 'platform_admin') {
      throw AppError.conflict('Este e-mail pertence à equipe; use outro')
    }
    const [membership] = await db
      .select({ role: member.role, accessStatus: member.accessStatus })
      .from(member)
      .where(and(eq(member.organizationId, tenant.id), eq(member.userId, existing.id)))
      .limit(1)
    if (membership && membership.role !== 'client') {
      throw AppError.conflict('Este e-mail pertence à equipe; use outro')
    }
    // Bloqueado pelo clube não se cadastra de novo com este e-mail.
    if (membership?.accessStatus === 'blocked') throw accessUnavailable()
    const [profile] = await db
      .select({ cpf: clientProfiles.cpf })
      .from(clientProfiles)
      .where(and(eq(clientProfiles.organizationId, tenant.id), eq(clientProfiles.userId, existing.id)))
      .limit(1)
    // Sem sessão, CPF diferente do perfil é recusado (quem só sabe o e-mail
    // não troca o CPF de ninguém). O dono logado pode corrigir.
    if (profile && onlyDigits(profile.cpf) !== holder.cpf && !isOwner) {
      throw AppError.conflict('E-mail já cadastrado com outro CPF')
    }
    if (!isOwner && !(await canReuseWithoutSession(tenant.id, existing.id, Boolean(membership), Boolean(profile)))) {
      throw new AppError(ERROR_CODES.CONFLICT, EXISTING_ACCOUNT_MESSAGE, {
        issues: [{ path: 'holder.email', message: EXISTING_ACCOUNT_MESSAGE }],
      })
    }
  }

  // Assinatura viva do mesmo usuário OU do mesmo CPF no inquilino.
  const live = await db
    .select({ userId: clubSubscriptions.userId, cpf: clubSubscriptions.holderCpf })
    .from(clubSubscriptions)
    .where(
      and(
        eq(clubSubscriptions.organizationId, tenant.id),
        inArray(clubSubscriptions.status, [...LIVE_STATUSES]),
        or(eq(clubSubscriptions.holderCpf, holder.cpf), existing ? eq(clubSubscriptions.userId, existing.id) : undefined),
      ),
    )
    .limit(5)
  if (existing && live.some(row => row.userId === existing.id)) {
    throw AppError.conflict('Você já tem uma assinatura. Acesse a área do associado.')
  }
  if (live.length > 0) {
    throw AppError.conflict('Este CPF já tem uma assinatura ativa. Acesse a área do associado.')
  }
}

/**
 * O schema de transporte aceita o cartão de aprovação da sandbox (`4444…`);
 * aqui, já sabendo o gateway do clube, ele só passa com gateway de teste
 * (simulado ou Asaas sandbox). Luhn/bandeira/CVV já vieram do schema.
 */
async function assertCardAllowed(tenantId: string, gatewayOverride: Parameters<typeof effectiveProvider>[0], card: { number: string } | undefined, path: string) {
  if (!card) return
  const gateway = await getGatewayFor(tenantId, effectiveProvider(gatewayOverride))
  const issue = cardNumberIssue(card.number, { allowSandboxCard: gateway.sandbox || gateway.canSimulate })
  if (issue) throw AppError.validation([{ path, message: issue }])
}

async function currentCharge(subscriptionId: string): Promise<ChargeRow> {
  const [row] = await db
    .select()
    .from(clubCharges)
    .where(and(eq(clubCharges.subscriptionId, subscriptionId), eq(clubCharges.kind, 'cycle')))
    .orderBy(desc(clubCharges.periodStart), desc(clubCharges.createdAt))
    .limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada')
  return row
}

export async function findTenantSubscription(tenantId: string, subscriptionId: string): Promise<SubscriptionRow> {
  const [row] = await db
    .select()
    .from(clubSubscriptions)
    .where(and(eq(clubSubscriptions.id, subscriptionId), eq(clubSubscriptions.organizationId, tenantId)))
    .limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  return row
}

export async function buildCheckoutStatus(subscriptionId: string): Promise<CheckoutStatus> {
  const [sub] = await db.select().from(clubSubscriptions).where(eq(clubSubscriptions.id, subscriptionId)).limit(1)
  if (!sub) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  const [dependents, charge] = await Promise.all([
    db
      .select()
      .from(clubSubscriptionDependents)
      .where(eq(clubSubscriptionDependents.subscriptionId, sub.id))
      .orderBy(asc(clubSubscriptionDependents.position)),
    currentCharge(sub.id),
  ])
  return {
    subscriptionId: sub.id,
    status: sub.status,
    planName: sub.planName,
    amount: Number(sub.amount),
    paymentMethod: sub.paymentMethod,
    holderFirstName: sub.holderName.trim().split(/\s+/)[0] ?? sub.holderName,
    cardNumber: sub.cardNumber,
    dependents: dependents.map(dependent => ({
      name: dependent.name,
      relationship: dependent.relationship,
      cardNumber: dependent.cardNumber,
    })),
    charge: toClubCharge(charge, sub),
    canSimulatePayment: await chargesService.canSimulate(charge),
  }
}

export const checkoutService = {
  async context(tenant: ResolvedTenant): Promise<CheckoutContext> {
    const [plans, settings] = await Promise.all([
      db
        .select()
        .from(clubPlans)
        .where(and(eq(clubPlans.organizationId, tenant.id), eq(clubPlans.status, 'active'))),
      loadBillingSettings(tenant.id),
    ])
    // Sem conta de recebimento a vitrine abre (com `receivingConfigured: false`
    // para a tela avisar); quem barra a adesão é o `checkout`.
    const { provider, sandbox, receivingConfigured } = await describeGateway(tenant.id, settings.gatewayOverride)
    return {
      plans: sortClubPlansForDisplay(plans.map(toClubPlan)),
      enabledMethods: settings.enabledMethods,
      gateway: provider,
      sandbox,
      // Simulado e Asaas sandbox simulam (mesma regra de `PaymentGateway.canSimulate`).
      canSimulatePayment: receivingConfigured && (provider === 'simulated' || sandbox) && demoToolsAllowed,
      receivingConfigured,
      simulation:
        provider === 'simulated'
          ? {
              pixApproveSeconds: env.SIMULATED_PIX_APPROVE_SECONDS,
              boletoApproveSeconds: env.SIMULATED_BOLETO_APPROVE_SECONDS,
              declinedCardSuffix: SIMULATED_DECLINED_SUFFIX,
            }
          : null,
      boletoDueDays: settings.boletoDueDays,
    }
  },

  async checkout(tenant: ResolvedTenant, input: CheckoutInput, remoteIp?: string, viewer: CheckoutViewer | null = null): Promise<CheckoutResult> {
    const settings = await loadBillingSettings(tenant.id)
    const method = input.payment.method
    // Clube sem conta de recebimento: barra ANTES de criar conta/assinatura (409 RECEBIMENTO_NAO_CONFIGURADO).
    await assertGatewayReady(tenant.id, effectiveProvider(settings.gatewayOverride))

    const [plan] = await db
      .select()
      .from(clubPlans)
      .where(and(eq(clubPlans.id, input.planId), eq(clubPlans.organizationId, tenant.id), eq(clubPlans.status, 'active')))
      .limit(1)
    if (!plan) throw AppError.notFound('Plano')
    // Regras do plano (idades, parentescos, teto, forma de pagamento = clube ∩
    // plano) → 422 com `path`; o preço sai da mesma `quoteClubPlan` da tela.
    const quote = assertCheckoutEligible(toClubPlan(plan), input, settings.enabledMethods)
    await assertCardAllowed(tenant.id, settings.gatewayOverride, input.payment.card, 'payment.card.number')

    const holder = input.holder
    const seen = new Set<string>([holder.cpf])
    input.dependents.forEach((dependent, index) => {
      if (!dependent.cpf) return
      if (seen.has(dependent.cpf)) {
        throw AppError.validation([
          {
            path: `dependents.${index}.cpf`,
            message: dependent.cpf === holder.cpf ? 'O CPF do dependente não pode ser o do titular' : 'CPF repetido entre os dependentes',
          },
        ])
      }
      seen.add(dependent.cpf)
    })

    if (viewer && viewer.email.trim().toLowerCase() !== holder.email.trim().toLowerCase()) {
      const message = `Use o e-mail da sua conta (${viewer.email})`
      throw new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message, { issues: [{ path: 'holder.email', message }] })
    }
    const existingUser = await findUserByEmail(holder.email)
    const isOwner = Boolean(viewer && existingUser && existingUser.id === viewer.userId)
    await assertCanSubscribe(tenant, holder, existingUser, isOwner)
    // Card testing: CPF com recusas demais nas últimas 24 h não tenta cartão (antes de criar conta/assinatura).
    if (method === 'credit_card') await assertCardAttemptsAllowed({ organizationId: tenant.id, cpf: holder.cpf })
    const account = await resolveAccount(tenant, holder, existingUser, isOwner)
    if (account.joined) {
      await notifyClientSignup({
        organizationId: tenant.id,
        userId: account.userId,
        via: 'checkout',
        personName: holder.name,
        planName: plan.name,
      })
    }

    // Checkout anterior não pago do mesmo titular → substituído por este.
    const pending = await db
      .select()
      .from(clubSubscriptions)
      .where(
        and(
          eq(clubSubscriptions.organizationId, tenant.id),
          eq(clubSubscriptions.userId, account.userId),
          eq(clubSubscriptions.status, 'pending_payment'),
        ),
      )
    for (const previous of pending) {
      await cancelSubscription(previous, 'substituida_por_novo_checkout', { source: 'checkout' })
    }

    const now = new Date()
    const today = todaySP(now)
    const dueDay = dueDayOf(today)
    const provider = effectiveProvider(settings.gatewayOverride)

    const { subscriptionId, chargeId } = await db.transaction(async tx => {
      const [subscription] = await tx
        .insert(clubSubscriptions)
        .values({
          organizationId: tenant.id,
          clubPlanId: plan.id,
          userId: account.userId,
          planName: plan.name,
          planPriceMonthly: String(quote.basePrice),
          dependentPriceMonthly: String(quote.dependentUnitPrice),
          // Retratos: mudar o plano depois não altera quem já assinou.
          includedDependents: quote.includedDependents,
          enrollmentFee: String(quote.enrollmentFee),
          amount: String(quote.total),
          paymentMethod: method,
          status: 'pending_payment',
          dueDay,
          holderName: holder.name,
          holderCpf: holder.cpf,
          holderEmail: holder.email,
          holderPhone: holder.phone,
          holderBirthDate: holder.birthDate,
          gatewayProvider: provider,
          source: 'checkout',
        })
        .returning({ id: clubSubscriptions.id })

      if (input.dependents.length > 0) {
        await tx.insert(clubSubscriptionDependents).values(
          input.dependents.map((dependent, index) => ({
            subscriptionId: subscription!.id,
            organizationId: tenant.id,
            name: dependent.name,
            cpf: dependent.cpf ?? null,
            birthDate: dependent.birthDate,
            relationship: dependent.relationship,
            position: index + 1,
          })),
        )
      }

      const [charge] = await tx
        .insert(clubCharges)
        .values({
          organizationId: tenant.id,
          subscriptionId: subscription!.id,
          periodStart: today,
          periodEnd: addMonthsOnDueDay(today, 1, dueDay),
          dueDate: method === 'boleto' ? addDays(today, settings.boletoDueDays) : today,
          // Adesão só na 1ª cobrança; ciclos seguintes usam `amount` (mensalidade).
          amount: String(quote.firstChargeTotal),
          method,
          status: 'pending',
          description: firstChargeDescription(tenant.name, plan.name, monthLabel(today), quote),
          gatewayProvider: provider,
        })
        .returning({ id: clubCharges.id })

      await recordPaymentEvent(tx, {
        organizationId: tenant.id,
        subscriptionId: subscription!.id,
        chargeId: charge!.id,
        type: 'CHECKOUT_STARTED',
        source: 'checkout',
        gatewayProvider: provider,
        message: checkoutStartedMessage(plan.name, quote, method),
        payload: {
          planId: plan.id,
          dependents: quote.dependentsCount,
          includedDependents: quote.includedDependents,
          monthly: quote.total,
          enrollmentFee: quote.enrollmentFee,
          firstChargeTotal: quote.firstChargeTotal,
          method,
          accountCreated: account.created,
        },
      })
      return { subscriptionId: subscription!.id, chargeId: charge!.id }
    })

    await submitChargeToGateway(chargeId, { method, card: input.payment.card, remoteIp, source: 'checkout' })

    let session: CheckoutResult['session'] = null
    if (account.created && account.token) {
      try {
        await setActiveOrganization(account.token, tenant.id)
        const authSession = await getSessionByToken(account.token)
        session = { token: account.token, user: await presentSessionUser(authSession) }
      } catch (error) {
        logger.warn({ tenantId: tenant.id, err: error instanceof Error ? error.message : String(error) }, 'Checkout: sessão do novo associado não pôde ser aberta')
      }
    }

    const status = await buildCheckoutStatus(subscriptionId)
    return {
      ...status,
      accessKey: checkoutAccessKey(subscriptionId),
      accountCreated: account.created,
      session,
    }
  },

  /** Polling da tela de resultado: sincroniza a cobrança corrente (máx. 1×/3 s) e devolve o status. */
  async status(tenant: ResolvedTenant, subscriptionId: string): Promise<CheckoutStatus> {
    const sub = await findTenantSubscription(tenant.id, subscriptionId)
    const charge = await currentCharge(sub.id)
    await syncChargeIfStale(charge, STATUS_SYNC_INTERVAL_MS, 'checkout')
    return buildCheckoutStatus(sub.id)
  },

  /** Nova tentativa (outro cartão ou troca de método) — só enquanto aguarda pagamento. */
  async retry(tenant: ResolvedTenant, subscriptionId: string, input: RetryPaymentInput, remoteIp?: string): Promise<CheckoutStatus> {
    const sub = await findTenantSubscription(tenant.id, subscriptionId)
    if (sub.status !== 'pending_payment') {
      throw AppError.businessRule('Esta assinatura não está aguardando pagamento')
    }
    const [charge] = await db
      .select()
      .from(clubCharges)
      .where(
        and(
          eq(clubCharges.subscriptionId, sub.id),
          eq(clubCharges.kind, 'cycle'),
          inArray(clubCharges.status, OPEN_CHARGE_STATUSES),
        ),
      )
      .orderBy(desc(clubCharges.periodStart), desc(clubCharges.createdAt))
      .limit(1)
    if (!charge) throw AppError.businessRule('Não há cobrança em aberto para esta assinatura')
    const settings = await loadBillingSettings(tenant.id)
    await assertCardAllowed(tenant.id, settings.gatewayOverride, input.card, 'card.number')
    // Card testing: teto de recusas por assinatura e por CPF do titular (24 h, persistido).
    if (input.method === 'credit_card') {
      await assertCardAttemptsAllowed({ organizationId: tenant.id, cpf: sub.holderCpf, subscriptionId: sub.id })
    }
    await chargesService.pay(charge, input, { source: 'checkout', remoteIp })
    return buildCheckoutStatus(sub.id)
  },

  async simulate(tenant: ResolvedTenant, subscriptionId: string): Promise<CheckoutStatus> {
    const sub = await findTenantSubscription(tenant.id, subscriptionId)
    const charge = await currentCharge(sub.id)
    await chargesService.simulate(charge)
    return buildCheckoutStatus(sub.id)
  },

  async boletoView(tenant: ResolvedTenant, subscriptionId: string, chargeId: string): Promise<CheckoutBoletoView> {
    const sub = await findTenantSubscription(tenant.id, subscriptionId)
    const [charge] = await db
      .select()
      .from(clubCharges)
      .where(and(eq(clubCharges.id, chargeId), eq(clubCharges.subscriptionId, sub.id), ne(clubCharges.method, 'pix')))
      .limit(1)
    if (!charge || !charge.boletoIdentificationField) throw AppError.notFound('Boleto')
    return {
      charge: toClubCharge(charge, sub),
      payerName: sub.holderName,
      payerCpf: maskCpfPartially(sub.holderCpf),
      tenantName: tenant.name,
      simulated: charge.gatewayProvider === 'simulated',
    }
  },
}
