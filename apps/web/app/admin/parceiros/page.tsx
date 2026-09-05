'use client'

import { useEffect, useState } from 'react'
import type { Benefit, BenefitCategory, Partner, PartnerCategory, UF } from '@annetec/contracts'
import { UFS } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import {
  listOperatorPartnersAction,
  createOperatorPartnerAction,
  updateOperatorPartnerAction,
  deleteOperatorPartnerAction,
  listOperatorBenefitsAction,
  createOperatorBenefitAction,
  updateOperatorBenefitAction,
  deleteOperatorBenefitAction,
} from '@/lib/actions/operator-network-api'
import { Plus, Loader2, Handshake, Gift, Trash2, MapPin, Phone, Pencil } from 'lucide-react'

const PARTNER_CATEGORY_LABEL: Record<PartnerCategory, string> = {
  health: 'Saúde',
  dental: 'Odonto',
  pharmacy: 'Farmácia',
  wellness: 'Bem-estar',
  food: 'Alimentação',
  education: 'Educação',
  other: 'Outro',
}

const BENEFIT_CATEGORY_LABEL: Record<BenefitCategory, string> = {
  health: 'Saúde',
  dental: 'Odonto',
  pharmacy: 'Farmácia',
  funeral: 'Funeral',
  discount: 'Desconto',
}

