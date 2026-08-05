'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useTenantData, getAllClients, getAllSellers } from '@/contexts/tenant-data-context'
import { useTenant } from '@/contexts/tenant-context'
import { getInitials } from '@/lib/utils'
import type { Client } from '@/lib/types'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  CreditCard,
  Users,
  Calendar,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/dashboard/empty-state'

export default function ClientesPage() {
  const [search, setSearch] = useState('')
  const { tenant } = useTenant()
  const { users, clientPlans, createUser } = useTenantData()
  const clients = getAllClients(users)
  const sellers = getAllSellers(users)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newCPF, setNewCPF] = useState('')
  const [newPlan, setNewPlan] = useState('')
  const [newSellerId, setNewSellerId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!newPlan && clientPlans.length > 0) setNewPlan(clientPlans[0].name)
  }, [clientPlans, newPlan])
  useEffect(() => {
    if (!newSellerId && sellers.length > 0) setNewSellerId(sellers[0].id)
  }, [sellers, newSellerId])

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!tenant || !newName || !newEmail || !newCPF || !newPlan || !newSellerId) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    const result = await createUser({
      id: '',
      tenantId: tenant.id,
      name: newName,
      email: newEmail,
      phone: newPhone || '(11) 99999-9999',
      role: 'client',
      cpf: newCPF,
      plan: newPlan,
      planStatus: 'pending',
      contractDate: new Date(),
      cardNumber: `ANN-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      sellerId: newSellerId,
      dependents: [],
      createdAt: new Date(),
      password: 'trocar123',
    })
    if (!result.success) {
      setError(result.error || 'Não foi possível cadastrar o cliente')
      return
    }
    setIsAddOpen(false)
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewCPF('')
    setNewPlan(clientPlans[0]?.name ?? '')
  }

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    client.email.toLowerCase().includes(search.toLowerCase()) ||
    client.cpf.includes(search) ||
    client.cardNumber.toLowerCase().includes(search.toLowerCase())
  )

  const getStatusBadge = (status: Client['planStatus']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700">Ativo</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">Pendente</Badge>
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700">Cancelado</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os associados de {tenant?.name}</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, CPF ou carteirinha..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
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
                          <Mail className="h-3.5 w-3.5" />
                          {client.email}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {client.phone}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-medium text-sm">{client.plan}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Desde {new Date(client.contractDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="h-4 w-4 text-secondary" />
                        <span className="font-mono">{client.cardNumber}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {client.dependents.length}
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
                          <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          <DropdownMenuItem>Ver Dependentes</DropdownMenuItem>
                          <DropdownMenuItem>Histórico</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Cancelar Plano</DropdownMenuItem>
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
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title={clients.length === 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum cliente encontrado'}
              description={
                clients.length === 0
                  ? 'Cadastre o primeiro associado do clube ou aguarde as vendas da equipe comercial.'
                  : 'Ajuste a busca para encontrar o associado.'
              }
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAddClient}>
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
              <DialogDescription>Adicione um associado diretamente pela administração</DialogDescription>
            </DialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome Completo *</label>
                <Input required value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">E-mail *</label>
                <Input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">CPF *</label>
                <Input required value={newCPF} onChange={e => setNewCPF(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Plano *</label>
                {clientPlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum plano cadastrado. Crie um em Planos antes de cadastrar clientes.
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
                <label className="text-sm font-medium">Vendedor responsável *</label>
                {sellers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum vendedor cadastrado. Crie um em Vendedores antes de cadastrar clientes.
                  </p>
                ) : (
                  <Select value={newSellerId} onValueChange={setNewSellerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map(seller => (
                        <SelectItem key={seller.id} value={seller.id}>
                          {seller.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:opacity-90 text-white"
                disabled={clientPlans.length === 0 || sellers.length === 0}
              >
                Cadastrar Cliente
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
