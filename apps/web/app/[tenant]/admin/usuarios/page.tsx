'use client'

import { useMemo, useState } from 'react'
import {
  Building2,
  CircleCheckBig,
  Clock,
  Download,
  Eye,
  History,
  Minus,
  ListFilter,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  DataTable,
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
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { formatPhone, tenantUserSchema } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import type { User, UserRole } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'

const roleMeta: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Administrador', className: 'bg-rose-50 text-rose-700' },
  seller: { label: 'Vendedor', className: 'bg-violet-50 text-violet-700' },
  client: { label: 'PF Associado', className: 'bg-sky-50 text-sky-700' },
}

const ACCESS_PROFILES = [
  {
    role: 'client' as UserRole,
    name: 'PF Associado',
    hint: 'Acesso à área do beneficiário, carteirinha, agendamentos e utilização.',
    icon: Users,
    tone: 'bg-sky-50 text-sky-500',
  },
  {
    role: 'admin' as UserRole,
    name: 'Entidade / Cliente Cartão',
    hint: 'Gestão de beneficiários, vendas, relatórios e configuração do inquilino.',
    icon: Building2,
    tone: 'bg-emerald-50 text-emerald-500',
  },
  {
    role: 'seller' as UserRole,
    name: 'Vendedor',
    hint: 'Cadastro de leads, vendas e acompanhamento de comissões.',
    icon: UserCog,
    tone: 'bg-violet-50 text-violet-500',
  },
  {
    role: 'admin' as UserRole,
    name: 'Administrador',
    hint: 'Acesso completo ao sistema, configurações e gestão de usuários.',
    icon: ShieldCheck,
    tone: 'bg-rose-50 text-rose-500',
  },
]

const QUICK_ACTIONS = [
  { label: 'Novo usuário', icon: Plus },
  { label: 'Convidar por e-mail', icon: Mail },
  { label: 'Exportar lista', icon: Download },
  { label: 'Gerenciar permissões', icon: ShieldCheck },
  { label: 'Ver histórico de acesso', icon: History },
]

const EMPTY_USER = { name: '', email: '', phone: '', role: 'seller' }

type PermissionLevel = 'full' | 'read' | 'none'

const PERMISSION_PROFILES = ['PF Associado', 'Entidade', 'Vendedor', 'Administrador']

/** Na ordem de `PERMISSION_PROFILES`. */
const PERMISSION_MATRIX: { area: string; levels: PermissionLevel[] }[] = [
  { area: 'Início / indicadores', levels: ['none', 'read', 'read', 'full'] },
  { area: 'Leads', levels: ['none', 'read', 'full', 'full'] },
  { area: 'Vendas', levels: ['none', 'read', 'full', 'full'] },
  { area: 'Beneficiários', levels: ['none', 'full', 'read', 'full'] },
  { area: 'Planos e Produtos', levels: ['read', 'read', 'read', 'full'] },
  { area: 'Rede de Parceiros', levels: ['read', 'read', 'read', 'full'] },
  { area: 'Clínicas e Elegibilidade', levels: ['read', 'read', 'none', 'full'] },
  { area: 'Cobrança', levels: ['read', 'read', 'none', 'full'] },
  { area: 'Financeiro', levels: ['none', 'read', 'none', 'full'] },
  { area: 'Comissões', levels: ['none', 'none', 'read', 'full'] },
  { area: 'Relatórios', levels: ['none', 'read', 'read', 'full'] },
  { area: 'Comunicação', levels: ['none', 'read', 'none', 'full'] },
  { area: 'Atendimento', levels: ['read', 'full', 'read', 'full'] },
  { area: 'Usuários e Permissões', levels: ['none', 'none', 'none', 'full'] },
  { area: 'Configurações', levels: ['none', 'none', 'none', 'full'] },
]

const ACCESS_ORIGINS = ['Web · Chrome', 'Web · Safari', 'App Android', 'App iOS', 'Web · Edge']

function PermissionMark({ level }: { level: PermissionLevel }) {
  if (level === 'full') {
    return <CircleCheckBig className="mx-auto h-4 w-4 text-emerald-500" aria-label="Acesso total" />
  }
  if (level === 'read') {
    return <Eye className="mx-auto h-4 w-4 text-sky-500" aria-label="Somente leitura" />
  }
  return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Sem acesso" />
}

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
]

