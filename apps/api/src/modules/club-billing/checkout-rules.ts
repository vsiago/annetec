import {
  CLUB_PAYMENT_METHOD_LABELS,
  ERROR_CODES,
  checkCheckoutEligibility,
  formatBRL,
  quoteClubPlan,
  type CheckoutInput,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanQuote,
  type PlanRuleIssue,
} from '@annetec/contracts'
import { AppError } from '@/http/errors'

/**
 * Regras do plano aplicadas no checkout (puras — sem banco, sem relógio além
 * de `today`). A tela roda as mesmas funções do contracts a cada passo; aqui a
 * API confere de novo antes de gravar e devolve o preço oficial.
 */

/** 422 com uma issue por campo (`holder.birthDate`, `dependents.1.relationship`, `payment.method`…). */
export function checkoutRuleError(issues: readonly PlanRuleIssue[]): AppError {
  return new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, issues[0]?.message ?? 'Dados inválidos para este plano', {
    issues: issues.map(({ path, message }) => ({ path, message })),
  })
}

/**
 * Elegibilidade (idade do titular, parentesco/idade/teto dos dependentes,
 * forma de pagamento = clube ∩ plano) e cotação. Inelegível → 422 com `path`.
 */
export function assertCheckoutEligible(
  plan: ClubPlan,
  input: Pick<CheckoutInput, 'holder' | 'dependents'> & { payment: { method: ClubPaymentMethod } },
  enabledMethods: readonly ClubPaymentMethod[],
  today?: Date,
): ClubPlanQuote {
  const issues = checkCheckoutEligibility(
    plan,
    { holder: input.holder, dependents: input.dependents, payment: { method: input.payment.method } },
    { enabledMethods, today },
  )
  if (issues.length > 0) throw checkoutRuleError(issues)

  const quote = quoteClubPlan(plan, input.dependents.length)
  if (!quote.withinLimit) {
    // Coberto pela elegibilidade acima; fica como rede de segurança do teto.
    throw checkoutRuleError([
      {
        path: 'dependents',
        code: 'dependents_max',
        message:
          quote.maxDependents === 0
            ? 'Este plano não aceita dependentes'
            : `Este plano aceita até ${quote.maxDependents} dependente${quote.maxDependents === 1 ? '' : 's'}`,
      },
    ])
  }
  return quote
}

/** Descrição da 1ª cobrança: `<clube> · Plano X · <mês>`, com ` + adesão` quando há taxa. */
export function firstChargeDescription(tenantName: string, planName: string, month: string, quote: ClubPlanQuote): string {
  return `${tenantName} · Plano ${planName} · ${month}${quote.enrollmentFee > 0 ? ' + adesão' : ''}`
}

/** Frase do evento `CHECKOUT_STARTED` (timeline do painel). */
export function checkoutStartedMessage(planName: string, quote: ClubPlanQuote, method: ClubPaymentMethod): string {
  const dependents =
    quote.includedDependents > 0 && quote.dependentsCount > 0
      ? `${quote.dependentsCount} dependente(s), ${Math.min(quote.dependentsCount, quote.includedDependents)} incluso(s)`
      : `${quote.dependentsCount} dependente(s)`
  const fee =
    quote.enrollmentFee > 0
      ? ` + adesão ${formatBRL(quote.enrollmentFee)} (1ª cobrança ${formatBRL(quote.firstChargeTotal)})`
      : quote.enrollmentFeeWaived
        ? ` (adesão de ${formatBRL(quote.enrollmentFeeListPrice)} isenta)`
        : ''
  return `Checkout do plano ${planName}: ${formatBRL(quote.total)}/mês${fee}, ${dependents}, ${CLUB_PAYMENT_METHOD_LABELS[method]}`
}
