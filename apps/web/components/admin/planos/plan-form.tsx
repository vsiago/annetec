'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CircleAlert, LoaderCircle, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  DEPENDENT_RELATIONSHIP_LABELS,
  clubPaymentMethod,
  dependentRelationship,
  describeDependentRules,
  describeDependentsPolicy,
  describeEnrollmentFee,
  effectivePaymentMethods,
  formatBRL,
  quoteClubPlan,
  type ActiveStatus,
  type BillingSettings,
  type ClubPaymentMethod,
  type ClubPlan,
  type DependentRelationship,
} from '@annetec/contracts'
import { FormField, FormRow } from '@/components/dashboard/form-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useTenantData } from '@/contexts/tenant-data-context'
import { createClubPlanAction, updateClubPlanAction } from '@/lib/actions/planos-api'
import {
  MAX_DEPENDENTS_LIMIT,
  PLAN_FORM_SECTIONS,
  coverageFromForm,
  coverageFromTemplate,
  draftPlanTerms,
  emptyPlanForm,
  errorsBySection,
  featuresFromCoverages,
  firstErrorSection,
  lenientPlanFromForm,
  planAudiences,
  planFormToInput,
  planToFormState,
  pricingFromForm,
  remapApiFieldErrors,
  type CoverageFormState,
  type CoverageTemplate,
  type DependentRuleFormState,
  type PlanFormSection,
  type PlanFormState,
} from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'
import { AffixInput, CoverageEditor } from './coverage-editor'

type TextKey = {
  [K in keyof PlanFormState]: PlanFormState[K] extends string ? K : never
}[keyof PlanFormState]

/** Mudar um campo também libera o erro dos campos que a regra amarra a ele. */
const RELATED_FIELDS: Partial<Record<keyof PlanFormState, string[]>> = {
  maxDependents: ['includedDependents', 'dependentRules'],
  includedDependents: ['maxDependents'],
  holderMinAge: ['holderMaxAge'],
  holderMaxAge: ['holderMinAge'],
  status: ['paymentMethods'],
  restrictPaymentMethods: ['paymentMethods'],
  restrictRelationships: ['dependentRules'],
  enrollmentFeeWaived: ['enrollmentFee'],
}

const STATUS_OPTIONS: { value: ActiveStatus; label: string; hint: string }[] = [
  { value: 'active', label: 'Ativo', hint: 'À venda na vitrine e no checkout.' },
  { value: 'inactive', label: 'Inativo', hint: 'Fora da vitrine e do checkout; quem já assinou continua.' },
]

/**
 * Cadastro completo do plano do clube, em seções: identidade, preço e
 * dependentes, elegibilidade, coberturas, pagamento, contrato e vitrine.
 *
 * Valida com o MESMO schema e as MESMAS regras da API (`planFormToInput`) e
 * grava pela action própria (`planos-api`). Erro nunca some: o da API vai para
 * o alerta do topo e, quando tem caminho, para o campo; o foco pula para o
 * primeiro campo a revisar.
 */
