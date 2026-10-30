'use client'

import { downloadCsv } from '@/lib/download-csv'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Ban,
  CircleCheckBig,
  Clock,
  CreditCard,
  Download,
  IdCard,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Unlock,
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
} from '@/components/dashboard/form-dialog'
import { useTenant } from '@/contexts/tenant-context'
import { getAllClients, useTenantData } from '@/contexts/tenant-data-context'
import { formatCurrency, monthKeyOf } from '@/lib/analytics'
import { beneficiarioSchema, formatCpf, formatPhone } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import type { Client, MemberAccessStatus } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'

const statusMeta: Record<Client['planStatus'], { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pendente', className: 'bg-amber-50 text-amber-700' },
  cancelled: { label: 'Cancelado', className: 'bg-red-50 text-red-600' },
}

/** Situação do vínculo com o clube (`accessStatus`) — independente da situação do plano. */
const accessMeta: Record<MemberAccessStatus, { label: string; filterLabel: string; className: string }> = {
  active: { label: 'Ativo', filterLabel: 'Ativos', className: 'bg-emerald-50 text-emerald-700' },
  removed: { label: 'Removido', filterLabel: 'Removidos', className: 'bg-slate-100 text-slate-600' },
  blocked: { label: 'Bloqueado', filterLabel: 'Bloqueados', className: 'bg-red-50 text-red-600' },
}

function accessOf(client: Client): MemberAccessStatus {
  return client.accessStatus ?? (client.active === false ? 'removed' : 'active')
}

const EXCLUIR_DESCRICAO =
  'A assinatura será cancelada e o acesso removido. Se a pessoa voltar pelo site, o cadastro e o histórico são reativados e ela precisará assinar um plano de novo.'

const BLOQUEAR_DESCRICAO =
  'A pessoa não conseguirá mais entrar nem se cadastrar de novo com este e-mail neste clube.'

/**
 * Plano, vendedor e cidade não têm rota de escrita (nascem da adesão): o
 * formulário só valida e envia os dados da conta.
 */
