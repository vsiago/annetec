'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  FlaskConical,
  Globe,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Smile,
  Stethoscope,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
  FormSelect,
} from '@/components/dashboard/form-dialog'
import { useTenantData } from '@/contexts/tenant-data-context'
import { formatPhone, partnerSchema } from '@/lib/form-schemas'
import type { Partner } from '@/lib/types'
import { useZodForm } from '@/lib/use-zod-form'
import { cn } from '@/lib/utils'

const EMPTY_PARTNER = {
  name: '',
  tagline: '',
  category: 'health',
  discountPercent: '10',
  address: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  specialties: '',
}

const categoryMeta: Record<Partner['category'], { label: string; className: string; icon: typeof Stethoscope }> = {
  health: { label: 'Clínica', className: 'bg-sky-50 text-sky-700', icon: Stethoscope },
  dental: { label: 'Odontologia', className: 'bg-rose-50 text-rose-700', icon: Smile },
  pharmacy: { label: 'Farmácia', className: 'bg-emerald-50 text-emerald-700', icon: FlaskConical },
  wellness: { label: 'Bem-estar', className: 'bg-violet-50 text-violet-700', icon: Building2 },
  food: { label: 'Alimentação', className: 'bg-amber-50 text-amber-700', icon: Building2 },
  education: { label: 'Educação', className: 'bg-indigo-50 text-indigo-700', icon: Building2 },
  other: { label: 'Outros', className: 'bg-slate-100 text-slate-600', icon: Building2 },
}

const statusMeta: Record<Partner['status'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  inactive: { label: 'Inativo', className: 'bg-red-50 text-red-600' },
}

