import { z } from 'zod'
import { ageOn, CARD_BRANDS, detectCardBrand, isValidCardNumber, onlyDigits, roundCents, type CardBrand } from '../common/br'
import { paginationQuery } from '../common/pagination'
import { cep, cpf, dateOnly, email, telefone, uuid } from '../common/primitives'
import { authSession, clubAccessStatus } from './auth'
import { clubPlan, type ClubPlan } from './catalog'
import {
  clubPaymentMethod,
  dependentRelationship,
  type ClubPaymentMethod,
  type DependentRelationship,
} from './enums'

/**
 * Clube de Benefícios — assinatura, cobrança e faturamento PRÓPRIOS da Annetec.
 *
 * Diferente de `billing.ts` (faturas que só LEMOS da Digital Saúde), aqui a
 * Annetec é a dona do ciclo: a assinatura, os períodos, a régua de cobrança e
 * a inadimplência vivem no nosso banco. O gateway (Asaas hoje, simulado sem
 * chave, outro amanhã) é só o PROCESSADOR — cria, consulta, cancela e estorna
 * cobranças. Nada aqui toca `contracts`/`beneficiaries` (espelhos do ERP).
 *
 * Datas-só são `yyyy-MM-dd` (fuso America/Sao_Paulo); instantes são ISO UTC
 * (`toISOString()`). Valores em reais, number com 2 casas.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Máquina de estados da assinatura (transições em blueprint §0):
 *  - `pending_payment`: checkout feito, 1ª cobrança ainda não paga (sem carteirinha);
 *  - `active`: em dia, carteirinhas válidas;
 *  - `past_due`: há cobrança vencida/recusada — carteirinha ainda vale (carência);
 *  - `suspended`: inadimplente além de `suspendAfterDays` — carteirinha bloqueada;
 *  - `canceled`: encerrada (pedido, inadimplência além de `cancelAfterDays` ou checkout abandonado).
 */
export const clubSubscriptionStatus = z.enum(['pending_payment', 'active', 'past_due', 'suspended', 'canceled'])
export type ClubSubscriptionStatus = z.infer<typeof clubSubscriptionStatus>

/**
 * Cobrança de um período:
 *  - `pending`: em aberto, dentro do prazo;
 *  - `paid`: paga (CONFIRMED ou RECEIVED no Asaas);
 *  - `overdue`: venceu sem pagamento;
 *  - `failed`: cartão recusado (há retentativas até `maxCardRetries`);
 *  - `canceled`: cancelada (manual, substituída ou assinatura encerrada);
 *  - `refunded`: estornada.
 */
export const clubChargeStatus = z.enum(['pending', 'paid', 'overdue', 'failed', 'canceled', 'refunded'])
export type ClubChargeStatus = z.infer<typeof clubChargeStatus>

// `clubPaymentMethod` e `dependentRelationship` (+ tipos) moram em `enums.ts`
// — o plano (catalog.ts) também os usa; continuam exportados pelo índice.

/** Processador da cobrança. `simulated` = modo demonstração, sem dinheiro real. */
export const paymentGatewayProvider = z.enum(['simulated', 'asaas'])
export type PaymentGatewayProvider = z.infer<typeof paymentGatewayProvider>

/** De onde veio a mudança registrada em `payment_events`. */
export const paymentEventSource = z.enum(['webhook', 'automation', 'checkout', 'manual', 'simulation'])
export type PaymentEventSource = z.infer<typeof paymentEventSource>

export const cardBrand = z.enum(CARD_BRANDS)
export type CardBrandEnum = z.infer<typeof cardBrand>

export const CLUB_SUBSCRIPTION_STATUS_LABELS: Record<ClubSubscriptionStatus, string> = {
  pending_payment: 'Aguardando pagamento',
  active: 'Ativa',
  past_due: 'Em atraso',
  suspended: 'Suspensa',
  canceled: 'Cancelada',
}

export const CLUB_CHARGE_STATUS_LABELS: Record<ClubChargeStatus, string> = {
  pending: 'Em aberto',
  paid: 'Paga',
  overdue: 'Vencida',
  failed: 'Recusada',
  canceled: 'Cancelada',
  refunded: 'Estornada',
}

/**
 * Natureza da cobrança:
 *  - `cycle`: mensalidade de um período `[periodStart, periodEnd)` — gerada pela
 *    automação, pelo checkout, pela reativação ou adiantada pelo admin (é a
 *    mesma linha que a automação geraria). Paga, renova a assinatura;
 *    vencida, entra na régua de inadimplência;
 *  - `one_off`: cobrança avulsa lançada pelo admin (descrição livre). Não mexe
 *    em assinatura, período, carteirinha nem inadimplência — só é cobrada.
 *    Período vazio (`periodStart = periodEnd` = data de emissão).
 */
export const clubChargeKind = z.enum(['cycle', 'one_off'])
export type ClubChargeKind = z.infer<typeof clubChargeKind>

export const CLUB_CHARGE_KIND_LABELS: Record<ClubChargeKind, string> = {
  cycle: 'Mensalidade',
  one_off: 'Cobrança avulsa',
}

export const CLUB_PAYMENT_METHOD_LABELS: Record<ClubPaymentMethod, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  credit_card: 'Cartão de crédito',
}

export const DEPENDENT_RELATIONSHIP_LABELS: Record<DependentRelationship, string> = {
  conjuge: 'Cônjuge/Companheiro(a)',
  filho: 'Filho(a)',
  enteado: 'Enteado(a)',
  pai_mae: 'Pai/Mãe',
  irmao: 'Irmão(ã)',
  neto: 'Neto(a)',
  outro: 'Outro',
}

/**
 * Tipos de `payment_events.type`. Os `PAYMENT_*` usam EXATAMENTE o vocabulário
 * dos webhooks do Asaas — é o idioma interno do handler único de eventos, seja
 * a origem webhook real, sincronização, simulação ou baixa manual. Os demais
 * são transições nossas. A coluna é texto: tipo desconhecido do gateway é
 * gravado mesmo assim (só não muda estado).
 */
export const PAYMENT_EVENT_TYPES = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_RESTORED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  /** Pagamento recebido num id do gateway que já não é o da cobrança (Pix/boleto antigo não cancelado). */
  'PAYMENT_ORPHAN_RECEIVED',
  'CHECKOUT_STARTED',
  'CHARGE_GENERATED',
  'CHARGE_REISSUED',
  'CHARGE_CANCELED',
  'CHARGE_MANUAL_PAYMENT',
  'REMINDER_SENT',
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_PAST_DUE',
  'SUBSCRIPTION_SUSPENDED',
  'SUBSCRIPTION_REACTIVATED',
  'SUBSCRIPTION_CANCELED',
] as const
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number]

