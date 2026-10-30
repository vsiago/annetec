'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { BadgePercent, Building2, CircleCheck, Contact, FileSignature, KanbanSquare, MailCheck, Tags } from 'lucide-react'
import { formatPhone, quotePlatformPlan } from '@annetec/contracts'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Notice } from '@/components/admin-platform/ui/wizard'
import { Skeleton } from '@/components/ui/skeleton'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { formatCnpj } from '@/lib/adapters/platform-console'
import {
  DiscountStatusPill,
  InfoRow,
  LINK_STATUS_META,
  LinkStatusPill,
  QuoteComparison,
  SellerProposalStatusPill,
  discountSummary,
  formatDateTime,
  formatInt,
  formatMoney,
} from '@/components/sales/sales-ui'
import { ProposalActionButtons, useProposalActions } from '@/components/vendas/proposal-actions'
import { useSellerPlans } from '@/components/vendas/vendas-kit'
import { getSellerProposalAction } from '@/lib/actions/vendas-api'

/** O que cada status da proposta quer dizer para o vendedor (próximo passo). */
const NEXT_STEP: Record<string, string> = {
  draft: 'O cliente está preenchendo o cadastro pelo link do e-mail.',
  submitted: 'O cliente enviou o cadastro. A ANNETEC vai analisar.',
  in_review: 'A equipe da ANNETEC está analisando o cadastro.',
  pending_info: 'A ANNETEC pediu uma correção ao cliente. Vale ligar para ajudar.',
  approved: 'Cadastro aprovado. A cobrança de ativação vai para o cliente.',
  awaiting_payment: 'Aprovado: falta o cliente pagar a ativação.',
  provisioning: 'Pagamento confirmado. O clube está sendo liberado.',
  active: 'Clube no ar. A comissão entra a cada fatura paga.',
  rejected: 'A ANNETEC reprovou o cadastro.',
  canceled: 'A proposta foi cancelada.',
}

