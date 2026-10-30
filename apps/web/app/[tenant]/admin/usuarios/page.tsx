'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CircleCheckBig,
  Download,
  Eye,
  History,
  Minus,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  UserCog,
  UserX,
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
import { resetTenantUserPasswordAction } from '@/lib/actions/tenant-users-api'
import { formatPhone, tenantUserSchema } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import type { MemberAccessStatus, User, UserRole } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'
import { downloadCsv } from '@/lib/download-csv'
import { SUPPORT_EMAIL } from '@/lib/support-contact'

const roleMeta: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Administrador', className: 'bg-rose-50 text-rose-700' },
  seller: { label: 'Vendedor', className: 'bg-violet-50 text-violet-700' },
  client: { label: 'Associado', className: 'bg-sky-50 text-sky-700' },
}

/** Os três perfis que a API reconhece em um clube. */
const ACCESS_PROFILES = [
  {
    role: 'admin' as UserRole,
    name: 'Administrador',
    hint: 'Acesso completo ao painel do clube: planos, financeiro, equipe e configurações.',
    icon: ShieldCheck,
    tone: 'bg-rose-50 text-rose-500',
  },
  {
    role: 'seller' as UserRole,
    name: 'Vendedor',
    hint: 'Portal próprio: cadastra e acompanha os próprios leads e vendas, vê suas metas.',
    icon: UserCog,
    tone: 'bg-violet-50 text-violet-500',
  },
  {
    role: 'client' as UserRole,
    name: 'Associado',
    hint: 'Portal do associado: carteirinha, faturas, dependentes, benefícios e atendimento.',
    icon: Users,
    tone: 'bg-sky-50 text-sky-500',
  },
]

const EMPTY_USER = { name: '', email: '', phone: '', role: 'seller' }

type PermissionLevel = 'full' | 'read' | 'none'

const PERMISSION_PROFILES = ['Associado', 'Vendedor', 'Administrador']

/**
 * O que a API realmente aplica (guardas de perfil nas rotas do clube), na
 * ordem de `PERMISSION_PROFILES`. Só entram áreas que existem hoje.
 */
const PERMISSION_MATRIX: { area: string; note?: string; levels: PermissionLevel[] }[] = [
  { area: 'Painel do clube', note: 'Tudo o que está neste menu', levels: ['none', 'none', 'full'] },
  { area: 'Leads e vendas', note: 'O vendedor vê só os próprios', levels: ['none', 'full', 'full'] },
  { area: 'Metas de venda', note: 'Só o administrador define', levels: ['none', 'read', 'full'] },
  { area: 'Planos, benefícios e rede credenciada', note: 'Leitura é a vitrine do clube', levels: ['read', 'read', 'full'] },
  { area: 'Cobranças e faturas', note: 'O associado vê só as dele', levels: ['read', 'none', 'full'] },
  { area: 'Atendimento', note: 'O associado abre e acompanha os próprios chamados', levels: ['full', 'full', 'full'] },
  { area: 'Equipe, permissões e dados do clube', levels: ['none', 'none', 'full'] },
]

type UserStatus = 'ativo' | 'removido' | 'bloqueado' | 'suspenso'

const STATUS_META: Record<UserStatus, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  removido: { label: 'Removido', className: 'bg-slate-100 text-slate-600' },
  bloqueado: { label: 'Bloqueado', className: 'bg-red-50 text-red-600' },
  suspenso: { label: 'Suspenso pela plataforma', className: 'bg-red-50 text-red-600' },
}

/** Situação do vínculo com o clube; API antiga só tinha o booleano `active`. */
function accessOf(user: User): MemberAccessStatus {
  return user.accessStatus ?? (user.active === false ? 'removed' : 'active')
}

/**
 * Situação exibida: bloqueio pelo clube > vínculo removido > conta suspensa
 * pela plataforma (`banned`, vale em todo clube) > ativo.
 */
function statusOf(user: User): UserStatus {
  const access = accessOf(user)
  if (access === 'blocked') return 'bloqueado'
  if (access === 'removed') return 'removido'
  if (user.banned) return 'suspenso'
  return 'ativo'
}

const EXCLUIR_ASSOCIADO_DESCRICAO =
  'A assinatura será cancelada e o acesso removido. Se a pessoa voltar pelo site, o cadastro e o histórico são reativados e ela precisará assinar um plano de novo.'

const BLOQUEAR_DESCRICAO =
  'A pessoa não conseguirá mais entrar nem se cadastrar de novo com este e-mail neste clube.'