export const PAYMENT_EVENT_LABELS: Record<PaymentEventType, string> = {
  PAYMENT_CREATED: 'Cobrança criada no gateway',
  PAYMENT_UPDATED: 'Cobrança atualizada no gateway',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  PAYMENT_OVERDUE: 'Cobrança vencida',
  PAYMENT_DELETED: 'Cobrança removida no gateway',
  PAYMENT_REFUNDED: 'Pagamento estornado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'Cartão recusado',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'Cartão reprovado na análise de risco',
  PAYMENT_PARTIALLY_REFUNDED: 'Pagamento estornado parcialmente',
  PAYMENT_RESTORED: 'Cobrança restaurada no gateway',
  PAYMENT_CHARGEBACK_REQUESTED: 'Chargeback (contestação) aberto',
  PAYMENT_CHARGEBACK_DISPUTE: 'Chargeback em disputa',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'Disputa de chargeback ganha — aguardando reversão',
  PAYMENT_ORPHAN_RECEIVED: 'Pagamento duplicado recebido (estornar manualmente)',
  CHECKOUT_STARTED: 'Checkout iniciado',
  CHARGE_GENERATED: 'Cobrança do ciclo gerada',
  CHARGE_REISSUED: 'Segunda via emitida',
  CHARGE_CANCELED: 'Cobrança cancelada',
  CHARGE_MANUAL_PAYMENT: 'Baixa manual',
  REMINDER_SENT: 'Lembrete de vencimento',
  SUBSCRIPTION_ACTIVATED: 'Assinatura ativada',
  SUBSCRIPTION_PAST_DUE: 'Assinatura em atraso',
  SUBSCRIPTION_SUSPENDED: 'Assinatura suspensa',
  SUBSCRIPTION_REACTIVATED: 'Assinatura reativada',
  SUBSCRIPTION_CANCELED: 'Assinatura cancelada',
}

// ---------------------------------------------------------------------------
// Preço — função única para tela e API
// ---------------------------------------------------------------------------

export interface ClubPlanQuote {
  basePrice: number
  dependentsCount: number
  /** Preço unitário por dependente EXTRA (além dos inclusos); 0 quando todos inclusos. */
  dependentUnitPrice: number
  /** Dependentes cobertos pela mensalidade do titular (`includedDependents`, 0 se ausente). */
  includedDependents: number
  /** Dependentes que pagam `dependentUnitPrice` = max(0, dependentsCount − includedDependents). */
  chargedDependents: number
  dependentsTotal: number
  /** Valor MENSAL recorrente da assinatura (titular + dependentes extras). */
  total: number
  /** `null` = sem limite. */
  maxDependents: number | null
  withinLimit: boolean
  /** Taxa de adesão de tabela (antes da isenção); 0 = plano sem adesão. */
  enrollmentFeeListPrice: number
  enrollmentFeeWaived: boolean
  /** Adesão efetivamente cobrada, só na 1ª cobrança (0 se isenta ou sem adesão). */
  enrollmentFee: number
  /** 1ª cobrança = `total` (1ª mensalidade) + `enrollmentFee`. */
  firstChargeTotal: number
}

/**
 * Preço de um plano com N dependentes: mensalidade recorrente (`total`) e 1ª
 * cobrança (`firstChargeTotal`, com a adesão). A API recalcula com esta mesma
 * função no checkout — o valor que a tela mostra é o valor cobrado.
 *
 * Sem os campos novos (`includedDependents`, `enrollmentFee*`) o resultado é
 * idêntico ao de antes: todo dependente paga `priceDependentMonthly` e a 1ª
 * cobrança é igual à mensalidade.
 */
export function quoteClubPlan(
  plan: Pick<
    ClubPlan,
    'priceMonthly' | 'priceDependentMonthly' | 'maxDependents' | 'includedDependents' | 'enrollmentFee' | 'enrollmentFeeWaived'
  >,
  dependentsCount: number,
): ClubPlanQuote {
  const count = Math.max(0, Math.trunc(dependentsCount))
  const unit = plan.priceDependentMonthly ?? 0
  const included = Math.max(0, Math.trunc(plan.includedDependents ?? 0))
  const charged = Math.max(0, count - included)
  const dependentsTotal = roundCents(unit * charged)
  const maxDependents = plan.maxDependents ?? null
  const total = roundCents(plan.priceMonthly + dependentsTotal)
  const feeListPrice = roundCents(Math.max(0, plan.enrollmentFee ?? 0))
  const waived = feeListPrice > 0 && plan.enrollmentFeeWaived === true
  const fee = waived ? 0 : feeListPrice
  return {
    basePrice: roundCents(plan.priceMonthly),
    dependentsCount: count,
    dependentUnitPrice: roundCents(unit),
    includedDependents: included,
    chargedDependents: charged,
    dependentsTotal,
    total,
    maxDependents,
    withinLimit: maxDependents === null || count <= maxDependents,
    enrollmentFeeListPrice: feeListPrice,
    enrollmentFeeWaived: waived,
    enrollmentFee: fee,
    firstChargeTotal: roundCents(total + fee),
  }
}

// ---------------------------------------------------------------------------
// Blocos de leitura
// ---------------------------------------------------------------------------

/** Cartão salvo: só bandeira, finais e validade. Número e CVV NUNCA saem nem são gravados. */
export const clubCardInfo = z.object({
  brand: cardBrand,
  last4: z.string().regex(/^\d{4}$/),
  /** `MM/YYYY`. */
  expiry: z.string().nullable(),
})
export type ClubCardInfo = z.infer<typeof clubCardInfo>

export const clubPixData = z.object({
  /** Pix copia-e-cola (BR Code EMV). */
  payload: z.string(),
  /** PNG em base64 SEM prefixo `data:` (mesmo formato do `encodedImage` do Asaas). */
  qrCodeBase64: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
})
export type ClubPixData = z.infer<typeof clubPixData>

export const clubBoletoData = z.object({
  /** Linha digitável, 47 dígitos sem máscara — exibir com `formatBoletoLine`. */
  identificationField: z.string(),
  barCode: z.string().nullable(),
  /** Boleto para imprimir/baixar (PDF do Asaas ou a página imprimível do modo simulado). */
  url: z.string().nullable(),
})
export type ClubBoletoData = z.infer<typeof clubBoletoData>

