'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData, getLeadsBySellerId } from '@/contexts/tenant-data-context'
import type { Lead, LeadStatus, Seller } from '@/lib/types'
import {
  Plus,
  Phone,
  Mail,
  GripVertical,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormField, FormSelect } from '@/components/dashboard/form-dialog'
import { formatPhone, leadSchema } from '@/lib/form-schemas'
import { useZodForm } from '@/lib/use-zod-form'
import { leadSourceLabel, leadSourceOptions, DEFAULT_LEAD_SOURCE } from '@/lib/lead-sources'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const columns: { id: LeadStatus; title: string; color: string }[] = [
  { id: 'new', title: 'Novos', color: 'bg-blue-500' },
  { id: 'contacted', title: 'Contatados', color: 'bg-purple-500' },
  { id: 'qualified', title: 'Qualificados', color: 'bg-green-500' },
  { id: 'proposal', title: 'Proposta', color: 'bg-yellow-500' },
  { id: 'negotiation', title: 'Negociação', color: 'bg-orange-500' },
  { id: 'closed', title: 'Fechados', color: 'bg-teal-500' },
]

export default function PipelinePage() {
  const { user } = useAuth()
  const seller = user as Seller
  const { leads: allLeads, updateLead, createLead } = useTenantData()
  const leads = getLeadsBySellerId(allLeads, seller?.id || '')
  const { tenant } = useTenant()
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false)
  const form = useZodForm(
    leadSchema.pick({ name: true, email: true, phone: true, source: true, value: true, notes: true }),
    { name: '', email: '', phone: '', source: DEFAULT_LEAD_SOURCE, value: '0', notes: '' },
  )

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
      notes: data.notes ?? '',
      value: data.value,
      sellerId: seller.id,
    })
    setIsNewLeadOpen(false)
    form.reset()
  }

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, newStatus: LeadStatus) => {
    e.preventDefault()
    if (draggedLead && draggedLead.status !== newStatus) {
      updateLead(draggedLead.id, { status: newStatus })
    }
    setDraggedLead(null)
  }

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads.filter(lead => lead.status === status)
  }

  const getTotalValue = (status: LeadStatus) => {
    return getLeadsByStatus(status).reduce((acc, lead) => acc + lead.value, 0)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">Arraste os leads entre as colunas para atualizar o status</p>
        </div>
        <Dialog open={isNewLeadOpen} onOpenChange={setIsNewLeadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:opacity-90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Novo Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Novo Lead</DialogTitle>
              <DialogDescription>
                Preencha as informações do novo lead
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleAddLead} noValidate>
              <FormField label="Nome" htmlFor="name" error={form.errors.name} required>
                <Input id="name" placeholder="Nome completo" value={form.values.name} onChange={e => form.setField('name', e.target.value)} aria-invalid={!!form.errors.name} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="E-mail" htmlFor="email" error={form.errors.email} required>
                  <Input id="email" type="email" placeholder="email@exemplo.com" value={form.values.email} onChange={e => form.setField('email', e.target.value)} aria-invalid={!!form.errors.email} />
                </FormField>
                <FormField label="Telefone" htmlFor="phone" error={form.errors.phone} required hint="Com DDD">
                  <Input id="phone" placeholder="(11) 99999-9999" value={form.values.phone} onChange={e => form.setField('phone', e.target.value)} aria-invalid={!!form.errors.phone} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Origem" error={form.errors.source} required>
                  <FormSelect
                    value={form.values.source}
                    onChange={value => form.setField('source', value)}
                    placeholder="Selecione a origem"
                    options={leadSourceOptions}
                    invalid={!!form.errors.source}
                  />
                </FormField>
                <FormField label="Valor Estimado (R$)" htmlFor="value" error={form.errors.value} required>
                  <Input id="value" inputMode="decimal" placeholder="0,00" value={form.values.value} onChange={e => form.setField('value', e.target.value)} aria-invalid={!!form.errors.value} />
                </FormField>
              </div>
              <FormField label="Observações" htmlFor="notes" error={form.errors.notes}>
                <Textarea id="notes" placeholder="Informações adicionais sobre o lead..." value={form.values.notes} onChange={e => form.setField('notes', e.target.value)} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsNewLeadOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                  Adicionar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {columns.map(column => {
            const columnLeads = getLeadsByStatus(column.id)
            const totalValue = getTotalValue(column.id)
            
            return (
              <div
                key={column.id}
                className="w-72 flex-shrink-0"
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, column.id)}
              >
                <Card className="border-0 shadow-sm h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${column.color}`} />
                      <CardTitle className="text-sm font-medium">{column.title}</CardTitle>
                      <Badge variant="secondary" className="ml-auto">
                        {columnLeads.length}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      R$ {totalValue.toLocaleString('pt-BR')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 min-h-[400px]">
                    {columnLeads.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => handleDragStart(e, lead)}
                        className="p-3 bg-background border border-border rounded-lg cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <p className="font-medium text-sm truncate">{lead.name}</p>
                            </div>
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span className="truncate">{lead.email}</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                              <Badge variant="outline" className="text-xs">
                                {leadSourceLabel(lead.source)}
                              </Badge>
                              <span className="text-xs font-medium text-secondary">
                                R$ {lead.value.toLocaleString('pt-BR')}
                              </span>
                            </div>
                            {lead.interactions.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {lead.interactions.length} interação(ões)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {columnLeads.length === 0 && (
                      <div className="flex items-center justify-center h-24 border-2 border-dashed border-border rounded-lg">
                        <p className="text-sm text-muted-foreground">Arraste leads aqui</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
