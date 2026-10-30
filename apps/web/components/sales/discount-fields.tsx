'use client'

import { BadgePercent, CalendarRange, Gift, MessageSquareText } from 'lucide-react'
import {
  MAX_MONTHLY_DISCOUNT_PERCENT,
  discountAmount,
  roundCents,
  type DiscountRequestInput,
  type PlatformPlanQuote,
} from '@annetec/contracts'
import {
  ChoiceField,
  FieldSection,
  Notice,
  TextField,
  TextareaField,
  maskDecimal,
  maskDigits,
  parseDecimal,
  parseInteger,
  type FieldBinding,
  type FieldErrors,
} from '@/components/admin-platform/ui/wizard'
import { formatPct } from './sales-ui'

/**
 * Campos da "condição especial" (pedido de desconto do vendedor) e as regras
 * de tela que espelham `discountRequestInput`: adesão 0–100% (100 = isenção),
 * mensalidade 0–50% por N mensalidades (a 1ª, que vai na ativação, conta) ou
 * permanente, e a justificativa (mín. 10 caracteres). Usados no link de
 * contratação, no "Pedir desconto" da proposta e no ajuste do superadmin.
 */

export type SetupMode = 'nenhum' | 'percentual' | 'isencao'
export type MonthlyMode = 'nenhum' | 'meses' | 'permanente'

export interface DiscountFormValues {
  setupMode: SetupMode
  setupPercent: string
  monthlyMode: MonthlyMode
  monthlyPercent: string
  monthlyMonths: string
  justification: string
}

export const DISCOUNT_FIELDS = ['setupMode', 'setupPercent', 'monthlyMode', 'monthlyPercent', 'monthlyMonths', 'justification'] as const

export const EMPTY_DISCOUNT: DiscountFormValues = {
  setupMode: 'nenhum',
  setupPercent: '',
  monthlyMode: 'nenhum',
  monthlyPercent: '',
  monthlyMonths: '3',
  justification: '',
}

/** Desconto já em percentuais (o que vai para a API), sem a justificativa. */
export interface DiscountPercents {
  setupFeePercent: number
  monthlyPercent: number
  monthlyMonths: number | null
}

export function discountPercentsOf(values: DiscountFormValues): DiscountPercents {
  const setup = values.setupMode === 'isencao' ? 100 : values.setupMode === 'percentual' ? parseDecimal(values.setupPercent) ?? 0 : 0
  const monthly = values.monthlyMode === 'nenhum' ? 0 : parseDecimal(values.monthlyPercent) ?? 0
  const months = values.monthlyMode === 'meses' ? parseInteger(values.monthlyMonths) : null
  return { setupFeePercent: setup, monthlyPercent: monthly, monthlyMonths: monthly > 0 ? months : null }
}

export function hasDiscount(values: DiscountFormValues): boolean {
  const d = discountPercentsOf(values)
  return d.setupFeePercent > 0 || d.monthlyPercent > 0
}

/** Corpo de `discountRequestInput` (com a justificativa). */
export function toDiscountRequest(values: DiscountFormValues): DiscountRequestInput {
  const d = discountPercentsOf(values)
  return {
    ...(d.setupFeePercent > 0 ? { setupFeePercent: d.setupFeePercent } : {}),
    ...(d.monthlyPercent > 0 ? { monthlyPercent: d.monthlyPercent, monthlyMonths: d.monthlyMonths } : {}),
    justification: values.justification.trim(),
  }
}

/** Valores do formulário a partir de um desconto em percentuais (ajuste do superadmin). */
export function discountFormFrom(discount: Partial<DiscountPercents> | null | undefined, justification = ''): DiscountFormValues {
  const setup = discount?.setupFeePercent ?? 0
  const monthly = discount?.monthlyPercent ?? 0
  return {
    setupMode: setup >= 100 ? 'isencao' : setup > 0 ? 'percentual' : 'nenhum',
    setupPercent: setup > 0 && setup < 100 ? String(setup).replace('.', ',') : '',
    monthlyMode: monthly > 0 ? (discount?.monthlyMonths === null || discount?.monthlyMonths === undefined ? 'permanente' : 'meses') : 'nenhum',
    monthlyPercent: monthly > 0 ? String(monthly).replace('.', ',') : '',
    monthlyMonths: discount?.monthlyMonths ? String(discount.monthlyMonths) : '3',
    justification,
  }
}