export default function AdminParceirosPage() {
  const { partners, createPartner, updatePartner, deletePartner, isLoading } = useTenantData()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [removing, setRemoving] = useState<Partner | null>(null)
  const form = useZodForm(partnerSchema, EMPTY_PARTNER)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [city, setCity] = useState('all')
  const [status, setStatus] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const cities = useMemo(
    () => [...new Set(partners.map(p => p.city).filter((v): v is string => Boolean(v)))].sort(),
    [partners],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return partners.filter(partner => {
      if (category !== 'all' && partner.category !== category) return false
      if (city !== 'all' && partner.city !== city) return false
      if (status !== 'all' && partner.status !== status) return false
      if (!term) return true
      return [partner.name, partner.tagline, partner.city, partner.address, ...(partner.specialties ?? [])].some(
        field => field?.toLowerCase().includes(term),
      )
    })
  }, [partners, search, category, city, status])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  const selected = partners.find(p => p.id === selectedId) ?? visible[0] ?? null

  const countBy = (predicate: (p: Partner) => boolean) => partners.filter(predicate).length

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function openCreate() {
    form.reset(EMPTY_PARTNER)
    setCreating(true)
  }

  function openEdit(partner: Partner) {
    form.reset({
      name: partner.name,
      tagline: partner.tagline ?? '',
      category: partner.category,
      discountPercent: String(partner.discountPercent),
      address: partner.address,
      city: partner.city ?? '',
      phone: partner.phone,
      email: partner.email ?? '',
      website: partner.website ?? '',
      specialties: (partner.specialties ?? []).join(', '),
    })
    setEditing(partner)
  }

  async function submitPartner(existing: Partner | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'

    const duplicate = partners.some(
      partner =>
        partner.id !== existing?.id &&
        partner.name.toLowerCase() === data.name.toLowerCase() &&
        partner.city === data.city,
    )
    if (duplicate) return 'Já existe um parceiro com este nome nesta cidade.'

    const payload = {
      name: data.name,
      tagline: data.tagline || undefined,
      category: data.category as Partner['category'],
      discountPercent: data.discountPercent,
      address: data.address,
      city: data.city,
      phone: formatPhone(data.phone),
      email: data.email || undefined,
      website: data.website || undefined,
      specialties: data.specialties
        ? data.specialties.split(',').map(item => item.trim()).filter(Boolean)
        : [],
      status: existing?.status ?? ('active' as Partner['status']),
    }

    if (existing) {
      await updatePartner(existing.id, payload)
      toast.success('Parceiro atualizado', { description: data.name })
    } else {
      await createPartner({ ...payload, since: new Date() })
      toast.success('Parceiro credenciado', { description: data.name })
    }
  }

  async function toggleStatus(partner: Partner) {
    const next = partner.status === 'active' ? 'inactive' : 'active'
    await updatePartner(partner.id, { status: next })
    toast.success(next === 'active' ? 'Parceiro reativado' : 'Parceiro descredenciado', {
      description: partner.name,
    })
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rede de Parceiros"
        description="Encontre clínicas, laboratórios, profissionais e parceiros credenciados."
      >
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo Parceiro
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          accent="primary"
          value={countBy(p => p.status === 'active').toLocaleString('pt-BR')}
          label="Parceiros ativos"
        />
        <StatCard
          icon={Stethoscope}
          accent="info"
          value={countBy(p => p.category === 'health').toLocaleString('pt-BR')}
          label="Clínicas e consultórios"
        />
        <StatCard
          icon={FlaskConical}
          accent="success"
          value={countBy(p => p.category === 'pharmacy' || p.category === 'wellness').toLocaleString('pt-BR')}
          label="Laboratórios e exames"
        />
        <StatCard
          icon={Smile}
          accent="warning"
          value={countBy(p => !['health', 'pharmacy', 'wellness'].includes(p.category)).toLocaleString('pt-BR')}
          label="Odontologia e outros"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput
            value={search}
            onChange={withPageReset(setSearch)}
            placeholder="Buscar por nome, especialidade, cidade ou serviço..."
          />
          <FilterSelect
            label="Categoria"
            value={category}
            onChange={withPageReset(setCategory)}
            allLabel="Todas"
            options={Object.entries(categoryMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
          <FilterSelect
            label="Cidade"
            value={city}
            onChange={withPageReset(setCity)}
            allLabel="Todas"
            options={cities.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={withPageReset(setStatus)}
            allLabel="Todos"
            options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="gap-0 py-0 shadow-sm xl:col-span-8">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="w-10 py-3 pl-4">
                      <Checkbox aria-label="Selecionar todos" />
                    </th>
                    <th className="px-4 py-3 font-medium">Nome / Razão Social</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Cidade</th>
                    <th className="px-4 py-3 font-medium">Telefone</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        Nenhum parceiro encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                  {visible.map(partner => {
                    const meta = categoryMeta[partner.category]
                    const Icon = meta.icon
                    const isSelected = selected?.id === partner.id
                    return (
                      <tr
                        key={partner.id}
                        onClick={() => setSelectedId(partner.id)}
                        className={cn(
                          'cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40',
                          isSelected && 'bg-primary/5',
                        )}
                      >
                        <td className="py-3 pl-4" onClick={event => event.stopPropagation()}>
                          <Checkbox aria-label={`Selecionar ${partner.name}`} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                                meta.className,
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-primary">{partner.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {partner.tagline}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill label={meta.label} className={meta.className} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{partner.city}</td>
                        <td className="px-4 py-3 text-muted-foreground">{partner.phone}</td>
                        <td className="px-4 py-3">
                          <StatusPill {...statusMeta[partner.status]} />
                        </td>
                        <td className="px-4 py-3 text-right" onClick={event => event.stopPropagation()}>
                          <PartnerActions
                            partner={partner}
                            onEdit={() => openEdit(partner)}
                            onToggle={() => toggleStatus(partner)}
                            onRemove={() => setRemoving(partner)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>

          <TableFooter
            page={currentPage}
            perPage={perPage}
            total={filtered.length}
            noun="parceiros"
            onPageChange={setPage}
            onPerPageChange={withPageReset(setPerPage)}
          />
        </Card>

        <div className="xl:col-span-4">
          {selected ? (
            <PartnerPanel partner={selected} onEdit={() => openEdit(selected)} />
          ) : (
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <EmptyState
                  icon={Building2}
                  title="Selecione um parceiro"
                  description="Clique em uma linha da lista para ver os detalhes do credenciado."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? 'Editar parceiro' : 'Novo parceiro'}
        description={
          editing
            ? 'Atualize os dados do credenciado da rede.'
            : 'Credencie um novo parceiro na rede de benefícios.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Credenciar parceiro'}
        size="lg"
        onSubmit={() => submitPartner(editing)}
      >
        <FormRow>
          <FormField label="Nome / Razão social" htmlFor="partner-name" error={form.errors.name} required>
            <Input
              id="partner-name"
              value={form.values.name}
              onChange={event => form.setField('name', event.target.value)}
              aria-invalid={!!form.errors.name}
            />
          </FormField>
          <FormField label="Categoria" error={form.errors.category} required>
            <FormSelect
              value={form.values.category}
              onChange={value => form.setField('category', value)}
              placeholder="Selecione a categoria"
              options={Object.entries(categoryMeta).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              invalid={!!form.errors.category}
            />
          </FormField>
        </FormRow>

        <FormField label="Frase de apresentação" htmlFor="partner-tagline" error={form.errors.tagline}>
          <Input
            id="partner-tagline"
            placeholder="Cuidando de você sempre"
            value={form.values.tagline}
            onChange={event => form.setField('tagline', event.target.value)}
          />
        </FormField>

        <FormRow>
          <FormField label="Endereço" htmlFor="partner-address" error={form.errors.address} required>
            <Input
              id="partner-address"
              value={form.values.address}
              onChange={event => form.setField('address', event.target.value)}
              aria-invalid={!!form.errors.address}
            />
          </FormField>
          <FormField label="Cidade" htmlFor="partner-city" error={form.errors.city} required>
            <Input
              id="partner-city"
              placeholder="Cabo Frio - RJ"
              value={form.values.city}
              onChange={event => form.setField('city', event.target.value)}
              aria-invalid={!!form.errors.city}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Telefone" htmlFor="partner-phone" error={form.errors.phone} required hint="Com DDD">
            <Input
              id="partner-phone"
              value={form.values.phone}
              onChange={event => form.setField('phone', event.target.value)}
              aria-invalid={!!form.errors.phone}
            />
          </FormField>
          <FormField
            label="Desconto (%)"
            htmlFor="partner-discount"
            error={form.errors.discountPercent}
            required
          >
            <Input
              id="partner-discount"
              inputMode="decimal"
              value={form.values.discountPercent}
              onChange={event => form.setField('discountPercent', event.target.value)}
              aria-invalid={!!form.errors.discountPercent}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="E-mail" htmlFor="partner-email" error={form.errors.email}>
            <Input
              id="partner-email"
              type="email"
              value={form.values.email}
              onChange={event => form.setField('email', event.target.value)}
              aria-invalid={!!form.errors.email}
            />
          </FormField>
          <FormField label="Site" htmlFor="partner-website" error={form.errors.website}>
            <Input
              id="partner-website"
              value={form.values.website}
              onChange={event => form.setField('website', event.target.value)}
            />
          </FormField>
        </FormRow>

        <FormField
          label="Especialidades"
          htmlFor="partner-specialties"
          error={form.errors.specialties}
          hint="Separe por vírgula: Clínica Geral, Cardiologia"
        >
          <Input
            id="partner-specialties"
            value={form.values.specialties}
            onChange={event => form.setField('specialties', event.target.value)}
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Excluir parceiro"
        description={
          removing
            ? `"${removing.name}" será removido da rede credenciada. Para apenas suspender o atendimento, use "Descredenciar" em vez de excluir.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          await deletePartner(removing.id)
          toast.success('Parceiro excluído', { description: removing.name })
        }}
      />
    </div>
  )
}

function PartnerPanel({ partner, onEdit }: { partner: Partner; onEdit: () => void }) {
  const meta = categoryMeta[partner.category]
  const Icon = meta.icon

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', meta.className)}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-base font-bold text-foreground">{partner.name}</h2>
            <StatusPill {...statusMeta[partner.status]} />
          </div>
          <p className="text-xs text-muted-foreground">
            {partner.since
              ? `Parceiro desde ${new Date(partner.since).toLocaleDateString('pt-BR')}`
              : partner.tagline}
          </p>
        </div>
      </div>

      <Tabs defaultValue="visao" className="gap-0">
        <SectionTabsList className="px-2">
          <SectionTab value="visao">Visão geral</SectionTab>
          <SectionTab value="servicos">Serviços</SectionTab>
          <SectionTab value="horarios">Horários</SectionTab>
        </SectionTabsList>

        <TabsContent value="visao" className="m-0 space-y-3 p-4">
          <div
            className={cn(
              'flex h-32 items-center justify-center rounded-xl bg-linear-to-br',
              'from-muted to-card',
            )}
          >
            <Icon className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <dl className="space-y-2.5 text-sm">
            <PanelLine icon={Tag}>{meta.label}</PanelLine>
            <PanelLine icon={Stethoscope}>{(partner.specialties ?? []).join(', ') || '—'}</PanelLine>
            <PanelLine icon={MapPin}>
              {partner.address}
              <br />
              <span className="text-muted-foreground">{partner.city}</span>
            </PanelLine>
            <PanelLine icon={Phone}>{partner.phone}</PanelLine>
            <PanelLine icon={Mail}>{partner.email ?? '—'}</PanelLine>
            <PanelLine icon={Globe}>{partner.website ?? '—'}</PanelLine>
          </dl>
        </TabsContent>

        <TabsContent value="servicos" className="m-0 space-y-2 p-4">
          {(partner.specialties ?? []).map(item => (
            <div
              key={item}
              className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5 text-sm"
            >
              <span className="text-foreground">{item}</span>
              <span className="text-xs font-medium text-emerald-600">
                {partner.discountPercent}% off
              </span>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="horarios" className="m-0 space-y-2 p-4 text-sm">
          {[
            ['Segunda a sexta', '08h às 18h'],
            ['Sábado', '08h às 12h'],
            ['Domingo e feriados', 'Fechado'],
          ].map(([day, hours]) => (
            <div
              key={day}
              className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span className="text-foreground">{day}</span>
              <span className="text-muted-foreground">{hours}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <div className="flex gap-2 border-t border-border p-4">
        <Button variant="outline" className="flex-1 gap-2" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
        <Button className="flex-1 gap-2">
          <MapPin className="h-4 w-4" />
          Ver no mapa
        </Button>
      </div>
    </Card>
  )
}

function PanelLine({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 wrap-break-word text-foreground">{children}</span>
    </div>
  )
}

function PartnerActions({
  partner,
  onEdit,
  onToggle,
  onRemove,
}: {
  partner: Partner
  onEdit: () => void
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações do parceiro</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar parceiro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          <MapPin className="mr-2 h-4 w-4" />
          {partner.status === 'active' ? 'Descredenciar' : 'Reativar'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onRemove}>
          Excluir cadastro
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
