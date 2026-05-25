'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { mockUsers } from '@/lib/mock-data'
import type { User, Seller, Client, UserRole } from '@/lib/types'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  Calendar,
  Filter,
  Shield,
  Briefcase,
  Users,
  User as UserIcon,
  ShieldAlert
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<(User | Seller | Client)[]>(mockUsers)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Dialog States
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | Seller | Client | null>(null)

  // Form States for New User
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('client')

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><Shield className="w-3 h-3 mr-1" /> Administrador</Badge>
      case 'seller':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Briefcase className="w-3 h-3 mr-1" /> Vendedor</Badge>
      case 'client':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><UserIcon className="w-3 h-3 mr-1" /> Cliente</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.phone && user.phone.includes(search))

    const matchesRole = roleFilter === 'all' || user.role === roleFilter

    return matchesSearch && matchesRole
  })

  // Handle adding user
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newEmail) {
      alert('Por favor, preencha nome e e-mail.')
      return
    }

    const newUser: User = {
      id: `${newRole}-new-${Date.now()}`,
      name: newName,
      email: newEmail,
      phone: newPhone || '(11) 99999-9999',
      role: newRole,
      createdAt: new Date(),
    }

    setUsers([newUser as any, ...users])
    setIsAddOpen(false)
    
    // Clear inputs
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewRole('client')
  }

  // Stats calculation
  const totalUsers = users.length
  const totalAdmins = users.filter(u => u.role === 'admin').length
  const totalSellers = users.filter(u => u.role === 'seller').length
  const totalClients = users.filter(u => u.role === 'client').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
          <p className="text-muted-foreground">Gerencie o acesso de todos os usuários do sistema</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="bg-[#e5375b] hover:bg-[#d42d50] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Usuários</p>
                <p className="text-2xl font-bold mt-1">{totalUsers}</p>
                <p className="text-sm text-muted-foreground mt-1">Registrados no sistema</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-100">
                <Users className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Administradores</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{totalAdmins}</p>
                <p className="text-sm text-muted-foreground mt-1">Acesso total</p>
              </div>
              <div className="p-3 rounded-lg bg-red-100">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendedores</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{totalSellers}</p>
                <p className="text-sm text-muted-foreground mt-1">Equipe comercial</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{totalClients}</p>
                <p className="text-sm text-muted-foreground mt-1">Associados ativos</p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <UserIcon className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Cargo/Função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Cargos</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="seller">Vendedor</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Função</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Data de Cadastro</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 bg-[#1c3670]">
                          <AvatarFallback className="bg-[#1c3670] text-white text-sm">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">ID: {user.id.substring(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[150px]">{user.email}</span>
                        </div>
                        {user.phone && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user)
                            setIsDetailsOpen(true)
                          }}>
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            Editar Permissões
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            Bloquear Acesso
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
      </Card>

      {filteredUsers.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Dialog for Adding New User */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAddUser}>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
              <DialogDescription>
                Crie um novo acesso administrativo, vendedor ou cliente avulso.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome Completo *</label>
                <Input
                  required
                  placeholder="Ex: Ana Souza"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">E-mail *</label>
                <Input
                  required
                  type="email"
                  placeholder="Ex: ana@email.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input
                  placeholder="Ex: (11) 98888-7777"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Função/Cargo *</label>
                <Select value={newRole} onValueChange={v => setNewRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="seller">Vendedor</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#e5375b] hover:bg-[#d42d50] text-white">
                Cadastrar Usuário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Viewing User Details */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[450px]">
          {selectedUser && (
            <div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-[#1c3670]">
                    <AvatarFallback className="bg-[#1c3670] text-white">
                      {getInitials(selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span>{selectedUser.name}</span>
                    <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="py-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4 border-b border-border pb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">ID do Sistema</span>
                    <span className="font-mono text-xs">{selectedUser.id}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Data de Cadastro</span>
                    <span>{new Date(selectedUser.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-border pb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">E-mail</span>
                    <span className="font-medium break-all">{selectedUser.email}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Telefone</span>
                    <span className="font-medium">{selectedUser.phone || '-'}</span>
                  </div>
                </div>

                {selectedUser.role === 'seller' && (
                  <div className="border-b border-border pb-3 space-y-2">
                    <span className="text-xs text-muted-foreground block mb-2">Informações Comerciais</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-muted-foreground block">Região</span>
                        <span className="font-medium">{(selectedUser as Seller).region || 'Não definida'}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Comissão</span>
                        <span className="font-medium">{((selectedUser as Seller).commissionRate * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={() => setIsDetailsOpen(false)} className="bg-[#1c3670] hover:bg-[#152a5c] text-white">
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