export const clubCharge = z.object({
  id: uuid,
  tenantId: uuid,
  subscriptionId: uuid,
  holderName: z.string(),
  planName: z.string(),
  /** `cycle` = mensalidade; `one_off` = avulsa (mostre `description` no lugar de "Mensalidade mm/aaaa"). */
  kind: clubChargeKind,
  /** Texto da cobrança (mensalidade: "Clube · Plano X · mm/aaaa"; avulsa: o que o admin digitou). */
  description: z.string(),
  /** Período coberto, `[periodStart, periodEnd)`. Avulsa: período vazio na data de emissão. */
  periodStart: dateOnly,
  periodEnd: dateOnly,
  dueDate: dateOnly,
  amount: z.number().nonnegative(),
  method: clubPaymentMethod,
  status: clubChargeStatus,
  /** Tentativas de cobrança no cartão (0 para Pix/boleto). */
  attempts: z.number().int().nonnegative(),
  failureReason: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  paidAmount: z.number().nullable(),
  canceledAt: z.string().datetime().nullable(),
  refundedAt: z.string().datetime().nullable(),
  /** Fatura hospedada no gateway (Asaas `invoiceUrl`), quando houver. */
  invoiceUrl: z.string().nullable(),
  pix: clubPixData.nullable(),
  boleto: clubBoletoData.nullable(),
  card: clubCardInfo.nullable(),
  gatewayProvider: paymentGatewayProvider,
  gatewayChargeId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ClubCharge = z.infer<typeof clubCharge>

export const clubDependent = z.object({
  id: uuid,
  name: z.string(),
  cpf: z.string().nullable(),
  birthDate: dateOnly.nullable(),
  relationship: dependentRelationship,
  /** Emitido na ativação da assinatura; `null` enquanto `pending_payment`. */
  cardNumber: z.string().nullable(),
})
export type ClubDependent = z.infer<typeof clubDependent>

export const clubHolder = z.object({
  userId: z.string(),
  name: z.string(),
  /** Só dígitos. */
  cpf: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  birthDate: dateOnly.nullable(),
})
export type ClubHolder = z.infer<typeof clubHolder>

export const clubSubscription = z.object({
  id: uuid,
  tenantId: uuid,
  /** `null` se o plano foi excluído depois — nome e preço abaixo são o retrato da contratação. */
  planId: uuid.nullable(),
  planName: z.string(),
  planPriceMonthly: z.number(),
  dependentPriceMonthly: z.number(),
  /**
   * Retrato de `includedDependents` do plano na contratação (0 = todo
   * dependente paga `dependentPriceMonthly`). Opcional enquanto a coluna nasce;
   * ausente = 0. Reprecificar dependentes: `quoteClubPlan({ priceMonthly:
   * planPriceMonthly, priceDependentMonthly: dependentPriceMonthly,
   * includedDependents, maxDependents: null }, n)`.
   */
  includedDependents: z.number().int().nonnegative().optional(),
  /** Adesão cobrada na 1ª cobrança (retrato; 0 = sem adesão/isenta). Ausente = 0. */
  enrollmentFee: z.number().nonnegative().optional(),
  /** Valor mensal cobrado (titular + dependentes). */
  amount: z.number(),
  paymentMethod: clubPaymentMethod,
  status: clubSubscriptionStatus,
  dueDay: z.number().int().min(1).max(28),
  startedAt: z.string().datetime().nullable(),
  currentPeriodStart: dateOnly.nullable(),
  currentPeriodEnd: dateOnly.nullable(),
  nextDueDate: dateOnly.nullable(),
  /** Carteirinha do titular; emitida na ativação. */
  cardNumber: z.string().nullable(),
  holder: clubHolder,
  dependents: z.array(clubDependent),
  /** Cartão salvo para a recorrência (só com `credit_card`). */
  paymentCard: clubCardInfo.nullable(),
  gatewayProvider: paymentGatewayProvider,
  /** Soma das cobranças `pending`/`overdue`/`failed`. */
  openAmount: z.number(),
  overdueCount: z.number().int().nonnegative(),
  canceledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  suspendedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type ClubSubscription = z.infer<typeof clubSubscription>

export const paymentEvent = z.object({
  id: uuid,
  subscriptionId: uuid.nullable(),
  chargeId: uuid.nullable(),
  /** Um de `PAYMENT_EVENT_TYPES` (ou tipo cru do gateway). */
  type: z.string(),
  source: paymentEventSource,
  /** Frase pronta para a timeline, pt-BR. */
  message: z.string(),
  gatewayProvider: paymentGatewayProvider.nullable(),
  createdAt: z.string().datetime(),
})
export type PaymentEvent = z.infer<typeof paymentEvent>

export const clubSubscriptionDetail = clubSubscription.extend({
  charges: z.array(clubCharge),
  events: z.array(paymentEvent),
})
export type ClubSubscriptionDetail = z.infer<typeof clubSubscriptionDetail>

export const clubChargeDetail = clubCharge.extend({
  subscription: clubSubscription,
  events: z.array(paymentEvent),
})
export type ClubChargeDetail = z.infer<typeof clubChargeDetail>

// ---------------------------------------------------------------------------
// Entrada do checkout
// ---------------------------------------------------------------------------

/** Campo opcional de formulário chega como `''`; vira ausente antes de validar. */
const emptyAsUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export const checkoutHolderInput = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo')
    .max(120, 'Nome longo demais')
    .refine(v => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome'),
  cpf,
  email,
  phone: telefone,
  birthDate: dateOnly.refine(v => {
    const age = ageOn(v)
    return age !== null && age >= 18 && age <= 120
  }, 'O titular precisa ter 18 anos ou mais'),
})
export type CheckoutHolderInput = z.infer<typeof checkoutHolderInput>

export const checkoutDependentInput = z.object({
  name: z.string().trim().min(3, 'Informe o nome do dependente').max(120, 'Nome longo demais'),
  cpf: z.preprocess(emptyAsUndefined, cpf.optional()),
  birthDate: dateOnly.refine(v => {
    const age = ageOn(v)
    return age !== null && age >= 0 && age <= 120
  }, 'Data de nascimento inválida'),
  relationship: dependentRelationship,
})
export type CheckoutDependentInput = z.infer<typeof checkoutDependentInput>

/**
 * Cartão de APROVAÇÃO da sandbox do Asaas. Não passa no Luhn, então só é
 * aceito quando `allowSandboxCard` (gateway simulado ou Asaas sandbox) —
 * fora disso é um número inválido como outro qualquer.
 * (Recusa na sandbox: 5184 0197 4037 3151 e 4916 5613 5824 0741, válidos no Luhn.)
 */
export const ASAAS_SANDBOX_APPROVED_CARD = '4444444444444444'

/** Cartão de recusa da sandbox do Asaas (válido no Luhn; o Asaas devolve "não autorizada"). */
export const ASAAS_SANDBOX_DECLINED_CARD = '5184019740373151'

/**
 * Cartões de exemplo do modo SIMULADO: qualquer número válido aprova; final
 * `0002` recusa (regra em blueprint §0).
 */
export const SIMULATED_CARD_EXAMPLES = {
  approved: '4111111111111111',
  declined: '4000000000000002',
} as const

/**
 * Comprimentos aceitos por bandeira. Amex 15; Visa 13/16/19; Diners 14/16
 * (o Diners clássico tem 14); Discover/JCB 16–19; as demais 16. Bandeira
 * desconhecida (`outra`) não é aceita.
 */
const CARD_LENGTHS: Record<Exclude<CardBrand, 'outra'>, readonly number[]> = {
  visa: [13, 16, 19],
  mastercard: [16],
  elo: [16],
  amex: [15],
  hipercard: [16],
  diners: [14, 16],
  discover: [16, 17, 18, 19],
  jcb: [16, 17, 18, 19],
}

/** CVV: 4 dígitos no Amex, 3 nas demais bandeiras. */
export function cardCvvLength(brand: CardBrand | null | undefined): 3 | 4 {
  return brand === 'amex' ? 4 : 3
}

export interface CardInputOptions {
  /**
   * Aceita o cartão de aprovação da sandbox do Asaas (`4444…`, que não passa
   * no Luhn). Só com gateway simulado/sandbox — nunca em produção.
   */
  allowSandboxCard: boolean
}

/**
 * Problema do número do cartão, ou `null` se aceito: bandeira conhecida,
 * comprimento da bandeira e Luhn. Mesma regra na tela e na API.
 */
export function cardNumberIssue(value: string, options: CardInputOptions): string | null {
  const digits = onlyDigits(value)
  if (digits === ASAAS_SANDBOX_APPROVED_CARD) return options.allowSandboxCard ? null : 'Número de cartão inválido'
  if (digits.length < 13) return 'Número de cartão incompleto'
  const brand = detectCardBrand(digits)
  if (!brand || brand === 'outra') return 'Bandeira não aceita'
  if (!CARD_LENGTHS[brand].includes(digits.length) || !isValidCardNumber(digits)) return 'Número de cartão inválido'
  return null
}

/**
 * Dados do cartão. Trafegam tela → server action → API → gateway e morrem
 * ali: nunca gravados, nunca logados. Validade aceita ano com 2 ou 4 dígitos;
 * vencido (mês/ano antes do mês corrente) é recusado com "Cartão vencido".
 */
export function checkoutCardSchema(options: CardInputOptions) {
  return z
    .object({
      holderName: z.string().trim().min(3, 'Informe o nome impresso no cartão').max(80),
      number: z.string().transform(onlyDigits),
      expiryMonth: z.coerce.number().int().min(1, 'Mês inválido').max(12, 'Mês inválido'),
      expiryYear: z.coerce
        .number()
        .int()
        .transform(y => (y < 100 ? 2000 + y : y))
        .refine(y => y >= 2000 && y <= 2100, 'Ano inválido'),
      ccv: z.string().regex(/^\d{3,4}$/, 'Código de segurança inválido'),
      /** CPF do dono do cartão; ausente = CPF do titular da assinatura. */
      holderCpf: z.preprocess(emptyAsUndefined, cpf.optional()),
      /** Exigidos pelo Asaas em `creditCardHolderInfo`. */
      holderPostalCode: cep,
      holderAddressNumber: z.string().trim().min(1, 'Informe o número').max(10),
    })
    .superRefine((card, ctx) => {
      const numberIssue = cardNumberIssue(card.number, options)
      if (numberIssue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['number'], message: numberIssue })
      if (!numberIssue && card.number !== ASAAS_SANDBOX_APPROVED_CARD) {
        const brand = detectCardBrand(card.number)
        const expected = cardCvvLength(brand)
        if (/^\d{3,4}$/.test(card.ccv) && card.ccv.length !== expected) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ccv'],
            message: expected === 4 ? 'O código de segurança do American Express tem 4 dígitos' : 'O código de segurança tem 3 dígitos',
          })
        }
      }
      const now = new Date()
      if (card.expiryYear * 12 + card.expiryMonth < now.getFullYear() * 12 + (now.getMonth() + 1)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiryMonth'], message: 'Cartão vencido' })
      }
    })
}

