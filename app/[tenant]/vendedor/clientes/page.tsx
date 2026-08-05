'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData, getClientsBySellerId, getSalesBySellerId } from '@/contexts/tenant-data-context'
import { getInitials } from '@/lib/utils'
import type { Client, Seller, Dependent } from '@/lib/types'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  CreditCard,
  Users,
  Calendar,
  Filter,
  User,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Activity,
  UserCheck,
  Clock
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
export default function VendedorClientesPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const seller = user as Seller
  const { users, sales: allSales, clientPlans, createUser, updateUser } = useTenantData()

  const clients = getClientsBySellerId(users, seller?.id || '')
  const sellerSales = getSalesBySellerId(allSales, seller?.id || '')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')

  // Dialog States
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Form States for New Client
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newCPF, setNewCPF] = useState('')
  const [newPlan, setNewPlan] = useState('')
  const [newStatus, setNewStatus] = useState<'active' | 'pending'>('active')
  const [newDependentsText, setNewDependentsText] = useState('')

  // Default the plan select to the tenant's first catalog entry once plans load.
  useEffect(() => {
    if (!newPlan && clientPlans.length > 0) setNewPlan(clientPlans[0].name)
  }, [clientPlans, newPlan])

  const getStatusBadge = (status: Client['planStatus']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ativo</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Pendente</Badge>
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Cancelado</Badge>
    }
  }

  // Filter clients based on search and filters
  const filteredClients = clients.filter(client => {
    const matchesSearch =
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase()) ||
      client.cpf.includes(search) ||
      client.cardNumber.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || client.planStatus === statusFilter
    
    const matchesPlan = planFilter === 'all' || client.plan.toLowerCase().includes(planFilter.toLowerCase())

    return matchesSearch && matchesStatus && matchesPlan
  })

  // Handle adding client
  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newEmail || !newCPF || !newPlan || !tenant || !seller) {
      alert('Por favor, preencha todos os campos obrigatórios.')
      return
    }

    const dependentsList: Dependent[] = newDependentsText
      ? newDependentsText.split(',').map((name, index) => ({
          id: `dep-new-${Date.now()}-${index}`,
          name: name.trim(),
          cpf: '---.---.---- --',
          relationship: 'Dependente',
          birthDate: new Date()
        }))
      : []

    const result = await createUser({
      id: '',
      tenantId: tenant.id,
      name: newName,
      email: newEmail,
      phone: newPhone || '(11) 99999-9999',
      role: 'client',
      cpf: newCPF,
      plan: newPlan,
      planStatus: newStatus,
      contractDate: new Date(),
      cardNumber: `ANN-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      sellerId: seller.id,
      dependents: dependentsList,
      createdAt: new Date(),
      password: 'trocar123',
    })

    if (!result.success) {
      alert(result.error || 'Não foi possível cadastrar o cliente')
      return
    }

    setIsAddOpen(false)

    // Clear inputs
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewCPF('')
    setNewPlan(clientPlans[0]?.name ?? '')
    setNewStatus('active')
    setNewDependentsText('')
  }

  // Stats calculation
  const totalClients = clients.length
  const activeClients = clients.filter(c => c.planStatus === 'active').length
  const pendingClients = clients.filter(c => c.planStatus === 'pending').length
  
  // Total sales value for this seller
  const totalSalesValue = sellerSales.filter(s => s.status === 'confirmed').reduce((acc, s) => acc + s.value, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meus Clientes</h1>
          <p className="text-muted-foreground">Consulte e gerencie os clientes cadastrados por você</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="bg-primary hover:opacity-90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Clientes</p>
                <p className="text-2xl font-bold mt-1">{totalClients}</p>
                <p className="text-sm text-muted-foreground mt-1">Sua carteira de clientes</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes Ativos</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{activeClients}</p>
                <p className="text-sm text-muted-foreground mt-1">Benefícios liberados</p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Aguardando Liberação</p>
                <p className="text-2xl font-bold mt-1 text-yellow-600">{pendingClients}</p>
                <p className="text-sm text-muted-foreground mt-1">Cadastros pendentes</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total em Vendas</p>
                <p className="text-2xl font-bold mt-1 text-primary">
                  R$ {totalSalesValue.toLocaleString('pt-BR')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Volume acumulado</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
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
                placeholder="Buscar por nome, email, CPF ou carteirinha..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Planos</SelectItem>
                  {[...new Set(clients.map(c => c.plan).filter(Boolean))].map(plan => (
                    <SelectItem key={plan} value={plan}>
                      {plan}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Carteirinha</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Dependentes</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => (
                  <tr key={client.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 bg-secondary">
                          <AvatarFallback className="bg-secondary text-white text-sm">
                            {getInitials(client.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-sm text-muted-foreground">{client.cpf}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[150px]">{client.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {client.phone}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-medium text-sm">{client.plan}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Desde {new Date(client.contractDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="h-4 w-4 text-secondary shrink-0" />
                        <span className="font-mono">{client.cardNumber}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        {client.dependents?.length || 0}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {getStatusBadge(client.planStatus)}
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
                            setSelectedClient(client)
                            setIsDetailsOpen(true)
                          }}>
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            alert(`Enviando mensagem para ${client.phone}`)
                          }}>
                            Enviar Mensagem
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            updateUser(client.id, {
                              planStatus: client.planStatus === 'active' ? 'pending' : 'active',
                            })
                          }}>
                            Alternar Status
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

      {filteredClients.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum cliente encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Dialog for Adding New Client */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAddClient}>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
              <DialogDescription>
                Adicione um novo cliente diretamente na sua carteira de vendas
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome Completo *</label>
                <Input
                  required
                  placeholder="Ex: João da Silva"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">E-mail *</label>
                <Input
                  required
                  type="email"
                  placeholder="Ex: joao@email.com"
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
                <label className="text-sm font-medium">CPF *</label>
                <Input
                  required
                  placeholder="Ex: 123.456.789-00"
                  value={newCPF}
                  onChange={e => setNewCPF(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Plano *</label>
                {clientPlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum plano cadastrado. Peça ao administrador para criar um em Planos.
                  </p>
                ) : (
                  <Select value={newPlan} onValueChange={setNewPlan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientPlans.map(plan => (
                        <SelectItem key={plan.id} value={plan.name}>
                          {plan.name} — R$ {plan.priceMonthly.toLocaleString('pt-BR')}/mês
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Status Inicial</label>
                <Select value={newStatus} onValueChange={v => setNewStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status inicial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo (Confirmado)</SelectItem>
                    <SelectItem value="pending">Pendente (Aguardando liberação)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Dependentes (separados por vírgula)</label>
                <Input
                  placeholder="Ex: Pedro Silva, Maria Silva"
                  value={newDependentsText}
                  onChange={e => setNewDependentsText(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                Cadastrar Cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Viewing Client Details */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[450px]">
          {selectedClient && (
            <div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-secondary">
                    <AvatarFallback className="bg-secondary text-white">
                      {getInitials(selectedClient.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span>{selectedClient.name}</span>
                    <p className="text-xs font-normal text-muted-foreground">ID: {selectedClient.id}</p>
                  </div>
                </DialogTitle>
                <DialogDescription>
                  Detalhes cadastrais e contratuais do associado
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4 border-b border-border pb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">CPF</span>
                    <span className="font-medium">{selectedClient.cpf}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Status do Plano</span>
                    <span>{getStatusBadge(selectedClient.planStatus)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-border pb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">E-mail</span>
                    <span className="font-medium break-all">{selectedClient.email}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Telefone</span>
                    <span className="font-medium">{selectedClient.phone}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-border pb-3">
                  <div>
                    <span className="text-xs text-muted-foreground block">Plano Contratado</span>
                    <span className="font-medium text-secondary">{selectedClient.plan}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Número da Carteirinha</span>
                    <span className="font-mono font-medium">{selectedClient.cardNumber}</span>
                  </div>
                </div>

                <div className="border-b border-border pb-3">
                  <span className="text-xs text-muted-foreground block mb-2">Dependentes ({selectedClient.dependents?.length || 0})</span>
                  {selectedClient.dependents && selectedClient.dependents.length > 0 ? (
                    <ul className="space-y-1 bg-muted/40 p-2.5 rounded-lg">
                      {selectedClient.dependents.map((dep, index) => (
                        <li key={dep.id || index} className="flex justify-between items-center text-xs">
                          <span className="font-medium">{dep.name}</span>
                          <span className="text-muted-foreground">({dep.relationship || 'Dependente'})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">Nenhum dependente cadastrado</span>
                  )}
                </div>

                <div>
                  <span className="text-xs text-muted-foreground block">Data de Adesão</span>
                  <span className="font-medium">
                    {new Date(selectedClient.contractDate).toLocaleDateString('pt-BR')} às {new Date(selectedClient.contractDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={() => setIsDetailsOpen(false)} className="bg-secondary hover:opacity-90 text-white">
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