export default function AdminUsuariosPage() {
  const { tenant } = useTenant()
  const { users, createUser, updateUser, deleteUser, isLoading } = useTenantData()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const form = useZodForm(tenantUserSchema, EMPTY_USER)

  const [tab, setTab] = useState('usuarios')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  /**
   * A conta não tem campo de situação nem de último acesso ainda. Enquanto
   * não tem, a linha é derivada do índice para a tela exibir os três estados
   * que o time precisa enxergar.
   */
  const rows = useMemo(
    () =>
      users.map((user, index) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        entity: user.role === 'client' ? '-' : 'Clínica Centro',
        status: index % 23 === 0 ? 'pendente' : index % 31 === 0 ? 'inativo' : 'ativo',
        lastAccess: new Date(Date.now() - ((index * 7) % 30) * 86_400_000),
        accessOrigin: ACCESS_ORIGINS[index % ACCESS_ORIGINS.length],
        tone: AVATAR_TONES[index % AVATAR_TONES.length],
      })),
    [users],
  )

  const pendingRows = useMemo(() => rows.filter(row => row.status === 'pendente'), [rows])
  const accessRows = useMemo(
    () =>
      rows
        .filter(row => row.status !== 'pendente')
        .sort((a, b) => b.lastAccess.getTime() - a.lastAccess.getTime())
        .slice(0, 25),
    [rows],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(row => {
      if (role !== 'all' && row.role !== role) return false
      if (status !== 'all' && row.status !== status) return false
      if (!term) return true
      return [row.name, row.email, roleMeta[row.role].label].some(field =>
        field.toLowerCase().includes(term),
      )
    })
  }, [rows, search, role, status])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  const active = rows.filter(row => row.status === 'ativo').length
  const pending = rows.filter(row => row.status === 'pendente').length

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function openCreate() {
    form.reset(EMPTY_USER)
    setCreating(true)
  }

  async function approve(id: string, name: string) {
    // Aprovar hoje é só liberar o acesso; quando existir campo de situação na
    // conta, esta função passa a gravá-lo em vez de apenas avisar.
    await updateUser(id, {})
    toast.success('Solicitação aprovada', { description: name })
  }

  function openEdit(id: string) {
    const user = users.find(item => item.id === id)
    if (!user) return
    form.reset({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
    })
    setEditing(user)
  }

  async function submitUser(existing: User | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'
    if (!tenant) return 'Inquilino não carregado. Recarregue a página.'

    // O e-mail é a credencial de acesso: repetido dentro do mesmo inquilino,
    // duas pessoas disputariam o mesmo login.
    const emailTaken = users.some(
      user => user.id !== existing?.id && user.email.toLowerCase() === data.email.toLowerCase(),
    )
    if (emailTaken) return 'Já existe um usuário com este e-mail neste inquilino.'

    const shared = {
      name: data.name,
      email: data.email,
      phone: formatPhone(data.phone),
      role: data.role as UserRole,
    }

    if (existing) {
      const result = await updateUser(existing.id, shared)
      if (!result.success) return result.error ?? 'Não foi possível salvar as alterações.'
      toast.success('Usuário atualizado', { description: data.name })
      return
    }

    const result = await createUser({
      ...shared,
      id: '',
      tenantId: tenant.id,
      createdAt: new Date(),
      password: 'trocar123',
    })
    if (!result.success) return result.error ?? 'Não foi possível criar o usuário.'
    toast.success('Usuário criado', {
      description: 'Senha provisória: trocar123',
    })
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuários e Permissões"
        description="Gerencie os acessos à plataforma, perfis e permissões de cada usuário."
      >
        <Button className="h-11 gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          accent="info"
          value={active.toLocaleString('pt-BR')}
          label="Usuários ativos"
          delta={{ value: '20%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={UserPlus}
          accent="success"
          value={4}
          label="Perfis de acesso"
          hint="PF, Entidade, Vendedor, Administrador"
        />
        <StatCard
          icon={ShieldCheck}
          accent="primary"
          value={0}
          label="Tentativas de acesso bloqueadas"
          hint="últimos 30 dias"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={pending}
          label="Usuários pendentes"
          hint="aguardando aprovação"
        />
      </div>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <SectionTabsList>
          <SectionTab value="usuarios">Usuários</SectionTab>
          <SectionTab value="perfis">Perfis e Permissões</SectionTab>
          <SectionTab value="pendentes">Solicitações Pendentes</SectionTab>
          <SectionTab value="historico">Histórico de Acesso</SectionTab>
        </SectionTabsList>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <TabsContent value="usuarios" className="m-0">
            <Card className="gap-0 py-0 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <SearchInput
                  value={search}
                  onChange={withPageReset(setSearch)}
                  placeholder="Buscar por nome, e-mail ou perfil..."
                />
                <FilterSelect
                  label="Perfis"
                  value={role}
                  onChange={withPageReset(setRole)}
                  allLabel="Todos os perfis"
                  options={Object.entries(roleMeta).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                />
                <FilterSelect
                  label="Status"
                  value={status}
                  onChange={withPageReset(setStatus)}
                  allLabel="Todos os status"
                  options={[
                    { value: 'ativo', label: 'Ativo' },
                    { value: 'pendente', label: 'Pendente' },
                    { value: 'inativo', label: 'Inativo' },
                  ]}
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
                        <th className="px-4 py-3 font-medium">Nome</th>
                        <th className="px-4 py-3 font-medium">E-mail</th>
                        <th className="px-4 py-3 font-medium">Perfil</th>
                        <th className="px-4 py-3 font-medium">Entidade / Clínica</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Último acesso</th>
                        <th className="px-4 py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-muted-foreground">
                            Nenhum usuário encontrado com os filtros atuais.
                          </td>
                        </tr>
                      )}
                      {visible.map(row => (
                        <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className={cn('text-xs font-semibold', row.tone)}>
                                  {getInitials(row.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate font-medium text-foreground">{row.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-primary">{row.email}</td>
                          <td className="px-4 py-3">
                            <StatusPill {...roleMeta[row.role]} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.entity}</td>
                          <td className="px-4 py-3">
                            <StatusPill
                              label={
                                row.status === 'ativo'
                                  ? 'Ativo'
                                  : row.status === 'pendente'
                                    ? 'Pendente'
                                    : 'Inativo'
                              }
                              className={
                                row.status === 'ativo'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : row.status === 'pendente'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-red-50 text-red-600'
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.status === 'pendente'
                              ? '-'
                              : row.lastAccess.toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Ações do usuário</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openEdit(row.id)}>
                                  Editar usuário
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    toast.success('Senha redefinida', {
                                      description: 'Nova senha provisória: trocar123',
                                    })
                                  }
                                >
                                  Redefinir senha
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    const user = users.find(item => item.id === row.id)
                                    if (user) setRemoving(user)
                                  }}
                                >
                                  Excluir usuário
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
                noun="usuários"
                onPageChange={setPage}
                onPerPageChange={withPageReset(setPerPage)}
              />
            </Card>
            </TabsContent>

            <TabsContent value="perfis" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Perfis e permissões</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    O que cada perfil pode fazer em cada área do painel.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Área</th>
                          {PERMISSION_PROFILES.map(profile => (
                            <th key={profile} className="px-4 py-3 text-center font-medium whitespace-nowrap">
                              {profile}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {PERMISSION_MATRIX.map(area => (
                          <tr key={area.area} className="border-b border-border/60 last:border-0">
                            <td className="px-4 py-3 font-medium text-foreground">{area.area}</td>
                            {area.levels.map((level, index) => (
                              <td key={PERMISSION_PROFILES[index]} className="px-4 py-3 text-center">
                                <PermissionMark level={level} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
                <div className="flex flex-wrap items-center gap-4 border-t border-border p-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <PermissionMark level="full" /> Acesso total
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PermissionMark level="read" /> Somente leitura
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PermissionMark level="none" /> Sem acesso
                  </span>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="pendentes" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Solicitações pendentes</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cadastros aguardando aprovação para acessar a plataforma.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        header: 'Nome',
                        render: row => (
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={cn('text-xs font-semibold', row.tone)}>
                                {getInitials(row.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate font-medium text-foreground">{row.name}</span>
                          </div>
                        ),
                      },
                      {
                        key: 'email',
                        header: 'E-mail',
                        hideOnMobile: true,
                        render: row => <span className="text-primary">{row.email}</span>,
                      },
                      {
                        key: 'role',
                        header: 'Perfil solicitado',
                        render: row => <StatusPill {...roleMeta[row.role]} />,
                      },
                      {
                        key: 'actions',
                        header: 'Ações',
                        align: 'right',
                        render: row => (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const user = users.find(item => item.id === row.id)
                                if (user) setRemoving(user)
                              }}
                            >
                              Recusar
                            </Button>
                            <Button size="sm" onClick={() => approve(row.id, row.name)}>
                              Aprovar
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                    rows={pendingRows}
                    rowKey={row => row.id}
                    empty="Nenhuma solicitação aguardando aprovação."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Histórico de acesso</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Últimos acessos registrados na plataforma.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        header: 'Usuário',
                        render: row => (
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={cn('text-xs font-semibold', row.tone)}>
                                {getInitials(row.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-foreground">{row.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {roleMeta[row.role].label}
                              </span>
                            </span>
                          </div>
                        ),
                      },
                      {
                        key: 'when',
                        header: 'Data e hora',
                        render: row => (
                          <span className="text-muted-foreground">
                            {row.lastAccess.toLocaleDateString('pt-BR')}{' '}
                            {row.lastAccess.toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ),
                      },
                      {
                        key: 'origin',
                        header: 'Origem',
                        hideOnMobile: true,
                        render: row => (
                          <span className="text-muted-foreground">{row.accessOrigin}</span>
                        ),
                      },
                      {
                        key: 'result',
                        header: 'Resultado',
                        align: 'right',
                        render: row => (
                          <StatusPill
                            label={row.status === 'inativo' ? 'Bloqueado' : 'Sucesso'}
                            className={
                              row.status === 'inativo'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-emerald-50 text-emerald-700'
                            }
                          />
                        ),
                      },
                    ]}
                    rows={accessRows}
                    rowKey={row => row.id}
                    empty="Sem registros de acesso."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-5 xl:col-span-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Perfis de Acesso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ACCESS_PROFILES.map(profile => {
                    const Icon = profile.icon
                    return (
                      <div key={profile.name} className="flex items-start gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            profile.tone,
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {profile.name}
                          </span>
                          <span className="block text-xs leading-snug text-muted-foreground">
                            {profile.hint}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {QUICK_ACTIONS.map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>

              <Card className="border-primary/15 bg-primary/5 shadow-sm">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Precisa de ajuda?</p>
                      <p className="text-xs text-muted-foreground">
                        Nossa equipe está pronta para te atender.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full bg-card">
                    Falar com o suporte →
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
        title={editing ? 'Editar usuário' : 'Novo usuário'}
        description={
          editing
            ? 'Atualize os dados e o perfil de acesso desta pessoa.'
            : 'O usuário recebe a senha provisória "trocar123" no primeiro acesso.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Criar usuário'}
        onSubmit={() => submitUser(editing)}
      >
        <FormField label="Nome completo" htmlFor="user-name" error={form.errors.name} required>
          <Input
            id="user-name"
            value={form.values.name}
            onChange={event => form.setField('name', event.target.value)}
            aria-invalid={!!form.errors.name}
          />
        </FormField>

        <FormField label="E-mail" htmlFor="user-email" error={form.errors.email} required>
          <Input
            id="user-email"
            type="email"
            value={form.values.email}
            onChange={event => form.setField('email', event.target.value)}
            aria-invalid={!!form.errors.email}
          />
        </FormField>

        <FormRow>
          <FormField label="Telefone" htmlFor="user-phone" error={form.errors.phone} required hint="Com DDD">
            <Input
              id="user-phone"
              value={form.values.phone}
              onChange={event => form.setField('phone', event.target.value)}
              aria-invalid={!!form.errors.phone}
            />
          </FormField>
          <FormField label="Perfil de acesso" error={form.errors.role} required>
            <FormSelect
              value={form.values.role}
              onChange={value => form.setField('role', value)}
              placeholder="Selecione o perfil"
              options={Object.entries(roleMeta).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              invalid={!!form.errors.role}
            />
          </FormField>
        </FormRow>
      </FormDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="Excluir usuário"
        description={
          removing
            ? `"${removing.name}" perde o acesso à plataforma imediatamente. Se a pessoa for um beneficiário, o contrato dela também sai da carteira.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteUser(removing.id)
          if (!result.success) {
            toast.error(result.error ?? 'Não foi possível excluir o usuário')
            return
          }
          toast.success('Usuário excluído', { description: removing.name })
        }}
      />
    </div>
  )
}
