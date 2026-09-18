'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  Gift,
  MoreHorizontal,
  Pencil,
  Trash2,
  HeartHandshake,
  Users,
  Pill,
  Plus,
  Scale,
  ShieldCheck,
  Smile,
  Stethoscope,
  Target,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
} from '@/components/dashboard/form-dialog'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { planSchema } from '@/lib/form-schemas'
import type { Benefit, ClientPlan } from '@/lib/types'
import { useZodForm } from '@/lib/use-zod-form'
import { cn } from '@/lib/utils'

const EMPTY_PLAN = {
  name: '',
  priceMonthly: '',
  description: '',
  audience: 'Individual',
  features: '',
}

/** Promessas da operadora, a faixa de destaque acima da vitrine de planos. */
const HIGHLIGHTS = [
  { icon: Stethoscope, label: 'Rede credenciada', hint: 'de qualidade', tone: 'bg-rose-50 text-rose-500' },
  { icon: Users, label: 'Planos para', hint: 'você e sua família', tone: 'bg-sky-50 text-sky-500' },
  { icon: Video, label: 'Atendimento', hint: 'nas nossas clínicas', tone: 'bg-emerald-50 text-emerald-500' },
  { icon: Target, label: 'Benefícios que', hint: 'cabem no seu dia a dia', tone: 'bg-amber-50 text-amber-500' },
]

/**
 * Uma aba por categoria de benefício que o clube realmente tem, mais a
 * vitrine de planos. Antes a lista era fixa e repetia categoria — "Seguros"
 * mostrava exatamente o mesmo que "Assistências".
 */
const CATEGORY_LABELS: Record<Benefit['category'], string> = {
  health: 'Saúde e Telemedicina',
  dental: 'Odontológico',
  funeral: 'Assistências e Seguros',
  pharmacy: 'Farmácia',
  discount: 'Clube de Descontos',
}

const benefitIcons: Record<Benefit['category'], typeof Stethoscope> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  funeral: HeartHandshake,
  discount: Gift,
}

/** Tinta de cada cartão de plano na vitrine, na ordem em que aparecem. */
const PLAN_TONES = [
  { head: 'from-sky-100 to-sky-50', icon: 'bg-white text-sky-500' },
  { head: 'from-emerald-100 to-emerald-50', icon: 'bg-white text-emerald-500' },
  { head: 'from-violet-100 to-violet-50', icon: 'bg-white text-violet-500' },
  { head: 'from-amber-100 to-amber-50', icon: 'bg-white text-amber-500' },
]

const BENEFIT_TONES = [
  'bg-sky-50 text-sky-500',
  'bg-emerald-50 text-emerald-500',
  'bg-amber-50 text-amber-500',
  'bg-violet-50 text-violet-500',
  'bg-rose-50 text-rose-500',
  'bg-indigo-50 text-indigo-500',
]

