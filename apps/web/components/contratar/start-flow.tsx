'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileSearch,
  FlaskConical,
  HeartHandshake,
  History,
  Landmark,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  CONTRACTOR_TYPE_DESCRIPTIONS,
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  contractorType as contractorTypeSchema,
  contractorTypeOf,
  formatBRL,
  isValidCnpj,
  maskPhone,
  onlyDigits,
  quotePlatformPlan,
  startOnboardingInput,
  type ContractorType,
  type LegalForm,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { startOnboardingAction } from '@/lib/actions/contratacao-api'
import {
  forgetProposal,
  formatCnpj,
  legalFormsOf,
  maskCnpj,
  orphanErrors,
  readRememberedProposal,
  rememberProposal,
  validate,
  type FieldErrors,
  type ResumeInfo,
} from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { useContratarDemo } from './demo/use-demo'
import { useCnpjLookup, usePlatformOffers } from './hooks'
import { PlanPicker, recommendedPlanId } from './plan-picker'
import { QuoteMobileBar, QuoteSummaryCard } from './quote-summary'
import { ReceitaCard } from './receita-card'
import { B2BFooter, B2BHeader } from './shell'
import { Stepper } from './stepper'
import { ActionError, ChoiceCard, Notice, Panel, StepHeading, TextField } from './ui'

const STEPS = [
  { id: 'contratante', label: 'Contratante' },
  { id: 'cnpj', label: 'CNPJ' },
  { id: 'plano', label: 'Plano e vidas' },
  { id: 'contato', label: 'Contato' },
] as const

const TYPE_ICONS: Record<ContractorType, typeof Building2> = {
  empresa: Building2,
  entidade: Landmark,
  organizacao: HeartHandshake,
}

/** Em qual etapa do início cada campo do `startOnboardingInput` aparece. */
function stepOfField(field: string): number {
  if (field.startsWith('contractorType') || field.startsWith('legalForm')) return 0
  if (field.startsWith('cnpj')) return 1
  if (field.startsWith('planId') || field.startsWith('expectedLives')) return 2
  return 3
}

/**
 * Início da contratação (`/contratar`): tipo → forma jurídica → CNPJ (com a
 * Receita) → plano com simulador de vidas → contato e consentimento → cria a
 * proposta e leva ao wizard (`/contratar/<id>?chave=`).
 */
