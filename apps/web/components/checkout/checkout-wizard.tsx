'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { CLUB_PAYMENT_METHOD_LABELS, type CheckoutContext, type ClubPaymentMethod } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { googleClientIdConfigured } from '@/components/auth/google-sign-in-button'
import { useAuth } from '@/contexts/auth-context'
import { googleLoginConfigAction } from '@/lib/actions/auth-api'
import { submitCheckoutAction } from '@/lib/actions/checkout-api'
import {
  CHECKOUT_STEPS,
  cardNameFromHolder,
  cardOptionsFor,
  checkDraftEligibility,
  checkoutPlans,
  checkoutStepsFor,
  emptyCard,
  emptyDependent,
  emptyHolder,
  hasErrors,
  holderAgeHint,
  methodsFor,
  parseCheckout,
  parseDateBR,
  payButtonBusyLabel,
  payButtonLabel,
  pickInitialPlan,
  planFitIssue,
  quoteFor,
  routeFieldErrors,
  sampleCard,
  testCards as testCardsFor,
  validateCard,
  validateDependents,
  validateHolder,
  validateMethod,
  type CardForm as CardFormValue,
  type CheckoutStepId,
  type CheckoutSubmitResult,
  type DependentForm,
  type FieldErrors,
  type HolderForm,
} from '@/lib/adapters/checkout'
import { isDemoMode } from '@/lib/demo-mode'
import type { Tenant } from '@/lib/types'
import { CheckoutStepper } from './checkout-stepper'
import { DemoBanner } from './checkout-states'
import { DependentsBlock } from './dependents-step'
import { HolderStep, PasswordlessNote, type CheckoutMember } from './holder-step'
import { CheckoutMobileBar, OrderSummaryCard, OrderSummaryMobileTop, TrustSeals } from './order-summary'
import { PaymentStep, type PaymentSubmitError } from './payment-step'
import { PlanStep } from './plan-step'

const STEP_SUBTITLES: Record<CheckoutStepId, string> = {
  plano: 'Compare os benefícios e escolha o plano ideal para você e sua família.',
  titular: 'Leva menos de um minuto. Usamos estes dados para emitir a sua carteirinha.',
  pagamento: 'Escolha como pagar. Ambiente seguro e criptografado.',
}

type DependentField = 'name' | 'relationship' | 'birthDate' | 'cpf'

/** Posição do passo na ordem completa (plano → titular → pagamento). */
const orderOf = (id: CheckoutStepId) => CHECKOUT_STEPS.findIndex(step => step.id === id)

/** Erros da API que dependem do plano escolhido — somem quando o plano muda. */
function isPlanDependentPath(path: string): boolean {
  return (
    path === 'planId' ||
    path === 'holder.birthDate' ||
    path === 'dependents' ||
    path === 'payment.method' ||
    /^dependents\.\d+\.(relationship|birthDate)$/.test(path)
  )
}

const withoutPaths = (errors: FieldErrors, drop: (path: string) => boolean): FieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([path]) => !drop(path)))

/** Campo preenchido e sem erro local → check discreto no campo. */
function validMap<T extends object>(values: T, errors: FieldErrors): Partial<Record<keyof T, boolean>> {
  const out: Partial<Record<keyof T, boolean>> = {}
  for (const [field, value] of Object.entries(values)) {
    out[field as keyof T] = typeof value === 'string' && value.trim() !== '' && !errors[field]
  }
  return out
}

/** Falha de rede/servidor (não é regra de negócio): o mesmo pedido pode ir de novo. */
const RETRYABLE_ERROR = /não respondeu|tente novamente|conex|internet|indispon/i

interface CheckoutWizardProps {
  slug: string
  tenant: Tenant
  context: CheckoutContext
  planParam: string | null
  onSubmitted: (result: CheckoutSubmitResult, extra: { holderName: string; holderEmail: string; holderCpf: string }) => void
}