/**
 * Esquema de TRANSPORTE (controllers da API, que não sabem o gateway antes
 * de chegar ao serviço): aceita o cartão da sandbox; o serviço confere de
 * novo com `cardNumberIssue(..., { allowSandboxCard: <gateway em teste> })`.
 * A tela usa `checkoutCardSchema({ allowSandboxCard: isDemoMode(...) })`.
 */
export const checkoutCardInput = checkoutCardSchema({ allowSandboxCard: true })
export type CheckoutCardInput = z.infer<typeof checkoutCardInput>

export function checkoutPaymentSchema(options: CardInputOptions) {
  return z
    .object({
      method: clubPaymentMethod,
      card: checkoutCardSchema(options).optional(),
    })
    .superRefine((payment, ctx) => {
      if (payment.method === 'credit_card' && !payment.card) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['card'], message: 'Informe os dados do cartão' })
      }
    })
}

/** Transporte (ver `checkoutCardInput`). */
export const checkoutPaymentInput = checkoutPaymentSchema({ allowSandboxCard: true })
export type CheckoutPaymentInput = z.infer<typeof checkoutPaymentInput>

/** `POST /t/:slug/public/checkout`. */
export function checkoutInputSchema(options: CardInputOptions) {
  return z.object({
    planId: uuid,
    holder: checkoutHolderInput,
    dependents: z.array(checkoutDependentInput).max(20, 'Máximo de 20 dependentes').default([]),
    payment: checkoutPaymentSchema(options),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar os termos para continuar' }) }),
  })
}

