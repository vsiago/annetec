'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Interaction, Lead, LeadStatus, TenantUser } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getOperatorAction, listOperatorSellersAction } from '@/lib/actions/operator-api'
import { AddInteractionWizard, ConvertToSaleWizard } from '@/components/admin-platform/forms/lead-wizards'
import { getOperatorLeadAction, updateOperatorLeadAction } from '@/lib/actions/operator-crm-api'
import { Phone, Mail, MessageSquare, StickyNote, Users as MeetingIcon, Plus, Trophy, Target, Contact, History } from 'lucide-react'

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  negotiation: 'Negociação',
  closed: 'Fechado',
  lost: 'Perdido',
}

const STATUS_TONE: Record<LeadStatus, StatusPillTone> = {
  new: 'neutral',
  contacted: 'neutral',
  qualified: 'info',
  proposal: 'info',
  negotiation: 'warning',
  closed: 'success',
  lost: 'danger',
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

  const backLink = <BackLink href="/admin/leads">Voltar para Leads</BackLink>

  if (loading) {
    return (
      <PageContainer>
        <PageHeader icon={Target} breadcrumb={backLink} title="Lead" />
        <SectionCard>
          <SectionSkeleton rows={4} label="Carregando lead…" />
        </SectionCard>
      </PageContainer>
    )
  }

  if (error || !lead) {
    return (
      <PageContainer>
        <PageHeader icon={Target} breadcrumb={backLink} title="Lead" />
        <ErrorState description={error || 'Lead não encontrado.'} />
      </PageContainer>
    )
  }

  const timeline = [...lead.interactions].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  return (
    <PageContainer>
      <PageHeader
        icon={Target}
        breadcrumb={backLink}
        title={lead.name}
        badge={<StatusPill tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</StatusPill>}
        description={`${lead.source ?? 'Origem não informada'} · ${money(lead.estimatedValue)}`}
        actions={
          <>
            <Select value={lead.status} onValueChange={v => handleStatusChange(v as LeadStatus)}>
              <SelectTrigger aria-label="Situação do lead" className="w-44 rounded-[10px] data-[size=default]:h-11">
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
              <>
                <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setSaleOpen(true)}>
                  <Trophy aria-hidden="true" /> Converter em venda
                </Button>
                <ConvertToSaleWizard
                  open={saleOpen}
                  onOpenChange={setSaleOpen}
                  tenantSlug={tenantSlug}
                  lead={lead}
                  sellers={sellers}
                  onConverted={() => {
                    setSaleOpen(false)
                    router.push('/admin/leads')
                  }}
                  onRegistered={() => load(tenantSlug)}
                />
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <SectionCard title="Contato" icon={Contact} className="lg:col-span-1">
          <dl className="m-0 grid gap-4">
            <div>
              <dt className="text-[13px] text-muted-foreground">E-mail</dt>
              <dd className="m-0 wrap-break-word text-sm text-foreground">{lead.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Telefone</dt>
              <dd className="m-0 text-sm text-foreground">{lead.phone ?? '—'}</dd>
            </div>
            {lead.notes && (
              <div>
                <dt className="text-[13px] text-muted-foreground">Observações</dt>
                <dd className="m-0 wrap-break-word text-sm text-foreground">{lead.notes}</dd>
              </div>
            )}
          </dl>
        </SectionCard>

        <SectionCard
          title="Interações"
          icon={MessageSquare}
          className="lg:col-span-2"
          actions={
            tenantSlug ? (
              <>
                <Button variant="outline" className="h-10 rounded-[10px] px-4 font-semibold" onClick={() => setInteractionOpen(true)}>
                  <Plus aria-hidden="true" /> Registrar
                </Button>
                <AddInteractionWizard
                  open={interactionOpen}
                  onOpenChange={setInteractionOpen}
                  tenantSlug={tenantSlug}
                  leadId={lead.id}
                  onAdded={updated => setLead(updated)}
                  labels={INTERACTION_LABEL}
                  icons={INTERACTION_ICON}
                />
              </>
            ) : undefined
          }
        >
          {timeline.length === 0 ? (
            <EmptyState size="sm" icon={History} title="Nenhuma interação registrada ainda" />
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {timeline.map(interaction => {
                const Icon = INTERACTION_ICON[interaction.type]
                return (
                  <li key={interaction.id} className="flex gap-3 rounded-xl border border-border p-4">
                    <span
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-secondary"
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm text-foreground">
                        <span className="font-semibold">{INTERACTION_LABEL[interaction.type]}</span>
                        <time dateTime={interaction.occurredAt} className="text-[13px] text-muted-foreground">
                          {new Date(interaction.occurredAt).toLocaleString('pt-BR')}
                        </time>
                      </p>
                      <p className="m-0 wrap-break-word text-sm text-muted-foreground">{interaction.description}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  )
}
