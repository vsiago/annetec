'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Lead, LeadStatus, TenantUser } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useAdminScope } from '@/contexts/admin-scope-context'
import { listOperatorSellersAction } from '@/lib/actions/operator-api'
import { listOperatorLeadsAction, createOperatorLeadAction, updateOperatorLeadAction } from '@/lib/actions/operator-crm-api'
import { Search, Loader2, Plus, UserPlus, Phone, Mail, Funnel } from 'lucide-react'

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
  const { slug: tenantSlug, isLoading: loadingOperator, error: operatorError } = useAdminScope()

  const [leads, setLeads] = useState<Lead[]>([])
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)

  // Os vendedores do inquilino alimentam o seletor de responsável pelo lead.
  useEffect(() => {
    if (!tenantSlug) return
    listOperatorSellersAction(tenantSlug).then(result => {
      if (result.success) setSellers(result.data.filter(s => s.active))
    })
  }, [tenantSlug])

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
    <PageContainer>
      <PageHeader
        icon={Funnel}
        title="Leads"
        description="Funil comercial do clube selecionado acima — antes de virar contrato."
        actions={
          tenantSlug ? (
            <AddLeadDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              tenantSlug={tenantSlug}
              sellers={sellers}
              onCreated={() => refresh(tenantSlug)}
            />
          ) : undefined
        }
      />

      {operatorError ? (
        <ErrorState description={operatorError} />
      ) : (
        <>
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="busca-leads" className="sr-only">
              Buscar lead
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="busca-leads"
              type="search"
              placeholder="Buscar lead"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
              className="h-11 rounded-[10px] bg-white pl-10"
            />
          </div>

          {loadingLeads || loadingOperator ? (
            <SectionCard>
              <SectionSkeleton rows={5} label="Carregando leads…" />
            </SectionCard>
          ) : leads.length === 0 ? (
            <EmptyState
              framed
              icon={UserPlus}
              title="Nenhum lead neste clube"
              description='O funil é dado da Annetec, não vem da Digital Saúde — começa vazio até alguém criar o primeiro lead. Use "Novo lead", ou troque de clube no seletor acima.'
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              framed
              icon={Search}
              title="Nenhum lead encontrado"
              description="Nenhum lead combina com essa busca."
              action={
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-[10px] px-4 font-semibold"
                  onClick={() => setSearch('')}
                >
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <div
              role="region"
              aria-label="Funil de leads"
              tabIndex={0}
              className="-mx-1 overflow-x-auto rounded-xl px-1 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            >
              <div className="flex min-w-max gap-4">
                {COLUMNS.map(col => {
                  const items = byStatus.get(col.status) ?? []
                  return (
                    <section
                      key={col.status}
                      aria-labelledby={`coluna-${col.status}`}
                      className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-[#F9FAFB] p-3"
                    >
                      <div className="flex items-center justify-between gap-2 px-1 pt-1">
                        <h2 id={`coluna-${col.status}`} className="m-0 text-sm font-semibold text-foreground">
                          {col.label}
                        </h2>
                        <StatusPill tone="neutral">{items.length}</StatusPill>
                      </div>
                      {items.length === 0 ? (
                        <p className="m-0 rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                          Nenhum lead nesta etapa
                        </p>
                      ) : (
                        items.map(lead => {
                          const value = money(lead.estimatedValue)
                          return (
                            <article
                              key={lead.id}
                              className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors hover:border-secondary/40"
                            >
                              <Link
                                href={`/admin/leads/${lead.id}`}
                                className="text-sm font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-secondary focus-visible:after:ring-offset-2"
                              >
                                {lead.name}
                              </Link>
                              {lead.phone && (
                                <p className="m-0 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                                  <Phone className="size-3.5 shrink-0" aria-hidden="true" /> {lead.phone}
                                </p>
                              )}
                              {lead.email && (
                                <p className="m-0 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
                                  <Mail className="size-3.5 shrink-0" aria-hidden="true" /> {lead.email}
                                </p>
                              )}
                              {value && <p className="m-0 text-sm font-semibold text-foreground">{value}</p>}
                              <div className="relative z-10 pt-1">
                                <Select
                                  value={lead.status}
                                  onValueChange={v => handleMove(lead, v as LeadStatus)}
                                  disabled={movingId === lead.id}
                                >
                                  <SelectTrigger
                                    aria-label={`Etapa do lead ${lead.name}`}
                                    className="w-full rounded-[10px] text-sm data-[size=default]:h-10"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {COLUMNS.map(c => (
                                      <SelectItem key={c.status} value={c.status}>
                                        {c.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </section>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
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
        <Button className="h-11 rounded-[10px] px-4 font-semibold">
          <Plus aria-hidden="true" /> Novo lead
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
          {error && <p className="text-sm text-[#B42318]">{error}</p>}
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