/** Transporte (ver `checkoutCardInput`). */
export const checkoutInput = checkoutInputSchema({ allowSandboxCard: true })
export type CheckoutInput = z.infer<typeof checkoutInput>

/** Nova tentativa (outro cartão ou troca de método) — checkout público e portal. */
export const retryPaymentInput = checkoutPaymentInput
export type RetryPaymentInput = z.infer<typeof retryPaymentInput>

// ---------------------------------------------------------------------------
// Saída do checkout
// ---------------------------------------------------------------------------

/** `GET /t/:slug/public/checkout/contexto` — tudo que o wizard precisa antes do 1º passo. */
export const checkoutContext = z.object({
  /** Só planos ativos, na ordem da vitrine, já com os campos de dependente. */
  plans: z.array(clubPlan),
  enabledMethods: z.array(clubPaymentMethod),
  gateway: paymentGatewayProvider,
  /** Asaas em sandbox (dinheiro de mentira, mas gateway real). */
  sandbox: z.boolean(),
  /** Mostra o botão "Simular pagamento" (gateway simulado ou Asaas sandbox). */
  canSimulatePayment: z.boolean(),
  /**
   * `false` = clube com gateway Asaas mas SEM conta de recebimento conectada:
   * a adesão é recusada (`RECEBIMENTO_NAO_CONFIGURADO`) — a tela avisa antes
   * do formulário. Gateway simulado é sempre `true`.
   */
  receivingConfigured: z.boolean(),
  /** Regras do modo simulado, para a tela explicar o que vai acontecer; `null` fora dele. */
  simulation: z
    .object({
      pixApproveSeconds: z.number().int().nonnegative(),
      /** 0 = boleto só compensa pelo botão/baixa manual. */
      boletoApproveSeconds: z.number().int().nonnegative(),
      /** Cartão com estes 4 finais é recusado. */
      declinedCardSuffix: z.string(),
    })
    .nullable(),
  /** Dias até o vencimento do 1º boleto. */
  boletoDueDays: z.number().int().positive(),
})
export type CheckoutContext = z.infer<typeof checkoutContext>

/**
 * `GET /t/:slug/public/checkout/:subscriptionId?chave=` — o que a tela de
 * resultado consulta em polling (a API sincroniza com o gateway antes de responder).
 */
export const checkoutStatus = z.object({
  subscriptionId: uuid,
  status: clubSubscriptionStatus,
  planName: z.string(),
  amount: z.number(),
  paymentMethod: clubPaymentMethod,
  holderFirstName: z.string(),
  /** Carteirinhas — preenchidas quando a assinatura ativa. */
  cardNumber: z.string().nullable(),
  dependents: z.array(z.object({ name: z.string(), relationship: dependentRelationship, cardNumber: z.string().nullable() })),
  /** Cobrança corrente (a 1ª, ou a da nova tentativa). */
  charge: clubCharge,
  canSimulatePayment: z.boolean(),
})
export type CheckoutStatus = z.infer<typeof checkoutStatus>

export const checkoutResult = checkoutStatus.extend({
  /**
   * Chave de acesso às rotas públicas desta assinatura (status, nova
   * tentativa, simular, boleto). HMAC do id — guarde na URL (`?chave=`).
   */
  accessKey: z.string(),
  /** A conta foi criada agora (e-mail novo). */
  accountCreated: z.boolean(),
  /**
   * Sessão do novo associado, SÓ quando a conta nasceu neste checkout. E-mail
   * já existente → `null` (entra pelo portal com CPF + e-mail).
   */
  session: authSession.nullable(),
})
export type CheckoutResult = z.infer<typeof checkoutResult>

/** `GET /t/:slug/public/checkout/:subscriptionId/cobrancas/:chargeId?chave=` — página imprimível do boleto. */
export const checkoutBoletoView = z.object({
  charge: clubCharge,
  payerName: z.string(),
  /** Mascarado (`***.456.789-**`). */
  payerCpf: z.string(),
  tenantName: z.string(),
  /** `true` no modo simulado: a página exibe a tarja "documento sem valor". */
  simulated: z.boolean(),
})
export type CheckoutBoletoView = z.infer<typeof checkoutBoletoView>

// ---------------------------------------------------------------------------
// Painel do inquilino — Faturamento e Cadastros
// ---------------------------------------------------------------------------

export const listClubChargesQuery = paginationQuery.extend({
  status: clubChargeStatus.optional(),
  method: clubPaymentMethod.optional(),
  /** Filtro por vencimento, inclusive. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  subscriptionId: uuid.optional(),
})
export type ListClubChargesQuery = z.infer<typeof listClubChargesQuery>

/** `q` (de `paginationQuery`) busca por nome, e-mail, CPF ou nº de carteirinha (titular ou dependente). */
export const listClubSubscriptionsQuery = paginationQuery.extend({
  status: clubSubscriptionStatus.optional(),
  planId: uuid.optional(),
  method: clubPaymentMethod.optional(),
})
export type ListClubSubscriptionsQuery = z.infer<typeof listClubSubscriptionsQuery>

export const listPaymentEventsQuery = paginationQuery.extend({
  subscriptionId: uuid.optional(),
  chargeId: uuid.optional(),
  source: paymentEventSource.optional(),
})
export type ListPaymentEventsQuery = z.infer<typeof listPaymentEventsQuery>

/** Segunda via: novo vencimento (padrão hoje + `boletoDueDays`) e, opcionalmente, troca Pix↔boleto. */
export const reissueClubChargeInput = z.object({
  dueDate: dateOnly.optional(),
  method: z.enum(['pix', 'boleto']).optional(),
})
export type ReissueClubChargeInput = z.infer<typeof reissueClubChargeInput>

export const manualPaymentInput = z.object({
  /** Padrão: hoje. */
  paidAt: dateOnly.optional(),
  /** Padrão: valor da cobrança. */
  amount: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
})
export type ManualPaymentInput = z.infer<typeof manualPaymentInput>

export const cancelClubChargeInput = z.object({
  reason: z.string().trim().max(500).optional(),
})
export type CancelClubChargeInput = z.infer<typeof cancelClubChargeInput>

export const cancelClubSubscriptionInput = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo').max(500),
})
export type CancelClubSubscriptionInput = z.infer<typeof cancelClubSubscriptionInput>

// ---------------------------------------------------------------------------
// Cobrança gerada pelo admin (adiantar mensalidade / avulsa)
// ---------------------------------------------------------------------------

