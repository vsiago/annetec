'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  Filter,
  Handshake,
  ListFilter,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
  FormSelect,
} from '@/components/dashboard/form-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { formatDelta, monthKeyOf, percentChange } from '@/lib/analytics'
import { formatPhone, leadSchema } from '@/lib/form-schemas'
import { FOLLOW_UP_STATUSES, leadStatusMeta } from '@/lib/lead-status'
import type { Lead, LeadStatus } from '@/lib/types'
import { useZodForm } from '@/lib/use-zod-form'
import { cn, getInitials } from '@/lib/utils'

const EMPTY_LEAD = {
  name: '',
  email: '',
  phone: '',
  source: 'Site',
  status: 'new',
  interest: '',
  value: '',
  sellerId: '',
  notes: '',
}

/** Tons de fundo do avatar, só para a lista não virar um bloco monocromático. */
const AVATAR_TONES = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]

export default function AdminLeadsPage() {
  const { leads, users, createLead, updateLead, deleteLead, addLeadInteraction, isLoading } =
    useTenantData()
  const sellers = getAllSellers(users)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [removing, setRemoving] = useState<Lead | null>(null)
  const [contacting, setContacting] = useState<Lead | null>(null)
  const [interaction, setInteraction] = useState({ type: 'call', description: '' })
  const form = useZodForm(leadSchema, EMPTY_LEAD)

  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [seller, setSeller] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])

  const sellerNames = useMemo(
    () => new Map(sellers.map(s => [s.id, s.name])),
    [sellers],
  )
  const sources = useMemo(
    () => [...new Set(leads.map(lead => lead.source).filter(Boolean))].sort(),
    [leads],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads
      .filter(lead => {
        if (status !== 'all' && lead.status !== status) return false
        if (source !== 'all' && lead.source !== source) return false
        if (seller !== 'all' && lead.sellerId !== seller) return false
        if (!term) return true
        return [lead.name, lead.email, lead.phone, lead.source].some(field =>
          field?.toLowerCase().includes(term),
        )
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [leads, search, status, source, seller])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  const countBy = (predicate: (lead: Lead) => boolean) => leads.filter(predicate).length
  const deltaBy = (predicate: (lead: Lead) => boolean) => {
    const now = new Date()
    const current = monthKeyOf(now)
    const previous = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const inMonth = (key: string) =>
      leads.filter(lead => monthKeyOf(lead.createdAt) === key && predicate(lead)).length
    return formatDelta(percentChange(inMonth(current), inMonth(previous)))
  }

  const isNegotiating = (lead: Lead) => lead.status === 'negotiation'
  const isConverted = (lead: Lead) => lead.status === 'closed'
  const isFollowUp = (lead: Lead) => FOLLOW_UP_STATUSES.includes(lead.status)

  const allVisibleSelected = visible.length > 0 && visible.every(lead => selected.includes(lead.id))

  function toggleAllVisible(checked: boolean) {
    const ids = visible.map(lead => lead.id)
    setSelected(prev =>
      checked ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id)),
    )
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected(prev => (checked ? [...prev, id] : prev.filter(item => item !== id)))
  }

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function openCreate() {
    form.reset({ ...EMPTY_LEAD, sellerId: sellers[0]?.id ?? '' })
    setCreating(true)
  }

  function openEdit(lead: Lead) {
    form.reset({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      interest: lead.interest ?? '',
      value: String(lead.value ?? ''),
      sellerId: lead.sellerId,
      notes: lead.notes ?? '',
    })
    setEditing(lead)
  }

  async function submitLead(existing: Lead | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'

    const payload = {
      name: data.name,
      email: data.email,
      phone: formatPhone(data.phone),
      source: data.source,
      status: data.status as LeadStatus,
      interest: data.interest || undefined,
      notes: data.notes ?? '',
      value: data.value,
      sellerId: data.sellerId,
    }

    if (existing) {
      await updateLead(existing.id, { ...payload, updatedAt: new Date() })
      toast.success('Lead atualizado', { description: data.name })
    } else {
      await createLead(payload)
      toast.success('Lead cadastrado', { description: data.name })
    }
  }

  const sellerOptions = sellers.map(seller => ({ value: seller.id, label: seller.name }))
  const statusOptions = Object.entries(leadStatusMeta).map(([value, meta]) => ({
    value,
    label: meta.label,
  }))
  const sourceOptions = ['Site', 'Indicação', 'Campanha', 'Evento', 'Redes Sociais', 'Parceiro'].map(
    item => ({ value: item, label: item }),
  )

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Acompanhe e converta seus leads em novos beneficiários."
      >
        <Button variant="outline" className="h-11 gap-2 px-5">
          <Upload className="h-4 w-4" />
          Importar Leads
        </Button>
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo Lead
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="primary"
          value={leads.length.toLocaleString('pt-BR')}
          label="Leads no período"
          delta={deltaBy(() => true)}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={Filter}
          accent="info"
          value={countBy(isNegotiating).toLocaleString('pt-BR')}
          label="Em negociação"
          delta={deltaBy(isNegotiating)}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={Handshake}
          accent="success"
          value={countBy(isConverted).toLocaleString('pt-BR')}
          label="Convertidos"
          delta={deltaBy(isConverted)}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={countBy(isFollowUp).toLocaleString('pt-BR')}
          label="Em acompanhamento"
          delta={deltaBy(isFollowUp)}
          comparison="vs. período anterior"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <SearchInput
            value={search}
            onChange={resetToFirstPage(setSearch)}
            placeholder="Buscar por nome, e-mail, telefone ou origem..."
          />

          <FilterSelect
            label="Origem"
            value={source}
            onChange={resetToFirstPage(setSource)}
            allLabel="Todas"
            options={sources.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={resetToFirstPage(setStatus)}
            allLabel="Todos"
            options={Object.entries(leadStatusMeta).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
          <FilterSelect
            label="Vendedor"
            value={seller}
            onChange={resetToFirstPage(setSeller)}
            allLabel="Todos"
            options={sellers.map(item => ({ value: item.id, label: item.name }))}
          />

          <Button variant="outline" className="h-14 gap-2 rounded-xl">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Período</span>
          </Button>
          <Button variant="outline" className="h-14 gap-2 rounded-xl">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Mais filtros</span>
          </Button>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="w-10 py-3 pl-4">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={value => toggleAllVisible(value === true)}
                      aria-label="Selecionar todos os leads da página"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Contato</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3 font-medium">Interesse</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Vendedor</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Nenhum lead encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
                {visible.map((lead, index) => (
                  <tr key={lead.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="py-3 pl-4">
                      <Checkbox
                        checked={selected.includes(lead.id)}
                        onCheckedChange={value => toggleOne(lead.id, value === true)}
                        aria-label={`Selecionar ${lead.name}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback
                            className={cn('text-xs font-semibold', AVATAR_TONES[index % AVATAR_TONES.length])}
                          >
                            {getInitials(lead.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{lead.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{lead.phone}</p>
                      <p className="text-xs text-muted-foreground">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.source}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.interest ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusPill {...leadStatusMeta[lead.status]} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sellerNames.get(lead.sellerId) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações do lead</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => openEdit(lead)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setInteraction({ type: 'call', description: '' })
                              setContacting(lead)
                            }}
                          >
                            <Phone className="mr-2 h-4 w-4" />
                            Registrar contato
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <a href={`mailto:${lead.email}`}>
                              <Mail className="mr-2 h-4 w-4" />
                              Enviar e-mail
                            </a>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoving(lead)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>

        <TableFooter
          page={currentPage}
          perPage={perPage}
          total={filtered.length}
          noun="leads"
          onPageChange={setPage}
          onPerPageChange={resetToFirstPage(setPerPage)}
        />
      </Card>

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? 'Editar lead' : 'Novo lead'}
        description={
          editing
            ? 'Atualize os dados do lead e a etapa em que ele está.'
            : 'Cadastre uma nova oportunidade no funil de vendas.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Cadastrar lead'}
        size="lg"
        onSubmit={() => submitLead(editing)}
      >
        <FormField label="Nome completo" htmlFor="lead-name" error={form.errors.name} required>
          <Input
            id="lead-name"
            value={form.values.name}
            onChange={event => form.setField('name', event.target.value)}
            aria-invalid={!!form.errors.name}
          />
        </FormField>

        <FormRow>
          <FormField label="E-mail" htmlFor="lead-email" error={form.errors.email} required>
            <Input
              id="lead-email"
              type="email"
              value={form.values.email}
              onChange={event => form.setField('email', event.target.value)}
              aria-invalid={!!form.errors.email}
            />
          </FormField>
          <FormField
            label="Telefone"
            htmlFor="lead-phone"
            error={form.errors.phone}
            required
            hint="Com DDD"
          >
            <Input
              id="lead-phone"
              value={form.values.phone}
              onChange={event => form.setField('phone', event.target.value)}
              aria-invalid={!!form.errors.phone}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Origem" error={form.errors.source} required>
            <FormSelect
              value={form.values.source}
              onChange={value => form.setField('source', value)}
              placeholder="Selecione a origem"
              options={sourceOptions}
              invalid={!!form.errors.source}
            />
          </FormField>
          <FormField label="Etapa do funil" error={form.errors.status} required>
            <FormSelect
              value={form.values.status}
              onChange={value => form.setField('status', value)}
              placeholder="Selecione a etapa"
              options={statusOptions}
              invalid={!!form.errors.status}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Interesse" htmlFor="lead-interest" error={form.errors.interest}>
            <Input
              id="lead-interest"
              placeholder="Plano Família"
              value={form.values.interest}
              onChange={event => form.setField('interest', event.target.value)}
            />
          </FormField>
          <FormField
            label="Valor estimado"
            htmlFor="lead-value"
            error={form.errors.value}
            required
            hint="Mensalidade em reais"
          >
            <Input
              id="lead-value"
              inputMode="decimal"
              placeholder="49,90"
              value={form.values.value}
              onChange={event => form.setField('value', event.target.value)}
              aria-invalid={!!form.errors.value}
            />
          </FormField>
        </FormRow>

        <FormField label="Vendedor responsável" error={form.errors.sellerId} required>
          <FormSelect
            value={form.values.sellerId}
            onChange={value => form.setField('sellerId', value)}
            placeholder="Selecione o vendedor"
            options={sellerOptions}
            invalid={!!form.errors.sellerId}
          />
        </FormField>

        <FormField label="Observações" htmlFor="lead-notes" error={form.errors.notes}>
          <Textarea
            id="lead-notes"
            value={form.values.notes}
            onChange={event => form.setField('notes', event.target.value)}
            className="min-h-20 resize-none"
          />
        </FormField>
      </FormDialog>

      <FormDialog
        open={contacting !== null}
        onOpenChange={open => !open && setContacting(null)}
        title="Registrar contato"
        description={contacting ? `Interação com ${contacting.name}.` : undefined}
        submitLabel="Registrar"
        onSubmit={async () => {
          if (!contacting) return
          if (interaction.description.trim().length < 3) {
            return 'Descreva o que foi tratado no contato.'
          }
          await addLeadInteraction(contacting.id, {
            type: interaction.type as 'call' | 'email' | 'meeting' | 'note',
            description: interaction.description.trim(),
            date: new Date(),
          })
          toast.success('Contato registrado', { description: contacting.name })
        }}
      >
        <FormField label="Tipo de contato" required>
          <FormSelect
            value={interaction.type}
            onChange={value => setInteraction(prev => ({ ...prev, type: value }))}
            placeholder="Selecione o tipo"
            options={[
              { value: 'call', label: 'Ligação' },
              { value: 'email', label: 'E-mail' },
              { value: 'meeting', label: 'Reunião' },
              { value: 'note', label: 'Anotação' },
            ]}
          />
        </FormField>
        <FormField label="Descrição" htmlFor="interaction-description" required>
          <Textarea
            id="interaction-description"
            value={interaction.description}
            onChange={event =>
              setInteraction(prev => ({ ...prev, description: event.target.value }))
            }
            placeholder="Resumo do que foi tratado..."
            className="min-h-24 resize-none"
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Excluir lead"
        description={
          removing
            ? `O lead "${removing.name}" e todo o histórico de interações dele serão removidos. Esta ação não pode ser desfeita.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          await deleteLead(removing.id)
          toast.success('Lead excluído', { description: removing.name })
        }}
      />
    </div>
  )
}
