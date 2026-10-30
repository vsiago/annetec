'use client'

import { useMemo, useState } from 'react'
import { Check, Eye, EyeOff, Info, ListChecks, Plus, Sparkles, Store, Tags, TriangleAlert, Wallet } from 'lucide-react'
import {
  DEFAULT_TENANT_PLAN_PRICING,
  createTenantPlanInput,
  formatBRL,
  tenantPlanPricing,
  type PlatformPlanOffer,
  type UpdateTenantPlanPricingInput,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChipsField,
  FieldGrid,
  FieldSection,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SwitchField,
  TextField,
  TextareaField,
  WizardDialog,
  WizardSuccess,
  decimalInput,
  integerInput,
  maskDecimal,
  maskDigits,
  maskInteger,
  maskMoney,
  moneyInput,
  parseDecimal,
  parseInteger,
  parseMoney,
  successButton,
  useWizard,
  zodFields,
  type FieldKey,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { updatePlatformPlanPricingAction } from '@/lib/actions/platform-billing-api'
import { createTenantPlanAction, updateTenantPlanAction } from '@/lib/actions/tenants-api'
import { formatNumber } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'

/**
 * Criar ou editar um plano da ANNETEC num assistente de 4 etapas + revisão:
 * Plano → O que inclui → Preços e taxas → Vitrine (com prévia do cartão).
 *
 * O plano (nome, mensalidade, limite de vidas, recursos) e o preço comercial
 * (taxa de adesão, vida adicional, % sobre a receita, vitrine) moram em
 * tabelas diferentes na API, então salvar faz uma ou duas chamadas — mas a
 * pessoa vê um plano só. A validação de cada etapa vem dos schemas da API
 * (`createTenantPlanInput` e `tenantPlanPricing`).
 */

interface PlanValues {
  name: string
  price: string
  limit: string
  features: string[]
  description: string
  setupFee: string
  extra: string
  share: string
  publicVisible: boolean
  highlight: boolean
  tagline: string
  sortOrder: string
}

type PlanField = FieldKey<PlanValues>

const STEP_FIELDS = {
  plano: ['name', 'price', 'limit'],
  inclui: ['features', 'description'],
  precos: ['setupFee', 'extra', 'share'],
  vitrine: ['publicVisible', 'highlight', 'tagline', 'sortOrder'],
} as const satisfies Record<string, readonly PlanField[]>

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toValues(offer: PlatformPlanOffer | null): PlanValues {
  const pricing = offer?.pricing ?? { ...DEFAULT_TENANT_PLAN_PRICING, planId: '' }
  return {
    name: offer?.name ?? '',
    price: offer ? moneyInput(offer.priceMonthly) : '',
    limit: offer ? integerInput(offer.memberLimit) : '',
    features: offer ? [...offer.features] : [],
    description: pricing.description ?? '',
    setupFee: moneyInput(pricing.setupFee),
    extra: moneyInput(pricing.pricePerExtraLife),
    share: decimalInput(pricing.revenueSharePercent),
    publicVisible: pricing.publicVisible,
    highlight: pricing.highlight,
    tagline: pricing.tagline ?? '',
    sortOrder: pricing.sortOrder === null ? '' : String(pricing.sortOrder),
  }
}

/** Campo vazio de taxa = 0, como antes ("use 0 para não cobrar"). */
const moneyOrZero = (value: string) => parseMoney(value) ?? 0

const validatePlan = zodFields<PlanValues>(createTenantPlanInput.pick({ name: true, priceMonthly: true, memberLimit: true }), {
  input: v => ({
    name: v.name.trim(),
    priceMonthly: parseMoney(v.price) ?? undefined,
    memberLimit: parseInteger(v.limit) ?? undefined,
  }),
  fieldOf: path => (path[0] === 'priceMonthly' ? 'price' : path[0] === 'memberLimit' ? 'limit' : path[0] === 'name' ? 'name' : null),
  messages: {
    name: { required: 'Dê um nome ao plano.' },
    price: { required: 'Informe a mensalidade em reais.', invalid: 'Informe a mensalidade em reais.' },
    limit: {
      required: 'Informe quantas vidas cabem no plano.',
      invalid: 'Informe quantas vidas cabem no plano (número inteiro, a partir de 1).',
    },
  },
})

const validateIncludes = zodFields<PlanValues>(
  createTenantPlanInput.pick({ features: true }).merge(tenantPlanPricing.pick({ description: true })),
  {
    input: v => ({ features: v.features, description: v.description.trim() || null }),
    messages: { description: { invalid: 'Use no máximo 1.000 caracteres.' } },
  },
)

const validatePrices = zodFields<PlanValues>(
  tenantPlanPricing.pick({ setupFee: true, pricePerExtraLife: true, revenueSharePercent: true }),
  {
    input: v => ({
      setupFee: moneyOrZero(v.setupFee),
      pricePerExtraLife: moneyOrZero(v.extra),
      revenueSharePercent: parseDecimal(v.share) ?? 0,
    }),
    fieldOf: path =>
      path[0] === 'setupFee' ? 'setupFee' : path[0] === 'pricePerExtraLife' ? 'extra' : path[0] === 'revenueSharePercent' ? 'share' : null,
    messages: {
      setupFee: { invalid: 'Informe um valor em reais (use 0 para não cobrar).' },
      extra: { invalid: 'Informe um valor em reais (use 0 para não cobrar).' },
      share: { invalid: 'Use um percentual entre 0% e 30%.' },
    },
  },
)

const validateShowcase = zodFields<PlanValues>(
  tenantPlanPricing.pick({ publicVisible: true, highlight: true, tagline: true, sortOrder: true }),
  {
    input: v => ({
      publicVisible: v.publicVisible,
      highlight: v.highlight,
      tagline: v.tagline.trim() || null,
      sortOrder: v.sortOrder.trim() === '' ? null : parseInteger(v.sortOrder),
    }),
    messages: {
      tagline: { invalid: 'Use no máximo 120 caracteres.' },
      sortOrder: { invalid: 'Use um número inteiro, a partir de 0.' },
    },
  },
)

/** Cartão do plano como aparece na vitrine da contratação. */
function PlanCardPreview({ values }: { values: PlanValues }) {
  const price = parseMoney(values.price)
  const limit = parseInteger(values.limit)
  const setupFee = moneyOrZero(values.setupFee)
  return (
    <figure className="m-0 flex flex-col gap-2 sm:col-span-12">
      <figcaption className="flex items-center justify-between gap-3 text-[13px] font-medium text-muted-foreground">
        <span>Prévia na vitrine da contratação</span>
        {values.publicVisible ? (
          <span className="inline-flex items-center gap-1 text-[#067647]">
            <Eye className="size-3.5" aria-hidden="true" /> Visível
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <EyeOff className="size-3.5" aria-hidden="true" /> Fora da vitrine
          </span>
        )}
      </figcaption>
      <div className="rounded-2xl bg-[#F2F4F7] p-4 sm:p-6" aria-hidden="true">
        <div
          className={cn(
            'relative mx-auto flex max-w-sm flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-opacity',
            values.highlight ? 'border-primary shadow-[0_0_0_1px_var(--primary)]' : 'border-border',
            !values.publicVisible && 'opacity-60',
          )}
        >
          {values.highlight ? (
            <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white">
              <Sparkles className="size-3" /> Mais escolhido
            </span>
          ) : null}
          <div>
            <p className="m-0 text-base font-bold text-foreground">{values.name.trim() || 'Nome do plano'}</p>
            <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
              {values.tagline.trim() || (limit ? `Para clubes de até ${formatNumber(limit)} vidas` : 'Frase de apoio do plano')}
            </p>
          </div>
          <p className="m-0 flex items-baseline gap-1">
            <span className="text-2xl font-bold tabular-nums text-secondary">{formatBRL(price ?? 0)}</span>
            <span className="text-[13px] text-muted-foreground">/mês</span>
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-[#067647]" />
              {limit ? `Até ${formatNumber(limit)} vidas` : 'Limite de vidas'}
            </li>
            {values.features.slice(0, 5).map(feature => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[#067647]" />
                {feature}
              </li>
            ))}
            {values.features.length > 5 ? (
              <li className="text-muted-foreground">+ {values.features.length - 5} recursos</li>
            ) : null}
          </ul>
          <p className="m-0 border-t border-[#EEF0F3] pt-3 text-xs text-muted-foreground">
            {setupFee > 0 ? `Adesão de ${formatBRL(setupFee)} na primeira fatura` : 'Sem taxa de adesão'}
          </p>
        </div>
      </div>
    </figure>
  )
}

type Outcome = { kind: 'created' | 'saved'; name: string; warning?: string }

export function PlanDialog({
  open,
  offer,
  onClose,
  onSaved,
}: {
  open: boolean
  /** `null` = criar um plano novo. */
  offer: PlatformPlanOffer | null
  onClose: () => void
  /** Chamado depois de gravar (mesmo parcialmente), para a tela recarregar a lista. */
  onSaved: () => void | Promise<void>
}) {
  const editing = offer !== null
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Valores iniciais só mudam ao trocar de plano: recarregar a lista depois de
  // um salvamento parcial não pode apagar o que a pessoa ainda está digitando.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo(() => toValues(offer), [offer?.id, open])

  const steps = useMemo<WizardStep<PlanValues>[]>(
    () => [
      {
        id: 'plano',
        title: 'Plano',
        icon: Tags,
        description: 'Nome, mensalidade por clube e quantas vidas cabem nela.',
        fields: STEP_FIELDS.plano,
        validate: validatePlan,
      },
      {
        id: 'inclui',
        title: 'O que inclui',
        icon: ListChecks,
        description: 'Os recursos que o clube recebe. Aparecem no cartão do plano.',
        fields: STEP_FIELDS.inclui,
        validate: validateIncludes,
      },
      {
        id: 'precos',
        title: 'Preços e taxas',
        icon: Wallet,
        description: 'O que a ANNETEC cobra além da mensalidade. Use 0 para não cobrar.',
        fields: STEP_FIELDS.precos,
        validate: validatePrices,
      },
      {
        id: 'vitrine',
        title: 'Vitrine',
        icon: Store,
        description: 'Como o plano aparece na contratação pública.',
        fields: STEP_FIELDS.vitrine,
        validate: validateShowcase,
      },
    ],
    [],
  )

  const wizard = useWizard<PlanValues>({
    steps,
    initialValues,
    startComplete: editing,
    onSubmit: async values => {
      const planInput = {
        name: values.name.trim(),
        priceMonthly: round2(parseMoney(values.price) ?? 0),
        memberLimit: parseInteger(values.limit) ?? 0,
        features: values.features.map(item => item.trim()).filter(Boolean),
      }
      const pricingInput: UpdateTenantPlanPricingInput = {
        setupFee: round2(moneyOrZero(values.setupFee)),
        pricePerExtraLife: round2(moneyOrZero(values.extra)),
        revenueSharePercent: parseDecimal(values.share) ?? 0,
        sortOrder: values.sortOrder.trim() === '' ? null : parseInteger(values.sortOrder),
        tagline: values.tagline.trim() || null,
        description: values.description.trim() || null,
        publicVisible: values.publicVisible,
        highlight: values.highlight,
      }

      let planId = offer?.id ?? null

      // 1. O plano em si (nome, mensalidade, limite, recursos).
      const planChanged =
        !offer ||
        offer.name !== planInput.name ||
        offer.priceMonthly !== planInput.priceMonthly ||
        offer.memberLimit !== planInput.memberLimit ||
        offer.features.join('|') !== planInput.features.join('|')
      if (planChanged) {
        const result = offer ? await updateTenantPlanAction(offer.id, planInput) : await createTenantPlanAction(planInput)
        if (!result.success) {
          const fieldErrors: Partial<Record<PlanField, string>> = {}
          for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
            const key = path.endsWith('priceMonthly') ? 'price' : path.endsWith('memberLimit') ? 'limit' : path.endsWith('name') ? 'name' : null
            if (key && !fieldErrors[key]) fieldErrors[key] = message
          }
          return {
            ok: false,
            message: result.error || 'Não foi possível salvar o plano. Confira os campos e tente de novo.',
            fieldErrors,
          }
        }
        planId = result.data.id
      }

      // 2. Preços e taxas (só chama a API se algo mudou; plano novo com tudo no padrão não precisa).
      const base = offer?.pricing ?? { ...DEFAULT_TENANT_PLAN_PRICING, planId: '' }
      const pricingChanged =
        base.setupFee !== pricingInput.setupFee ||
        base.pricePerExtraLife !== pricingInput.pricePerExtraLife ||
        base.revenueSharePercent !== pricingInput.revenueSharePercent ||
        base.sortOrder !== pricingInput.sortOrder ||
        base.tagline !== pricingInput.tagline ||
        base.description !== pricingInput.description ||
        base.publicVisible !== pricingInput.publicVisible ||
        base.highlight !== pricingInput.highlight
      if (pricingChanged && planId) {
        const result = await updatePlatformPlanPricingAction(planId, pricingInput)
        if (!result.success) {
          await onSaved()
          if (offer) {
            // Edição: o plano já foi gravado; tentar de novo só reenvia os preços.
            return { ok: false, message: `O plano foi salvo, mas os preços e taxas não. ${result.error}` }
          }
          // Plano novo já existe: não dá para "tentar de novo" sem duplicar. Mostra o aviso no sucesso.
          setOutcome({
            kind: 'created',
            name: planInput.name,
            warning: `${result.error} Abra o plano em Planos e preços e salve os preços e taxas de novo.`,
          })
          return { ok: true }
        }
      }

      await onSaved()
      setOutcome({ kind: offer ? 'saved' : 'created', name: planInput.name })
      return { ok: true }
    },
  })

  const { values } = wizard
  const price = parseMoney(values.price)
  const limit = parseInteger(values.limit)
  const extra = moneyOrZero(values.extra)

  const renderStep = (id: string) => {
    if (id === 'plano') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('name')}
            label="Nome do plano"
            required
            span={12}
            maxLength={80}
            placeholder="Ex.: Essencial"
            hint="Curto e fácil de lembrar — é como o plano aparece na contratação e nas faturas."
          />
          <TextField
            {...wizard.field('price')}
            label="Mensalidade"
            required
            span={6}
            prefix="R$"
            mask={maskMoney}
            inputMode="numeric"
            placeholder="0,00"
            hint="Por clube, por mês."
          />
          <TextField
            {...wizard.field('limit')}
            label="Limite de vidas"
            required
            span={6}
            mask={value => maskInteger(value, 7)}
            inputMode="numeric"
            suffix="vidas"
            placeholder="Ex.: 1.000"
            hint="Titulares mais dependentes que cabem na mensalidade."
          />
          {price !== null && limit ? (
            <Notice tone="neutral" icon={Info}>
              {formatBRL(price)} por mês para até {formatNumber(limit)} vidas — {formatBRL(price / limit)} por vida, se o clube
              usar o limite todo.
            </Notice>
          ) : null}
        </FieldGrid>
      )
    }
    if (id === 'inclui') {
      return (
        <FieldGrid>
          <ChipsField
            {...wizard.field('features')}
            label="Recursos incluídos"
            optional
            span={12}
            placeholder="Ex.: Carteirinha digital — digite e aperte Enter"
            maxItemLength={80}
            hint="Um recurso por item. Também dá para colar vários separados por vírgula."
          />
          <TextareaField
            {...wizard.field('description')}
            label="Descrição"
            optional
            span={12}
            rows={4}
            maxLength={1000}
            placeholder="Texto mais longo, para quem quer saber os detalhes do plano na contratação."
          />
        </FieldGrid>
      )
    }
    if (id === 'precos') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('setupFee')}
            label="Taxa de adesão"
            span={4}
            prefix="R$"
            mask={maskMoney}
            inputMode="numeric"
            placeholder="0,00"
            hint="Cobrada uma vez, na primeira fatura."
          />
          <TextField
            {...wizard.field('extra')}
            label="Vida adicional"
            span={4}
            prefix="R$"
            mask={maskMoney}
            inputMode="numeric"
            placeholder="0,00"
            hint="Por vida acima do limite, por mês."
          />
          <TextField
            {...wizard.field('share')}
            label="Sobre a receita"
            span={4}
            suffix="%"
            mask={value => maskDecimal(value, 2)}
            inputMode="decimal"
            placeholder="0"
            hint="De 0% a 30% do que o clube recebeu no mês anterior."
          />
          {limit && extra > 0 ? (
            <Notice tone="neutral" icon={Info}>
              Exemplo: um clube com {formatNumber(limit + 100)} vidas paga {formatBRL(price ?? 0)} + 100 × {formatBRL(extra)} ={' '}
              <strong>{formatBRL((price ?? 0) + 100 * extra)}</strong> no mês.
            </Notice>
          ) : null}
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <SwitchField
          {...wizard.field('publicVisible')}
          label="Mostrar na contratação pública"
          span={6}
          description="Desligado, o plano some da vitrine, mas a equipe ainda pode trocar um clube para ele."
        />
        <SwitchField
          {...wizard.field('highlight')}
          label="Destacar como “Mais escolhido”"
          span={6}
          description="Coloca um selo no plano na vitrine de contratação."
        />
        <TextField
          {...wizard.field('tagline')}
          label="Frase de apoio"
          optional
          span={8}
          maxLength={120}
          showCounter
          placeholder="Ex.: Para clubes de até 1.000 vidas"
          hint="Aparece abaixo do nome do plano."
        />
        <TextField
          {...wizard.field('sortOrder')}
          label="Ordem na vitrine"
          optional
          span={4}
          mask={value => maskDigits(value, 4)}
          inputMode="numeric"
          placeholder="automática"
          hint="O menor número aparece primeiro."
        />
        <PlanCardPreview values={values} />
      </FieldGrid>
    )
  }

  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Plano" icon={Tags} onEdit={() => wizard.goToStep('plano')}>
        <ReviewItem label="Nome" value={values.name.trim()} />
        <ReviewItem label="Mensalidade" value={price !== null ? `${formatBRL(price)} por mês` : null} />
        <ReviewItem label="Limite de vidas" value={limit ? `${formatNumber(limit)} vidas` : null} />
      </ReviewSection>
      <ReviewSection title="O que inclui" icon={ListChecks} onEdit={() => wizard.goToStep('inclui')}>
        <ReviewItem
          label="Recursos"
          wide
          empty="Nenhum recurso listado"
          value={
            values.features.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {values.features.map(feature => (
                  <span key={feature} className="rounded-md bg-accent px-2 py-0.5 text-[13px] text-secondary">
                    {feature}
                  </span>
                ))}
              </span>
            ) : null
          }
        />
        <ReviewItem label="Descrição" wide value={values.description.trim()} empty="Sem descrição" />
      </ReviewSection>
      <ReviewSection title="Preços e taxas" icon={Wallet} onEdit={() => wizard.goToStep('precos')}>
        <ReviewItem label="Taxa de adesão" value={moneyOrZero(values.setupFee) > 0 ? formatBRL(moneyOrZero(values.setupFee)) : 'Não cobra'} />
        <ReviewItem label="Vida adicional" value={extra > 0 ? `${formatBRL(extra)} por vida/mês` : 'Não cobra'} />
        <ReviewItem
          label="Sobre a receita"
          value={(parseDecimal(values.share) ?? 0) > 0 ? `${values.share}%` : 'Não cobra'}
        />
      </ReviewSection>
      <ReviewSection title="Vitrine" icon={Store} onEdit={() => wizard.goToStep('vitrine')}>
        <ReviewItem label="Na contratação pública" value={values.publicVisible ? 'Visível' : 'Fora da vitrine'} />
        <ReviewItem label="Selo “Mais escolhido”" value={values.highlight ? 'Sim' : 'Não'} />
        <ReviewItem label="Frase de apoio" value={values.tagline.trim()} empty="Sem frase" />
        <ReviewItem label="Ordem" value={values.sortOrder.trim()} empty="Automática" />
      </ReviewSection>
      {editing ? (
        <Notice tone="info" icon={Info}>
          Preços, taxas e limite de vidas valem para novas contratações e trocas de plano. Quem já assina mantém as condições da
          assinatura.
        </Notice>
      ) : null}
    </ReviewList>
  )

  const renderSuccess = () =>
    outcome ? (
      <WizardSuccess
        title={outcome.kind === 'saved' ? 'Alterações salvas' : 'Plano criado'}
        description={
          outcome.kind === 'saved'
            ? `O plano ${outcome.name} foi atualizado.`
            : `O plano ${outcome.name} já pode ser escolhido para os clubes${values.publicVisible ? ' e aparece na contratação pública' : ''}.`
        }
        actions={
          <>
            {outcome.kind === 'created' && !outcome.warning ? (
              <Button
                type="button"
                variant="outline"
                className={successButton.secondary}
                onClick={() => {
                  setOutcome(null)
                  wizard.reset(toValues(null))
                }}
              >
                <Plus aria-hidden="true" />
                Criar outro
              </Button>
            ) : null}
            <Button type="button" className={successButton.primary} onClick={onClose}>
              Fechar
            </Button>
          </>
        }
      >
        {outcome.warning ? (
          <Notice tone="warning" icon={TriangleAlert} title="Os preços e taxas não foram salvos" role="alert">
            {outcome.warning}
          </Notice>
        ) : null}
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          onClose()
          setOutcome(null)
        }
      }}
      wizard={wizard}
      icon={Tags}
      title={editing ? `Editar o plano ${offer.name}` : 'Criar plano'}
      description={
        editing
          ? 'Mude só o que precisar: a trilha leva direto à etapa.'
          : 'Defina o que o plano inclui e quanto a ANNETEC cobra de cada clube que o contratar.'
      }
      submitLabel={editing ? 'Salvar alterações' : 'Criar plano'}
      submittingLabel={editing ? 'Salvando…' : 'Criando…'}
      discardTitle={editing ? 'Descartar as alterações?' : undefined}
      discardDescription={editing ? 'O que você mudou será perdido.' : undefined}
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}