export default function SellerProposalPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { canWrite } = useSellerProfile()
  const { plans } = useSellerPlans()
  const { data: proposal, error, loading, reload, setData } = useConsoleData(() => getSellerProposalAction(id), [id])
  const { dialogs, sendLink, requestDiscount } = useProposalActions(updated => setData(updated))

  if (loading && !proposal) {
    return (
      <PageContainer>
        <div role="status" aria-busy="true" className="flex flex-col gap-6">
          <span className="sr-only">Carregando a proposta…</span>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-20 w-full max-w-2xl rounded-2xl" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!proposal) {
    return (
      <PageContainer>
        <div>
          <BackLink href="/vendas/propostas">Voltar para Propostas</BackLink>
        </div>
        <ErrorState title={error ?? 'Não encontramos esta proposta'} description="Volte para Propostas e escolha outra." onRetry={() => reload()} />
      </PageContainer>
    )
  }

  const offer = plans.find(plan => plan.id === proposal.planId) ?? null
  const fullQuote = offer ? quotePlatformPlan(offer, offer.pricing, proposal.expectedLives) : null
  const quote = proposal.quote
  const last = proposal.lastDiscountRequest
  const linkMeta = LINK_STATUS_META[proposal.linkStatus]

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<BackLink href="/vendas/propostas">Voltar para Propostas</BackLink>}
        icon={FileSignature}
        title={proposal.customerName}
        badge={<SellerProposalStatusPill status={proposal.status} />}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Proposta <span className="font-mono">{proposal.code}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>CNPJ {formatCnpj(proposal.cnpj)}</span>
            <span aria-hidden="true">·</span>
            <span>Criada em {formatDateTime(proposal.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {proposal.prospectId ? (
              <Button asChild variant="outline" className="h-11 rounded-[10px] px-4 font-semibold">
                <Link href={`/vendas/funil/${proposal.prospectId}`}>
                  <KanbanSquare aria-hidden="true" />
                  Ver prospect
                </Link>
              </Button>
            ) : null}
            <ProposalActionButtons proposal={proposal} canWrite={canWrite} onSend={sendLink} onDiscount={requestDiscount} />
          </>
        }
      />

      <SectionCard title="Situação" icon={CircleCheck} iconTone="green">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] text-muted-foreground">Proposta</p>
            <div>
              <SellerProposalStatusPill status={proposal.status} />
            </div>
            <p className="m-0 text-sm text-[#344054]">{NEXT_STEP[proposal.status]}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] text-muted-foreground">Link de contratação</p>
            <div>
              <LinkStatusPill status={proposal.linkStatus} />
            </div>
            <p className="m-0 text-sm text-[#344054]">
              {proposal.linkStatus === 'sent' && proposal.inviteSentAt
                ? `Enviado para ${proposal.applicant.email} em ${formatDateTime(proposal.inviteSentAt)}.`
                : linkMeta.hint}
            </p>
          </div>
        </div>
        <Notice tone="neutral" icon={MailCheck} className="mt-4">
          Por segurança, o link da proposta vai só para o e-mail do cliente. Se ele não encontrou, peça para olhar o spam ou reenvie.
        </Notice>
      </SectionCard>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SectionCard title="Plano e valores" icon={Tags} iconTone="violet">
          <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Plano">{proposal.planName ?? 'Ainda não escolhido'}</InfoRow>
            <InfoRow label="Vidas esperadas">{formatInt(proposal.expectedLives)} vidas</InfoRow>
            <InfoRow label="Mensal estimado">{quote ? formatMoney(quote.monthlyTotal) : '—'}</InfoRow>
            <InfoRow label="Ativação (após aprovação)">{quote ? formatMoney(quote.activationTotal) : '—'}</InfoRow>
          </dl>
          {proposal.discount && fullQuote && quote ? (
            <QuoteComparison className="mt-5" before={fullQuote} after={quote} title="Preço cheio × com a condição especial aprovada" />
          ) : null}
          <p className="m-0 mt-4 text-[13px] text-muted-foreground">
            O cliente pode ajustar as vidas no cadastro; o valor acompanha.
          </p>
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Condição especial" icon={BadgePercent} iconTone="amber">
            {proposal.discount ? (
              <div className="flex flex-col items-start gap-2">
                <DiscountStatusPill status="approved" />
                <p className="m-0 text-sm text-foreground">{discountSummary(proposal.discount)}</p>
              </div>
            ) : last ? (
              <div className="flex flex-col items-start gap-2">
                <DiscountStatusPill status={last.status} />
                {last.status === 'pending' ? (
                  <p className="m-0 text-sm text-muted-foreground">O superadmin ainda vai decidir. Você recebe um aviso no sino.</p>
                ) : null}
                {last.status === 'rejected' ? (
                  <p className="m-0 text-sm text-[#B42318]">
                    {last.rejectionReason ? `Motivo: ${last.rejectionReason}. ` : ''}Reenvie o link sem desconto ou faça um novo pedido.
                  </p>
                ) : null}
                {last.decidedAt ? <p className="m-0 text-xs text-muted-foreground">Decidido em {formatDateTime(last.decidedAt)}</p> : null}
              </div>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Sem desconto. Preço cheio do plano.</p>
            )}
          </SectionCard>

          <SectionCard title="Cliente" icon={Contact}>
            <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Quem contrata">{proposal.applicant.name}</InfoRow>
              <InfoRow label="E-mail (recebe o link)">
                <a href={`mailto:${proposal.applicant.email}`} className="text-secondary underline-offset-2 hover:underline">
                  {proposal.applicant.email}
                </a>
              </InfoRow>
              <InfoRow label="Telefone">
                <a href={`tel:+55${proposal.applicant.phone}`} className="text-secondary underline-offset-2 hover:underline">
                  {formatPhone(proposal.applicant.phone)}
                </a>
              </InfoRow>
              <InfoRow label="Origem">{proposal.source === 'site' ? 'Site, com o seu código' : 'Link que você gerou'}</InfoRow>
            </dl>
            {proposal.organizationId ? (
              <p className="m-0 mt-4 flex items-center gap-2 text-sm font-medium text-[#067647]">
                <Building2 className="size-4" aria-hidden="true" />
                Clube criado na plataforma.
              </p>
            ) : null}
          </SectionCard>
        </div>
      </div>
      {dialogs}
    </PageContainer>
  )
}