/** Limites da cobrança avulsa (tela e API). */
export const ONE_OFF_CHARGE_LIMITS = {
  descriptionMax: 80,
  amountMax: 10_000,
  /** Vencimento entre hoje e hoje + N dias. */
  dueMaxDays: 60,
} as const

const manualChargeBase = {
  method: clubPaymentMethod,
  /**
   * Cartão: `true` cobra AGORA o cartão salvo da assinatura (a tela exige
   * confirmação explícita); `false` cria a cobrança no cartão sem cobrar — o
   * associado paga pelo portal (Faturas).
   */
  chargeSavedCard: z.boolean().default(false),
  /** Chave do cliente contra clique duplo: repetir a chave devolve a mesma cobrança. */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
}

/**
 * `POST /t/:slug/faturamento/assinaturas/:id/cobrancas`. O vencimento da avulsa
 * (hoje ≤ data ≤ hoje + 60) é conferido no serviço, que sabe o "hoje" de SP.
 */
export const createManualClubChargeInput = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('advance'), ...manualChargeBase }),
    z.object({
      type: z.literal('one_off'),
      ...manualChargeBase,
      description: z
        .string()
        .trim()
        .min(1, 'Informe a descrição')
        .max(ONE_OFF_CHARGE_LIMITS.descriptionMax, `Até ${ONE_OFF_CHARGE_LIMITS.descriptionMax} caracteres`),
      amount: z
        .number()
        .positive('O valor precisa ser maior que zero')
        .max(ONE_OFF_CHARGE_LIMITS.amountMax, 'O valor máximo é R$ 10.000,00')
        .refine(value => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, 'Use no máximo 2 casas decimais'),
      dueDate: dateOnly,
    }),
  ])
  .superRefine((input, ctx) => {
    if (input.chargeSavedCard && input.method !== 'credit_card') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chargeSavedCard'], message: 'Só dá para cobrar na hora com cartão' })
    }
  })
export type CreateManualClubChargeInput = z.infer<typeof createManualClubChargeInput>

/** `GET …/assinaturas/:id/cobrancas/previa` — tudo que o diálogo "Gerar cobrança" precisa. */
export const manualChargePreview = z.object({
  subscriptionId: uuid,
  status: clubSubscriptionStatus,
  /** Só `active`/`past_due` aceitam cobrança gerada pelo admin. */
  eligible: z.boolean(),
  ineligibleReason: z.string().nullable(),
  holderName: z.string(),
  holderEmail: z.string(),
  planName: z.string(),
  /** Forma de pagamento preferida do associado (a da assinatura). */
  preferredMethod: clubPaymentMethod,
  /** Formas habilitadas no clube (a tela só oferece estas). */
  enabledMethods: z.array(clubPaymentMethod),
  /** Cartão salvo que pode ser cobrado agora (token no gateway atual); `null` sem cartão utilizável. */
  savedCard: clubCardInfo.nullable(),
  advance: z.object({
    /** `false` quando a próxima mensalidade já existe ou a assinatura não tem próximo vencimento. */
    available: z.boolean(),
    unavailableReason: z.string().nullable(),
    periodStart: dateOnly.nullable(),
    periodEnd: dateOnly.nullable(),
    /** Vencimento do ciclo (não muda ao adiantar). */
    dueDate: dateOnly.nullable(),
    /** Mesmo valor que a automação cobraria (plano + dependentes). */
    amount: z.number(),
    /** "Mensalidade 11/2026". */
    label: z.string().nullable(),
    /** A mensalidade deste período, se já gerada (link "ver cobrança"). */
    existingCharge: z
      .object({ id: uuid, dueDate: dateOnly, status: clubChargeStatus, amount: z.number() })
      .nullable(),
  }),
  oneOff: z.object({
    minDueDate: dateOnly,
    maxDueDate: dateOnly,
    /** Sugestão: hoje + `boletoDueDays`. */
    defaultDueDate: dateOnly,
    maxAmount: z.number(),
    descriptionMax: z.number().int(),
  }),
})
export type ManualChargePreview = z.infer<typeof manualChargePreview>

/**
 * Resultado do "Gerar cobrança":
 *  - `created`: cobrança criada (Pix/boleto emitido, ou cartão aguardando o associado);
 *  - `card_approved` / `card_declined`: cobrado agora no cartão salvo;
 *  - `gateway_failed`: gravada, mas o processador não emitiu (segunda via/nova tentativa resolvem).
 */
export const manualChargeOutcome = z.enum(['created', 'card_approved', 'card_declined', 'gateway_failed'])
export type ManualChargeOutcome = z.infer<typeof manualChargeOutcome>

export const manualChargeResult = z.object({
  outcome: manualChargeOutcome,
  /** Motivo da recusa/falha, pronto para a tela. */
  message: z.string().nullable(),
  /** Mesma `idempotencyKey` de um pedido anterior: devolve a cobrança já criada, sem efeito novo. */
  reused: z.boolean(),
  /** Aviso por e-mail ao associado: `sent` (ou caixa de saída fora de produção), `failed` ou `skipped`. */
  notice: z.enum(['sent', 'failed', 'skipped']),
  charge: clubCharge,
})
export type ManualChargeResult = z.infer<typeof manualChargeResult>

/** Régua de cobrança do inquilino (`billing_settings`). */
export const billingSettings = z.object({
  /** Gateway efetivo agora (override do inquilino → env → simulado). */
  gateway: paymentGatewayProvider,
  /** Override gravado para o inquilino; `null` = segue a env `PAYMENT_GATEWAY`. */
  gatewayOverride: paymentGatewayProvider.nullable(),
  /**
   * O clube tem conta Asaas PRÓPRIA conectada (Configurações → Recebimento).
   * Sem ela, com gateway `asaas`, adesão e cobrança ficam bloqueadas
   * (`RECEBIMENTO_NAO_CONFIGURADO`). A chave global do servidor não conta.
   */
  asaasConfigured: z.boolean(),
  sandbox: z.boolean(),
  enabledMethods: z.array(clubPaymentMethod).min(1),
  /** Gera a cobrança do próximo ciclo N dias antes do vencimento. */
  generateDaysBefore: z.number().int().min(0).max(30),
  /** Lembrete N dias antes do vencimento. */
  reminderDaysBefore: z.number().int().min(0).max(15),
  maxCardRetries: z.number().int().min(0).max(10),
  cardRetryIntervalHours: z.number().int().min(1).max(168),
  /** Suspende (bloqueia carteirinhas) após N dias da cobrança mais antiga em aberto. */
  suspendAfterDays: z.number().int().min(1).max(180),
  /** Cancela após N dias (precisa ser > suspendAfterDays). */
  cancelAfterDays: z.number().int().min(2).max(365),
  /** Vencimento do boleto inicial/segunda via: hoje + N dias. */
  boletoDueDays: z.number().int().min(1).max(30),
  /** Multa após o vencimento (%), repassada ao gateway. */
  finePercent: z.number().min(0).max(2),
  /** Juros ao mês (%), repassados ao gateway. */
  interestMonthlyPercent: z.number().min(0).max(1),
  automation: z.object({
    enabled: z.boolean(),
    intervalSeconds: z.number().int().positive(),
    lastRunAt: z.string().datetime().nullable(),
  }),
})
export type BillingSettings = z.infer<typeof billingSettings>