const beneficiarioContaSchema = beneficiarioSchema.pick({
  name: true,
  email: true,
  cpf: true,
  phone: true,
})

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
  const { users, clientPlans, createUser, updateUser, deleteUser, blockUser, unblockUser, isLoading } =
    useTenantData()

  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [access, setAccess] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [removing, setRemoving] = useState<Client | null>(null)
  const [blocking, setBlocking] = useState<Client | null>(null)
  const [viewCardClient, setViewCardClient] = useState<Client | null>(null)
  const form = useZodForm(beneficiarioContaSchema, EMPTY_BENEFICIARIO)

  // A lista traz todo vínculo (ativos, removidos e bloqueados); os
  // indicadores contam só a carteira ativa.
  const clients = getAllClients(users)
  const activeClients = clients.filter(client => accessOf(client) === 'active')

  const planPrices = useMemo(
    () => new Map(clientPlans.map(item => [item.name, item.priceMonthly])),
    [clientPlans],
  )

  const active = activeClients.filter(client => client.planStatus === 'active')
  const pending = activeClients.filter(client => client.planStatus === 'pending')
  const currentMonth = monthKeyOf(new Date())
  const newThisMonth = activeClients.filter(client => monthKeyOf(client.contractDate) === currentMonth).length
  const recurring = active.reduce((sum, client) => sum + (planPrices.get(client.plan) ?? 0), 0)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return clients
      .filter(client => {
        if (plan !== 'all' && client.plan !== plan) return false
        if (status !== 'all' && client.planStatus !== status) return false
        if (access !== 'all' && accessOf(client) !== access) return false
        if (!term) return true
        return [client.name, client.email, client.cpf, client.cardNumber, client.city].some(field =>
          field?.toLowerCase().includes(term),
        )
      })
      .sort((a, b) => new Date(b.contractDate).getTime() - new Date(a.contractDate).getTime())
  }, [clients, search, plan, status, access])

  function exportClients() {
    downloadCsv('contas-de-acesso.csv', [
      ['Nome', 'E-mail', 'CPF', 'Telefone', 'Cidade', 'Plano', 'Situação do plano', 'Carteirinha', 'Contrato em'],
      ...filtered.map(client => [
        client.name,
        client.email,
        client.cpf,
        client.phone ?? '',
        client.city ?? '',
        client.plan,
        statusMeta[client.planStatus].label,
        client.cardNumber,
        new Date(client.contractDate).toLocaleDateString('pt-BR'),
      ]),
    ])
  }

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
    form.reset(EMPTY_BENEFICIARIO)
    setCreating(true)
  }

  function openEdit(client: Client) {
    form.reset({
      name: client.name,
      email: client.email,
      cpf: client.cpf,
      phone: client.phone ?? '',
      plan: '',
      sellerId: '',
      city: '',
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
    }

    if (existing) {
      const result = await updateUser(existing.id, shared)
      if (!result.success) return result.error ?? 'Não foi possível salvar as alterações.'
      toast.success('Cadastro atualizado', { description: data.name })
      return
    }

    // Só a conta e o CPF nascem aqui. Carteirinha, plano e situação vêm da
    // adesão (a carteirinha é emitida na confirmação do pagamento); senha o
    // associado não tem — entra pelo portal com CPF e e-mail ou Google.
    const result = await createUser({
      name: shared.name,
      email: shared.email,
      phone: shared.phone,
      cpf: shared.cpf,
      role: 'client',
    })

    if (!result.success) return result.error ?? 'Não foi possível cadastrar o beneficiário.'
    toast.success('Beneficiário cadastrado', {
      description: `${data.name} recebeu as boas-vindas do clube por e-mail. Plano e carteirinha nascem da adesão.`,
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

  async function unblock(client: Client) {
    const result = await unblockUser(client.id)
    if (!result.success) {
      toast.error('Desbloqueio não concluído', {
        description: result.error ?? 'Não foi possível desbloquear o acesso.',
      })
      return
    }
    toast.success('Acesso desbloqueado', {
      description: `${client.name} pode voltar pelo site e assinar um plano de novo.`,
    })
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contas de acesso"
        description="Quem tem cadastro e acesso ao portal do clube: dados, carteirinha e bloqueio. Planos e pagamentos ficam em Associados."
      >
        <Button variant="outline" className="h-11 gap-2" onClick={exportClients}>
          <Download className="h-4 w-4" />
          Exportar lista
        </Button>
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo associado
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="primary"
          value={active.length.toLocaleString('pt-BR')}
          label="Beneficiários ativos"
        />
        <StatCard
          icon={UserPlus}
          accent="success"
          value={newThisMonth.toLocaleString('pt-BR')}
          label="Novas adesões no mês"
        />
        <StatCard
          icon={CreditCard}
          accent="info"
          value={formatCurrency(Math.round(recurring))}
          label="Mensalidade recorrente"
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
          <FilterSelect
            label="Acesso"
            value={access}
            onChange={withPageReset(setAccess)}
            allLabel="Todos"
            options={Object.entries(accessMeta).map(([value, meta]) => ({ value, label: meta.filterLabel }))}
          />
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
                  <th className="px-4 py-3 font-medium">Acesso</th>
                  <th className="px-4 py-3 font-medium">Desde</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      Nenhum beneficiário encontrado com os filtros atuais.
                    </td>
                  </tr>
                )}
                {visible.map((client, index) => {
                  const clientAccess = accessOf(client)
                  return (
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
                      <span className="block truncate text-foreground">{client.phone || '—'}</span>
                      <span className="block truncate text-xs text-muted-foreground">{client.email}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{client.plan}</td>
                    <td className="px-4 py-3 text-muted-foreground">{client.cardNumber || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{client.city ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusPill {...statusMeta[client.planStatus]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill {...accessMeta[clientAccess]} />
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
                          {clientAccess === 'active' && client.planStatus === 'pending' && (
                            <DropdownMenuItem onClick={() => activate(client)}>
                              <CircleCheckBig className="mr-2 h-4 w-4" />
                              Ativar plano
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {clientAccess === 'blocked' ? (
                            <DropdownMenuItem onClick={() => void unblock(client)}>
                              <Unlock className="mr-2 h-4 w-4" />
                              Desbloquear
                            </DropdownMenuItem>
                          ) : (
                            <>
                              {clientAccess === 'active' && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setRemoving(client)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir cadastro
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setBlocking(client)}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Bloquear acesso
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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

        {editing && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Plano: <strong className="text-foreground">{editing.plan || '—'}</strong>
            {' · '}Cidade: <strong className="text-foreground">{editing.city || '—'}</strong>. Esses dados vêm da adesão
            e não são editados aqui.
          </p>
        )}
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title={removing ? `Excluir cadastro de ${removing.name}?` : 'Excluir cadastro'}
        description={EXCLUIR_DESCRICAO}
        confirmLabel="Excluir cadastro"
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteUser(removing.id)
          if (!result.success) {
            toast.error('Cadastro não excluído', {
              description: result.error ?? 'Não foi possível excluir o cadastro.',
            })
            return
          }
          toast.success('Cadastro excluído', {
            description: `${removing.name}: assinatura cancelada e acesso removido.`,
          })
        }}
      />

      <ConfirmDialog
        open={blocking !== null}
        onOpenChange={open => !open && setBlocking(null)}
        title={blocking ? `Bloquear o acesso de ${blocking.name}?` : 'Bloquear acesso'}
        description={BLOQUEAR_DESCRICAO}
        confirmLabel="Bloquear acesso"
        onConfirm={async () => {
          if (!blocking) return
          const result = await blockUser(blocking.id)
          if (!result.success) {
            toast.error('Acesso não bloqueado', {
              description: result.error ?? 'Não foi possível bloquear o acesso.',
            })
            return
          }
          toast.success('Acesso bloqueado', { description: blocking.name })
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
              cardNumber={viewCardClient.cardNumber || '—'}
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
        Carteira de {activeClients.length.toLocaleString('pt-BR')} beneficiários ativos em {tenant?.name}.
      </div>
    </div>
  )
}