/**
 * Validação da condição especial. `requireJustification` = pedido do vendedor
 * (o ajuste do superadmin não tem justificativa). `required` = é preciso ter
 * algum desconto (pedido avulso); no link a condição é opcional.
 */
export function validateDiscount<V extends DiscountFormValues>(
  values: V,
  options: { requireJustification?: boolean; required?: boolean } = {},
): FieldErrors<V> {
  const errors: FieldErrors<DiscountFormValues> = {}
  const { requireJustification = true, required = false } = options
  if (values.setupMode === 'percentual') {
    const n = parseDecimal(values.setupPercent)
    if (n === null) errors.setupPercent = 'Informe o percentual de desconto na adesão.'
    else if (n <= 0 || n > 100) errors.setupPercent = 'Use um percentual entre 0,01% e 100%.'
  }
  if (values.monthlyMode !== 'nenhum') {
    const n = parseDecimal(values.monthlyPercent)
    if (n === null) errors.monthlyPercent = 'Informe o percentual de desconto na mensalidade.'
    else if (n <= 0 || n > MAX_MONTHLY_DISCOUNT_PERCENT)
      errors.monthlyPercent = `O desconto na mensalidade vai até ${MAX_MONTHLY_DISCOUNT_PERCENT}%.`
  }
  if (values.monthlyMode === 'meses') {
    const months = parseInteger(values.monthlyMonths)
    if (months === null) errors.monthlyMonths = 'Informe por quantas mensalidades.'
    else if (months < 1 || months > 60) errors.monthlyMonths = 'Use de 1 a 60 mensalidades.'
  }
  const any = values.setupMode !== 'nenhum' || values.monthlyMode !== 'nenhum'
  if (required && !any) errors.setupMode = 'Escolha o desconto na adesão e/ou na mensalidade.'
  if (requireJustification && (required || any) && values.justification.trim().length < 10) {
    errors.justification =
      values.justification.trim() === '' ? 'Explique por que o cliente precisa dessa condição.' : 'Escreva pelo menos 10 caracteres.'
  }
  return errors as FieldErrors<V>
}

/**
 * Aplica um desconto a uma cotação SEM desconto — a mesma conta de
 * `quotePlatformPlan` (adesão até 100%, mensalidade até 50%).
 */
export function applyDiscountToQuote(quote: PlatformPlanQuote, discount: Partial<DiscountPercents> | null): PlatformPlanQuote {
  const setupPct = Math.min(100, Math.max(0, discount?.setupFeePercent ?? 0))
  const monthlyPct = Math.min(MAX_MONTHLY_DISCOUNT_PERCENT, Math.max(0, discount?.monthlyPercent ?? 0))
  const setupFeeDiscount = discountAmount(quote.setupFee, setupPct)
  const planFeeDiscount = discountAmount(quote.planFee, monthlyPct, MAX_MONTHLY_DISCOUNT_PERCENT)
  return {
    ...quote,
    setupFeeDiscountPercent: setupPct,
    setupFeeDiscount,
    planFeeDiscountPercent: monthlyPct,
    planFeeDiscount,
    monthlyTotal: roundCents(quote.planFee - planFeeDiscount + quote.overageTotal + quote.revenueShareTotal),
    activationTotal: roundCents(quote.planFee - planFeeDiscount + quote.setupFee - setupFeeDiscount),
  }
}

const SETUP_OPTIONS = [
  { value: 'nenhum', title: 'Sem desconto', description: 'Adesão cheia.' },
  { value: 'percentual', title: 'Desconto em %', description: 'Parte da adesão.', icon: BadgePercent },
  { value: 'isencao', title: 'Isenção', description: 'O cliente não paga adesão.', icon: Gift },
] as const

