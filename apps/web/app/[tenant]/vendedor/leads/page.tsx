'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormSelect } from '@/components/dashboard/form-dialog'
import { formatPhone, leadSchema } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import { leadSourceLabel, leadSourceOptions, DEFAULT_LEAD_SOURCE } from '@/lib/lead-sources'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData, getLeadsBySellerId } from '@/contexts/tenant-data-context'
import type { Lead, Seller } from '@/lib/types'
import {
  Search,
  Plus,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  Filter,
} from 'lucide-react'
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

const statusLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Novo', color: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'Contatado', color: 'bg-purple-100 text-purple-700' },
  qualified: { label: 'Qualificado', color: 'bg-green-100 text-green-700' },
  proposal: { label: 'Proposta', color: 'bg-yellow-100 text-yellow-700' },
  negotiation: { label: 'Negociação', color: 'bg-orange-100 text-orange-700' },
  closed: { label: 'Fechado', color: 'bg-teal-100 text-teal-700' },
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-700' },
}

export default function LeadsPage() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const seller = user as Seller
  const { leads, createLead } = useTenantData()
  const allLeads = getLeadsBySellerId(leads, seller?.id || '')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const form = useZodForm(leadSchema.pick({ name: true, email: true, phone: true, source: true, value: true }), {
    name: '',
    email: '',
    phone: '',
    source: DEFAULT_LEAD_SOURCE,
    value: '0',
  })

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = form.validate()
    if (!data || !tenant || !seller) return
    await createLead({
      name: data.name,
      email: data.email,
      phone: formatPhone(data.phone),
      source: data.source,
      status: 'new',
      notes: '',
      value: data.value,
      sellerId: seller.id,
    })
    setIsAddOpen(false)
    form.reset()
  }

  const filteredLeads = allLeads.filter(lead => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.email.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search)
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground">Gerencie todos os seus leads</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Lead
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="contacted">Contatado</SelectItem>
                <SelectItem value="qualified">Qualificado</SelectItem>
                <SelectItem value="proposal">Proposta</SelectItem>
                <SelectItem value="negotiation">Negociação</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Lead</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Origem</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Valor</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Interações</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(lead => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{lead.notes}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[150px]">{lead.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {lead.phone}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge variant="outline">{leadSourceLabel(lead.source) || '—'}</Badge>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-medium text-secondary">
                        R$ {lead.value.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <Badge className={statusLabels[lead.status].color}>
                        {statusLabels[lead.status].label}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MessageSquare className="h-4 w-4" />
                        {lead.interactions.length}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {filteredLeads.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum lead encontrado</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAddLead} noValidate>
            <DialogHeader>
              <DialogTitle>Novo Lead</DialogTitle>
              <DialogDescription>Cadastre um novo lead no seu funil de vendas</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <FormField label="Nome" htmlFor="lead-name" error={form.errors.name} required>
                <Input id="lead-name" value={form.values.name} onChange={e => form.setField('name', e.target.value)} placeholder="Ex: Ana Souza" aria-invalid={!!form.errors.name} />
              </FormField>
              <FormField label="E-mail" htmlFor="lead-email" error={form.errors.email} required>
                <Input id="lead-email" type="email" value={form.values.email} onChange={e => form.setField('email', e.target.value)} placeholder="Ex: ana@email.com" aria-invalid={!!form.errors.email} />
              </FormField>
              <FormField label="Telefone" htmlFor="lead-phone" error={form.errors.phone} required hint="Com DDD">
                <Input id="lead-phone" value={form.values.phone} onChange={e => form.setField('phone', e.target.value)} placeholder="Ex: (11) 98888-7777" aria-invalid={!!form.errors.phone} />
              </FormField>
              <FormField label="Origem" error={form.errors.source} required>
                <FormSelect
                  value={form.values.source}
                  onChange={value => form.setField('source', value)}
                  placeholder="Selecione a origem"
                  options={leadSourceOptions}
                  invalid={!!form.errors.source}
                />
              </FormField>
              <FormField label="Valor estimado (R$)" htmlFor="lead-value" error={form.errors.value} required>
                <Input id="lead-value" inputMode="decimal" value={form.values.value} onChange={e => form.setField('value', e.target.value)} placeholder="Ex: 2400" aria-invalid={!!form.errors.value} />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                Cadastrar Lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