export function StartFlow() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [type, setType] = useState<ContractorType | null>(null)
  const [form, setForm] = useState<LegalForm | null>(null)
  const [cnpj, setCnpj] = useState('')
  const [lives, setLives] = useState(500)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planTouched, setPlanTouched] = useState(false)
  const [applicant, setApplicant] = useState({ name: '', email: '', phone: '' })
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resume, setResume] = useState<ResumeInfo | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const firstRender = useRef(true)

  const { offers, error: offersError, loading: offersLoading, reload: reloadOffers } = usePlatformOffers()
  const { lookup, retry: retryLookup } = useCnpjLookup(cnpj)
  /**
   * Modo demonstração vem da API (`demoToolsEnabled` na consulta do CNPJ, o
   * 1º DTO desta tela). Fica ligado depois da 1ª resposta que o confirmar.
   */
  const [demoToolsEnabled, setDemoToolsEnabled] = useState(false)
  useEffect(() => {
    if (lookup.state === 'done' && lookup.response.demoToolsEnabled) setDemoToolsEnabled(true)
  }, [lookup])
  const demo = useContratarDemo({ demoToolsEnabled })
  const demoCnpj = demo?.isDemoCnpj(cnpj) ? onlyDigits(cnpj) : null

  useEffect(() => {
    setResume(readRememberedProposal())
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById(`start-step-${step}`)?.focus()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const offer = useMemo(() => offers?.find(item => item.id === planId) ?? null, [offers, planId])
  const quote = useMemo(() => (offer ? quotePlatformPlan(offer, offer.pricing, lives) : null), [offer, lives])
  const receita = lookup.state === 'done' && lookup.response.found ? lookup.response.result : null

  // Enquanto a pessoa não escolhe outro, o plano acompanha a recomendação das vidas simuladas.
  useEffect(() => {
    if (planTouched) return
    const recommended = recommendedPlanId(offers, lives)
    if (recommended && recommended !== planId) setPlanId(recommended)
  }, [offers, lives, planTouched, planId])

  function clearError(...keys: string[]) {
    setErrors(current => {
      const next = { ...current }
      for (const key of keys) delete next[key]
      return next
    })
  }

  function stepErrors(index: number): FieldErrors {
    const out: FieldErrors = {}
    if (index === 0) {
      if (!type) out.contractorType = 'Escolha o tipo de contratante'
      if (!form) out.legalForm = 'Escolha a forma jurídica'
    }
    if (index === 1) {
      const digits = onlyDigits(cnpj)
      if (digits.length !== 14) out.cnpj = 'Informe os 14 dígitos do CNPJ'
      else if (!isValidCnpj(digits)) out.cnpj = 'CNPJ inválido — confira os dígitos'
    }
    if (index === 2) {
      if (!planId) out.planId = 'Escolha um plano'
      if (!(lives >= 1)) out.expectedLives = 'Informe o número de vidas'
    }
    return out
  }

  function goNext() {
    const found = stepErrors(step)
    if (Object.keys(found).length) {
      setErrors(current => ({ ...current, ...found }))
      return
    }
    const next = Math.min(STEPS.length - 1, step + 1)
    setStep(next)
    setReached(value => Math.max(value, next))
  }

  async function submit() {
    setSubmitError(null)
    const candidate = {
      contractorType: type,
      legalForm: form,
      cnpj,
      planId,
      expectedLives: lives,
      applicant,
      acceptPrivacy,
    }
    const parsed = validate(startOnboardingInput, candidate)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      const earliest = Math.min(...Object.keys(parsed.errors).map(stepOfField))
      if (earliest < step) setStep(earliest)
      return
    }
    setBusy(true)
    try {
      const result = await startOnboardingAction(parsed.data)
      if (!result.success) {
        setSubmitError(result.error)
        if (result.fieldErrors) {
          setErrors(result.fieldErrors)
          const earliest = Math.min(3, ...Object.keys(result.fieldErrors).map(stepOfField))
          if (earliest < step) setStep(earliest)
        }
        return
      }
      rememberProposal({ id: result.data.proposalId, code: result.data.code, path: result.data.trackingPath })
      toast.success(`Proposta ${result.data.code} criada`, {
        description: `Enviamos o link de acompanhamento para ${parsed.data.applicant.email}.`,
      })
      router.push(result.data.trackingPath)
    } catch {
      setSubmitError('Não foi possível falar com o servidor. Verifique a conexão e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Só com ambiente de demonstração E CNPJ de cenário fictício. O
   * consentimento de privacidade NUNCA é marcado por atalho.
   */
  function fillDemo() {
    if (!demo || !demoCnpj) return
    const scenario = demo.demoScenarioFor(demoCnpj)
    if (!scenario) return
    const person = demo.demoPeopleFor(demoCnpj)[0]
    setType(scenario.contractorType)
    setForm(scenario.legalForm)
    setCnpj(maskCnpj(demoCnpj))
    setLives(1200)
    setPlanTouched(false)
    if (person) setApplicant({ name: person.name, email: person.email, phone: maskPhone(person.phone) })
    setErrors({})
    setSubmitError(null)
    setStep(3)
    setReached(3)
  }

  function pickDemoCnpj(cnpjDigits: string) {
    const scenario = demo?.demoScenarioFor(cnpjDigits)
    if (!scenario) return
    setType(scenario.contractorType)
    setForm(scenario.legalForm)
    setCnpj(maskCnpj(cnpjDigits))
    clearError('cnpj', 'contractorType', 'legalForm')
  }

  const ctaLabel = step === STEPS.length - 1 ? 'Criar proposta' : 'Continuar'
  const facts = [
    ...(type ? [{ label: 'Contratante', value: CONTRACTOR_TYPE_LABELS[type] }] : []),
    ...(form ? [{ label: 'Forma jurídica', value: LEGAL_FORM_LABELS[form] }] : []),
    ...(onlyDigits(cnpj).length === 14 ? [{ label: 'CNPJ', value: formatCnpj(cnpj) }] : []),
    ...(receita ? [{ label: 'Razão social', value: <span className="line-clamp-2">{receita.legalName}</span> }] : []),
  ]

  return (
    <>
      <B2BHeader
        action={
          <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5 text-sm">
            <Link href="/contratar/recuperar">
              <History className="size-4" aria-hidden />
              <span className="hidden sm:inline">Já tenho uma proposta</span>
              <span className="sm:hidden">Minha proposta</span>
            </Link>
          </Button>
        }
      />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e2a4a] via-[#24345c] to-[#33446f] text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[#e84364]/25 blur-3xl" aria-hidden />
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/85">
            <Sparkles className="size-3.5" aria-hidden />
            Contratação da plataforma
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            O clube de benefícios da sua instituição, com a sua marca, no ar em poucos dias
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">
            Contrate a ANNETEC 100% online. Nossa equipe de compliance analisa o cadastro e, com a proposta aprovada, o
            clube é criado automaticamente assim que a ativação é paga.
          </p>
          <ul className="mt-6 grid max-w-4xl gap-3 text-sm sm:grid-cols-3">
            {[
              { icon: FileSearch, text: 'Análise cadastral (KYB) em até 1 dia útil' },
              { icon: ShieldCheck, text: 'Nenhuma cobrança antes da aprovação' },
              { icon: BadgeCheck, text: 'LGPD: seu clube controla, a ANNETEC opera' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <Icon className="size-4 shrink-0 text-[#ff8aa2]" aria-hidden />
                <span className="text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-16 w-full max-w-6xl flex-1 px-4 pb-32 sm:px-6 lg:pb-16">
        {resume ? (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
            <History className="hidden size-5 shrink-0 text-primary sm:block" aria-hidden />
            <p className="flex-1 text-sm text-foreground">
              Você tem uma proposta em andamento neste dispositivo (<strong>{resume.code}</strong>).
            </p>
            <div className="flex gap-2">
              <Button asChild className="h-10 rounded-xl">
                <Link href={resume.path}>Continuar proposta</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                aria-label="Esquecer esta proposta neste dispositivo"
                onClick={() => {
                  forgetProposal()
                  setResume(null)
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <Stepper
            label="Etapas do início da contratação"
            steps={STEPS.map((item, index) => ({ id: item.id, label: item.label, complete: index < reached && index !== step }))}
            current={step}
            canSelect={index => index <= reached}
            onSelect={setStep}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="min-w-0 space-y-6">
            {demo && demoCnpj ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-900 sm:flex-row sm:items-center dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <FlaskConical className="hidden size-5 shrink-0 sm:block" aria-hidden />
                <p className="flex-1">
                  <strong>Ambiente de demonstração.</strong> Este CNPJ é de um cenário fictício: dá para preencher o
                  contato com dados de exemplo e percorrer a jornada sem dados reais.
                </p>
                <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl bg-background" onClick={() => fillDemo()}>
                  <WandSparkles className="size-4" aria-hidden />
                  Preencher com dados de exemplo
                </Button>
              </div>
            ) : null}

            <Panel>
              {step === 0 ? (
                <div className="space-y-6">
                  <StepHeading
                    id="start-step-0"
                    eyebrow="Etapa 1 de 4"
                    title="Quem está contratando?"
                    description="Os documentos pedidos na análise cadastral dependem do tipo e da forma jurídica da instituição."
                  />
                  <div role="radiogroup" aria-label="Tipo de contratante" className="grid gap-3 md:grid-cols-3">
                    {contractorTypeSchema.options.map(option => {
                      const Icon = TYPE_ICONS[option]
                      return (
                        <ChoiceCard
                          key={option}
                          selected={type === option}
                          onSelect={() => {
                            setType(option)
                            if (form && contractorTypeOf(form) !== option) setForm(null)
                            clearError('contractorType')
                          }}
                          icon={<Icon className="size-5" />}
                          title={CONTRACTOR_TYPE_LABELS[option]}
                          description={CONTRACTOR_TYPE_DESCRIPTIONS[option]}
                          className="h-full"
                        />
                      )
                    })}
                  </div>
                  {errors.contractorType ? (
                    <p className="text-[13px] text-destructive" role="alert">
                      {errors.contractorType}
                    </p>
                  ) : null}

                  {type ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">Forma jurídica</p>
                      <div role="radiogroup" aria-label="Forma jurídica" className="grid gap-2 sm:grid-cols-2">
                        {legalFormsOf(type).map(option => (
                          <ChoiceCard
                            key={option}
                            selected={form === option}
                            onSelect={() => {
                              setForm(option)
                              clearError('legalForm')
                            }}
                            title={LEGAL_FORM_LABELS[option]}
                            className="p-3.5"
                          />
                        ))}
                      </div>
                      {errors.legalForm ? (
                        <p className="text-[13px] text-destructive" role="alert">
                          {errors.legalForm}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-6">
                  <StepHeading
                    id="start-step-1"
                    eyebrow="Etapa 2 de 4"
                    title="Qual é o CNPJ da instituição?"
                    description="Consultamos a Receita Federal na hora e preenchemos os dados cadastrais para você."
                  />
                  <TextField
                    label="CNPJ"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    value={cnpj}
                    onChange={event => {
                      setCnpj(maskCnpj(event.target.value))
                      clearError('cnpj')
                    }}
                    error={errors.cnpj}
                    hint="Só números ou com pontuação — tanto faz."
                    adornment={lookup.state === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
                    containerClassName="max-w-sm"
                  />
                  <div aria-live="polite" className="space-y-3">
                    {lookup.state === 'loading' ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Consultando a Receita Federal…
                      </p>
                    ) : null}
                    {lookup.state === 'error' ? (
                      <Notice
                        tone="warning"
                        title="Não conseguimos consultar o CNPJ agora."
                        action={
                          <Button type="button" size="sm" variant="outline" className="bg-background" onClick={retryLookup}>
                            Tentar de novo
                          </Button>
                        }
                      >
                        {lookup.message} Você pode seguir: os dados cadastrais serão preenchidos à mão.
                      </Notice>
                    ) : null}
                    {lookup.state === 'done' && lookup.response.unavailable ? (
                      <Notice tone="warning" title="A Receita Federal está indisponível no momento.">
                        {lookup.response.message ?? 'Siga com o preenchimento manual; a situação cadastral é verificada de novo na análise.'}
                      </Notice>
                    ) : null}
                    {lookup.state === 'done' && !lookup.response.unavailable && !lookup.response.found ? (
                      <Notice tone="error" title="CNPJ não encontrado na Receita Federal.">
                        {lookup.response.message ?? 'Confira os dígitos. Se o CNPJ for recente, a base da Receita pode levar alguns dias para atualizar.'}
                      </Notice>
                    ) : null}
                    {receita ? (
                      <ReceitaCard
                        result={receita}
                        legalForm={form}
                        onUseForm={next => {
                          setForm(next)
                          setType(contractorTypeOf(next))
                        }}
                      />
                    ) : null}
                  </div>

                  {demo ? (
                    <details className="group rounded-2xl border border-dashed bg-muted/20 p-4">
                      <summary className="cursor-pointer select-none text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        CNPJs de demonstração (dados fictícios)
                      </summary>
                      <ul className="mt-3 grid gap-2">
                        {demo.demoScenarios().map(item => (
                          <li key={item.cnpj}>
                            <button
                              type="button"
                              onClick={() => pickDemoCnpj(item.cnpj)}
                              className="flex w-full flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 text-left text-[13px] transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="font-semibold text-foreground">
                                {formatCnpj(item.cnpj)} · {item.tradeName ?? item.legalName}
                              </span>
                              <span className="text-muted-foreground">{item.scenario}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-6">
                  <StepHeading
                    id="start-step-2"
                    eyebrow="Etapa 3 de 4"
                    title="Simule as vidas e escolha o plano"
                    description="O valor simulado aqui é exatamente o que será cobrado: a fatura usa a mesma regra de cálculo."
                  />
                  <PlanPicker
                    offers={offers}
                    loading={offersLoading}
                    error={offersError}
                    onRetry={() => void reloadOffers()}
                    lives={lives}
                    onLivesChange={value => {
                      setLives(value)
                      clearError('expectedLives')
                    }}
                    planId={planId}
                    onPlanChange={id => {
                      setPlanId(id)
                      setPlanTouched(true)
                      clearError('planId')
                    }}
                    errors={{ planId: errors.planId, expectedLives: errors.expectedLives }}
                  />
                  {planTouched && planId !== recommendedPlanId(offers, lives) ? (
                    <button
                      type="button"
                      className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setPlanTouched(false)}
                    >
                      Voltar a usar o plano recomendado para {lives.toLocaleString('pt-BR')} vidas
                    </button>
                  ) : null}
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-6">
                  <StepHeading
                    id="start-step-3"
                    eyebrow="Etapa 4 de 4"
                    title="Quem vai acompanhar a proposta?"
                    description="Enviamos para este e-mail o link seguro de acompanhamento. Por ele você completa o cadastro, acompanha a análise e paga a ativação."
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      label="Nome completo"
                      autoComplete="name"
                      value={applicant.name}
                      onChange={event => {
                        setApplicant(current => ({ ...current, name: event.target.value }))
                        clearError('applicant.name')
                      }}
                      error={errors['applicant.name']}
                      containerClassName="sm:col-span-2"
                    />
                    <TextField
                      label="E-mail corporativo"
                      type="email"
                      autoComplete="email"
                      value={applicant.email}
                      onChange={event => {
                        setApplicant(current => ({ ...current, email: event.target.value }))
                        clearError('applicant.email')
                      }}
                      error={errors['applicant.email']}
                    />
                    <TextField
                      label="Telefone com DDD"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(21) 99999-9999"
                      value={applicant.phone}
                      onChange={event => {
                        setApplicant(current => ({ ...current, phone: maskPhone(event.target.value) }))
                        clearError('applicant.phone')
                      }}
                      error={errors['applicant.phone']}
                    />
                  </div>

                  <div
                    className={cn(
                      'rounded-2xl border bg-muted/30 p-4',
                      errors.acceptPrivacy ? 'border-destructive/50 bg-destructive/5' : null,
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="accept-privacy"
                        checked={acceptPrivacy}
                        onCheckedChange={checked => {
                          setAcceptPrivacy(checked === true)
                          clearError('acceptPrivacy')
                        }}
                        aria-invalid={errors.acceptPrivacy ? true : undefined}
                        aria-describedby="accept-privacy-text"
                        className="mt-0.5 size-5"
                      />
                      <label id="accept-privacy-text" htmlFor="accept-privacy" className="cursor-pointer text-sm leading-relaxed text-foreground">
                        Autorizo a ANNETEC a tratar os dados informados para a análise cadastral (conheça seu cliente e
                        prevenção à lavagem de dinheiro) e para o contato sobre esta proposta, conforme a LGPD (Lei
                        13.709/2018). Os dados de representantes e sócios são usados só para esses fins.
                      </label>
                    </div>
                    {errors.acceptPrivacy ? (
                      <p className="mt-2 pl-8 text-[13px] text-destructive" role="alert">
                        {errors.acceptPrivacy}
                      </p>
                    ) : null}
                  </div>

                  <ActionError
                    message={submitError}
                    details={orphanErrors(errors, ['applicant', 'acceptPrivacy', 'cnpj', 'contractorType', 'legalForm', 'planId', 'expectedLives'])}
                  />

                  <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-4 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <Rocket className="size-4 text-primary" aria-hidden />
                      Próximos passos depois de criar a proposta
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>Complete os dados cadastrais, representantes, documentos, marca e o contrato (≈ 15 minutos).</li>
                      <li>Envie para análise: o compliance responde em até 1 dia útil.</li>
                      <li>Aprovada a proposta, pague a ativação{quote ? ` (${formatBRL(quote.activationTotal)})` : ''} e o clube entra no ar sozinho.</li>
                    </ol>
                  </div>
                </div>
              ) : null}

              <div className="mt-8 hidden items-center justify-between gap-3 border-t pt-6 lg:flex">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 gap-2 rounded-xl"
                  onClick={() => setStep(value => Math.max(0, value - 1))}
                  disabled={step === 0 || busy}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar
                </Button>
                <Button
                  type="button"
                  className="h-12 min-w-52 gap-2 rounded-xl text-base font-semibold shadow-md"
                  onClick={() => (step === STEPS.length - 1 ? void submit() : goNext())}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                  {busy ? 'Criando proposta…' : ctaLabel}
                  {!busy ? <ArrowRight className="size-5" aria-hidden /> : null}
                </Button>
              </div>
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-6 h-11 gap-2 rounded-xl lg:hidden"
                  onClick={() => setStep(value => Math.max(0, value - 1))}
                  disabled={busy}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar
                </Button>
              ) : null}
            </Panel>
          </div>

          <div className="hidden lg:block">
            <QuoteSummaryCard offer={offer} quote={quote} facts={facts} />
          </div>
        </div>
      </main>

      <B2BFooter className="pb-28 lg:pb-0" />
      <QuoteMobileBar
        offer={offer}
        quote={quote}
        facts={facts}
        ctaLabel={ctaLabel}
        busy={busy}
        onCta={() => (step === STEPS.length - 1 ? void submit() : goNext())}
      />
    </>
  )
}
