'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Interaction, Lead, LeadStatus, TenantUser } from '@annetec/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { getOperatorAction, listOperatorSellersAction } from '@/lib/actions/operator-api'
import {
  getOperatorLeadAction,
  updateOperatorLeadAction,
  addOperatorLeadInteractionAction,
  createOperatorSaleAction,
} from '@/lib/actions/operator-crm-api'
import {
  ArrowLeft,
  Loader2,
  Phone,
  Mail,
  MessageSquare,
  StickyNote,
  Users as MeetingIcon,
  Plus,
  CheckCircle2,
  Trophy,
} from 'lucide-react'

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  closed: 'Fechado',
  lost: 'Perdido',
}

const STATUS_VARIANT: Record<LeadStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  new: 'outline',
  contacted: 'outline',
  qualified: 'secondary',
  proposal: 'secondary',
  negotiation: 'secondary',
  closed: 'default',
  lost: 'destructive',
}

const INTERACTION_ICON: Record<Interaction['type'], typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: MeetingIcon,
  note: StickyNote,
  whatsapp: MessageSquare,
}

const INTERACTION_LABEL: Record<Interaction['type'], string> = {
  call: 'Ligação',
  email: 'E-mail',
  meeting: 'Reunião',
  note: 'Nota',
  whatsapp: 'WhatsApp',
}

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [interactionOpen, setInteractionOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)

  const load = async (slug: string) => {
    setLoading(true)
    const result = await getOperatorLeadAction(slug, params.id)
    setLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setLead(result.data)
  }

  useEffect(() => {
    getOperatorAction().then(async result => {
      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }
      if (!result.data) {
        setError('A Annetec ainda não está configurada como operadora.')
        setLoading(false)
        return
      }
      setTenantSlug(result.data.slug)
      const sellersResult = await listOperatorSellersAction(result.data.slug)
      if (sellersResult.success) setSellers(sellersResult.data.filter(s => s.active))
      await load(result.data.slug)
    })
  }, [])

  const handleStatusChange = async (status: LeadStatus) => {
    if (!tenantSlug) return
    const result = await updateOperatorLeadAction(tenantSlug, params.id, { status })
    if (result.success) setLead(result.data)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error || 'Lead não encontrado.'}</CardContent>
        </Card>
      </div>
    )
  }

  const timeline = [...lead.interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{lead.name}</h1>
            <Badge variant={STATUS_VARIANT[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {lead.source ?? 'Origem não informada'} · {money(lead.estimatedValue)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={lead.status} onValueChange={v => handleStatusChange(v as LeadStatus)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([status, label]) => (
                <SelectItem key={status} value={status}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lead.status !== 'closed' && tenantSlug && (
            <ConvertToSaleDialog
              open={saleOpen}
              onOpenChange={setSaleOpen}
              tenantSlug={tenantSlug}
              lead={lead}
              sellers={sellers}
              onConverted={() => {
                setSaleOpen(false)
                router.push('/admin/leads')
              }}
            />
          )}
        </div>
      </div>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm text-foreground">{lead.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="text-sm text-foreground">{lead.phone ?? '—'}</p>
          </div>
          {lead.notes && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm text-foreground">{lead.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Interações</CardTitle>
          {tenantSlug && (
            <AddInteractionDialog
              open={interactionOpen}
              onOpenChange={setInteractionOpen}
              tenantSlug={tenantSlug}
              leadId={lead.id}
              onAdded={updated => setLead(updated)}
            />
          )}
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
          ) : (
            <div className="space-y-4">
              {timeline.map(interaction => {
                const Icon = INTERACTION_ICON[interaction.type]
                return (
                  <div key={interaction.id} className="flex gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-1.5 h-fit">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{INTERACTION_LABEL[interaction.type]}</span>{' '}
                        <span className="text-xs text-muted-foreground">
                          {new Date(interaction.occurredAt).toLocaleString('pt-BR')}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">{interaction.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Voltar para Leads
    </Link>
  )
}

function AddInteractionDialog({
  open,
  onOpenChange,
  tenantSlug,
  leadId,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  leadId: string
  onAdded: (lead: Lead) => void
}) {
  const [type, setType] = useState<Interaction['type']>('call')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!description) {
      setError('Descreva a interação')
      return
    }
    setSubmitting(true)
    const result = await addOperatorLeadInteractionAction(tenantSlug, leadId, {
      type,
      description,
      occurredAt: new Date().toISOString(),
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setDescription('')
    onOpenChange(false)
    onAdded(result.data)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1.5" /> Registrar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar interação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={v => setType(v as Interaction['type'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERACTION_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConvertToSaleDialog({
  open,
  onOpenChange,
  tenantSlug,
  lead,
  sellers,
  onConverted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  lead: Lead
  sellers: TenantUser[]
  onConverted: () => void
}) {
  const [sellerId, setSellerId] = useState(lead.sellerId ?? '')
  const [value, setValue] = useState(lead.estimatedValue ? String(lead.estimatedValue) : '')
  const [planCodigo, setPlanCodigo] = useState('')
  const [planName, setPlanName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!sellerId || !value) {
      setError('Selecione o vendedor e informe o valor')
      return
    }
    setSubmitting(true)
    const result = await createOperatorSaleAction(tenantSlug, {
      leadId: lead.id,
      clientUserId: null,
      clientName: lead.name,
      sellerId,
      planCodigo: planCodigo || null,
      planName: planName || null,
      value: Number(value),
      status: 'confirmed',
      soldAt: new Date().toISOString(),
      contractUpstreamCodigo: null,
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onConverted()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Trophy className="h-4 w-4 mr-1.5" /> Converter em venda
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Converter em venda</DialogTitle>
          <DialogDescription>
            Registra a venda e fecha o lead. Isso não cria o contrato na Digital Saúde — depois use "Nova adesão"
            para isso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Vendedor *</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
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
            <Label>Valor *</Label>
            <Input type="number" value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Código do plano</Label>
              <Input value={planCodigo} onChange={e => setPlanCodigo(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Nome do plano</Label>
              <Input value={planName} onChange={e => setPlanName(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