export default function AdminPlanosPage() {
  const { tenant } = useTenant()
  const { clientPlans, benefits, users, createClientPlan, updateClientPlan, deleteClientPlan, isLoading } =
    useTenantData()
  const [tab, setTab] = useState('saude')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ClientPlan | null>(null)
  const [removing, setRemoving] = useState<ClientPlan | null>(null)
  const form = useZodForm(planSchema, EMPTY_PLAN)
  const [audience, setAudience] = useState('all')
  const [priceRange, setPriceRange] = useState('all')

  const audiences = useMemo(
    () => [...new Set(clientPlans.map(plan => plan.audience).filter((v): v is string => Boolean(v)))],
    [clientPlans],
  )

  const categoryTabs = useMemo(() => {
    const present = [...new Set(benefits.map(benefit => benefit.category))]
    return [
      { value: 'saude', label: 'Planos de Saúde' },
      ...present.map(category => ({ value: category, label: CATEGORY_LABELS[category] })),
    ]
  }, [benefits])

  const visiblePlans = useMemo(
    () =>
      clientPlans
        .filter(plan => {
          if (audience !== 'all' && plan.audience !== audience) return false
          if (priceRange === 'ate50' && plan.priceMonthly > 50) return false
          if (priceRange === '50a100' && (plan.priceMonthly <= 50 || plan.priceMonthly > 100)) return false
          if (priceRange === 'acima100' && plan.priceMonthly <= 100) return false
          return true
        })
        .sort((a, b) => a.priceMonthly - b.priceMonthly),
    [clientPlans, audience, priceRange],
  )

  /** Quantos beneficiários cada plano tem hoje — prova social da vitrine. */
  const planUsage = useMemo(() => {
    const counts = new Map<string, number>()
    users.forEach(user => {
      if (user.role !== 'client') return
      const plan = (user as { plan?: string }).plan
      if (plan) counts.set(plan, (counts.get(plan) ?? 0) + 1)
    })
    return counts
  }, [users])

  function openCreate() {
    form.reset(EMPTY_PLAN)
    setCreating(true)
  }

  function openEdit(plan: ClientPlan) {
    form.reset({
      name: plan.name,
      priceMonthly: String(plan.priceMonthly).replace('.', ','),
      description: plan.description,
      audience: plan.audience ?? 'Individual',
      features: (plan.features ?? []).join('\n'),
    })
    setEditing(plan)
  }

  async function submitPlan(existing: ClientPlan | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'

    const duplicate = clientPlans.some(
      plan => plan.id !== existing?.id && plan.name.toLowerCase() === data.name.toLowerCase(),
    )
    if (duplicate) return 'Já existe um plano com este nome.'

    const payload = {
      name: data.name,
      priceMonthly: data.priceMonthly,
      description: data.description,
      audience: data.audience || undefined,
      features: data.features
        ? data.features.split('\n').map(item => item.trim()).filter(Boolean)
        : [],
      highlight: existing?.highlight,
    }

    if (existing) {
      await updateClientPlan(existing.id, payload)
      toast.success('Plano atualizado', { description: data.name })
    } else {
      await createClientPlan(payload)
      toast.success('Plano criado', { description: data.name })
    }
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planos e Produtos"
        description="Conheça nossos planos de saúde e benefícios. Mais saúde, mais qualidade de vida."
      >
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo produto
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <SectionTabsList>
          {categoryTabs.map(item => (
            <SectionTab key={item.value} value={item.value}>
              {item.label}
            </SectionTab>
          ))}
        </SectionTabsList>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-9">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {HIGHLIGHTS.map(item => {
                const Icon = item.icon
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
                  >
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', item.tone)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 text-sm leading-tight">
                      <span className="block font-semibold text-foreground">{item.label}</span>
                      <span className="block text-muted-foreground">{item.hint}</span>
                    </span>
                  </div>
                )
              })}
            </div>

            <TabsContent value="saude" className="m-0">
              {visiblePlans.length === 0 ? (
                <EmptyStateCardShell />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visiblePlans.map((plan, index) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      tone={PLAN_TONES[index % PLAN_TONES.length]}
                      members={planUsage.get(plan.name) ?? 0}
                      tenantName={tenant?.name ?? ''}
                      onEdit={() => openEdit(plan)}
                      onRemove={() => setRemoving(plan)}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {categoryTabs
              .filter(item => item.value !== 'saude')
              .map(item => {
                const list = benefits.filter(benefit => benefit.category === item.value)
                return (
                  <TabsContent key={item.value} value={item.value} className="m-0">
                    {list.length === 0 ? (
                      <EmptyStateCardShell />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {list.map((benefit, index) => (
                          <BenefitCard key={benefit.id} benefit={benefit} index={index} />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                )
              })}

            {/* Atalho para as outras categorias, só na vitrine de planos —
                antes repetia embaixo de toda aba, duplicando o que já estava
                aberto logo acima. */}
            <TabsContent value="saude" className="m-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {benefits.slice(0, 5).map((benefit, index) => {
                  const Icon = benefitIcons[benefit.category]
                  return (
                    <button
                      key={benefit.id}
                      type="button"
                      onClick={() => setTab(benefit.category)}
                      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          BENEFIT_TONES[index % BENEFIT_TONES.length],
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 text-xs leading-tight">
                        <span className="block truncate font-semibold text-foreground">{benefit.name}</span>
                        <span className="block truncate text-muted-foreground">
                          {benefit.provider ?? 'Rede credenciada'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </TabsContent>
          </div>

          <div className="space-y-5 xl:col-span-3">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Encontre o plano ideal</CardTitle>
                <p className="text-xs text-muted-foreground">Filtre e compare os planos disponíveis.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <LabeledSelect
                  label="Categoria"
                  value={tab}
                  onChange={setTab}
                  options={categoryTabs}
                />
                <LabeledSelect
                  label="Faixa de preço"
                  value={priceRange}
                  onChange={setPriceRange}
                  options={[
                    { value: 'all', label: 'Qualquer valor' },
                    { value: 'ate50', label: 'Até R$ 50' },
                    { value: '50a100', label: 'R$ 50 a R$ 100' },
                    { value: 'acima100', label: 'Acima de R$ 100' },
                  ]}
                />
                <LabeledSelect
                  label="Público-alvo"
                  value={audience}
                  onChange={setAudience}
                  options={[
                    { value: 'all', label: 'Todos' },
                    ...audiences.map(item => ({ value: item, label: item })),
                  ]}
                />
                <Button className="w-full">Buscar</Button>
              </CardContent>
            </Card>

            <Card className="border-sky-100 bg-sky-50/60 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Compare Planos</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Selecione até 3 planos para comparar benefícios e coberturas.
                </p>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2 bg-card">
                  <Scale className="h-4 w-4" />
                  Comparar planos
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? 'Editar plano' : 'Novo plano'}
        description={
          editing
            ? 'Atualize o preço e as coberturas oferecidas neste plano.'
            : 'Cadastre um novo plano na vitrine do clube.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Criar plano'}
        size="lg"
        onSubmit={() => submitPlan(editing)}
      >
        <FormRow>
          <FormField label="Nome do plano" htmlFor="plan-name" error={form.errors.name} required>
            <Input
              id="plan-name"
              placeholder="Essencial"
              value={form.values.name}
              onChange={event => form.setField('name', event.target.value)}
              aria-invalid={!!form.errors.name}
            />
          </FormField>
          <FormField
            label="Mensalidade"
            htmlFor="plan-price"
            error={form.errors.priceMonthly}
            required
            hint="Em reais, ex.: 49,90"
          >
            <Input
              id="plan-price"
              inputMode="decimal"
              placeholder="49,90"
              value={form.values.priceMonthly}
              onChange={event => form.setField('priceMonthly', event.target.value)}
              aria-invalid={!!form.errors.priceMonthly}
            />
          </FormField>
        </FormRow>

        <FormField label="Descrição" htmlFor="plan-description" error={form.errors.description} required>
          <Input
            id="plan-description"
            placeholder="Cuidado na medida certa para o seu dia a dia."
            value={form.values.description}
            onChange={event => form.setField('description', event.target.value)}
            aria-invalid={!!form.errors.description}
          />
        </FormField>

        <FormField label="Público-alvo" htmlFor="plan-audience" error={form.errors.audience}>
          <Input
            id="plan-audience"
            placeholder="Individual, Família, Sênior..."
            value={form.values.audience}
            onChange={event => form.setField('audience', event.target.value)}
          />
        </FormField>

        <FormField
          label="Coberturas"
          htmlFor="plan-features"
          error={form.errors.features}
          hint="Uma por linha — é essa lista que aparece no cartão do plano."
        >
          <Textarea
            id="plan-features"
            value={form.values.features}
            onChange={event => form.setField('features', event.target.value)}
            placeholder={'Consultas nas clínicas próprias\nTelemedicina\nClube de descontos'}
            className="min-h-28 resize-none"
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Excluir plano"
        description={
          removing
            ? `O plano "${removing.name}" sairá da vitrine. Beneficiários já contratados nele não são alterados, mas o plano deixa de ser oferecido em novas vendas.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          await deleteClientPlan(removing.id)
          toast.success('Plano excluído', { description: removing.name })
        }}
      />
    </div>
  )
}

function PlanCard({
  plan,
  tone,
  members,
  tenantName,
  onEdit,
  onRemove,
}: {
  plan: ClientPlan
  tone: { head: string; icon: string }
  members: number
  tenantName: string
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <Card className="relative gap-0 overflow-hidden py-0 shadow-sm">
      <div className={cn('relative flex h-28 items-center justify-center bg-linear-to-br', tone.head)}>
        <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm', tone.icon)}>
          <ShieldCheck className="h-7 w-7" />
        </span>
        {plan.highlight && (
          <span className="absolute left-3 top-3 rounded-full bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white">
            Mais escolhido
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 bg-card/80 hover:bg-card"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Ações do plano</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar plano
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir plano
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="space-y-3 p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-foreground">
            {tenantName} {plan.name}
          </h3>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">A partir de</p>
          <p className="text-2xl font-bold text-foreground">
            R$ {plan.priceMonthly.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ mês</span>
          </p>
        </div>

        <ul className="space-y-1.5">
          {(plan.features ?? []).map(feature => (
            <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              {feature}
            </li>
          ))}
        </ul>

        {members > 0 && (
          <p className="text-xs text-muted-foreground">
            {members.toLocaleString('pt-BR')} beneficiários neste plano
          </p>
        )}

        <Button
          variant={plan.highlight ? 'default' : 'outline'}
          className="w-full"
          onClick={onEdit}
        >
          Ver detalhes
        </Button>
      </CardContent>
    </Card>
  )
}

function BenefitCard({ benefit, index }: { benefit: Benefit; index: number }) {
  const Icon = benefitIcons[benefit.category]
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3">
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl',
            BENEFIT_TONES[index % BENEFIT_TONES.length],
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <h3 className="font-bold text-foreground">{benefit.name}</h3>
          <p className="text-sm text-muted-foreground">{benefit.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {benefit.discount && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              até {benefit.discount}% off
            </span>
          )}
          {(benefit.locations ?? []).map(location => (
            <span key={location} className="rounded-full bg-muted px-2 py-0.5">
              {location}
            </span>
          ))}
        </div>
        <Button variant="outline" className="w-full">
          Ver detalhes
        </Button>
      </CardContent>
    </Card>
  )
}

function EmptyStateCardShell() {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <EmptyState
          icon={Gift}
          title="Nada cadastrado nesta categoria"
          description="Cadastre planos e benefícios para montar a vitrine do clube."
        />
      </CardContent>
    </Card>
  )
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full rounded-xl data-[size=default]:h-14">
        <span className="flex flex-col items-start gap-0.5">
          <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
