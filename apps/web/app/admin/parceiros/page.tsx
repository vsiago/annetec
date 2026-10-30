'use client'

import { useEffect, useState } from 'react'
import type { Benefit, BenefitCategory, Partner, PartnerCategory } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BenefitWizard, PartnerWizard } from '@/components/admin-platform/forms/partner-wizards'
import {
  listOperatorPartnersAction,
  deleteOperatorPartnerAction,
  listOperatorBenefitsAction,
  deleteOperatorBenefitAction,
} from '@/lib/actions/operator-network-api'
import { Handshake, Gift, Trash2, MapPin, Phone, Pencil } from 'lucide-react'

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
        <PartnerWizard
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
        <BenefitWizard
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
