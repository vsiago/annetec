'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CircleCheckBig,
  Clock,
  CreditCard,
  Download,
  IdCard,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { toast } from 'sonner'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
  FormSelect,
} from '@/components/dashboard/form-dialog'
import { useTenant } from '@/contexts/tenant-context'
import { getAllClients, getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { formatCurrency, monthKeyOf } from '@/lib/analytics'
import { beneficiarioSchema, formatCpf, formatPhone } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import type { Client } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'

const statusMeta: Record<Client['planStatus'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelado', className: 'bg-red-50 text-red-600' },
}

const EMPTY_BENEFICIARIO = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  plan: '',
  sellerId: '',
  city: '',
}

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
]

export default function AdminBeneficiariosPage() {
  const { tenant } = useTenant()
  const { users, clientPlans, createUser, updateUser, deleteUser, isLoading } = useTenantData()

  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [removing, setRemoving] = useState<Client | null>(null)
  const [viewCardClient, setViewCardClient] = useState<Client | null>(null)
  const form = useZodForm(beneficiarioSchema, EMPTY_BENEFICIARIO)

  const clients = getAllClients(users)
  const sellers = getAllSellers(users)

  const planPrices = useMemo(
    () => new Map(clientPlans.map(item => [item.name, item.priceMonthly])),
    [clientPlans],
  )

  const active = clients.filter(client => client.planStatus === 'active')
  const pending = clients.filter(client => client.planStatus === 'pending')
  const currentMonth = monthKeyOf(new Date())
  const newThisMonth = clients.filter(client => monthKeyOf(client.contractDate) === currentMonth).length
  const recurring = active.reduce((sum, client) => sum + (planPrices.get(client.plan) ?? 0), 0)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clients
      .filter(client => {
        if (plan !== 'all' && client.plan !== plan) return false
        if (status !== 'all' && client.planStatus !== status) return false
        if (!term) return true
        return [client.name, client.email, client.cpf, client.cardNumber, client.city].some(field =>
          field?.toLowerCase().includes(term),
        )
      })
      .sort((a, b) => new Date(b.contractDate).getTime() - new Date(a.contractDate).getTime())
  }, [clients, search, plan, status])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function openCreate() {
    form.reset({
      ...EMPTY_BENEFICIARIO,
      plan: clientPlans[0]?.name ?? '',
      sellerId: sellers[0]?.id ?? '',
    })
    setCreating(true)
  }

  function openEdit(client: Client) {
    form.reset({
      name: client.name,
      email: client.email,
      cpf: client.cpf,
      phone: client.phone ?? '',
      plan: client.plan,
      sellerId: client.sellerId,
      city: client.city ?? '',
    })
    setEditing(client)
  }

  async function submitClient(existing: Client | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'
    if (!tenant) return 'Inquilino não carregado. Recarregue a página.'

    // CPF é a chave do beneficiário na carteira: dois cadastros com o mesmo
    // documento quebram carteirinha, cobrança e elegibilidade lá na frente.
    const cpfTaken = clients.some(
      client =>
        client.id !== existing?.id && client.cpf.replace(/\D/g, '') === data.cpf.replace(/\D/g, ''),
    )
    if (cpfTaken) return 'Já existe um beneficiário com este CPF nesta carteira.'

    const shared = {
      name: data.name,
      email: data.email,
      phone: formatPhone(data.phone),
      cpf: formatCpf(data.cpf),
      plan: data.plan,
      sellerId: data.sellerId,
      city: data.city || undefined,
    }

    if (existing) {
      const result = await updateUser(existing.id, shared)
      if (!result.success) return result.error ?? 'Não foi possível salvar as alterações.'
      toast.success('Cadastro atualizado', { description: data.name })
      return
    }

    const result = await createUser({
      ...shared,
      id: '',
      tenantId: tenant.id,
      role: 'client',
      planStatus: 'pending',
      contractDate: new Date(),
      cardNumber: `MC-${new Date().getFullYear()}-${String(clients.length + 1).padStart(5, '0')}`,
      dependents: [],
      createdAt: new Date(),
      password: 'trocar123',
    })

    if (!result.success) return result.error ?? 'Não foi possível cadastrar o beneficiário.'
    toast.success('Beneficiário cadastrado', {
      description: `${data.name} entrou como pendente de ativação.`,
    })
  }

  /**
   * A situação do plano nasce da ADESÃO, não desta tela: quando o inquilino
   * opera integrado, quem a define é o contrato na Digital Saúde; quando não,
   * é a venda no CRM. Não existe rota que grave o campo direto, então aqui se
   * avisa em vez de exibir "ativado" sobre uma gravação que não aconteceu.
   */
  async function activate(client: Client) {
    const result = await updateUser(client.id, { planStatus: 'active' })
    if (!result.success) {
      toast.error('Ativação não concluída', {
        description: result.error ?? 'A situação do plano vem da adesão.',
      })
      return
    }
    toast.success('Plano ativado', { description: client.name })
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Beneficiários"
        description="Gerencie a carteira de associados, planos e carteirinhas digitais."
      >
        <Button variant="outline" className="h-11 gap-2">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo beneficiário
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="primary"
          value={active.length.toLocaleString('pt-BR')}
          label="Beneficiários ativos"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={UserPlus}
          accent="success"
          value={newThisMonth.toLocaleString('pt-BR')}
          label="Novas adesões no mês"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CreditCard}
          accent="info"
          value={formatCurrency(Math.round(recurring))}
          label="Mensalidade recorrente"
          delta={{ value: '15%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={pending.length.toLocaleString('pt-BR')}
          label="Cadastros pendentes"
          hint="aguardando ativação"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput
            value={search}
            onChange={withPageReset(setSearch)}
            placeholder="Buscar por nome, CPF, e-mail ou nº do beneficiário..."
          />
          <FilterSelect
            label="Plano"
            value={plan}
            onChange={withPageReset(setPlan)}
            allLabel="Todos"
            options={clientPlans.map(item => ({ value: item.name, label: item.name }))}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={withPageReset(setStatus)}
            allLabel="Todos"
            options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
          <Button variant="outline" className="h-14 gap-2 rounded-xl">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            Mais filtros
          </Button>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Beneficiário</th>
                  <th className="px-4 py-3 font-medium">Contato</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Nº do beneficiário</th>
                  <th className="px-4 py-3 font-medium">Cidade</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Desde</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Nenhum beneficiário encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
                {visible.map((client, index) => (
                  <tr key={client.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback
                            className={cn('text-xs font-semibold', AVATAR_TONES[index % AVATAR_TONES.length])}
                          >
                            {getInitials(client.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <Link
                            href={`/${tenant?.slug}/admin/clientes/${client.id}`}
                            className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {client.name}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            {client.cpf}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block truncate text-foreground">{client.phone}</span>
                      <span className="block truncate text-xs text-muted-foreground">{client.email}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{client.plan}</td>
                    <td className="px-4 py-3 text-muted-foreground">{client.cardNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{client.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusPill {...statusMeta[client.planStatus]} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(client.contractDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações do beneficiário</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem asChild>
                            <Link href={`/${tenant?.slug}/admin/clientes/${client.id}`}>
                              <IdCard className="mr-2 h-4 w-4" />
                              Ver ficha completa
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setViewCardClient(client)}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Ver carteirinha
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(client)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar cadastro
                          </DropdownMenuItem>
                          {client.planStatus === 'pending' && (
                            <DropdownMenuItem onClick={() => activate(client)}>
                              <CircleCheckBig className="mr-2 h-4 w-4" />
                              Ativar plano
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoving(client)}
                          >
                            Excluir cadastro
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
          noun="beneficiários"
          onPageChange={setPage}
          onPerPageChange={withPageReset(setPerPage)}
        />
      </Card>

      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? 'Editar beneficiário' : 'Novo beneficiário'}
        description={
          editing
            ? 'Atualize os dados cadastrais do associado.'
            : 'O cadastro entra como pendente até a ativação do plano.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Cadastrar'}
        size="lg"
        onSubmit={() => submitClient(editing)}
      >
        <FormField label="Nome completo" htmlFor="ben-name" error={form.errors.name} required>
          <Input
            id="ben-name"
            value={form.values.name}
            onChange={event => form.setField('name', event.target.value)}
            aria-invalid={!!form.errors.name}
          />
        </FormField>

        <FormRow>
          <FormField label="CPF" htmlFor="ben-cpf" error={form.errors.cpf} required>
            <Input
              id="ben-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={form.values.cpf}
              onChange={event => form.setField('cpf', event.target.value)}
              aria-invalid={!!form.errors.cpf}
            />
          </FormField>
          <FormField label="Telefone" htmlFor="ben-phone" error={form.errors.phone} required hint="Com DDD">
            <Input
              id="ben-phone"
              value={form.values.phone}
              onChange={event => form.setField('phone', event.target.value)}
              aria-invalid={!!form.errors.phone}
            />
          </FormField>
        </FormRow>

        <FormField label="E-mail" htmlFor="ben-email" error={form.errors.email} required>
          <Input
            id="ben-email"
            type="email"
            value={form.values.email}
            onChange={event => form.setField('email', event.target.value)}
            aria-invalid={!!form.errors.email}
          />
        </FormField>

        <FormRow>
          <FormField label="Plano" error={form.errors.plan} required>
            <FormSelect
              value={form.values.plan}
              onChange={value => form.setField('plan', value)}
              placeholder="Selecione o plano"
              options={clientPlans.map(item => ({
                value: item.name,
                label: `${item.name} — ${formatCurrency(item.priceMonthly)}`,
              }))}
              invalid={!!form.errors.plan}
            />
          </FormField>
          <FormField label="Vendedor responsável" error={form.errors.sellerId} required>
            <FormSelect
              value={form.values.sellerId}
              onChange={value => form.setField('sellerId', value)}
              placeholder="Selecione o vendedor"
              options={sellers.map(seller => ({ value: seller.id, label: seller.name }))}
              invalid={!!form.errors.sellerId}
            />
          </FormField>
        </FormRow>

        <FormField label="Cidade" htmlFor="ben-city" error={form.errors.city}>
          <Input
            id="ben-city"
            placeholder="Cabo Frio - RJ"
            value={form.values.city}
            onChange={event => form.setField('city', event.target.value)}
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Excluir beneficiário"
        description={
          removing
            ? `O cadastro de "${removing.name}" e o acesso dele ao portal serão removidos. Para encerrar o contrato mantendo o histórico, cancele o plano em vez de excluir.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteUser(removing.id)
          if (!result.success) {
            toast.error(result.error ?? 'Não foi possível excluir o cadastro')
            return
          }
          toast.success('Beneficiário excluído', { description: removing.name })
        }}
      />

      <Dialog open={!!viewCardClient} onOpenChange={open => !open && setViewCardClient(null)}>
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <DialogTitle>Carteirinha digital</DialogTitle>
            <DialogDescription>{viewCardClient?.name}</DialogDescription>
          </DialogHeader>
          {viewCardClient && (
            <DigitalCardMockup
              tenant={tenant}
              clientName={viewCardClient.name}
              cardNumber={viewCardClient.cardNumber}
              planName={viewCardClient.plan}
              cpf={viewCardClient.cpf}
              contractDate={viewCardClient.contractDate}
              dependentsCount={viewCardClient.dependents.length}
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CircleCheckBig className="h-3.5 w-3.5 text-emerald-500" />
        Carteira de {clients.length.toLocaleString('pt-BR')} beneficiários em {tenant?.name}.
      </div>
    </div>
  )
}
