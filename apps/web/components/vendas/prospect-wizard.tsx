'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, CalendarClock, Contact, Link2, Loader2, Plus, Target } from 'lucide-react'
import {
  PROSPECT_ORIGIN_LABELS,
  PROSPECT_STAGE_LABELS,
  UFS,
  createProspectInput,
  formatPhone,
  onlyDigits,
  quotePlatformPlan,
  type CreateProspectInput,
  type ProspectDetail,
  type ProspectOrigin,
  type ProspectStage,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  FieldSection,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  integerInput,
  maskCnpj,
  maskInteger,
  maskMoney,
  maskPhone,
  moneyInput,
  parseInteger,
  parseMoney,
  successButton,
  useWizard,
  zodFields,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { useCnpjLookup } from '@/components/contratar/hooks'
import { formatMoney } from '@/components/sales/sales-ui'
import { CnpjLookupNotice, receitaName, useSellerPlans } from './vendas-kit'
import { createSellerProspectAction, updateSellerProspectAction } from '@/lib/actions/vendas-api'

/**
 * Cadastro e edição de prospect (operadora ou clube que ainda não é cliente):
 * Operadora → Contato → Oportunidade → Revisão. Com o CNPJ completo, a
 * Receita preenche nome, cidade e contato que estiverem vazios. Regras de
 * `createProspectInput`.
 */

interface ProspectValues {
  name: string
  cnpj: string
  city: string
  state: string
  contactName: string
  email: string
  phone: string
  estimatedLives: string
  interestPlanId: string
  estimatedValue: string
  origin: string
  stage: string
  nextAction: string
  nextActionAt: string
}

const FIELDS = [
  'name',
  'cnpj',
  'city',
  'state',
  'contactName',
  'email',
  'phone',
  'estimatedLives',
  'interestPlanId',
  'estimatedValue',
  'origin',
  'stage',
  'nextAction',
  'nextActionAt',
] as const

const EMPTY: ProspectValues = {
  name: '',
  cnpj: '',
  city: '',
  state: '',
  contactName: '',
  email: '',
  phone: '',
  estimatedLives: '',
  interestPlanId: '',
  estimatedValue: '',
  origin: 'prospeccao_ativa',
  stage: 'novo',
  nextAction: '',
  nextActionAt: '',
}

const UF_OPTIONS = UFS.map(uf => ({ value: uf, label: uf }))
const ORIGIN_OPTIONS = (Object.keys(PROSPECT_ORIGIN_LABELS) as ProspectOrigin[])
  .filter(origin => origin !== 'site')
  .map(value => ({ value, label: PROSPECT_ORIGIN_LABELS[value] }))
const START_STAGES: ProspectStage[] = ['novo', 'em_contato', 'proposta_enviada']
const STAGE_OPTIONS = START_STAGES.map(value => ({ value, label: PROSPECT_STAGE_LABELS[value] }))

function toPayload(v: ProspectValues, editing: boolean): CreateProspectInput {
  const cnpjDigits = onlyDigits(v.cnpj)
  return {
    name: v.name.trim(),
    cnpj: cnpjDigits || null,
    contactName: v.contactName.trim() || null,
    email: v.email.trim() || null,
    phone: v.phone.trim() || null,
    city: v.city.trim() || null,
    state: (v.state || null) as CreateProspectInput['state'],
    estimatedLives: parseInteger(v.estimatedLives),
    interestPlanId: v.interestPlanId || null,
    estimatedValue: parseMoney(v.estimatedValue),
    // Origem "site" é automática (código de indicação) e não volta pela edição.
    ...(v.origin && v.origin !== 'site' ? { origin: v.origin as Exclude<ProspectOrigin, 'site'> } : {}),
    nextAction: v.nextAction.trim() || null,
    nextActionAt: v.nextActionAt || null,
    ...(editing ? {} : { stage: v.stage as CreateProspectInput['stage'] }),
  }
}

const MESSAGES = {
  name: { required: 'Informe o nome da operadora ou do clube.' },
  interestPlanId: 'Escolha um plano da lista.',
}

const stepValidator = (keys: (keyof ProspectValues)[]) =>
  zodFields<ProspectValues>(
    createProspectInput.pick(Object.fromEntries(keys.map(key => [key, true])) as Record<keyof CreateProspectInput, true>),
    { input: v => toPayload(v, false), messages: MESSAGES },
  )

function valuesFrom(prospect: ProspectDetail | null): ProspectValues {
  if (!prospect) return EMPTY
  return {
    name: prospect.name,
    cnpj: prospect.cnpj ? maskCnpj(prospect.cnpj) : '',
    city: prospect.city ?? '',
    state: prospect.state ?? '',
    contactName: prospect.contactName ?? '',
    email: prospect.email ?? '',
    phone: prospect.phone ? formatPhone(prospect.phone) : '',
    estimatedLives: integerInput(prospect.estimatedLives),
    interestPlanId: prospect.interestPlanId ?? '',
    estimatedValue: moneyInput(prospect.estimatedValue),
    origin: prospect.origin,
    stage: prospect.stage,
    nextAction: prospect.nextAction ?? '',
    nextActionAt: prospect.nextActionAt ?? '',
  }
}

export function ProspectWizard({
  open,
  onOpenChange,
  prospect = null,
  onSaved,
  onGenerateLink,
  onOpenProspect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Em edição; `null` = cadastrar. */
  prospect?: ProspectDetail | null
  onSaved?: (detail: ProspectDetail) => void
  /** Atalho do sucesso: abrir o assistente de link para o prospect recém-criado. */
  onGenerateLink?: (detail: ProspectDetail) => void
  /** Atalho do sucesso: abrir o detalhe. */
  onOpenProspect?: (detail: ProspectDetail) => void
}) {
  const editing = prospect !== null
  const { plans, loading: plansLoading } = useSellerPlans()
  const [saved, setSaved] = useState<ProspectDetail | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo(() => valuesFrom(prospect), [prospect?.id, open])

  const steps = useMemo<WizardStep<ProspectValues>[]>(
    () => [
      {
        id: 'operadora',
        title: 'Operadora',
        icon: Building2,
        description: 'Quem você está prospectando. Com o CNPJ, buscamos os dados na Receita Federal.',
        fields: ['name', 'cnpj', 'city', 'state'],
        validate: stepValidator(['name', 'cnpj', 'city', 'state']),
      },
      {
        id: 'contato',
        title: 'Contato',
        icon: Contact,
        description: 'Com quem você fala lá dentro. Tudo opcional — complete quando souber.',
        fields: ['contactName', 'email', 'phone'],
        validate: stepValidator(['contactName', 'email', 'phone']),
      },
      {
        id: 'oportunidade',
        title: 'Oportunidade',
        icon: Target,
        description: 'Tamanho do negócio, plano de interesse e o próximo passo combinado.',
        fields: editing
          ? ['estimatedLives', 'interestPlanId', 'estimatedValue', 'origin', 'nextAction', 'nextActionAt']
          : ['estimatedLives', 'interestPlanId', 'estimatedValue', 'origin', 'stage', 'nextAction', 'nextActionAt'],
        validate: stepValidator(
          editing
            ? ['estimatedLives', 'interestPlanId', 'estimatedValue', 'nextAction', 'nextActionAt']
            : ['estimatedLives', 'interestPlanId', 'estimatedValue', 'origin', 'stage', 'nextAction', 'nextActionAt'],
        ),
      },
    ],
    [editing],
  )

  const wizard = useWizard<ProspectValues>({
    steps,
    initialValues,
    startComplete: editing,
    onSubmit: async values => {
      const payload = toPayload(values, editing)
      const result = prospect
        ? await updateSellerProspectAction(prospect.id, payload)
        : await createSellerProspectAction(payload)
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível salvar o prospect. Confira os dados e tente de novo.',
          fieldErrors: apiFieldErrors<ProspectValues>(result.fieldErrors, FIELDS),
        }
      }
      setSaved(result.data)
      onSaved?.(result.data)
      return { ok: true }
    },
  })
  const { values, setMany } = wizard

  useEffect(() => {
    if (open) setSaved(null)
  }, [open])

  // --- CNPJ na Receita: preenche só o que está vazio (ou veio da consulta anterior).
  const { lookup, retry } = useCnpjLookup(values.cnpj)
  const autofill = useRef<Partial<ProspectValues>>({})
  const filledFor = useRef('')
  const valuesRef = useRef(values)
  valuesRef.current = values
  useEffect(() => {
    if (lookup.state !== 'done' || !lookup.response.found || !lookup.response.result) return
    const digits = onlyDigits(valuesRef.current.cnpj)
    if (filledFor.current === digits) return
    filledFor.current = digits
    const r = lookup.response.result
    const state = r.address.state?.toUpperCase() ?? ''
    const proposed: Partial<ProspectValues> = {
      name: receitaName(lookup.response) ?? '',
      city: r.address.city ?? '',
      state: (UFS as readonly string[]).includes(state) ? state : '',
      email: r.email?.toLowerCase() ?? '',
      phone: r.phone ? maskPhone(r.phone) : '',
    }
    const current = valuesRef.current
    const patch: Partial<ProspectValues> = {}
    for (const key of Object.keys(proposed) as (keyof ProspectValues)[]) {
      const next = proposed[key]
      if (!next) continue
      if (current[key].trim() === '' || current[key] === autofill.current[key]) patch[key] = next
    }
    autofill.current = proposed
    setMany(patch, { reveal: true })
  }, [lookup, setMany])

  const plan = plans.find(item => item.id === values.interestPlanId) ?? null
  const lives = parseInteger(values.estimatedLives)
  const suggested = plan && lives ? quotePlatformPlan(plan, plan.pricing, lives).monthlyTotal : null
  const planOptions = plans.map(item => ({
    value: item.id,
    label: `${item.name} — ${formatMoney(item.priceMonthly)}/mês${item.pricing.publicVisible ? '' : ' (fora do site)'}`,
  }))
  const originOptions =
    values.origin === 'site' ? [{ value: 'site', label: PROSPECT_ORIGIN_LABELS.site, disabled: true }, ...ORIGIN_OPTIONS] : ORIGIN_OPTIONS

  const renderStep = (id: string) => {
    if (id === 'operadora') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('cnpj')}
            label="CNPJ"
            optional
            span={5}
            mask={maskCnpj}
            inputMode="numeric"
            placeholder="00.000.000/0001-00"
            maxLength={18}
            status={lookup.state === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Consultando a Receita" /> : null}
            hint="Com o CNPJ completo, buscamos o nome e a cidade na Receita."
          />
          <TextField
            {...wizard.field('name')}
            label="Nome da operadora ou do clube"
            required
            span={7}
            maxLength={160}
            placeholder="Ex.: Associação dos Servidores de Niterói"
            autoComplete="organization"
          />
          <CnpjLookupNotice cnpj={values.cnpj} lookup={lookup} onRetry={retry} />
          <TextField {...wizard.field('city')} label="Cidade" optional span={8} maxLength={80} placeholder="Ex.: Niterói" />
          <SelectField {...wizard.field('state')} label="UF" optional span={4} options={UF_OPTIONS} placeholder="UF" />
        </FieldGrid>
      )
    }
    if (id === 'contato') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('contactName')}
            label="Nome do contato"
            optional
            span={12}
            maxLength={120}
            placeholder="Quem decide ou influencia a compra"
          />
          <TextField
            {...wizard.field('email')}
            label="E-mail"
            optional
            span={7}
            type="email"
            inputMode="email"
            placeholder="contato@operadora.com.br"
          />
          <TextField
            {...wizard.field('phone')}
            label="Telefone ou WhatsApp"
            optional
            span={5}
            type="tel"
            inputMode="tel"
            mask={maskPhone}
            maxLength={15}
            placeholder="(21) 99999-9999"
          />
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <FieldSection title="Tamanho do negócio" icon={Target}>
          <TextField
            {...wizard.field('estimatedLives')}
            label="Vidas estimadas"
            optional
            span={4}
            inputMode="numeric"
            mask={value => maskInteger(value, 8)}
            suffix="vidas"
            placeholder="500"
          />
          <SelectField
            {...wizard.field('interestPlanId')}
            label="Plano de interesse"
            optional
            span={8}
            options={planOptions}
            placeholder={plansLoading ? 'Carregando planos…' : 'Ainda não sei'}
          />
          <TextField
            {...wizard.field('estimatedValue')}
            label="Valor estimado por mês"
            optional
            span={6}
            inputMode="numeric"
            mask={maskMoney}
            prefix="R$"
            placeholder="0,00"
            hint={suggested !== null ? `Pelo plano e pelas vidas: ${formatMoney(suggested)}/mês.` : 'Quanto o clube pagaria à ANNETEC por mês.'}
            labelAside={
              suggested !== null && parseMoney(values.estimatedValue) !== suggested ? (
                <button
                  type="button"
                  onClick={() => setMany({ estimatedValue: moneyInput(suggested) }, { reveal: true })}
                  className="min-h-8 rounded-md px-1.5 text-[13px] font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
                >
                  Usar {formatMoney(suggested)}
                </button>
              ) : null
            }
          />
          <SelectField {...wizard.field('origin')} label="Origem" span={6} options={originOptions} disabled={values.origin === 'site'} />
          {editing ? null : (
            <SelectField {...wizard.field('stage')} label="Etapa inicial" span={6} options={STAGE_OPTIONS} />
          )}
        </FieldSection>
        <FieldSection title="Próxima ação" icon={CalendarClock} description="Aparece no seu painel até 7 dias antes, e em destaque quando atrasa.">
          <TextField
            {...wizard.field('nextAction')}
            label="O que fazer"
            optional
            span={8}
            maxLength={300}
            placeholder="Ex.: ligar para apresentar o plano Profissional"
          />
          <TextField {...wizard.field('nextActionAt')} label="Quando" optional span={4} type="date" />
        </FieldSection>
      </FieldGrid>
    )
  }

  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Operadora" icon={Building2} onEdit={() => wizard.goToStep('operadora')}>
        <ReviewItem label="Nome" value={values.name.trim()} />
        <ReviewItem label="CNPJ" value={values.cnpj} />
        <ReviewItem label="Cidade" value={[values.city.trim(), values.state].filter(Boolean).join('/')} />
      </ReviewSection>
      <ReviewSection title="Contato" icon={Contact} onEdit={() => wizard.goToStep('contato')}>
        <ReviewItem label="Nome" value={values.contactName.trim()} />
        <ReviewItem label="E-mail" value={values.email.trim()} />
        <ReviewItem label="Telefone" value={values.phone} />
      </ReviewSection>
      <ReviewSection title="Oportunidade" icon={Target} onEdit={() => wizard.goToStep('oportunidade')}>
        <ReviewItem label="Vidas estimadas" value={values.estimatedLives ? `${values.estimatedLives} vidas` : ''} />
        <ReviewItem label="Plano de interesse" value={plan?.name} empty="Ainda não definido" />
        <ReviewItem label="Valor estimado" value={values.estimatedValue ? `R$ ${values.estimatedValue}/mês` : ''} />
        <ReviewItem label="Origem" value={PROSPECT_ORIGIN_LABELS[values.origin as ProspectOrigin]} />
        {editing ? null : <ReviewItem label="Etapa inicial" value={PROSPECT_STAGE_LABELS[values.stage as ProspectStage]} />}
        <ReviewItem
          label="Próxima ação"
          value={[values.nextAction.trim(), values.nextActionAt ? values.nextActionAt.split('-').reverse().join('/') : ''].filter(Boolean).join(' · ')}
          wide
        />
      </ReviewSection>
    </ReviewList>
  )

  const renderSuccess = () =>
    saved ? (
      <WizardSuccess
        title={editing ? 'Prospect atualizado' : 'Prospect cadastrado'}
        description={editing ? `Os dados de ${saved.name} foram salvos.` : `${saved.name} entrou no seu funil em "${PROSPECT_STAGE_LABELS[saved.stage]}".`}
        actions={
          editing ? (
            <Button type="button" className={successButton.primary} onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className={successButton.secondary}
                onClick={() => {
                  setSaved(null)
                  wizard.reset(EMPTY)
                }}
              >
                <Plus aria-hidden="true" />
                Cadastrar outro
              </Button>
              {onOpenProspect ? (
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    onOpenChange(false)
                    onOpenProspect(saved)
                  }}
                >
                  Abrir prospect
                </Button>
              ) : null}
              {onGenerateLink ? (
                <Button
                  type="button"
                  className={successButton.primary}
                  onClick={() => {
                    onOpenChange(false)
                    onGenerateLink(saved)
                  }}
                >
                  <Link2 aria-hidden="true" />
                  Gerar link de contratação
                </Button>
              ) : (
                <Button type="button" className={successButton.primary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              )}
            </>
          )
        }
      />
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      wizard={wizard}
      icon={editing ? Building2 : Plus}
      title={editing ? `Editar ${prospect?.name}` : 'Novo prospect'}
      description={editing ? 'Dados da operadora, do contato e da oportunidade.' : 'Operadora ou clube que ainda não é cliente da ANNETEC.'}
      submitLabel={editing ? 'Salvar alterações' : 'Cadastrar prospect'}
      submittingLabel={editing ? 'Salvando…' : 'Cadastrando…'}
      discardTitle={editing ? 'Descartar as alterações?' : 'Descartar o cadastro?'}
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}