export default function OperatorRedePage() {
  // De qual inquilino são os dados desta tela — ver AdminScopeProvider.
  const { slug: tenantSlug, isLoading: loadingOperator, error: operatorError } = useAdminScope()


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rede de Parceiros</h1>
        <p className="text-muted-foreground">Clube de benefícios oferecido pela Annetec — conteúdo próprio.</p>
      </div>

      {operatorError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{operatorError}</CardContent>
        </Card>
      )}

      {!operatorError && tenantSlug && (
        <Tabs defaultValue="parceiros">
          <TabsList>
            <TabsTrigger value="parceiros">Parceiros</TabsTrigger>
            <TabsTrigger value="beneficios">Benefícios</TabsTrigger>
          </TabsList>
          <TabsContent value="parceiros" className="pt-4">
            <PartnersTab tenantSlug={tenantSlug} />
          </TabsContent>
          <TabsContent value="beneficios" className="pt-4">
            <BenefitsTab tenantSlug={tenantSlug} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function PartnersTab({ tenantSlug }: { tenantSlug: string }) {
  /** Parceiro em edição — `null` quando o diálogo está criando. */
  const [editing, setEditing] = useState<Partner | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const result = await listOperatorPartnersAction(tenantSlug)
    setLoading(false)
    if (result.success) setPartners(result.data)
  }

  useEffect(() => {
    refresh()
  }, [tenantSlug])

  const handleDelete = async (id: string) => {
    const result = await deleteOperatorPartnerAction(tenantSlug, id)
    if (result.success) await refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddPartnerDialog
          open={addOpen}
          onOpenChange={aberto => {
            setAddOpen(aberto)
            if (!aberto) setEditing(null)
          }}
          tenantSlug={tenantSlug}
          editing={editing}
          onCreated={refresh}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
        </div>
      ) : partners.length === 0 ? (
        <EmptyStateCard
          icon={Handshake}
          title="Nenhum parceiro neste inquilino"
          description="A rede credenciada é conteúdo próprio da Annetec — a Digital Saúde não tem equivalente, então cada inquilino monta a sua. Troque de inquilino no seletor acima para ver outra."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {partners.map(partner => (
            <Card key={partner.id} className="border border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{partner.name}</p>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setEditing(partner)
                        setAddOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Editar {partner.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(partner.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Remover {partner.name}</span>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{PARTNER_CATEGORY_LABEL[partner.category]}</Badge>
                  <Badge variant="secondary" className="text-xs">{partner.discountPercent}% off</Badge>
                  {partner.status === 'inactive' && (
                    <Badge variant="destructive" className="text-xs">Inativo</Badge>
                  )}
                </div>
                {(partner.city || partner.state) && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {[partner.city, partner.state].filter(Boolean).join(' / ')}
                  </p>
                )}
                {partner.phone && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {partner.phone}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** Cria ou edita — `editing` decide qual. */
function AddPartnerDialog({
  open,
  onOpenChange,
  tenantSlug,
  editing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  editing: Partner | null
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<PartnerCategory>('health')
  const [discountPercent, setDiscountPercent] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState<UF | ''>('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Repõe o formulário sempre que o diálogo abre, para não carregar resíduo
  // de um parceiro editado antes.
  useEffect(() => {
    if (!open) return
    setError('')
    setName(editing?.name ?? '')
    setCategory(editing?.category ?? 'health')
    setDiscountPercent(editing ? String(editing.discountPercent) : '')
    setAddress(editing?.address ?? '')
    setPhone(editing?.phone ?? '')
    setCity(editing?.city ?? '')
    setState((editing?.state as UF | null) ?? '')
  }, [open, editing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !discountPercent) {
      setError('Preencha nome e desconto')
      return
    }
    const payload = {
      name,
      category,
      discountPercent: Number(discountPercent),
      address: address || null,
      phone: phone || null,
      city: city || null,
      state: state || null,
      status: editing?.status ?? ('active' as const),
    }

    setSubmitting(true)
    const result = editing
      ? await updateOperatorPartnerAction(tenantSlug, editing.id, payload)
      : await createOperatorPartnerAction(tenantSlug, payload)
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setName('')
    setDiscountPercent('')
    setAddress('')
    setPhone('')
    setCity('')
    setState('')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:opacity-90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Novo parceiro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar parceiro' : 'Novo parceiro'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={v => setCategory(v as PartnerCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PARTNER_CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Desconto (%) *</Label>
              <Input type="number" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Endereço</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5 col-span-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>UF</Label>
              <Select value={state} onValueChange={v => setState(v as UF)}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map(uf => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Cidade</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Salvar parceiro' : 'Criar parceiro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BenefitsTab({ tenantSlug }: { tenantSlug: string }) {
  const [editing, setEditing] = useState<Benefit | null>(null)
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const result = await listOperatorBenefitsAction(tenantSlug)
    setLoading(false)
    if (result.success) setBenefits(result.data)
  }

  useEffect(() => {
    refresh()
  }, [tenantSlug])

  const handleDelete = async (id: string) => {
    const result = await deleteOperatorBenefitAction(tenantSlug, id)
    if (result.success) await refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddBenefitDialog
          open={addOpen}
          onOpenChange={aberto => {
            setAddOpen(aberto)
            if (!aberto) setEditing(null)
          }}
          tenantSlug={tenantSlug}
          editing={editing}
          onCreated={refresh}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
        </div>
      ) : benefits.length === 0 ? (
        <EmptyStateCard
          icon={Gift}
          title="Nenhum benefício neste inquilino"
          description="O clube de benefícios é conteúdo próprio da Annetec, cadastrado por inquilino."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {benefits.map(benefit => (
            <Card key={benefit.id} className="border border-border/80 shadow-xs bg-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">{benefit.name}</p>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setEditing(benefit)
                        setAddOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Editar {benefit.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(benefit.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Remover {benefit.name}</span>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{BENEFIT_CATEGORY_LABEL[benefit.category]}</Badge>
                  {benefit.discountPercent !== null && (
                    <Badge variant="secondary" className="text-xs">{benefit.discountPercent}% off</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{benefit.description}</p>
                {benefit.provider && <p className="text-xs text-muted-foreground">Fornecedor: {benefit.provider}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/** Cria ou edita — `editing` decide qual. */
function AddBenefitDialog({
  open,
  onOpenChange,
  tenantSlug,
  editing,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  editing: Benefit | null
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<BenefitCategory>('discount')
  const [discountPercent, setDiscountPercent] = useState('')
  const [provider, setProvider] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setCategory(editing?.category ?? 'discount')
    setDiscountPercent(editing?.discountPercent != null ? String(editing.discountPercent) : '')
    setProvider(editing?.provider ?? '')
  }, [open, editing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !description) {
      setError('Preencha nome e descrição')
      return
    }
    const payload = {
      name,
      description,
      category,
      discountPercent: discountPercent ? Number(discountPercent) : null,
      provider: provider || null,
      locations: editing?.locations ?? [],
    }

    setSubmitting(true)
    const result = editing
      ? await updateOperatorBenefitAction(tenantSlug, editing.id, payload)
      : await createOperatorBenefitAction(tenantSlug, payload)
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setName('')
    setDescription('')
    setDiscountPercent('')
    setProvider('')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:opacity-90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Novo benefício
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar benefício' : 'Novo benefício'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={v => setCategory(v as BenefitCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BENEFIT_CATEGORY_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Desconto (%)</Label>
              <Input type="number" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Fornecedor</Label>
            <Input value={provider} onChange={e => setProvider(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Salvar benefício' : 'Criar benefício'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