/** Resume o `User-Agent` do último acesso em "Web · Chrome", "App Android"...; sem dado, "—". */
function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return '—'
  const ua = userAgent.toLowerCase()
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('opr/') || ua.includes('opera')
      ? 'Opera'
      : ua.includes('firefox/')
        ? 'Firefox'
        : ua.includes('chrome/') || ua.includes('crios/')
          ? 'Chrome'
          : ua.includes('safari/')
            ? 'Safari'
            : null
  const platform = ua.includes('android')
    ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad')
      ? 'iOS'
      : null
  if (browser) return platform ? `${platform} · ${browser}` : `Web · ${browser}`
  if (platform) return `App ${platform}`
  return 'Outro'
}

function formatDateTime(value: Date): string {
  return `${value.toLocaleDateString('pt-BR')} ${value.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

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
  const { users, createUser, updateUser, deleteUser, blockUser, unblockUser, isLoading } = useTenantData()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const [blocking, setBlocking] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const form = useZodForm(tenantUserSchema, EMPTY_USER)

  // Atalho de "Vendedores e metas": /usuarios?novo=vendedor abre o cadastro
  // com o perfil Vendedor já escolhido.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get('novo') !== 'vendedor') return
      url.searchParams.delete('novo')
      window.history.replaceState(null, '', url.toString())
      form.reset({ ...EMPTY_USER, role: 'seller' })
      setCreating(true)
    } catch {
      // Sem acesso à URL: o botão "Novo usuário" continua valendo.
    }
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [tab, setTab] = useState('usuarios')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  /**
   * Situação, último acesso e origem vêm da API: `member.active`,
   * `user.banned` e o login mais recente neste clube (trilha de atividade ou
   * sessão). Sem registro de acesso, a tela mostra "—".
   */
  const rows = useMemo(
    () =>
      users.map((user, index) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: statusOf(user),
        access: accessOf(user),
        lastAccess: user.lastLoginAt ?? null,
        accessOrigin: describeUserAgent(user.lastLoginUserAgent),
        tone: AVATAR_TONES[index % AVATAR_TONES.length],
      })),
    [users],
  )

  const accessRows = useMemo(
    () =>
      rows
        .filter((row): row is typeof row & { lastAccess: Date } => row.lastAccess !== null)
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
  const inactive = rows.length - active
  const sellers = rows.filter(row => row.role === 'seller' && row.status === 'ativo').length
  const admins = rows.filter(row => row.role === 'admin' && row.status === 'ativo').length

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

  function exportList() {
    downloadCsv('equipe-e-acessos.csv', [
      ['Nome', 'E-mail', 'Perfil', 'Situação', 'Último acesso'],
      ...filtered.map(row => [
        row.name,
        row.email,
        roleMeta[row.role].label,
        STATUS_META[row.status].label,
        row.lastAccess ? formatDateTime(row.lastAccess) : '',
      ]),
    ])
  }

  /** A senha provisória é gerada na API e vai só para o e-mail do usuário. */
  async function resetPassword(user: User) {
    if (!tenant) return
    const result = await resetTenantUserPasswordAction(tenant.slug, user.id)
    if (!result.success) {
      toast.error('Senha não redefinida', { description: result.error })
      return
    }
    toast.success('Senha redefinida', {
      description:
        result.data.emailStatus === 'failed'
          ? `A senha foi trocada, mas o e-mail para ${result.data.email} falhou. Tente de novo.`
          : `Uma senha provisória foi enviada para ${result.data.email}.`,
    })
  }

  async function unblock(user: User) {
    const result = await unblockUser(user.id)
    if (!result.success) {
      toast.error('Desbloqueio não concluído', {
        description: result.error ?? 'Não foi possível desbloquear o acesso.',
      })
      return
    }
    toast.success('Acesso desbloqueado', {
      description:
        user.role === 'client'
          ? `${user.name} pode voltar pelo site e assinar um plano de novo.`
          : `${user.name} voltou a ter acesso.`,
    })
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

    const result = await createUser(shared)
    if (!result.success) return result.error ?? 'Não foi possível criar o usuário.'
    toast.success('Usuário criado', {
      description:
        shared.role === 'client'
          ? `As boas-vindas do clube foram enviadas para ${data.email}.`
          : `O acesso (com senha provisória) foi enviado por e-mail para ${data.email}.`,
    })
  }

  const quickActions = [
    { label: 'Novo usuário', icon: Plus, onClick: openCreate },
    { label: 'Exportar lista (CSV)', icon: Download, onClick: exportList },
    { label: 'Ver perfis e permissões', icon: ShieldCheck, onClick: () => setTab('perfis') },
    { label: 'Ver histórico de acesso', icon: History, onClick: () => setTab('historico') },
  ]

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipe e permissões"
        description="Quem acessa o clube, com qual perfil, e o que cada perfil pode fazer."
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
        />
        <StatCard
          icon={ShieldCheck}
          accent="primary"
          value={admins.toLocaleString('pt-BR')}
          label="Administradores ativos"
        />
        <StatCard
          icon={UserCog}
          accent="success"
          value={sellers.toLocaleString('pt-BR')}
          label="Vendedores ativos"
        />
        <StatCard
          icon={UserX}
          accent="warning"
          value={inactive.toLocaleString('pt-BR')}
          label="Removidos ou bloqueados"
        />
      </div>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <SectionTabsList>
          <SectionTab value="usuarios">Usuários</SectionTab>
          <SectionTab value="perfis">Perfis e Permissões</SectionTab>
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
                  options={Object.entries(STATUS_META).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                />
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Nome</th>
                        <th className="px-4 py-3 font-medium">E-mail</th>
                        <th className="px-4 py-3 font-medium">Perfil</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Último acesso</th>
                        <th className="px-4 py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-muted-foreground">
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
                          <td className="px-4 py-3">
                            <StatusPill {...STATUS_META[row.status]} />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {row.lastAccess ? row.lastAccess.toLocaleDateString('pt-BR') : '—'}
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
                                  disabled={row.status !== 'ativo'}
                                  onClick={() => {
                                    const user = users.find(item => item.id === row.id)
                                    if (user) setResetting(user)
                                  }}
                                >
                                  Redefinir senha
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {row.access === 'blocked' ? (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const user = users.find(item => item.id === row.id)
                                      if (user) void unblock(user)
                                    }}
                                  >
                                    Desbloquear
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    {row.access === 'active' && (
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => {
                                          const user = users.find(item => item.id === row.id)
                                          if (user) setRemoving(user)
                                        }}
                                      >
                                        {row.role === 'client' ? 'Excluir cadastro' : 'Excluir usuário'}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => {
                                        const user = users.find(item => item.id === row.id)
                                        if (user) setBlocking(user)
                                      }}
                                    >
                                      Bloquear acesso
                                    </DropdownMenuItem>
                                  </>
                                )}
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
                    O que cada perfil pode fazer, conforme as regras aplicadas pelo sistema.
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
                            <td className="px-4 py-3">
                              <span className="block font-medium text-foreground">{area.area}</span>
                              {area.note && <span className="block text-xs text-muted-foreground">{area.note}</span>}
                            </td>
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

            <TabsContent value="historico" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Histórico de acesso</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Último acesso de cada usuário neste clube (sem registro, a pessoa não aparece).
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
                          <span className="text-muted-foreground">{formatDateTime(row.lastAccess)}</span>
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
                        key: 'status',
                        header: 'Situação atual',
                        align: 'right',
                        render: row => <StatusPill {...STATUS_META[row.status]} />,
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
                  {quickActions.map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.onClick}
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
                        Escreva para a equipe ANNETEC.
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline" className="w-full bg-card">
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte do painel do clube')}`}>
                      Falar com o suporte
                    </a>
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
            : 'A senha provisória é gerada pelo sistema e enviada por e-mail ao usuário, com a marca do clube. Associados não recebem senha: entram por CPF ou Google.'
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
        open={resetting !== null}
        onOpenChange={open => !open && setResetting(null)}
        title="Redefinir senha"
        confirmLabel="Redefinir e enviar"
        description={
          resetting
            ? `Uma nova senha provisória será gerada e enviada para ${resetting.email}. A senha atual deixa de valer e as sessões abertas de "${resetting.name}" são encerradas.`
            : ''
        }
        onConfirm={async () => {
          if (resetting) await resetPassword(resetting)
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title={removing?.role === 'client' ? 'Excluir cadastro' : 'Excluir usuário'}
        confirmLabel={removing?.role === 'client' ? 'Excluir cadastro' : 'Excluir'}
        description={
          removing
            ? removing.role === 'client'
              ? EXCLUIR_ASSOCIADO_DESCRICAO
              : `"${removing.name}" perde o acesso ao clube imediatamente e as sessões abertas são encerradas. O histórico continua guardado.`
            : ''
        }
        onConfirm={async () => {
          if (!removing) return
          const result = await deleteUser(removing.id)
          if (!result.success) {
            toast.error(result.error ?? 'Não foi possível excluir o usuário')
            return
          }
          toast.success(removing.role === 'client' ? 'Cadastro excluído' : 'Usuário excluído', {
            description: removing.name,
          })
        }}
      />

      <ConfirmDialog
        open={blocking !== null}
        onOpenChange={open => !open && setBlocking(null)}
        title={blocking ? `Bloquear o acesso de ${blocking.name}?` : 'Bloquear acesso'}
        confirmLabel="Bloquear acesso"
        description={BLOQUEAR_DESCRICAO}
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
    </div>
  )
}
