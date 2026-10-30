'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ExternalLink,
  Gift,
  MapPin,
  MoreHorizontal,
  Pencil,
  Percent,
  Pill,
  Plus,
  Smile,
  Stethoscope,
  Tag,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Benefit, BenefitCategory } from '@annetec/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
  FormSelect,
} from '@/components/dashboard/form-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { FilterSelect, SearchInput } from '@/components/dashboard/table-controls'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { useTenant } from '@/contexts/tenant-context'
import {
  createOperatorBenefitAction,
  deleteOperatorBenefitAction,
  listOperatorBenefitsAction,
  updateOperatorBenefitAction,
} from '@/lib/actions/operator-network-api'

/** Categorias do contrato, com o nome que o clube usa no dia a dia. */
const CATEGORY_META: Record<BenefitCategory, { label: string; icon: LucideIcon; className: string }> = {
  health: { label: 'Saúde', icon: Stethoscope, className: 'bg-sky-50 text-sky-600' },
  dental: { label: 'Odontologia', icon: Smile, className: 'bg-emerald-50 text-emerald-600' },
  pharmacy: { label: 'Farmácia', icon: Pill, className: 'bg-violet-50 text-violet-600' },
  funeral: { label: 'Assistência funeral', icon: Gift, className: 'bg-slate-100 text-slate-600' },
  discount: { label: 'Descontos', icon: Tag, className: 'bg-amber-50 text-amber-600' },
}

const CATEGORY_ORDER = Object.keys(CATEGORY_META) as BenefitCategory[]

interface BenefitFormValues {
  name: string
  description: string
  category: BenefitCategory
  discountPercent: string
  provider: string
  locations: string
}

const EMPTY_FORM: BenefitFormValues = {
  name: '',
  description: '',
  category: 'health',
  discountPercent: '',
  provider: '',
  locations: '',
}

function formFromBenefit(benefit: Benefit): BenefitFormValues {
  return {
    name: benefit.name,
    description: benefit.description,
    category: benefit.category,
    discountPercent: benefit.discountPercent === null ? '' : String(benefit.discountPercent),
    provider: benefit.provider ?? '',
    locations: benefit.locations.join('\n'),
  }
}

/** Valida o formulário e devolve o corpo da API ou os erros por campo. */
function parseForm(values: BenefitFormValues) {
  const errors: Record<string, string> = {}
  const name = values.name.trim()
  if (name.length < 2) errors.name = 'Informe o nome do benefício.'

  let discountPercent: number | null = null
  if (values.discountPercent.trim() !== '') {
    const parsed = Number(values.discountPercent.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      errors.discountPercent = 'Use um valor entre 0 e 100.'
    } else {
      discountPercent = parsed
    }
  }

  if (Object.keys(errors).length > 0) return { errors, data: null }
  return {
    errors: null,
    data: {
      name,
      description: values.description.trim(),
      category: values.category,
      discountPercent,
      provider: values.provider.trim() || null,
      locations: values.locations
        .split(/\r?\n|,/)
        .map(item => item.trim())
        .filter(Boolean),
    },
  }
}