/**
 * Checkout em 2 passos quando o plano vem na URL — "Seus dados" (com
 * dependentes como bloco opcional) e "Pagamento" (forma, aceite dos termos e
 * o botão "Pagar R$ …") —, igual para Pix, cartão e boleto. Sem plano na URL,
 * a escolha do plano vem antes. Tudo no mesmo componente: trocar de passo não
 * recarrega nada. O resultado (QR Pix, boleto, cartão) é a tela seguinte.
 */
export function CheckoutWizard({ slug, tenant, context, planParam, onSubmitted }: CheckoutWizardProps) {
  const plans = useMemo(() => checkoutPlans(context.plans), [context.plans])
  const cards = useMemo(() => testCardsFor(context), [context])
  const isDemo = isDemoMode(context)
  const cardOptions = useMemo(() => cardOptionsFor(context), [context])

  const [initial] = useState(() => pickInitialPlan(plans, planParam))
  /** Passo "Plano" só existe sem `?plano=` válido (ou depois de "Trocar plano"). */
  const [withPlanStep, setWithPlanStep] = useState(!initial.fromParam)
  const [stepId, setStepId] = useState<CheckoutStepId>(initial.fromParam ? 'titular' : 'plano')
  /** Maior passo já alcançado, na ordem completa. */
  const [maxReached, setMaxReached] = useState(orderOf(initial.fromParam ? 'titular' : 'plano'))

  const [planId, setPlanId] = useState<string | null>(initial.plan?.id ?? null)
  const [holder, setHolder] = useState<HolderForm>(emptyHolder)
  const [dependents, setDependents] = useState<DependentForm[]>([])
  const [dependentsOpen, setDependentsOpen] = useState(false)
  // Pix é o padrão (1º da lista); sem Pix no plano/clube, a 1ª forma habilitada.
  const [method, setMethod] = useState<ClubPaymentMethod>(
    () => methodsFor(initial.plan, context.enabledMethods)[0] ?? 'pix',
  )
  /** Aviso quando a troca de plano invalidou a forma escolhida e ela foi ajustada. */
  const [methodNotice, setMethodNotice] = useState<string | null>(null)
  // Número e CVV vivem só aqui, em memória: nunca em storage, URL ou log.
  const [card, setCard] = useState<CardFormValue>(emptyCard)
  /** A pessoa mexeu no nome impresso: a sugestão (nome do titular) não sobrescreve mais. */
  const cardNameEdited = useRef(false)
  const [acceptTerms, setAcceptTerms] = useState(false)

  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showErrors, setShowErrors] = useState<Partial<Record<CheckoutStepId, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<PaymentSubmitError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // ------------------------------------------------- conta do titular
  // Página pública: sem sessão é o caso normal. Com sessão de associado DESTE
  // clube (o AuthProvider só expõe sessão do inquilino da URL), a assinatura
  // nasce na conta dele: nome/e-mail pré-preenchidos e e-mail travado. Sessão
  // de equipe é ignorada (a API também ignora).
  const { user, isLoading: sessionLoading, loginGoogle, logoutInPlace } = useAuth()
  const member: CheckoutMember | null = useMemo(
    () =>
      user?.role === 'client'
        ? { name: user.name, email: user.email, alreadySubscribed: user.subscriptionStatus === 'subscribed' }
        : null,
    [user],
  )
  const [googleApiEnabled, setGoogleApiEnabled] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const googleEnabled = googleClientIdConfigured && googleApiEnabled

  useEffect(() => {
    if (!googleClientIdConfigured) return
    let cancelled = false
    googleLoginConfigAction()
      .then(result => {
        if (!cancelled && result.success) setGoogleApiEnabled(result.data.googleEnabled)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [])

  // Sessão de associado: nome (se ainda vazio) e e-mail vêm da conta.
  useEffect(() => {
    if (!member) return
    setHolder(current => ({ ...current, name: current.name.trim() ? current.name : member.name, email: member.email }))
  }, [member])

  // Nome impresso no cartão = nome do titular em MAIÚSCULAS, até a pessoa editar o campo.
  useEffect(() => {
    if (cardNameEdited.current) return
    const suggested = cardNameFromHolder(holder.name)
    setCard(current => (current.holderName === suggested ? current : { ...current, holderName: suggested }))
  }, [holder.name])

  const steps = useMemo(() => checkoutStepsFor(withPlanStep), [withPlanStep])
  const stepIndex = Math.max(0, steps.findIndex(item => item.id === stepId))
  const step = steps[stepIndex]!
  const isFinal = stepIndex === steps.length - 1
  const reachableIndex = steps.reduce((last, item, index) => (orderOf(item.id) <= maxReached ? index : last), 0)

  const plan = plans.find(item => item.id === planId) ?? null
  const quote = quoteFor(plan, dependents.length)
  // Formas EFETIVAS do plano (clube ∩ plano), Pix primeiro.
  const methods = useMemo(() => methodsFor(plan, context.enabledMethods), [plan, context.enabledMethods])

  // Rede de segurança: a forma selecionada sempre pertence ao plano atual.
  useEffect(() => {
    if (methods.length > 0 && !methods.includes(method)) setMethod(methods[0]!)
  }, [method, methods])

  // ---------------------------------------------------------------- validação
  // Mesma ordem da API: schema do contrato, depois as regras do plano.
  const holderErrors = useMemo(() => validateHolder(holder, plan), [holder, plan])
  const dependentsCheck = useMemo(() => validateDependents(dependents, plan), [dependents, plan])
  const cardErrors = useMemo(() => (method === 'credit_card' ? validateCard(card, cardOptions) : {}), [card, method, cardOptions])
  const methodError = validateMethod(plan, method, context.enabledMethods)
  const dependentsValid = dependentsCheck.items.every(errors => !hasErrors(errors)) && dependentsCheck.list === null

  const stepValid: Record<CheckoutStepId, boolean> = {
    plano: Boolean(plan),
    titular: !hasErrors(holderErrors) && dependentsValid,
    pagamento:
      methods.includes(method) &&
      methodError === null &&
      (method !== 'credit_card' || !hasErrors(cardErrors)) &&
      acceptTerms,
  }

  /**
   * Erro visível = do servidor (prioridade) ou local, depois de tocado/tentado.
   * `eager`: campos cuja regra aparece na hora, sem esperar o blur — uma data
   * completa já é conferida contra a idade do plano, e um parentesco escolhido
   * contra os aceitos.
   */
  function visible(prefix: string, local: FieldErrors, stepKey: CheckoutStepId, eager: readonly string[] = []): FieldErrors {
    const out: FieldErrors = {}
    for (const [field, message] of Object.entries(local)) {
      if (showErrors[stepKey] || touched[`${prefix}${field}`] || eager.includes(field)) out[field] = message
    }
    for (const [path, message] of Object.entries(serverErrors)) {
      if (path.startsWith(prefix)) out[path.slice(prefix.length)] = message
    }
    return out
  }

  const holderVisible = visible('holder.', holderErrors, 'titular', parseDateBR(holder.birthDate) ? ['birthDate'] : [])
  const cardVisible = visible('payment.card.', cardErrors, 'pagamento')
  const dependentsVisible: Record<string, FieldErrors> = {}
  dependents.forEach((dependent, index) => {
    const eager: string[] = []
    if (dependent.relationship) eager.push('relationship')
    if (parseDateBR(dependent.birthDate)) eager.push('birthDate')
    dependentsVisible[dependent.key] = visible(`dependents.${index}.`, dependentsCheck.items[index] ?? {}, 'titular', eager)
  })
  const dependentsListError = serverErrors.dependents ?? dependentsCheck.list
  const methodVisibleError = serverErrors['payment.method'] ?? serverErrors['payment.card'] ?? methodError
  const termsError =
    serverErrors.acceptTerms ??
    (showErrors.pagamento && !acceptTerms ? 'Para continuar, aceite o regulamento e as condições da assinatura.' : undefined)

  const holderValid = useMemo(() => validMap(holder, holderErrors), [holder, holderErrors])
  const cardValid = useMemo(() => validMap(card, cardErrors), [card, cardErrors])

  // Por plano: por que o que já foi preenchido não cabe nele (aviso no card).
  const fitIssues = useMemo(
    () => Object.fromEntries(plans.map(item => [item.id, planFitIssue(item, holder, dependents)])),
    [plans, holder, dependents],
  )

  const touch = (path: string) => setTouched(current => (current[path] ? current : { ...current, [path]: true }))
  const clearServerError = (path: string) =>
    setServerErrors(current => {
      if (!(path in current)) return current
      const next = { ...current }
      delete next[path]
      return next
    })
  const clearDependentsErrors = () =>
    setServerErrors(current => withoutPaths(current, path => path === 'dependents' || path.startsWith('dependents.')))

  // -------------------------------------------------------------- navegação
  const focusFirstInvalid = () => {
    window.setTimeout(() => {
      const element = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (!element) return
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'center' })
    }, 60)
  }

  const goTo = (id: CheckoutStepId) => {
    setStepId(id)
    setMaxReached(current => Math.max(current, orderOf(id)))
    window.setTimeout(() => {
      window.scrollTo({ top: 0 })
      // Pagamento com cartão: o foco vai para o número (o formulário cuida disso).
      if (!(id === 'pagamento' && method === 'credit_card')) headingRef.current?.focus({ preventScroll: true })
    }, 0)
  }

  const blockAt = (id: CheckoutStepId) => {
    setShowErrors(current => ({ ...current, [id]: true }))
    if (id === 'titular') {
      // Erro com os dependentes recolhidos: abre para mostrar o campo.
      if (!dependentsValid || serverErrors.dependents || dependents.length > 0) setDependentsOpen(true)
    }
    if (id !== stepId) {
      if (id === 'plano') setWithPlanStep(true)
      goTo(id)
    }
    focusFirstInvalid()
  }

  const handleSelectStep = (index: number) => {
    const target = steps[index]
    if (!target) return
    if (index <= stepIndex) {
      goTo(target.id)
      return
    }
    for (let i = stepIndex; i < index; i++) {
      const id = steps[i]!.id
      if (!stepValid[id]) {
        blockAt(id)
        return
      }
    }
    goTo(target.id)
  }

  const handleNext = () => {
    if (submittingRef.current) return
    if (!stepValid[step.id]) {
      blockAt(step.id)
      return
    }
    if (isFinal) {
      void submit()
      return
    }
    goTo(steps[stepIndex + 1]!.id)
  }

  const handleBack = () => {
    if (stepIndex > 0) goTo(steps[stepIndex - 1]!.id)
  }

  const changePlan = () => {
    setWithPlanStep(true)
    goTo('plano')
  }

  // ------------------------------------------------------------------ envio
  /**
   * Pendura os erros (422 da API ou regra local) nos campos e leva ao 1º passo
   * com erro. Sem campo conhecido, o erro fica no alerta acima do botão final.
   */
  function showFieldErrors(fieldErrors: FieldErrors, fallback: string) {
    const routed = routeFieldErrors(fieldErrors)
    const message = routed.firstMessage ?? fallback
    setServerErrors(fieldErrors)
    if (routed.step) {
      setSubmitError(null)
      if (routed.step !== stepId) toast.error(message)
      blockAt(routed.step)
    } else {
      setSubmitError({ message, retryable: false })
      blockAt('pagamento')
    }
  }

  async function submit() {
    if (submittingRef.current || !plan) return
    const parsed = parseCheckout({ planId: plan.id, holder, dependents, method, card, acceptTerms }, cardOptions)
    if (!parsed.ok) {
      const routed = routeFieldErrors(parsed.errors)
      setServerErrors(parsed.errors)
      blockAt(routed.step ?? 'pagamento')
      return
    }
    // As mesmas regras de plano que a API confere antes de gravar.
    const ruleErrors = checkDraftEligibility(plan, parsed.data, context.enabledMethods)
    if (hasErrors(ruleErrors)) {
      showFieldErrors(ruleErrors, 'Revise os dados do pedido')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    let result: Awaited<ReturnType<typeof submitCheckoutAction>>
    try {
      result = await submitCheckoutAction(slug, parsed.data)
    } catch {
      // A chamada nem chegou ao servidor (sem internet, deploy no meio): nada foi criado.
      submittingRef.current = false
      setSubmitting(false)
      setSubmitError({
        message: 'Não conseguimos falar com o servidor. Verifique sua conexão — seus dados continuam aqui.',
        retryable: true,
      })
      return
    }

    if (result.success) {
      setCard(emptyCard())
      onSubmitted(result.data, { holderName: holder.name.trim(), holderEmail: parsed.data.holder.email, holderCpf: holder.cpf })
      return
    }

    submittingRef.current = false
    setSubmitting(false)
    if (result.fieldErrors && hasErrors(result.fieldErrors)) {
      showFieldErrors(result.fieldErrors, result.error)
    } else {
      setSubmitError({ message: result.error, retryable: RETRYABLE_ERROR.test(result.error) })
    }
  }

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault()
    handleNext()
  }

  // ------------------------------------------------------------- mudanças
  const selectPlan = (id: string) => {
    const next = plans.find(item => item.id === id) ?? null
    setPlanId(id)
    setServerErrors(current => withoutPaths(current, isPlanDependentPath))
    setSubmitError(null)

    // A forma escolhida pode não valer no novo plano: ajusta e avisa.
    const nextMethods = methodsFor(next, context.enabledMethods)
    const replacement = nextMethods[0]
    if (next && replacement && !nextMethods.includes(method)) {
      setMethod(replacement)
      if (maxReached >= orderOf('pagamento')) {
        const reason = `${CLUB_PAYMENT_METHOD_LABELS[method]} não está disponível no plano ${next.name}.`
        const chosen = CLUB_PAYMENT_METHOD_LABELS[replacement]
        setMethodNotice(`${reason} Selecionamos ${chosen} — se preferir, escolha outra forma abaixo.`)
        toast.warning(reason, { description: `Selecionamos ${chosen}. Você pode trocar no passo Pagamento.` })
      } else {
        setMethodNotice(null)
      }
    } else {
      setMethodNotice(null)
    }
  }

  const changeMethod = (value: ClubPaymentMethod) => {
    setMethod(value)
    setMethodNotice(null)
    clearServerError('payment.method')
    clearServerError('payment.card')
  }

  const updateHolder = (field: keyof HolderForm, value: string) => {
    if (field === 'email' && member) return
    setHolder(current => ({ ...current, [field]: value }))
    clearServerError(`holder.${field}`)
  }

  /** Google no checkout: abre a sessão (cookie, como o login do clube) e FICA aqui. */
  const handleGoogleCredential = async (credential: string) => {
    if (googleBusy) return
    setGoogleBusy(true)
    setGoogleError(null)
    try {
      const result = await loginGoogle(credential, { redirect: false })
      if (!result.success) {
        setGoogleError(result.error || 'Não foi possível entrar com o Google. Tente novamente.')
      } else if (result.role !== 'client') {
        // Conta da equipe do clube: a assinatura é sempre de associado — não fica logada aqui.
        await logoutInPlace()
        setGoogleError('Esta conta Google é da equipe do clube. Para assinar, use outro e-mail do Google ou preencha seus dados.')
      } else {
        clearServerError('holder.email')
        // Nome e e-mail já vieram da conta: o próximo campo a preencher é o CPF.
        window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>('input[name="cpf"]')?.focus(), 150)
      }
    } catch {
      setGoogleError('Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.')
    } finally {
      setGoogleBusy(false)
    }
  }

  /** "Trocar conta": encerra a sessão e volta ao formulário vazio. */
  const handleSwitchAccount = async () => {
    setSwitchingAccount(true)
    try {
      await logoutInPlace()
    } finally {
      setHolder(emptyHolder())
      cardNameEdited.current = false
      setGoogleError(null)
      setServerErrors(current => withoutPaths(current, path => path.startsWith('holder.')))
      setTouched(current => Object.fromEntries(Object.entries(current).filter(([path]) => !path.startsWith('holder.'))))
      setShowErrors(current => ({ ...current, titular: false }))
      setSwitchingAccount(false)
    }
  }

  const addDependent = () => {
    const dependent = emptyDependent()
    setDependents(current => [...current, dependent])
    clearDependentsErrors()
    return dependent.key
  }

  const removeDependent = (key: string) => {
    setDependents(current => current.filter(dependent => dependent.key !== key))
    clearDependentsErrors()
  }

  const updateDependent = (key: string, field: DependentField, value: string) => {
    const index = dependents.findIndex(dependent => dependent.key === key)
    setDependents(current => current.map(dependent => (dependent.key === key ? { ...dependent, [field]: value } : dependent)))
    if (index >= 0) clearServerError(`dependents.${index}.${field}`)
  }

  const touchDependent = (key: string, field: DependentField) => {
    const index = dependents.findIndex(dependent => dependent.key === key)
    if (index >= 0) touch(`dependents.${index}.${field}`)
  }

  const updateCard = (field: keyof CardFormValue, value: string) => {
    if (field === 'holderName') cardNameEdited.current = true
    setCard(current => ({ ...current, [field]: value }))
    clearServerError(`payment.card.${field}`)
    if (field === 'expiry') {
      clearServerError('payment.card.expiryMonth')
      clearServerError('payment.card.expiryYear')
    }
  }

  /** Ambiente de testes: preenche só o NÚMERO do cartão de teste; o resto fica com quem testa. */
  const applyTestCard = (kind: 'approved' | 'declined') => {
    if (!cards) return
    setCard(current => ({ ...current, number: sampleCard(kind === 'approved' ? cards.approved : cards.declined) }))
    setServerErrors(current => withoutPaths(current, path => path.startsWith('payment.')))
  }

  // ------------------------------------------------------------------ render
  const total = quote?.firstChargeTotal ?? 0
  const nextIsPayment = steps[stepIndex + 1]?.id === 'pagamento'
  const ctaLabel = isFinal ? (quote ? payButtonLabel(method, total) : 'Pagar') : nextIsPayment ? 'Continuar para pagamento' : 'Continuar'
  const busyLabel = payButtonBusyLabel(method)
  const otherPlanAcceptsDependents = plans.some(item => item.id !== plan?.id && item.maxDependents !== 0)
  const onChangePlan = plans.length > 1 ? changePlan : undefined

  function renderStep() {
    switch (step.id) {
      case 'plano':
        return (
          <PlanStep
            plans={plans}
            selectedId={planId}
            enabledMethods={context.enabledMethods}
            fitIssues={fitIssues}
            onSelect={selectPlan}
            compareHref={`/${slug}/planos#comparativo`}
          />
        )
      case 'titular':
        return (
          <HolderStep
            slug={slug}
            value={holder}
            errors={holderVisible}
            validFields={holderValid}
            ageHint={holderAgeHint(plan)}
            onChange={updateHolder}
            onBlur={field => touch(`holder.${field}`)}
            member={member}
            sessionLoading={sessionLoading && !googleBusy}
            googleEnabled={googleEnabled}
            googleBusy={googleBusy}
            googleError={googleError}
            onGoogleCredential={credential => void handleGoogleCredential(credential)}
            onSwitchAccount={() => void handleSwitchAccount()}
            switchingAccount={switchingAccount}
          >
            {plan && quote ? (
              <DependentsBlock
                plan={plan}
                quote={quote}
                dependents={dependents}
                errors={dependentsVisible}
                listError={dependentsListError}
                open={dependentsOpen}
                onOpenChange={setDependentsOpen}
                onAdd={addDependent}
                onRemove={removeDependent}
                onChange={updateDependent}
                onBlur={touchDependent}
                onChangePlan={otherPlanAcceptsDependents ? changePlan : undefined}
              />
            ) : null}
          </HolderStep>
        )
      case 'pagamento':
        return (
          <PaymentStep
            slug={slug}
            tenantName={tenant.name}
            context={context}
            plan={plan}
            quote={quote}
            methods={methods}
            method={method}
            onMethodChange={changeMethod}
            methodError={methodVisibleError}
            notice={methodNotice}
            onChangePlan={onChangePlan}
            card={card}
            cardErrors={cardVisible}
            cardValid={cardValid}
            cardOptions={cardOptions}
            onCardChange={updateCard}
            onCardBlur={field => touch(`payment.card.${field}`)}
            autoFocusCard
            testCards={cards}
            onUseTestCard={cards ? applyTestCard : undefined}
            acceptTerms={acceptTerms}
            onAcceptTerms={value => {
              setAcceptTerms(value)
              clearServerError('acceptTerms')
            }}
            termsError={termsError}
            submitError={submitError}
            onRetry={() => void submit()}
            onEditHolder={() => goTo('titular')}
            onEditDependents={() => {
              setDependentsOpen(true)
              goTo('titular')
            }}
          />
        )
    }
  }

  return (
    <>
      {isDemo ? <DemoBanner /> : null}

      <div className="mx-auto max-w-5xl px-4 pb-36 pt-5 sm:px-6 lg:pb-16 lg:pt-10">
        <div className={steps.length === 2 ? 'max-w-sm' : 'max-w-lg'}>
          <CheckoutStepper steps={steps} current={stepIndex} reachable={reachableIndex} onSelect={handleSelectStep} />
        </div>

        <div className="mt-4 lg:hidden">
          <OrderSummaryMobileTop
            plan={plan}
            quote={quote}
            method={method}
            showMethod={step.id === 'pagamento'}
            onChangePlan={step.id !== 'plano' ? onChangePlan : undefined}
          />
        </div>

        <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-12">
          <form ref={formRef} method="post" onSubmit={handleFormSubmit} noValidate className="min-w-0" aria-busy={submitting || undefined}>
            <header className="mb-6">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-2xl font-bold tracking-tight text-foreground outline-none"
              >
                {step.title}
              </h1>
              <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{STEP_SUBTITLES[step.id]}</p>
            </header>

            <div key={step.id} className="duration-150 animate-in fade-in motion-reduce:animate-none">
              {renderStep()}
            </div>

            {/* Desktop: ação principal do passo logo abaixo do conteúdo. */}
            <div className="mt-8 hidden lg:block">
              {isFinal ? (
                <div className="space-y-3">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting}
                    aria-busy={submitting || undefined}
                    className="h-14 w-full rounded-xl text-base font-semibold shadow-sm"
                  >
                    {submitting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                    {submitting ? busyLabel : ctaLabel}
                  </Button>
                  <TrustSeals />
                </div>
              ) : (
                <div className="max-w-140 space-y-3">
                  <Button type="submit" size="lg" className="h-12 w-full rounded-xl px-8 text-base font-semibold shadow-sm">
                    {ctaLabel}
                    <ArrowRight className="size-5" aria-hidden />
                  </Button>
                  {step.id === 'titular' ? <PasswordlessNote googleEnabled={googleEnabled} /> : null}
                </div>
              )}
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={submitting}
                  className="mt-4 h-10 rounded-xl px-3 text-muted-foreground"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar para {steps[stepIndex - 1]!.label.toLowerCase()}
                </Button>
              ) : null}
            </div>

            {/* Mobile: selos e nota de acesso abaixo do formulário (o botão fica na barra fixa). */}
            {!isFinal ? (
              <div className="mt-8 space-y-3 lg:hidden">
                {step.id === 'titular' ? <PasswordlessNote googleEnabled={googleEnabled} /> : null}
                <TrustSeals />
              </div>
            ) : null}

            {stepIndex > 0 ? (
              <div className="mt-6 lg:hidden">
                <Button type="button" variant="ghost" onClick={handleBack} disabled={submitting} className="h-11 rounded-xl px-3 text-muted-foreground">
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar para {steps[stepIndex - 1]!.label.toLowerCase()}
                </Button>
              </div>
            ) : null}
          </form>

          <div className="hidden lg:block">
            <OrderSummaryCard
              tenantName={tenant.name}
              plan={plan}
              quote={quote}
              method={method}
              showMethod={step.id === 'pagamento'}
              onChangePlan={step.id !== 'plano' ? onChangePlan : undefined}
            />
          </div>
        </div>
      </div>

      <CheckoutMobileBar
        quote={quote}
        ctaLabel={ctaLabel}
        busyLabel={busyLabel}
        onCta={handleNext}
        busy={submitting}
        final={isFinal}
      />
    </>
  )
}
