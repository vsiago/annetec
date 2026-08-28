'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Lead, LeadStatus, TenantUser } from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { getOperatorAction, listOperatorSellersAction } from '@/lib/actions/operator-api'
import { listOperatorLeadsAction, createOperatorLeadAction, updateOperatorLeadAction } from '@/lib/actions/operator-crm-api'
import { Search, Loader2, Plus, UserPlus, Phone, Mail } from 'lucide-react'

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'Novo' },
  { status: 'contacted', label: 'Contatado' },
  { status: 'qualified', label: 'Qualificado' },
  { status: 'proposal', label: 'Proposta' },
  { status: 'negotiation', label: 'Negociação' },
  { status: 'closed', label: 'Fechado' },
  { status: 'lost', label: 'Perdido' },
]

function money(value: number | null) {
  if (value === null) return null
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function OperatorLeadsPage() {
  const router = useRouter()
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [loadingOperator, setLoadingOperator] = useState(true)
  const [operatorError, setOperatorError] = useState('')

  const [leads, setLeads] = useState<Lead[]>([])
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)

  useEffect(() => {
    getOperatorAction().then(async result => {
      if (!result.success) {
        setOperatorError(result.error)
        setLoadingOperator(false)
        return
      }
      if (!result.data) {
        setOperatorError('A Annetec ainda não está configurada como operadora.')
        setLoadingOperator(false)
        return
      }
      setTenantSlug(result.data.slug)
      const sellersResult = await listOperatorSellersAction(result.data.slug)
      if (sellersResult.success) setSellers(sellersResult.data.filter(s => s.active))
      setLoadingOperator(false)
    })
  }, [])

  const refresh = async (slug: string) => {
    setLoadingLeads(true)
    const result = await listOperatorLeadsAction(slug)
    setLoadingLeads(false)
    if (result.success) setLeads(result.data)
  }

  useEffect(() => {
    if (tenantSlug) refresh(tenantSlug)
  }, [tenantSlug])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return leads
    return leads.filter(
      lead =>
        lead.name.toLowerCase().includes(term) ||
        (lead.email ?? '').toLowerCase().includes(term) ||
        (lead.phone ?? '').includes(term),
    )
  }, [leads, search])

  const byStatus = useMemo(() => {
    const map = new Map<LeadStatus, Lead[]>()
    for (const col of COLUMNS) map.set(col.status, [])
    for (const lead of filtered) map.get(lead.status)?.push(lead)
    return map
  }, [filtered])

  const handleMove = async (lead: Lead, status: LeadStatus) => {
    if (!tenantSlug) return
    setMovingId(lead.id)
    const result = await updateOperatorLeadAction(tenantSlug, lead.id, { status })
    setMovingId(null)
    if (result.success) await refresh(tenantSlug)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground">Funil comercial da Annetec — antes de virar contrato.</p>
        </div>
        {tenantSlug && (
          <AddLeadDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            tenantSlug={tenantSlug}
            sellers={sellers}
            onCreated={() => refresh(tenantSlug)}
          />
        )}
      </div>

      {operatorError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{operatorError}</CardContent>
        </Card>
      )}

      {!operatorError && (
        <>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar lead"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loadingLeads || loadingOperator ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
            </div>
          ) : leads.length === 0 ? (
            <EmptyStateCard
              icon={UserPlus}
              title="Nenhum lead cadastrado"
              description='Clique em "Novo lead" para começar o funil.'
            />
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3 min-w-max">
                {COLUMNS.map(col => (
                  <div key={col.status} className="w-72 shrink-0">
                    <div className="flex items-center justify-between px-1 mb-2">
                      <p className="text-sm font-medium text-foreground">{col.label}</p>
                      <Badge variant="outline" className="text-xs">
                        {byStatus.get(col.status)?.length ?? 0}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {byStatus.get(col.status)?.map(lead => (
                        <Card
                          key={lead.id}
                          className="border border-border/80 shadow-xs bg-card cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => router.push(`/admin/leads/${lead.id}`)}
                        >
                          <CardContent className="p-3 space-y-2">
                            <p className="text-sm font-medium text-foreground">{lead.name}</p>
                            {lead.phone && (
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" /> {lead.phone}
                              </p>
                            )}
                            {lead.email && (
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                                <Mail className="h-3 w-3 shrink-0" /> {lead.email}
                              </p>
                            )}
                            {money(lead.estimatedValue) && (
                              <p className="text-xs font-medium text-foreground">{money(lead.estimatedValue)}</p>
                            )}
                            <div onClick={e => e.stopPropagation()}>
                              <Select
                                value={lead.status}
                                onValueChange={v => handleMove(lead, v as LeadStatus)}
                                disabled={movingId === lead.id}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {COLUMNS.map(c => (
                                    <SelectItem key={c.status} value={c.status} className="text-xs">
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AddLeadDialog({
  open,
  onOpenChange,
  tenantSlug,
  sellers,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  sellers: TenantUser[]
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')
  const [sellerId, setSellerId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name) {
      setError('Informe o nome')
      return
    }
    setSubmitting(true)
    const result = await createOperatorLeadAction(tenantSlug, {
      name,
      email: email || null,
      phone: phone || null,
      source: source || null,
      status: 'new',
      notes: notes || null,
      estimatedValue: estimatedValue ? Number(estimatedValue) : null,
      sellerId: sellerId || null,
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setName('')
    setEmail('')
    setPhone('')
    setSource('')
    setEstimatedValue('')
    setSellerId('')
    setNotes('')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:opacity-90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Novo lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>Entra no funil como "Novo".</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Origem</Label>
              <Input value={source} onChange={e => setSource(e.target.value)} placeholder="Indicação, site..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor estimado</Label>
              <Input
                type="number"
                value={estimatedValue}
                onChange={e => setEstimatedValue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Vendedor responsável</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem vendedor" />
              </SelectTrigger>
              <SelectContent>
                {sellers.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Observações</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