export const updateBillingSettingsInput = billingSettings
  .pick({
    gatewayOverride: true,
    enabledMethods: true,
    generateDaysBefore: true,
    reminderDaysBefore: true,
    maxCardRetries: true,
    cardRetryIntervalHours: true,
    suspendAfterDays: true,
    cancelAfterDays: true,
    boletoDueDays: true,
    finePercent: true,
    interestMonthlyPercent: true,
  })
  .partial()
export type UpdateBillingSettingsInput = z.infer<typeof updateBillingSettingsInput>

// ---------------------------------------------------------------------------
// Conta de recebimento do clube (Asaas próprio do inquilino)
// ---------------------------------------------------------------------------

/** Ambiente da chave: `$aact_hmlg_…` = sandbox, `$aact_prod_…` = produção. */
export const asaasEnvironment = z.enum(['sandbox', 'production'])
export type AsaasEnvironmentName = z.infer<typeof asaasEnvironment>

/** `ativo` = cadastrado e ligado no Asaas; `pendente` = ainda não deu para cadastrar (ex.: API sem URL pública); `erro` = o Asaas recusou. */
export const clubReceivingWebhookStatus = z.enum(['ativo', 'pendente', 'erro'])
export type ClubReceivingWebhookStatus = z.infer<typeof clubReceivingWebhookStatus>

export const CLUB_RECEIVING_WEBHOOK_STATUS_LABELS: Record<ClubReceivingWebhookStatus, string> = {
  ativo: 'Ativo',
  pendente: 'Pendente',
  erro: 'Com erro',
}

/** Resumo do `GET /myAccount/status` do Asaas (situação cadastral da conta do clube). */
export const clubReceivingAccountApproval = z.object({
  /** Conta aprovada (`general = APPROVED`): pode receber e sacar. */
  approved: z.boolean(),
  /** Situação geral crua do Asaas (`APPROVED`, `AWAITING_APPROVAL`, `PENDING`, `REJECTED`…); `null` = não informada. */
  general: z.string().nullable(),
  /** O que ainda falta aprovar, em português (ex.: "Documentação: aguardando aprovação"). Vazio = nada. */
  pending: z.array(z.string()),
})
export type ClubReceivingAccountApproval = z.infer<typeof clubReceivingAccountApproval>

/**
 * `GET /t/:slug/faturamento/configuracoes/recebimento` (e resposta das
 * mutações). NUNCA traz a chave nem o token do webhook.
 */
export const clubReceivingAccount = z.object({
  connected: z.boolean(),
  env: asaasEnvironment.nullable(),
  /** 4 últimos caracteres da chave (para o admin reconhecer qual colou). */
  keyHint: z.string().nullable(),
  accountName: z.string().nullable(),
  /** CPF/CNPJ do titular da conta Asaas, mascarado. */
  cpfCnpj: z.string().nullable(),
  email: z.string().nullable(),
  accountStatus: clubReceivingAccountApproval.nullable(),
  webhookStatus: clubReceivingWebhookStatus.nullable(),
  /** Motivo do `pendente`/`erro` do webhook, pronto para a tela. */
  webhookLastError: z.string().nullable(),
  /** URL que o Asaas chama (`/api/v1/webhooks/asaas/clube/:organizationId`). */
  webhookUrl: z.string().nullable(),
  connectedAt: z.string().datetime().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
})
export type ClubReceivingAccount = z.infer<typeof clubReceivingAccount>

/** `PUT /t/:slug/faturamento/configuracoes/recebimento`. Formato/ambiente da chave são conferidos na API. */
export const connectClubReceivingAccountInput = z.object({
  apiKey: z.string().trim().min(1, 'Informe a chave de API do Asaas').max(500, 'Chave de API grande demais'),
})
export type ConnectClubReceivingAccountInput = z.infer<typeof connectClubReceivingAccountInput>

/** `GET /t/:slug/faturamento/resumo`. Definições exatas em blueprint §0. */
export const billingSummary = z.object({
  gateway: paymentGatewayProvider,
  sandbox: z.boolean(),
  /** Soma de `amount` das assinaturas `active` + `past_due`. */
  mrr: z.number(),
  activeSubscriptions: z.number().int(),
  pendingSubscriptions: z.number().int(),
  pastDueSubscriptions: z.number().int(),
  suspendedSubscriptions: z.number().int(),
  canceledThisMonth: z.number().int(),
  /** Ativadas no mês corrente. */
  newThisMonth: z.number().int(),
  totalDependents: z.number().int(),
  /** Soma das cobranças `overdue` + `failed` com vencimento passado. */
  overdueAmount: z.number(),
  overdueCharges: z.number().int(),
  /** % = overdueAmount ÷ valor faturado com vencimento nos últimos 90 dias (exceto canceladas). */
  delinquencyRate: z.number(),
  receivedThisMonth: z.number(),
  /** Em aberto, não vencidas, com vencimento no mês corrente. */
  pendingThisMonth: z.number(),
  /** Previsão do próximo mês (= MRR). */
  forecastNextMonth: z.number(),
  /** Últimos 6 meses, do mais antigo ao atual. `month` = `yyyy-MM` (por vencimento; `received` por data de pagamento). */
  monthly: z.array(
    z.object({ month: z.string(), billed: z.number(), received: z.number(), overdue: z.number() }),
  ),
  /** Assinaturas ativas/em atraso por método. */
  byMethod: z.array(z.object({ method: clubPaymentMethod, count: z.number().int(), amount: z.number() })),
  lastAutomationRunAt: z.string().datetime().nullable(),
})
export type BillingSummary = z.infer<typeof billingSummary>