const MONTHLY_OPTIONS = [
  { value: 'nenhum', title: 'Sem desconto', description: 'Mensalidade cheia.' },
  { value: 'meses', title: 'Por alguns meses', description: 'A 1ª mensalidade conta.', icon: CalendarRange },
  { value: 'permanente', title: 'Permanente', description: 'Enquanto o contrato durar.', icon: BadgePercent },
] as const

export function DiscountFields({
  bind,
  values,
  justification = true,
  setupFee,
}: {
  /** `key => wizard.field(key)` do assistente que hospeda os campos. */
  bind: (key: (typeof DISCOUNT_FIELDS)[number]) => FieldBinding<string>
  values: DiscountFormValues
  /** Mostra o campo de justificativa (pedido do vendedor). */
  justification?: boolean
  /** Adesão do plano em R$ — sem adesão, o desconto nela não faz sentido. */
  setupFee?: number | null
}) {
  const noSetupFee = setupFee !== undefined && setupFee !== null && setupFee <= 0
  return (
    <>
      <FieldSection title="Adesão" icon={Gift} description={noSetupFee ? 'Este plano não cobra adesão.' : 'Cobrada uma vez, junto da 1ª mensalidade.'}>
        <ChoiceField {...bind('setupMode')} label="Desconto na adesão" span={12} columns={3} options={SETUP_OPTIONS} disabled={noSetupFee} />
        {values.setupMode === 'percentual' ? (
          <TextField
            {...bind('setupPercent')}
            label="Percentual de desconto na adesão"
            required
            span={4}
            inputMode="decimal"
            mask={value => maskDecimal(value, 2)}
            suffix="%"
            placeholder="50"
            hint="De 0,01% a 100%."
          />
        ) : null}
      </FieldSection>
      <FieldSection title="Mensalidade" icon={CalendarRange} description={`Desconto sobre a mensalidade do plano, até ${MAX_MONTHLY_DISCOUNT_PERCENT}%.`}>
        <ChoiceField {...bind('monthlyMode')} label="Desconto na mensalidade" span={12} columns={3} options={MONTHLY_OPTIONS} />
        {values.monthlyMode !== 'nenhum' ? (
          <TextField
            {...bind('monthlyPercent')}
            label="Percentual de desconto na mensalidade"
            required
            span={5}
            inputMode="decimal"
            mask={value => maskDecimal(value, 2)}
            suffix="%"
            placeholder="20"
            hint={`Até ${formatPct(MAX_MONTHLY_DISCOUNT_PERCENT)}.`}
          />
        ) : null}
        {values.monthlyMode === 'meses' ? (
          <TextField
            {...bind('monthlyMonths')}
            label="Quantas mensalidades"
            required
            span={4}
            inputMode="numeric"
            mask={value => maskDigits(value, 2)}
            suffix="meses"
            placeholder="3"
            hint="De 1 a 60."
          />
        ) : null}
      </FieldSection>
      {justification ? (
        <FieldSection title="Justificativa" icon={MessageSquareText} description="O superadmin lê antes de decidir.">
          <TextareaField
            {...bind('justification')}
            label="Por que o cliente precisa dessa condição?"
            required={values.setupMode !== 'nenhum' || values.monthlyMode !== 'nenhum'}
            optional={values.setupMode === 'nenhum' && values.monthlyMode === 'nenhum'}
            span={12}
            rows={3}
            maxLength={2000}
            showCounter
            placeholder="Ex.: o concorrente ofereceu isenção da adesão; o clube tem 3 mil associados e fecha esta semana."
          />
        </FieldSection>
      ) : null}
      {justification ? (
        <Notice tone="neutral" icon={BadgePercent} className="sm:col-span-12">
          Desconto precisa da aprovação do superadmin. Enquanto ele não decide, o e-mail com o link fica guardado.
        </Notice>
      ) : null}
    </>
  )
}