export default function BeneficiosPage() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const benefits = useActionData(slug ? () => listOperatorBenefitsAction(slug) : null, [slug])

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState<Benefit | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<Benefit | null>(null)
  const [values, setValues] = useState<BenefitFormValues>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const list = useMemo(() => benefits.data ?? [], [benefits.data])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return list.filter(item => {
      if (category !== 'all' && item.category !== category) return false
      if (!term) return true
      return [item.name, item.description, item.provider ?? '', ...item.locations]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [list, search, category])

  const grouped = CATEGORY_ORDER.map(key => ({
    key,
    items: visible.filter(item => item.category === key),
  })).filter(group => group.items.length > 0)

  function setField<K extends keyof BenefitFormValues>(field: K, value: BenefitFormValues[K]) {
    setValues(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function openCreate() {
    setValues(EMPTY_FORM)
    setErrors({})
    setCreating(true)
  }

  function openEdit(benefit: Benefit) {
    setValues(formFromBenefit(benefit))
    setErrors({})
    setEditing(benefit)
  }

  async function submit(existing: Benefit | null): Promise<string | void> {
    const parsed = parseForm(values)
    if (!parsed.data) {
      setErrors(parsed.errors)
      return 'Confira os campos destacados abaixo.'
    }
    const duplicate = list.some(
      item => item.id !== existing?.id && item.name.toLowerCase() === parsed.data.name.toLowerCase(),
    )
    if (duplicate) return 'Já existe um benefício com este nome.'

    const result = existing
      ? await updateOperatorBenefitAction(slug, existing.id, parsed.data)
      : await createOperatorBenefitAction(slug, parsed.data)
    if (!result.success) return result.error

    benefits.setData(
      existing
        ? list.map(item => (item.id === existing.id ? result.data : item))
        : [...list, result.data],
    )
    toast.success(existing ? 'Benefício atualizado' : 'Benefício cadastrado', { description: parsed.data.name })
  }

  async function remove(benefit: Benefit) {
    const result = await deleteOperatorBenefitAction(slug, benefit.id)
    if (!result.success) {
      toast.error('Não foi possível remover o benefício', { description: result.error })
      return
    }
    benefits.setData(list.filter(item => item.id !== benefit.id))
    toast.success('Benefício removido', { description: benefit.name })
  }

  const base = slug ? `/${slug}` : ''
  const filtered = search.trim() !== '' || category !== 'all'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benefícios"
        description="O que o associado recebe ao participar do clube: descontos, assistências e vantagens."
      >
        <Button className="h-11 gap-2 px-5" onClick={openCreate} disabled={!slug}>
          <Plus className="h-4 w-4" />
          Novo benefício
        </Button>
      </PageHeader>

      <Card className="border-primary/15 bg-primary/5 py-0 shadow-none">
        <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-foreground/80">
            Os benefícios aparecem para o associado no portal dele e na página pública do clube.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2 bg-card">
              <Link href={`${base}/cliente/beneficios`} target="_blank" rel="noopener noreferrer">
                Portal do associado
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-2 bg-card">
              <Link href={base || '/'} target="_blank" rel="noopener noreferrer">
                Site do clube
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, fornecedor ou local" />
        <FilterSelect
          label="Categoria"
          value={category}
          onChange={setCategory}
          allLabel="Todas"
          options={CATEGORY_ORDER.map(key => ({ value: key, label: CATEGORY_META[key].label }))}
        />
      </div>

      {benefits.loading && !benefits.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map(item => (
            <Skeleton key={item} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : benefits.error && !benefits.data ? (
        <EmptyStateCard
          title="Não foi possível carregar os benefícios"
          description={benefits.error}
          action={
            <Button variant="outline" onClick={() => void benefits.reload()}>
              Tentar de novo
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyStateCard
          icon={Gift}
          title="Nenhum benefício cadastrado"
          description="Cadastre o que o associado ganha ao entrar no clube. Sem benefícios, o site e o portal ficam sem vitrine."
          action={
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Cadastrar primeiro benefício
            </Button>
          }
        />
      ) : grouped.length === 0 ? (
        <EmptyStateCard
          icon={Gift}
          title="Nenhum benefício encontrado"
          description={filtered ? 'Nenhum benefício combina com a busca ou a categoria escolhida.' : undefined}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('')
                setCategory('all')
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(group => {
            const meta = CATEGORY_META[group.key]
            const Icon = meta.icon
            return (
              <section key={group.key} aria-label={meta.label} className="space-y-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {meta.label}
                  <span className="text-sm font-normal text-muted-foreground">({group.items.length})</span>
                </h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map(benefit => (
                    <Card key={benefit.id} className="gap-0 py-0 shadow-sm">
                      <CardContent className="space-y-3 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 flex-1 font-semibold leading-snug text-foreground">
                            {benefit.name}
                          </h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="-mr-2 -mt-1 h-8 w-8 shrink-0"
                                aria-label={`Ações de ${benefit.name}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEdit(benefit)}>
                                <Pencil className="h-4 w-4" />
                                Editar benefício
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => setRemoving(benefit)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remover benefício
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {benefit.description && (
                          <p className="line-clamp-3 text-sm text-muted-foreground">{benefit.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {benefit.discountPercent !== null && (
                            <Badge variant="secondary" className="gap-1">
                              <Percent className="h-3 w-3" />
                              {benefit.discountPercent.toLocaleString('pt-BR')}% de desconto
                            </Badge>
                          )}
                          {benefit.provider && (
                            <span className="text-xs text-muted-foreground">Por {benefit.provider}</span>
                          )}
                        </div>
                        {benefit.locations.length > 0 && (
                          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">{benefit.locations.join(' · ')}</span>
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
        title={editing ? 'Editar benefício' : 'Novo benefício'}
        description="Isto é o que o associado vê no portal e no site do clube."
        submitLabel={editing ? 'Salvar alterações' : 'Cadastrar benefício'}
        onSubmit={() => submit(editing)}
      >
        <FormField label="Nome do benefício" htmlFor="benefit-name" required error={errors.name}>
          <Input
            id="benefit-name"
            value={values.name}
            onChange={event => setField('name', event.target.value)}
            placeholder="Ex.: Consultas com desconto"
            aria-invalid={Boolean(errors.name)}
          />
        </FormField>
        <FormField label="Descrição" htmlFor="benefit-description" hint="Explique em uma ou duas frases como usar.">
          <Textarea
            id="benefit-description"
            value={values.description}
            onChange={event => setField('description', event.target.value)}
            rows={3}
          />
        </FormField>
        <FormRow>
          <FormField label="Categoria" required>
            <FormSelect
              value={values.category}
              onChange={value => setField('category', value as BenefitCategory)}
              placeholder="Escolha a categoria"
              options={CATEGORY_ORDER.map(key => ({ value: key, label: CATEGORY_META[key].label }))}
            />
          </FormField>
          <FormField
            label="Desconto (%)"
            htmlFor="benefit-discount"
            error={errors.discountPercent}
            hint="Deixe em branco se não houver desconto."
          >
            <Input
              id="benefit-discount"
              inputMode="decimal"
              value={values.discountPercent}
              onChange={event => setField('discountPercent', event.target.value)}
              placeholder="Ex.: 30"
              aria-invalid={Boolean(errors.discountPercent)}
            />
          </FormField>
        </FormRow>
        <FormField label="Fornecedor" htmlFor="benefit-provider" hint="Opcional. Quem presta o serviço.">
          <Input
            id="benefit-provider"
            value={values.provider}
            onChange={event => setField('provider', event.target.value)}
          />
        </FormField>
        <FormField label="Onde vale" htmlFor="benefit-locations" hint="Uma cidade ou local por linha. Opcional.">
          <Textarea
            id="benefit-locations"
            value={values.locations}
            onChange={event => setField('locations', event.target.value)}
            rows={3}
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => {
          if (!open) setRemoving(null)
        }}
        title="Remover este benefício?"
        description={
          removing
            ? `"${removing.name}" deixa de aparecer para os associados no portal e no site. Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Remover benefício"
        onConfirm={async () => {
          if (removing) await remove(removing)
        }}
      />
    </div>
  )
}
