'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Bot,
  Building2,
  CalendarClock,
  FileSignature,
  Handshake,
  History,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Phone,
  StickyNote,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  PROSPECT_INTERACTION_KIND_LABELS,
  PROSPECT_ORIGIN_LABELS,
  formatPhone,
  type ProspectDetail,
  type ProspectInteractionKind,
} from '@annetec/contracts'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { formatCnpj } from '@/lib/adapters/platform-console'
import {
  InfoRow,
  SellerProposalStatusPill,
  StagePill,
  formatDateTime,
  formatInt,
  formatMoney,
} from '@/components/sales/sales-ui'
import { LinkWizard } from '@/components/vendas/link-wizard'
import { InteractionWizard, proposalInProgress, useMoveStage } from '@/components/vendas/prospect-actions'
import { NextAction, ProspectMenu } from '@/components/vendas/prospect-card'
import { canGenerateLink } from '@/components/vendas/prospect-picker'
import { ProspectWizard } from '@/components/vendas/prospect-wizard'
import { getSellerProspectAction } from '@/lib/actions/vendas-api'

const KIND_ICON: Record<ProspectInteractionKind, LucideIcon> = {
  ligacao: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reuniao: Handshake,
  visita: MapPin,
  nota: StickyNote,
  sistema: Bot,
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { canWrite } = useSellerProfile()
  const { data: prospect, error, loading, reload, setData } = useConsoleData(() => getSellerProspectAction(id), [id])
  const [editOpen, setEditOpen] = useState(false)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)

  const onUpdated = (detail: ProspectDetail) => setData(detail)
  const { move, dialog: lostDialog, busyId } = useMoveStage(onUpdated)

  if (loading && !prospect) {
    return (
      <PageContainer>
        <div role="status" aria-busy="true" className="flex flex-col gap-6">
          <span className="sr-only">Carregando o prospect…</span>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full max-w-2xl rounded-2xl" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!prospect) {
    return (
      <PageContainer>
        <div>
          <BackLink href="/vendas/funil">Voltar para o funil</BackLink>
        </div>
        <ErrorState
          title={error ?? 'Não encontramos este prospect'}
          description="Ele pode ter sido passado para outro vendedor. Volte para o funil e escolha outro."
          onRetry={() => reload()}
        />
      </PageContainer>
    )
  }

  const place = [prospect.city, prospect.state].filter(Boolean).join('/')
  const linkable = canWrite && canGenerateLink(prospect)

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<BackLink href="/vendas/funil">Voltar para o funil</BackLink>}
        icon={Building2}
        title={prospect.name}
        badge={<StagePill stage={prospect.stage} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {prospect.cnpj ? <span>CNPJ {formatCnpj(prospect.cnpj)}</span> : <span>Sem CNPJ cadastrado</span>}
            {place ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{place}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>Origem: {PROSPECT_ORIGIN_LABELS[prospect.origin]}</span>
          </span>
        }
        actions={
          <>
            {canWrite ? (
              <>
                <Button variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setInteractionOpen(true)}>
                  <MessagesSquare aria-hidden="true" />
                  Registrar interação
                </Button>
                <Button variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setEditOpen(true)}>
                  <Pencil aria-hidden="true" />
                  Editar dados
                </Button>
              </>
            ) : null}
            {linkable ? (
              <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setLinkOpen(true)}>
                <Link2 aria-hidden="true" />
                Gerar link de contratação
              </Button>
            ) : null}
            <ProspectMenu
              prospect={prospect}
              canWrite={canWrite}
              busy={busyId === prospect.id}
              onMove={(item, target) => void move(item, target)}
              onInteraction={() => setInteractionOpen(true)}
              onLink={() => setLinkOpen(true)}
            />
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          title="Linha do tempo"
          description="Ligações, conversas e o que a plataforma registrou sozinha."
          icon={History}
          padded={false}
          actions={
            canWrite ? (
              <Button variant="outline" className="h-10 rounded-[10px] px-3 text-sm font-semibold" onClick={() => setInteractionOpen(true)}>
                <MessagesSquare aria-hidden="true" />
                Registrar interação
              </Button>
            ) : null
          }
        >
          {loading && prospect.interactions.length === 0 ? (
            <div className="p-5">
              <SectionSkeleton rows={3} />
            </div>
          ) : prospect.interactions.length === 0 ? (
            <EmptyState
              size="sm"
              icon={MessagesSquare}
              title="Nenhuma interação ainda"
              description="Registre cada contato: ajuda você e a equipe a saber em que pé está a negociação."
            />
          ) : (
            <ol className="m-0 list-none p-0 px-5 py-4 sm:px-6">
              {prospect.interactions.map((item, index) => {
                const Icon = KIND_ICON[item.kind]
                const system = item.kind === 'sistema'
                return (
                  <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < prospect.interactions.length - 1 ? (
                      <span className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-px bg-border" aria-hidden="true" />
                    ) : null}
                    <span
                      className={
                        system
                          ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[#475467]'
                          : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E5EDF5] text-secondary'
                      }
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-semibold text-foreground">{PROSPECT_INTERACTION_KIND_LABELS[item.kind]}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(item.occurredAt)}
                          {item.authorName && !system ? ` · ${item.authorName}` : ''}
                        </span>
                      </p>
                      <p className="m-0 mt-0.5 whitespace-pre-line break-words text-sm text-[#344054]">{item.description}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Proposta" icon={FileSignature} iconTone="blue">
            {prospect.proposal ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{prospect.proposal.code}</span>
                  <SellerProposalStatusPill status={prospect.proposal.status} />
                </div>
                <p className="m-0 text-sm text-muted-foreground">
                  {proposalInProgress(prospect)
                    ? 'A etapa do prospect acompanha a proposta enquanto ela estiver em andamento.'
                    : 'Esta proposta foi encerrada. Dá para gerar um novo link.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="h-10 rounded-[10px] px-3 text-sm font-semibold">
                    <Link href={`/vendas/propostas/${prospect.proposal.id}`}>Ver proposta</Link>
                  </Button>
                  {linkable ? (
                    <Button className="h-10 rounded-[10px] px-3 text-sm font-semibold" onClick={() => setLinkOpen(true)}>
                      <Link2 aria-hidden="true" />
                      Gerar novo link
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm text-muted-foreground">
                  Ainda sem proposta. Quando o cliente quiser contratar, gere o link: ele recebe por e-mail e preenche o cadastro.
                </p>
                {linkable ? (
                  <Button className="h-11 self-start rounded-[10px] px-4 font-semibold" onClick={() => setLinkOpen(true)}>
                    <Link2 aria-hidden="true" />
                    Gerar link de contratação
                  </Button>
                ) : null}
              </div>
            )}
            {prospect.stage === 'perdido' && prospect.lostReason ? (
              <p className="m-0 mt-4 rounded-xl bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">
                <strong className="font-semibold">Motivo da perda:</strong> {prospect.lostReason}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Oportunidade" icon={Target} iconTone="green">
            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Vidas estimadas">{prospect.estimatedLives ? `${formatInt(prospect.estimatedLives)} vidas` : 'A definir'}</InfoRow>
              <InfoRow label="Valor estimado">{prospect.estimatedValue ? `${formatMoney(prospect.estimatedValue)}/mês` : 'A definir'}</InfoRow>
              <InfoRow label="Plano de interesse">{prospect.interestPlanName ?? 'A definir'}</InfoRow>
              <InfoRow label="Na etapa desde">{formatDateTime(prospect.stageChangedAt)}</InfoRow>
            </dl>
            <div className="mt-4">
              {prospect.nextAction || prospect.nextActionAt ? (
                <NextAction prospect={prospect} />
              ) : (
                <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" aria-hidden="true" />
                  Sem próxima ação marcada.
                </p>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Contato" icon={Phone}>
            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Nome">{prospect.contactName ?? 'Não informado'}</InfoRow>
              <InfoRow label="E-mail">
                {prospect.email ? (
                  <a href={`mailto:${prospect.email}`} className="text-secondary underline-offset-2 hover:underline">
                    {prospect.email}
                  </a>
                ) : (
                  'Não informado'
                )}
              </InfoRow>
              <InfoRow label="Telefone">
                {prospect.phone ? (
                  <a href={`tel:+55${prospect.phone}`} className="text-secondary underline-offset-2 hover:underline">
                    {formatPhone(prospect.phone)}
                  </a>
                ) : (
                  'Não informado'
                )}
              </InfoRow>
              <InfoRow label="Cidade">{place || 'Não informada'}</InfoRow>
            </dl>
          </SectionCard>
        </div>
      </div>

      {lostDialog}
      <ProspectWizard open={editOpen} onOpenChange={setEditOpen} prospect={prospect} onSaved={onUpdated} />
      <InteractionWizard
        open={interactionOpen}
        onOpenChange={setInteractionOpen}
        prospect={prospect}
        onSaved={detail => {
          onUpdated(detail)
          toast.success('Interação registrada')
        }}
      />
      <LinkWizard open={linkOpen} onOpenChange={setLinkOpen} prospect={prospect} onCreated={() => void reload({ silent: true })} />
    </PageContainer>
  )
}
