'use client'

import { useEffect, useState } from 'react'
import type { Benefit, BenefitCategory, Partner, PartnerCategory, UF } from '@annetec/contracts'
import { UFS } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  const { slug: tenantSlug, error: operatorError } = useAdminScope()

  return (
    <PageContainer>
      <PageHeader
        icon={Handshake}
        title="Rede de Parceiros"
        description="Clube de benefícios oferecido pela Annetec — conteúdo próprio."
      />

      {operatorError ? (
        <ErrorState description={operatorError} />
      ) : !tenantSlug ? (
        <SectionCard>
          <SectionSkeleton rows={4} label="Carregando…" />
        </SectionCard>
      ) : (
        <Tabs defaultValue="parceiros" className="gap-0">
          <TabsList className="h-12 rounded-xl">
            <TabsTrigger value="parceiros" className="rounded-lg px-5">
              Parceiros
            </TabsTrigger>
            <TabsTrigger value="beneficios" className="rounded-lg px-5">
              Benefícios
            </TabsTrigger>
          </TabsList>
          <TabsContent value="parceiros" className="pt-6">
            <PartnersTab tenantSlug={tenantSlug} />
          </TabsContent>
          <TabsContent value="beneficios" className="pt-6">
            <BenefitsTab tenantSlug={tenantSlug} />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
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
    <div className="flex flex-col gap-4">
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
        <SectionCard>
          <SectionSkeleton rows={4} label="Carregando parceiros…" />
        </SectionCard>
      ) : partners.length === 0 ? (
        <EmptyState
          framed
          icon={Handshake}
          title="Nenhum parceiro neste clube"
          description="A rede credenciada é conteúdo próprio da Annetec — a Digital Saúde não tem equivalente, então cada clube monta a sua. Troque de clube no seletor acima para ver outra."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {partners.map(partner => (
            <SectionCard
              key={partner.id}
              title={partner.name}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    onClick={() => {
                      setEditing(partner)
                      setAddOpen(true)
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="sr-only">Editar {partner.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                    onClick={() => handleDelete(partner.id)}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="sr-only">Remover {partner.name}</span>
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="neutral">{PARTNER_CATEGORY_LABEL[partner.category]}</StatusPill>
                  <StatusPill tone="info">{partner.discountPercent}% off</StatusPill>
                  {partner.status === 'inactive' && <StatusPill tone="danger">Inativo</StatusPill>}
                </div>
                {(partner.city || partner.state) && (
                  <p className="m-0 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" aria-hidden="true" />{' '}
                    {[partner.city, partner.state].filter(Boolean).join(' / ')}
                  </p>
                )}
                {partner.phone && (
                  <p className="m-0 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" aria-hidden="true" /> {partner.phone}
                  </p>
                )}
              </div>
            </SectionCard>
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
    // Esta é a visão da equipe Annetec, que cadastra o essencial do parceiro.
    // Vitrine (frase, site, especialidades, início do credenciamento) é do
    // painel do inquilino — aqui os campos são preservados na edição em vez de
    // zerados, senão salvar daqui apagaria o que o inquilino escreveu.
    const payload = {
      name,
      tagline: editing?.tagline ?? null,
      category,
      discountPercent: Number(discountPercent),
      address: address || null,
      phone: phone || null,
      email: editing?.email ?? null,
      website: editing?.website ?? null,
      city: city || null,
      state: state || null,
      specialties: editing?.specialties ?? [],
      since: editing?.since ?? null,
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
        <Button className="h-11 rounded-[10px] px-4 font-semibold">
          <Plus aria-hidden="true" /> Novo parceiro
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
          {error && <p className="text-sm text-[#B42318]">{error}</p>}
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
    <div className="flex flex-col gap-4">
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
        <SectionCard>
          <SectionSkeleton rows={4} label="Carregando benefícios…" />
        </SectionCard>
      ) : benefits.length === 0 ? (
        <EmptyState
          framed
          icon={Gift}
          title="Nenhum benefício neste clube"
          description="O clube de benefícios é conteúdo próprio da Annetec, cadastrado por clube."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {benefits.map(benefit => (
            <SectionCard
              key={benefit.id}
              title={benefit.name}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    onClick={() => {
                      setEditing(benefit)
                      setAddOpen(true)
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="sr-only">Editar {benefit.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                    onClick={() => handleDelete(benefit.id)}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="sr-only">Remover {benefit.name}</span>
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone="neutral">{BENEFIT_CATEGORY_LABEL[benefit.category]}</StatusPill>
                  {benefit.discountPercent !== null && (
                    <StatusPill tone="info">{benefit.discountPercent}% off</StatusPill>
                  )}
                </div>
                <p className="m-0 text-sm text-muted-foreground">{benefit.description}</p>
                {benefit.provider && (
                  <p className="m-0 text-[13px] text-muted-foreground">Fornecedor: {benefit.provider}</p>
                )}
              </div>
            </SectionCard>
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
        <Button className="h-11 rounded-[10px] px-4 font-semibold">
          <Plus aria-hidden="true" /> Novo benefício
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
          {error && <p className="text-sm text-[#B42318]">{error}</p>}
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