export function PlanForm({
  slug,
  tenantName,
  plan,
  plans,
  settings,
}: {
  slug: string
  tenantName: string
  /** `null` = plano novo. */
  plan: ClubPlan | null
  /** Todos os planos do inquilino (nome repetido e sugestões de público). */
  plans: readonly ClubPlan[]
  /** Formas habilitadas e régua do clube; `null` = não carregou (a API confere ao salvar). */
  settings: BillingSettings | null
}) {
  const router = useRouter()
  const { reloadClientPlans } = useTenantData()
  const [initial] = useState<PlanFormState>(() => (plan ? planToFormState(plan) : emptyPlanForm()))
  const [form, setForm] = useState<PlanFormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openCoverages, setOpenCoverages] = useState<Set<string>>(() => new Set())
  const [activeSection, setActiveSection] = useState<PlanFormSection>('identidade')
  const alertRef = useRef<HTMLDivElement>(null)

  const listHref = `/${slug}/admin/planos`
  const cancelHref = plan ? `${listHref}/${plan.id}` : listHref
  const enabledMethods = settings?.enabledMethods ?? null
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])
  const sectionErrors = useMemo(() => errorsBySection(errors), [errors])
  const errorCount = Object.keys(errors).length
  const preview = useMemo(() => lenientPlanFromForm(form), [form])
  const audiences = useMemo(() => planAudiences([...plans]), [plans])
  const individual = preview.maxDependents === 0
  const effective = enabledMethods ? effectivePaymentMethods(preview, enabledMethods) : null

  // Fechar ou recarregar a aba com alteração pendente pede confirmação ao navegador.
  useEffect(() => {
    if (!dirty || saving) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, saving])

  // Link direto para uma seção (ex.: "Cadastrar coberturas" no detalhe → #secao-coberturas).
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#secao-')) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [])

  // Seção à vista acende na navegação lateral.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const nodes = PLAN_FORM_SECTIONS.map(section => document.getElementById(`secao-${section.id}`)).filter(
      (node): node is HTMLElement => node !== null,
    )
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveSection(visible[0].target.id.replace('secao-', '') as PlanFormSection)
      },
      { rootMargin: '-96px 0px -60% 0px' },
    )
    nodes.forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  function clearErrors(predicate: (path: string) => boolean) {
    setErrors(previous => {
      const keys = Object.keys(previous).filter(predicate)
      if (keys.length === 0) return previous
      const next = { ...previous }
      keys.forEach(key => delete next[key])
      return next
    })
  }

  function update<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
    const related = RELATED_FIELDS[key] ?? []
    clearErrors(path =>
      [String(key), ...related].some(field => path === field || path.startsWith(`${field}.`)),
    )
  }

  const bind = (key: TextKey) => ({
    id: `plano-${key}`,
    value: form[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value),
    'aria-invalid': errors[key] ? true : undefined,
  })

  function updateRule(relationship: DependentRelationship, patch: Partial<DependentRuleFormState>) {
    setForm(previous => ({
      ...previous,
      dependentRules: {
        ...previous.dependentRules,
        [relationship]: { ...previous.dependentRules[relationship], ...patch },
      },
    }))
    clearErrors(path => path === 'dependentRules' || path.startsWith(`dependentRules.${relationship}`))
  }

  function toggleRestrictRelationships(checked: boolean) {
    // Primeira vez: já marca os dois parentescos mais comuns.
    if (checked && !dependentRelationship.options.some(relationship => form.dependentRules[relationship].enabled)) {
      setForm(previous => ({
        ...previous,
        dependentRules: {
          ...previous.dependentRules,
          conjuge: { ...previous.dependentRules.conjuge, enabled: true },
          filho: { ...previous.dependentRules.filho, enabled: true },
        },
      }))
    }
    update('restrictRelationships', checked)
  }

  function togglePaymentMethod(method: ClubPaymentMethod, checked: boolean) {
    setForm(previous => ({ ...previous, paymentMethods: { ...previous.paymentMethods, [method]: checked } }))
    clearErrors(path => path === 'paymentMethods' || path.startsWith('paymentMethods.'))
  }

  /** Reindexa os erros `coverages.<i>.*` quando a lista muda de ordem ou perde um item. */
  function remapCoverageErrors(map: (index: number) => number | null) {
    setErrors(previous => {
      const next: Record<string, string> = {}
      for (const [path, message] of Object.entries(previous)) {
        const match = /^coverages\.(\d+)\.(.+)$/.exec(path)
        if (!match) {
          next[path] = message
          continue
        }
        const target = map(Number(match[1]))
        if (target !== null) next[`coverages.${target}.${match[2]}`] = message
      }
      return next
    })
  }

  function changeCoverage(index: number, patch: Partial<CoverageFormState>) {
    setForm(previous => ({
      ...previous,
      coverages: previous.coverages.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    }))
    const fields = Object.keys(patch)
    if ('kind' in patch || 'limitPeriod' in patch || 'limitQuantity' in patch) {
      fields.push('value', 'limitQuantity', 'limitPeriod')
    }
    clearErrors(path => fields.some(field => path === `coverages.${index}.${field}`))
  }

  function addCoverage(template: CoverageTemplate): string {
    const item = coverageFromTemplate(
      template,
      form.coverages.map(coverage => coverage.id),
    )
    setForm(previous => ({ ...previous, coverages: [...previous.coverages, item] }))
    setOpenCoverages(previous => new Set(previous).add(item.key))
    clearErrors(path => path === 'coverages')
    return item.key
  }

  function moveCoverage(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= form.coverages.length) return
    setForm(previous => {
      const next = [...previous.coverages]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...previous, coverages: next }
    })
    remapCoverageErrors(position => (position === index ? target : position === target ? index : position))
  }

  function removeCoverage(index: number) {
    const removed = form.coverages[index]
    setForm(previous => ({ ...previous, coverages: previous.coverages.filter((_, position) => position !== index) }))
    remapCoverageErrors(position => (position === index ? null : position > index ? position - 1 : position))
    if (removed) {
      toast('Cobertura removida', {
        description: removed.title || 'Nova cobertura',
        action: {
          label: 'Desfazer',
          onClick: () =>
            setForm(previous => {
              const next = [...previous.coverages]
              next.splice(Math.min(index, next.length), 0, removed)
              return { ...previous, coverages: next }
            }),
        },
      })
    }
  }

  function toggleCoverage(key: string) {
    setOpenCoverages(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function generateFeatures() {
    const lines = featuresFromCoverages(form.coverages.map(coverageFromForm))
    if (lines.length === 0) return
    const previous = form.features
    update('features', lines.join('\n'))
    toast.success('Destaques gerados a partir das coberturas', {
      description: 'Revise e encurte o que precisar.',
      action: previous.trim() ? { label: 'Desfazer', onClick: () => update('features', previous) } : undefined,
    })
  }

  function generateTerms() {
    const previous = form.terms
    const draft = draftPlanTerms(
      { ...preview, name: preview.name || 'SEM NOME' },
      {
        orgName: tenantName,
        enabledMethods,
        suspendAfterDays: settings?.suspendAfterDays ?? null,
        cancelAfterDays: settings?.cancelAfterDays ?? null,
      },
    )
    update('terms', draft)
    toast.success('Rascunho do regulamento gerado', {
      description: 'Montado com os dados deste formulário. Revise o texto antes de salvar.',
      action: previous.trim() ? { label: 'Desfazer', onClick: () => update('terms', previous) } : undefined,
    })
  }

  // -------------------------------------------------------------------------
  // Salvar
  // -------------------------------------------------------------------------

  /** Abre as coberturas com erro e leva o foco ao primeiro campo a revisar. */
  function revealErrors(found: Record<string, string>) {
    const keys: string[] = []
    for (const path of Object.keys(found)) {
      const match = /^coverages\.(\d+)\./.exec(path)
      const item = match ? form.coverages[Number(match[1])] : undefined
      if (item) keys.push(item.key)
    }
    if (keys.length > 0) setOpenCoverages(previous => new Set([...previous, ...keys]))

    const section = firstErrorSection(found)
    window.setTimeout(() => {
      const container = section ? document.getElementById(`secao-${section}`) : null
      const field = container?.querySelector<HTMLElement>('[aria-invalid="true"]')
      if (field) {
        field.focus({ preventScroll: true })
        field.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        alertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 80)
  }

  async function submit() {
    if (saving) return
    setSubmitError(null)
    const { input, errors: local } = planFormToInput(form, {
      enabledMethods,
      otherPlanNames: plans.filter(other => other.id !== plan?.id).map(other => other.name),
    })
    if (!input) {
      const count = Object.keys(local).length
      setErrors(local)
      setSubmitError(
        count === 1 ? 'Revise o campo destacado antes de salvar.' : `Revise os ${count} campos destacados antes de salvar.`,
      )
      revealErrors(local)
      return
    }

    setErrors({})
    setSaving(true)
    const result = plan ? await updateClubPlanAction(slug, plan.id, input) : await createClubPlanAction(slug, input)
    if (!result.success) {
      setSaving(false)
      const fieldErrors = remapApiFieldErrors(result.fieldErrors, input)
      // Conflito de nome (409) vem sem caminho: pendura no campo também.
      if (Object.keys(fieldErrors).length === 0 && /nome/i.test(result.error)) fieldErrors.name = result.error
      setErrors(fieldErrors)
      setSubmitError(result.error)
      toast.error('Não foi possível salvar o plano', { description: result.error })
      revealErrors(fieldErrors)
      return
    }

    toast.success(plan ? 'Plano atualizado' : 'Plano criado', { description: result.data.name })
    await reloadClientPlans()
    router.push(`${listHref}/${result.data.id}`)
  }

  // -------------------------------------------------------------------------
  // Tela
  // -------------------------------------------------------------------------

  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault()
        void submit()
      }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <Link
          href={cancelHref}
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {plan ? plan.name : 'Produtos e Planos'}
        </Link>
        <PageHeader
          title={plan ? `Editar ${plan.name}` : 'Novo plano'}
          description={
            plan
              ? 'As mudanças valem para novas adesões. Quem já assinou mantém o preço e as regras da contratação.'
              : 'Cadastre o produto completo: preço, regras, coberturas e contrato.'
          }
        />
      </div>

      {submitError && (
        <div ref={alertRef}>
          <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível salvar</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Seções do formulário" className="hidden lg:block">
          <ol className="sticky top-24 space-y-0.5">
            {PLAN_FORM_SECTIONS.map(section => (
              <li key={section.id}>
                <a
                  href={`#secao-${section.id}`}
                  aria-current={activeSection === section.id ? 'location' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30',
                    activeSection === section.id
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {section.label}
                  {sectionErrors[section.id] > 0 && (
                    <span className="rounded-full bg-destructive/10 px-1.5 text-[11px] font-semibold text-destructive">
                      {sectionErrors[section.id]}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          <FormSection
            id="identidade"
            title="Identidade"
            description="Como o plano aparece para quem vai contratar."
            errorCount={sectionErrors.identidade}
          >
            <FormRow>
              <FormField label="Nome do plano" htmlFor="plano-name" error={errors.name} required>
                <Input {...bind('name')} placeholder="Ex.: Plus" autoComplete="off" />
              </FormField>
              <FormField
                label="Público"
                htmlFor="plano-audience"
                error={errors.audience}
                hint="Filtro da vitrine e da lista. Ex.: Individual, Famílias."
              >
                <Input {...bind('audience')} list="plano-audiences" placeholder="Ex.: Casal ou família pequena" />
                <datalist id="plano-audiences">
                  {audiences.map(audience => (
                    <option key={audience} value={audience} />
                  ))}
                </datalist>
              </FormField>
            </FormRow>
            <FormField
              label="Frase de venda"
              htmlFor="plano-tagline"
              error={errors.tagline}
              hint={`${form.tagline.trim().length}/120 · aparece logo abaixo do nome no card.`}
            >
              <Input {...bind('tagline')} placeholder="Ex.: Você e mais uma pessoa com consultas e dentista por preço de parceiro." />
            </FormField>
            <FormField
              label="Descrição"
              htmlFor="plano-description"
              error={errors.description}
              hint="O resumo do plano no card e no detalhe."
            >
              <Textarea {...bind('description')} rows={3} className="resize-y" />
            </FormField>
            <FormField
              label="Selo"
              htmlFor="plano-badge"
              error={errors.badge}
              hint={`${form.badge.trim().length}/30 · ex.: Mais escolhido, Melhor para famílias.`}
            >
              <Input {...bind('badge')} className="sm:max-w-xs" placeholder="Sem selo" />
            </FormField>
          </FormSection>

          <FormSection
            id="preco"
            title="Preço e dependentes"
            description="Mensalidade, adesão e quantos dependentes cabem no plano."
            errorCount={sectionErrors.preco}
          >
            <FormRow>
              <FormField
                label="Mensalidade do titular"
                htmlFor="plano-priceMonthly"
                error={errors.priceMonthly}
                hint="Em reais, ex.: 49,90."
                required
              >
                <AffixInput {...bind('priceMonthly')} prefix="R$" inputMode="decimal" placeholder="49,90" />
              </FormField>
              <FormField
                label="Taxa de adesão"
                htmlFor="plano-enrollmentFee"
                error={errors.enrollmentFee}
                hint="Cobrada uma vez, só na 1ª cobrança. Vazio = sem adesão."
              >
                <AffixInput {...bind('enrollmentFee')} prefix="R$" inputMode="decimal" placeholder="Sem adesão" />
              </FormField>
            </FormRow>
            <SwitchRow
              id="plano-enrollmentFeeWaived"
              label="Isentar a adesão"
              description="A vitrine mostra a adesão riscada e a 1ª cobrança fica igual à mensalidade."
              checked={form.enrollmentFeeWaived}
              onCheckedChange={checked => update('enrollmentFeeWaived', checked)}
              disabled={!form.enrollmentFee.trim() && !form.enrollmentFeeWaived}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label="Máximo de dependentes"
                htmlFor="plano-maxDependents"
                error={errors.maxDependents}
                hint="Vazio = sem limite · 0 = individual."
              >
                <Input {...bind('maxDependents')} inputMode="numeric" placeholder="Sem limite" />
              </FormField>
              <FormField
                label="Dependentes inclusos"
                htmlFor="plano-includedDependents"
                error={errors.includedDependents}
                hint="Cobertos pela mensalidade do titular."
              >
                <Input {...bind('includedDependents')} inputMode="numeric" placeholder="0" disabled={individual} />
              </FormField>
              <FormField
                label="Dependente extra"
                htmlFor="plano-priceDependentMonthly"
                error={errors.priceDependentMonthly}
                hint="R$/mês por dependente além dos inclusos."
              >
                <AffixInput
                  {...bind('priceDependentMonthly')}
                  prefix="R$"
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={individual}
                />
              </FormField>
            </div>
            <QuotePreview state={form} />
          </FormSection>

          <FormSection
            id="elegibilidade"
            title="Elegibilidade"
            description="Quem pode ser titular e quem pode entrar como dependente. O checkout confere na adesão."
            errorCount={sectionErrors.elegibilidade}
          >
            <FormRow>
              <FormField
                label="Idade mínima do titular"
                htmlFor="plano-holderMinAge"
                error={errors.holderMinAge}
                hint="Vazio = 18 anos (regra geral)."
              >
                <AffixInput {...bind('holderMinAge')} inputMode="numeric" suffix="anos" placeholder="18" />
              </FormField>
              <FormField
                label="Idade máxima do titular"
                htmlFor="plano-holderMaxAge"
                error={errors.holderMaxAge}
                hint="Vazio = sem limite."
              >
                <AffixInput {...bind('holderMaxAge')} inputMode="numeric" suffix="anos" placeholder="Sem limite" />
              </FormField>
            </FormRow>

            {individual ? (
              <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Plano individual (máximo de dependentes 0): não há parentescos para configurar.
              </p>
            ) : (
              <div className="space-y-3">
                <SwitchRow
                  id="plano-restrictRelationships"
                  label="Restringir parentescos e idades"
                  description="Desligado, o plano aceita qualquer parentesco, sem limite de idade."
                  checked={form.restrictRelationships}
                  onCheckedChange={toggleRestrictRelationships}
                />
                {form.restrictRelationships && (
                  <div
                    role="group"
                    aria-label="Parentescos aceitos"
                    className={cn(
                      'divide-y divide-border/60 rounded-xl border',
                      errors.dependentRules ? 'border-destructive/40' : 'border-border/60',
                    )}
                  >
                    {dependentRelationship.options.map(relationship => {
                      const rule = form.dependentRules[relationship]
                      const id = `plano-rule-${relationship}`
                      const error = errors[`dependentRules.${relationship}.maxAge`] ?? errors[`dependentRules.${relationship}.relationship`]
                      return (
                        <div key={relationship} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={id}
                              checked={rule.enabled}
                              onCheckedChange={checked => updateRule(relationship, { enabled: checked === true })}
                            />
                            <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm font-normal">
                              {DEPENDENT_RELATIONSHIP_LABELS[relationship]}
                            </Label>
                            <AffixInput
                              aria-label={`Idade máxima — ${DEPENDENT_RELATIONSHIP_LABELS[relationship]}`}
                              inputMode="numeric"
                              className="h-9 w-32"
                              suffix="anos"
                              placeholder="Sem limite"
                              disabled={!rule.enabled}
                              value={rule.maxAge}
                              onChange={event => updateRule(relationship, { maxAge: event.target.value })}
                              aria-invalid={error ? true : undefined}
                            />
                          </div>
                          {error && <p className="mt-1.5 pl-7 text-xs text-destructive">{error}</p>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {errors.dependentRules && <p className="text-xs text-destructive">{errors.dependentRules}</p>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Como fica no checkout: <span className="text-foreground">{describeDependentRules(preview)}</span>
            </p>
          </FormSection>

          <FormSection
            id="coberturas"
            title="Coberturas"
            description="O que o associado usa, quanto paga no uso e quando libera. A ordem aqui é a da vitrine."
            errorCount={sectionErrors.coberturas}
          >
            <CoverageEditor
              coverages={form.coverages}
              errors={errors}
              open={openCoverages}
              onToggle={toggleCoverage}
              onChange={changeCoverage}
              onAdd={addCoverage}
              onMove={moveCoverage}
              onRemove={removeCoverage}
            />
            {errors.coverages && <p className="text-xs text-destructive">{errors.coverages}</p>}
          </FormSection>

          <FormSection
            id="pagamento"
            title="Pagamento"
            description="Formas aceitas neste plano, dentro das habilitadas no clube."
            errorCount={sectionErrors.pagamento}
          >
            <SwitchRow
              id="plano-restrictPaymentMethods"
              label="Restringir formas de pagamento"
              description="Desligado, o plano aceita todas as formas habilitadas no clube."
              checked={form.restrictPaymentMethods}
              onCheckedChange={checked => update('restrictPaymentMethods', checked)}
            />
            {form.restrictPaymentMethods && (
              <div role="group" aria-label="Formas aceitas no plano" className="grid gap-2 sm:grid-cols-3">
                {clubPaymentMethod.options.map(method => {
                  const id = `plano-method-${method}`
                  const checked = form.paymentMethods[method]
                  const offInClub = enabledMethods !== null && !enabledMethods.includes(method)
                  return (
                    <label
                      key={method}
                      htmlFor={id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                        checked ? 'border-primary/40 bg-primary/3' : 'border-border/60 hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={value => togglePaymentMethod(method, value === true)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {CLUB_PAYMENT_METHOD_LABELS[method]}
                        </span>
                        {offInClub && (
                          <span className="block text-xs text-amber-700 dark:text-amber-400">Desabilitado no clube</span>
                        )}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {errors.paymentMethods && <p className="text-xs text-destructive">{errors.paymentMethods}</p>}
            <p className="text-sm text-muted-foreground">
              No checkout:{' '}
              {effective === null ? (
                <span>as formas habilitadas no clube{settings === null ? ' (não foi possível conferir agora)' : ''}</span>
              ) : effective.length === 0 ? (
                <span className="font-medium text-destructive">nenhuma forma disponível</span>
              ) : (
                <span className="font-medium text-foreground">
                  {effective.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ')}
                </span>
              )}
            </p>
          </FormSection>

          <FormSection
            id="contrato"
            title="Contrato e regulamento"
            description="Fidelidade, cancelamento, reajuste e o regulamento que o associado aceita no checkout."
            errorCount={sectionErrors.contrato}
          >
            <FormField
              label="Fidelidade"
              htmlFor="plano-loyaltyMonths"
              error={errors.loyaltyMonths}
              hint="Permanência mínima. 0 ou vazio = sem fidelidade."
            >
              <AffixInput {...bind('loyaltyMonths')} inputMode="numeric" suffix="meses" placeholder="0" className="sm:w-48" />
            </FormField>
            <FormField
              label="Política de cancelamento"
              htmlFor="plano-cancellationPolicy"
              error={errors.cancellationPolicy}
              hint="Como cancelar, multa de fidelidade e direito de arrependimento (art. 49 do CDC)."
            >
              <Textarea {...bind('cancellationPolicy')} rows={4} className="resize-y" />
            </FormField>
            <FormField
              label="Reajuste"
              htmlFor="plano-adjustmentPolicy"
              error={errors.adjustmentPolicy}
              hint="Índice, data-base e aviso prévio."
            >
              <Textarea {...bind('adjustmentPolicy')} rows={3} className="resize-y" />
            </FormField>
            <FormField
              label="Regulamento"
              htmlFor="plano-terms"
              error={errors.terms}
              hint={`${form.terms.trim().length.toLocaleString('pt-BR')}/20.000 caracteres · o associado lê e aceita no checkout.`}
            >
              <Textarea {...bind('terms')} rows={10} className="resize-y leading-relaxed" />
            </FormField>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={generateTerms}>
              <Wand2 className="size-4" aria-hidden="true" />
              Gerar rascunho a partir do plano
            </Button>
          </FormSection>

          <FormSection
            id="vitrine"
            title="Vitrine"
            description="Destaque, ordem, status e os destaques em texto do card."
            errorCount={sectionErrors.vitrine}
          >
            <SwitchRow
              id="plano-highlight"
              label="Destacar na vitrine"
              description="Card em evidência. Sem selo próprio, ganha “Mais escolhido”."
              checked={form.highlight}
              onCheckedChange={checked => update('highlight', checked)}
            />
            <FormRow>
              <FormField
                label="Ordem de exibição"
                htmlFor="plano-sortOrder"
                error={errors.sortOrder}
                hint="Menor aparece primeiro. Vazio = depois dos ordenados."
              >
                <Input {...bind('sortOrder')} inputMode="numeric" placeholder="Automática" />
              </FormField>
              <FormField
                label="Status"
                htmlFor="plano-status"
                error={errors.status}
                hint={STATUS_OPTIONS.find(option => option.value === form.status)?.hint}
              >
                <Select value={form.status} onValueChange={value => update('status', value as ActiveStatus)}>
                  <SelectTrigger id="plano-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
            <FormField
              label="Destaques do card"
              htmlFor="plano-features"
              error={errors.features}
              hint="Um por linha. A vitrine usa estes textos quando o plano não tem coberturas cadastradas."
            >
              <Textarea
                {...bind('features')}
                rows={5}
                className="resize-y"
                placeholder={'Telemedicina 24h\nConsultas presenciais por R$ 39,90\nClube de vantagens'}
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={generateFeatures}
              disabled={form.coverages.length === 0}
            >
              <Wand2 className="size-4" aria-hidden="true" />
              Gerar a partir das coberturas
            </Button>
          </FormSection>
        </div>
      </div>

      {/* Rodapé fixo: acima da barra inferior no mobile (bottom-16), colado embaixo no desktop. */}
      <div className="sticky bottom-16 z-20 -mx-4 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-3">
          <p className="hidden min-w-0 flex-1 truncate text-sm sm:block" aria-live="polite">
            {errorCount > 0 ? (
              <span className="text-destructive">
                {errorCount === 1 ? '1 campo a revisar' : `${errorCount} campos a revisar`}
              </span>
            ) : dirty ? (
              <span className="text-muted-foreground">Alterações não salvas</span>
            ) : (
              <span className="text-muted-foreground">{plan ? 'Nenhuma alteração' : 'Preencha e salve para publicar'}</span>
            )}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href={cancelHref}>Cancelar</Link>
            </Button>
            <Button type="submit" disabled={saving} className="min-w-32 gap-2">
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Salvando…' : plan ? 'Salvar alterações' : 'Criar plano'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function FormSection({
  id,
  title,
  description,
  errorCount,
  children,
}: {
  id: PlanFormSection
  title: string
  description?: string
  errorCount: number
  children: ReactNode
}) {
  return (
    <section
      id={`secao-${id}`}
      aria-labelledby={`secao-${id}-titulo`}
      className="scroll-mt-20 rounded-2xl border border-border/60 bg-card p-5 sm:p-6 lg:scroll-mt-24"
    >
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`secao-${id}-titulo`} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {errorCount > 0 && (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {errorCount === 1 ? '1 a revisar' : `${errorCount} a revisar`}
          </span>
        )}
      </header>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border border-border/60 px-4 py-3',
        disabled && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  )
}

/** Prévia ao vivo com `quoteClubPlan` — o mesmo cálculo que o checkout cobra. */
function QuotePreview({ state }: { state: PlanFormState }) {
  const pricing = pricingFromForm(state)
  if (!state.priceMonthly.trim() || pricing.priceMonthly <= 0) {
    return (
      <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Informe a mensalidade para ver a prévia do preço.
      </p>
    )
  }
  const max = pricing.maxDependents ?? null
  const counts = [0, 1, 2, 3].filter(count => max === null || count <= max)
  if (max !== null && max > 3) counts.push(Math.min(max, MAX_DEPENDENTS_LIMIT))

  return (
    <div className="rounded-xl bg-muted/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Prévia do preço</p>
        <p className="text-xs text-muted-foreground">Mesmo cálculo do checkout</p>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 font-medium">
              Pessoas
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Mensalidade
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              1ª cobrança
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {counts.map(count => {
            const quote = quoteClubPlan(pricing, count)
            return (
              <tr key={count}>
                <td className="py-2 text-muted-foreground">
                  {count === 0 ? 'Só o titular' : `Titular + ${count} ${count === 1 ? 'dependente' : 'dependentes'}`}
                  {max !== null && count === max && count > 3 ? ' (máximo)' : ''}
                </td>
                <td className="py-2 text-right font-medium tabular-nums text-foreground">{formatBRL(quote.total)}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {formatBRL(quote.firstChargeTotal)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        {describeDependentsPolicy(pricing)} · {describeEnrollmentFee(pricing)}
      </p>
    </div>
  )
}