/** `POST /t/:slug/faturamento/automacao/executar`. */
export const billingAutomationReport = z.object({
  tenantId: uuid,
  ranAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  synced: z.number().int(),
  generated: z.number().int(),
  cardCharged: z.number().int(),
  cardFailed: z.number().int(),
  remindersSent: z.number().int(),
  /** E-mails da régua "assine seu plano" (associado sem assinatura) enviados nesta rodada. */
  onboardingEmailsSent: z.number().int().optional(),
  markedOverdue: z.number().int(),
  suspended: z.number().int(),
  canceled: z.number().int(),
  reactivated: z.number().int(),
  errors: z.array(z.string()),
})
export type BillingAutomationReport = z.infer<typeof billingAutomationReport>

// ---------------------------------------------------------------------------
// Recebimentos (Financeiro → Recebimento)
// ---------------------------------------------------------------------------

/**
 * `GET /t/:slug/faturamento/recebimentos` — dinheiro que entrou (e saiu, no
 * estorno) num período, pela data do pagamento. Período em datas-só de São
 * Paulo, inclusive; sem `from`/`to` vale o mês corrente.
 */
export const listClubReceiptsQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  method: clubPaymentMethod.optional(),
  /** `nextCursor` da página anterior. */
  cursor: z.string().trim().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type ListClubReceiptsQuery = z.infer<typeof listClubReceiptsQuery>

/** `received` = pagamento confirmado (pela data do pagamento); `refunded` = estorno (pela data do estorno). */
export const clubReceiptKind = z.enum(['received', 'refunded'])
export type ClubReceiptKind = z.infer<typeof clubReceiptKind>

export const CLUB_RECEIPT_KIND_LABELS: Record<ClubReceiptKind, string> = {
  received: 'Recebido',
  refunded: 'Estornado',
}

export const clubReceiptItem = z.object({
  /** `${chargeId}:${kind}` — a mesma cobrança pode aparecer como recebida e, depois, estornada. */
  id: z.string(),
  kind: clubReceiptKind,
  chargeId: uuid,
  subscriptionId: uuid,
  /** Instante do pagamento (`received`) ou do estorno (`refunded`). */
  occurredAt: z.string().datetime(),
  holderName: z.string(),
  planName: z.string(),
  /** Avulsa mostra `description` no lugar do plano/competência. */
  chargeKind: clubChargeKind,
  description: z.string(),
  method: clubPaymentMethod,
  card: clubCardInfo.nullable(),
  /** Sempre positivo (valor pago); o estorno é saída. */
  amount: z.number(),
  dueDate: dateOnly,
})
export type ClubReceiptItem = z.infer<typeof clubReceiptItem>

export const clubReceiptsTotals = z.object({
  /** Soma do valor pago dos pagamentos confirmados no período (inclui os estornados depois). */
  received: z.number(),
  /** Quantidade de pagamentos confirmados no período. */
  count: z.number().int().nonnegative(),
  /** `received ÷ count` (0 sem pagamentos). */
  average: z.number(),
  /** Soma estornada no período (pela data do estorno). */
  refunded: z.number(),
  refundedCount: z.number().int().nonnegative(),
  /** `received − refunded`. */
  net: z.number(),
  /** Em aberto (pendentes, vencidas e recusadas) com vencimento no período. */
  receivable: z.number(),
  receivableCount: z.number().int().nonnegative(),
})
export type ClubReceiptsTotals = z.infer<typeof clubReceiptsTotals>

export const clubReceiptsPage = z.object({
  /** Período efetivo (datas-só, inclusive). */
  from: dateOnly,
  to: dateOnly,
  items: z.array(clubReceiptItem),
  totals: clubReceiptsTotals,
  /** Recebido por dia do período (só dias com pagamento), do mais antigo ao mais recente. */
  daily: z.array(z.object({ date: dateOnly, amount: z.number() })),
  /** `null` quando não há mais páginas. */
  nextCursor: z.string().nullable(),
})
export type ClubReceiptsPage = z.infer<typeof clubReceiptsPage>

// ---------------------------------------------------------------------------
// Portal do associado
// ---------------------------------------------------------------------------

/**
 * Situação da carteirinha exibida. `past_due` ainda vale (carência) → `active`
 * com aviso; `suspended` → `blocked`.
 */
export const clubCardStatus = z.enum(['active', 'pending', 'blocked', 'canceled'])
export type ClubCardStatus = z.infer<typeof clubCardStatus>

export const clubMembershipCard = z.object({
  kind: z.enum(['titular', 'dependente']),
  /** id do dependente; `null` para o titular. */
  dependentId: uuid.nullable(),
  name: z.string(),
  cpf: z.string().nullable(),
  birthDate: dateOnly.nullable(),
  relationship: dependentRelationship.nullable(),
  cardNumber: z.string().nullable(),
  planName: z.string(),
  status: clubCardStatus,
  /** Associado desde (ativação). */
  validSince: z.string().datetime().nullable(),
})
export type ClubMembershipCard = z.infer<typeof clubMembershipCard>

/** `GET /t/:slug/cliente/assinatura` — `data: null` quando a pessoa não tem assinatura do clube. */
export const myClubMembership = z.object({
  subscription: clubSubscription,
  /** Titular primeiro, depois dependentes. */
  cards: z.array(clubMembershipCard),
  /** Próxima cobrança em aberto (a de vencimento mais próximo), se houver. */
  nextCharge: clubCharge.nullable(),
  openCharges: z.array(clubCharge),
  /**
   * Plano ATUAL (coberturas, carências, regras) de `subscription.planId`;
   * `null` se o plano foi excluído. Opcional até a API passar a enviar. Preço
   * e nome contratados continuam sendo os do retrato em `subscription`.
   */
  plan: clubPlan.nullable().optional(),
})
export type MyClubMembership = z.infer<typeof myClubMembership>

// `clubAccessStatus` / `ClubAccessStatus` moram em ./auth (o `SessionUser`
// também os usa e este arquivo já importa de ./auth — evita import circular).

/** `GET /t/:slug/cliente/acesso`. */
export const myClubAccess = z.object({
  status: clubAccessStatus,
  /** `true` em `none` e `pending_payment`: benefícios ainda não liberados. */
  needsSubscription: z.boolean(),
})
export type MyClubAccess = z.infer<typeof myClubAccess>
