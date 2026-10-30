'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgePercent, Building2, Contact, FileSignature, Loader2, MailCheck, Tags } from 'lucide-react'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  LEGAL_FORMS_BY_CONTRACTOR_TYPE,
  LEGAL_NATURE_CODES_BY_FORM,
  legalForm as legalFormSchema,
  contractorType,
  createSellerLinkInput,
  formatPhone,
  onboardingApplicant,
  onlyDigits,
  quotePlatformPlan,
  type LegalForm,
  type PlatformPlanOffer,
  type PlatformPlanQuote,
  type Prospect,
  type SellerLinkResult,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import {
  ChoiceField,
  FieldGrid,
  FieldSection,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  SwitchField,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  combineValidators,
  integerInput,
  maskCnpj,
  maskInteger,
  maskPhone,
  parseInteger,
  successButton,
  useWizard,
  zodFields,
  type FieldBinding,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { useCnpjLookup } from '@/components/contratar/hooks'
import {
  DISCOUNT_FIELDS,
  DiscountFields,
  EMPTY_DISCOUNT,
  discountPercentsOf,
  hasDiscount,
  toDiscountRequest,
  validateDiscount,
  type DiscountFormValues,
} from '@/components/sales/discount-fields'
import { QuoteComparison, discountSummary, formatInt, formatMoney } from '@/components/sales/sales-ui'
import { createSellerLinkAction } from '@/lib/actions/vendas-api'
import { CnpjLookupNotice, useSellerPlans } from './vendas-kit'

/**
 * "Gerar link de contratação" a partir de um prospect:
 * Empresa → Plano e vidas → Contato do cliente → Condição especial (opcional) → Revisão.
 *
 * Sem condição especial, o e-mail com o link vai na hora para o cliente. Com
 * ela, a proposta nasce, o pedido vai ao superadmin e o e-mail fica guardado
 * até a decisão. O vendedor NUNCA vê a URL da proposta — ela só vai para o
 * e-mail do cliente (dá acesso de edição e ao aceite do contrato).
 */

interface LinkValues extends DiscountFormValues {
  legalForm: string
  cnpj: string
  planId: string
  lives: string
  applicantName: string
  applicantEmail: string
  applicantPhone: string
  wantsDiscount: boolean
}

const FIELDS = [
  'legalForm',
  'cnpj',
  'planId',
  'lives',
  'applicantName',
  'applicantEmail',
  'applicantPhone',
  'wantsDiscount',
  ...DISCOUNT_FIELDS,
] as const

const API_ALIASES: Record<string, (typeof FIELDS)[number]> = {
  expectedLives: 'lives',
  name: 'applicantName',
  email: 'applicantEmail',
  phone: 'applicantPhone',
  setupFeePercent: 'setupPercent',
}

const LEGAL_FORM_OPTIONS = contractorType.options.flatMap(type =>
  LEGAL_FORMS_BY_CONTRACTOR_TYPE[type].map(form => ({ value: form, label: `${CONTRACTOR_TYPE_LABELS[type]} · ${LEGAL_FORM_LABELS[form]}` })),
)

function initialFrom(prospect: Prospect | null): LinkValues {
  return {
    legalForm: '',
    cnpj: prospect?.cnpj ? maskCnpj(prospect.cnpj) : '',
    planId: prospect?.interestPlanId ?? '',
    lives: integerInput(prospect?.estimatedLives ?? null),
    applicantName: prospect?.contactName ?? '',
    applicantEmail: prospect?.email ?? '',
    applicantPhone: prospect?.phone ? formatPhone(prospect.phone) : '',
    wantsDiscount: false,
    ...EMPTY_DISCOUNT,
  }
}

const validateCompany = zodFields<LinkValues>(createSellerLinkInput.pick({ legalForm: true, cnpj: true }), {
  messages: {
    legalForm: 'Escolha a forma jurídica do cliente.',
    cnpj: { required: 'Informe o CNPJ do cliente.' },
  },
})

const validatePlan = zodFields<LinkValues>(createSellerLinkInput.pick({ planId: true, expectedLives: true }), {
  input: v => ({ planId: v.planId, expectedLives: parseInteger(v.lives) ?? undefined }),
  fieldOf: path => (path[0] === 'expectedLives' ? 'lives' : path[0] === 'planId' ? 'planId' : null),
  messages: {
    planId: 'Escolha o plano.',
    lives: { required: 'Informe quantas vidas o clube espera ter.', invalid: 'Use de 1 a 1.000.000 vidas.' },
  },
})

const validateApplicant = zodFields<LinkValues>(onboardingApplicant, {
  input: v => ({ name: v.applicantName, email: v.applicantEmail, phone: v.applicantPhone }),
  fieldOf: path =>
    path[0] === 'name' ? 'applicantName' : path[0] === 'email' ? 'applicantEmail' : path[0] === 'phone' ? 'applicantPhone' : null,
  messages: {
    applicantName: { required: 'Informe o nome de quem vai contratar.' },
    applicantEmail: { required: 'Informe o e-mail — o link vai para ele.' },
    applicantPhone: { required: 'Informe o telefone com DDD.' },
  },
})

const validateCondition = (v: LinkValues) => (v.wantsDiscount ? validateDiscount(v, { required: true }) : {})

/** Resumo da cotação (mensalidade, excedente, adesão e ativação) do plano escolhido. */
function QuoteBox({ quote, offer }: { quote: PlatformPlanQuote; offer: PlatformPlanOffer }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white sm:col-span-12">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF0F3] bg-[#FCFCFD] px-4 py-2.5">
        <p className="m-0 text-sm font-semibold text-foreground">Cotação do plano {offer.name}</p>
        <p className="m-0 text-xs text-muted-foreground">
          {formatInt(quote.lives)} vidas · uso de {quote.usagePct.toLocaleString('pt-BR')}% do limite
        </p>
      </div>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Mensalidade (até {formatInt(quote.memberLimit)} vidas)</dt>
          <dd className="m-0 tabular-nums">{formatMoney(quote.planFee)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            {quote.extraLives > 0 ? `${formatInt(quote.extraLives)} vidas extras × ${formatMoney(quote.pricePerExtraLife)}` : 'Vidas extras'}
          </dt>
          <dd className="m-0 tabular-nums">{quote.extraLives > 0 ? formatMoney(quote.overageTotal) : 'nenhuma'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Adesão (única)</dt>
          <dd className="m-0 tabular-nums">{quote.setupFee > 0 ? formatMoney(quote.setupFee) : 'sem adesão'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-foreground">Mensal estimado</dt>
          <dd className="m-0 font-semibold tabular-nums">{formatMoney(quote.monthlyTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3 sm:col-span-2">
          <dt className="font-medium text-foreground">Ativação (adesão + 1ª mensalidade, cobrada após a aprovação)</dt>
          <dd className="m-0 font-semibold tabular-nums">{formatMoney(quote.activationTotal)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function LinkWizard({
  open,
  onOpenChange,
  prospect,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect: Prospect | null
  /** Depois de criar a proposta (a tela recarrega o prospect/funil). */
  onCreated?: (result: SellerLinkResult) => void
}) {
  const router = useRouter()
  const { plans, loading: plansLoading, error: plansError, reload: reloadPlans } = useSellerPlans()
  const [result, setResult] = useState<SellerLinkResult | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo(() => initialFrom(prospect), [prospect?.id, open])

  const steps = useMemo<WizardStep<LinkValues>[]>(
    () => [
      {
        id: 'empresa',
        title: 'Empresa',
        icon: Building2,
        description: 'Quem vai contratar. Com o CNPJ, conferimos a empresa na Receita Federal.',
        fields: ['legalForm', 'cnpj'],
        validate: validateCompany,
      },
      {
        id: 'plano',
        title: 'Plano e vidas',
        icon: Tags,
        description: 'Você pode oferecer qualquer plano ANNETEC, inclusive os que não aparecem no site.',
        fields: ['planId', 'lives'],
        validate: validatePlan,
      },
      {
        id: 'contato',
        title: 'Contato do cliente',
        icon: Contact,
        description: 'O link de contratação vai para este e-mail. Só o cliente recebe o link.',
        fields: ['applicantName', 'applicantEmail', 'applicantPhone'],
        validate: validateApplicant,
      },
      {
        id: 'condicao',
        title: 'Condição especial',
        icon: BadgePercent,
        description: 'Opcional. Desconto na adesão e/ou na mensalidade, com aprovação do superadmin.',
        fields: ['wantsDiscount', ...DISCOUNT_FIELDS],
        validate: combineValidators(validateCondition),
      },
    ],
    [],
  )

  const wizard = useWizard<LinkValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      if (!prospect) return { ok: false, message: 'Escolha um prospect para gerar o link.' }
      const response = await createSellerLinkAction(prospect.id, {
        legalForm: values.legalForm as LegalForm,
        cnpj: onlyDigits(values.cnpj),
        planId: values.planId,
        expectedLives: parseInteger(values.lives) ?? 0,
        applicant: {
          name: values.applicantName.trim(),
          email: values.applicantEmail.trim().toLowerCase(),
          phone: onlyDigits(values.applicantPhone),
        },
        ...(values.wantsDiscount && hasDiscount(values) ? { discount: toDiscountRequest(values) } : {}),
      })
      if (!response.success) {
        return {
          ok: false,
          message: response.error || 'Não foi possível gerar o link. Confira os dados e tente de novo.',
          fieldErrors: apiFieldErrors<LinkValues>(response.fieldErrors, FIELDS, API_ALIASES),
        }
      }
      setResult(response.data)
      onCreated?.(response.data)
      return { ok: true }
    },
  })
  const { values } = wizard

  useEffect(() => {
    if (open) setResult(null)
  }, [open])

  const { lookup, retry } = useCnpjLookup(values.cnpj)

  // Forma jurídica sugerida pela natureza jurídica da Receita (só quando a pessoa ainda não escolheu).
  const { setMany } = wizard
  const legalFormRef = useRef(values.legalForm)
  legalFormRef.current = values.legalForm
  useEffect(() => {
    if (lookup.state !== 'done' || !lookup.response.found || legalFormRef.current) return
    const code = lookup.response.result?.legalNatureCode
    if (!code) return
    const forms = legalFormSchema.options.filter(form => LEGAL_NATURE_CODES_BY_FORM[form].includes(code))
    if (forms.length === 1) setMany({ legalForm: forms[0]! }, { reveal: true })
  }, [lookup, setMany])

  const offer = plans.find(plan => plan.id === values.planId) ?? null
  const lives = parseInteger(values.lives) ?? 0
  const quote = offer && lives > 0 ? quotePlatformPlan(offer, offer.pricing, lives) : null
  const discount = values.wantsDiscount ? discountPercentsOf(values) : null
  const discounted = offer && lives > 0 && discount ? quotePlatformPlan(offer, offer.pricing, lives, { discount }) : null

  const planOptions = plans.map(plan => {
    const q = quotePlatformPlan(plan, plan.pricing, Math.max(1, lives))
    return {
      value: plan.id,
      title: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {plan.name}
          {plan.pricing.publicVisible ? null : <StatusPill tone="info">Só com vendedor</StatusPill>}
        </span>
      ),
      description: `Até ${formatInt(plan.memberLimit)} vidas · vida extra ${
        plan.pricing.pricePerExtraLife > 0 ? formatMoney(plan.pricing.pricePerExtraLife) : 'sem custo'
      } · adesão ${plan.pricing.setupFee > 0 ? formatMoney(plan.pricing.setupFee) : 'grátis'}`,
      aside: (
        <span className="text-right">
          <span className="block font-semibold tabular-nums text-foreground">{formatMoney(q.monthlyTotal)}</span>
          <span className="block text-[11px] text-muted-foreground">por mês</span>
        </span>
      ),
    }
  })

  const bindDiscount = (key: (typeof DISCOUNT_FIELDS)[number]) => wizard.field(key) as FieldBinding<string>

  const renderStep = (id: string) => {
    if (id === 'empresa') {
      return (
        <FieldGrid>
          <SelectField
            {...wizard.field('legalForm')}
            label="Forma jurídica"
            required
            span={7}
            options={LEGAL_FORM_OPTIONS}
            placeholder="Escolha a forma jurídica"
            hint="Como está no cartão CNPJ."
          />
          <TextField
            {...wizard.field('cnpj')}
            label="CNPJ"
            required
            span={5}
            mask={maskCnpj}
            inputMode="numeric"
            placeholder="00.000.000/0001-00"
            maxLength={18}
            status={lookup.state === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Consultando a Receita" /> : null}
          />
          <CnpjLookupNotice cnpj={values.cnpj} lookup={lookup} onRetry={retry} />
        </FieldGrid>
      )
    }
    if (id === 'plano') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('lives')}
            label="Vidas esperadas"
            required
            span={4}
            inputMode="numeric"
            mask={value => maskInteger(value, 7)}
            suffix="vidas"
            placeholder="500"
            hint="Titulares + dependentes nos próximos meses."
          />
          {plansError && plans.length === 0 ? (
            <Notice
              tone="warning"
              action={
                <Button type="button" variant="outline" onClick={() => void reloadPlans()} className="h-10 rounded-[10px] px-3 text-[13px] font-semibold">
                  Tentar de novo
                </Button>
              }
            >
              {plansError}
            </Notice>
          ) : plansLoading && plans.length === 0 ? (
            <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground sm:col-span-12">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando os planos…
            </p>
          ) : (
            <ChoiceField {...wizard.field('planId')} label="Plano" required span={12} columns={2} options={planOptions} />
          )}
          {offer && quote ? <QuoteBox quote={quote} offer={offer} /> : null}
        </FieldGrid>
      )
    }
    if (id === 'contato') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('applicantName')}
            label="Nome completo de quem vai contratar"
            required
            span={12}
            maxLength={120}
            autoComplete="off"
            placeholder="Nome e sobrenome"
          />
          <TextField
            {...wizard.field('applicantEmail')}
            label="E-mail"
            required
            span={7}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="responsavel@operadora.com.br"
            hint="O link de contratação chega neste e-mail."
          />
          <TextField
            {...wizard.field('applicantPhone')}
            label="Telefone com DDD"
            required
            span={5}
            type="tel"
            inputMode="tel"
            mask={maskPhone}
            maxLength={15}
            placeholder="(21) 99999-9999"
          />
          <Notice tone="info" icon={MailCheck}>
            Por segurança, o link de contratação vai só para o e-mail do cliente — ele dá acesso ao cadastro e ao aceite do
            contrato. Você acompanha o andamento em Propostas.
          </Notice>
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <SwitchField
          {...wizard.field('wantsDiscount')}
          label="Pedir condição especial para este cliente"
          description="Desconto na adesão e/ou na mensalidade. O superadmin aprova antes de o link sair."
        />
        {values.wantsDiscount ? (
          <>
            <DiscountFields bind={bindDiscount} values={values} setupFee={offer?.pricing.setupFee ?? null} />
            {quote && discounted ? (
              <div className="sm:col-span-12">
                <QuoteComparison before={quote} after={discounted} title="Prévia: preço cheio × com a condição especial" />
              </div>
            ) : null}
          </>
        ) : (
          <Notice tone="neutral" icon={MailCheck}>
            Sem condição especial, o e-mail com o link sai assim que você gerar.
          </Notice>
        )}
      </FieldGrid>
    )
  }

  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Empresa" icon={Building2} onEdit={() => wizard.goToStep('empresa')}>
        <ReviewItem label="Forma jurídica" value={values.legalForm ? LEGAL_FORM_LABELS[values.legalForm as LegalForm] : ''} />
        <ReviewItem label="CNPJ" value={values.cnpj} />
      </ReviewSection>
      <ReviewSection title="Plano e vidas" icon={Tags} onEdit={() => wizard.goToStep('plano')}>
        <ReviewItem label="Plano" value={offer ? `${offer.name}${offer.pricing.publicVisible ? '' : ' (fora do site)'}` : ''} />
        <ReviewItem label="Vidas esperadas" value={lives ? `${formatInt(lives)} vidas` : ''} />
        <ReviewItem label="Mensal estimado" value={quote ? formatMoney((discounted ?? quote).monthlyTotal) : ''} />
        <ReviewItem label="Ativação" value={quote ? formatMoney((discounted ?? quote).activationTotal) : ''} />
      </ReviewSection>
      <ReviewSection title="Contato do cliente" icon={Contact} onEdit={() => wizard.goToStep('contato')}>
        <ReviewItem label="Nome" value={values.applicantName.trim()} />
        <ReviewItem label="E-mail (recebe o link)" value={values.applicantEmail.trim().toLowerCase()} />
        <ReviewItem label="Telefone" value={values.applicantPhone} />
      </ReviewSection>
      <ReviewSection title="Condição especial" icon={BadgePercent} onEdit={() => wizard.goToStep('condicao')}>
        <ReviewItem label="Desconto pedido" value={values.wantsDiscount ? discountSummary(discountPercentsOf(values)) : 'Sem condição especial'} wide />
        {values.wantsDiscount ? <ReviewItem label="Justificativa" value={values.justification.trim()} wide /> : null}
        <ReviewItem
          label="Envio do link"
          value={
            values.wantsDiscount
              ? 'Depois que o superadmin decidir o desconto'
              : `Agora, para ${values.applicantEmail.trim().toLowerCase() || 'o e-mail do cliente'}`
          }
          wide
        />
      </ReviewSection>
    </ReviewList>
  )

  const renderSuccess = () => {
    if (!result) return null
    const email = result.proposal.applicant.email
    const actions = (
      <>
        <Button type="button" variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
        <Button
          type="button"
          className={successButton.primary}
          onClick={() => {
            onOpenChange(false)
            router.push(`/vendas/propostas/${result.proposal.id}`)
          }}
        >
          <FileSignature aria-hidden="true" />
          Ver proposta {result.proposal.code}
        </Button>
      </>
    )
    if (result.emailSent) {
      return (
        <WizardSuccess
          title={`Link enviado para ${email}`}
          description={`A proposta ${result.proposal.code} foi criada. O cliente preenche o cadastro pelo link do e-mail; você acompanha em Propostas.`}
          actions={actions}
        />
      )
    }
    return (
      <WizardSuccess
        title="Pedido de desconto enviado para aprovação"
        description={`O link será enviado para ${email} quando o superadmin aprovar. Você recebe um aviso no sino com a decisão.`}
        actions={actions}
      >
        {result.discountRequest ? (
          <Notice tone="warning" icon={BadgePercent} title="Condição pedida">
            {discountSummary(result.discountRequest.requested)}
          </Notice>
        ) : null}
      </WizardSuccess>
    )
  }

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      wizard={wizard}
      icon={FileSignature}
      title="Gerar link de contratação"
      description={prospect ? `Proposta para ${prospect.name}. O link vai por e-mail para o cliente.` : undefined}
      submitLabel={values.wantsDiscount ? 'Enviar pedido de desconto' : 'Gerar e enviar link'}
      submittingLabel="Gerando…"
      discardTitle="Descartar o link?"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}
