'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BadgePercent, FileSignature, Loader2, MoreHorizontal, Send } from 'lucide-react'
import type { SellerProposal } from '@annetec/contracts'
import { ConfirmDialog, runCommand } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DiscountStatusPill, canRequestDiscount, canSendLink, discountSummary } from '@/components/sales/sales-ui'
import { sendSellerLinkAction } from '@/lib/actions/vendas-api'
import { DiscountRequestWizard } from './discount-wizard'

/**
 * Ações de uma proposta do vendedor: (re)enviar o link ao e-mail do cliente e
 * pedir desconto. Só aparecem quando a API aceitaria — o vendedor nunca vê a
 * URL da proposta, só manda o e-mail de novo.
 */
export function useProposalActions(onUpdated: (proposal: SellerProposal) => void) {
  const [sendFor, setSendFor] = useState<SellerProposal | null>(null)
  const [discountFor, setDiscountFor] = useState<SellerProposal | null>(null)

  const dialogs = (
    <>
      <ConfirmDialog
        open={sendFor !== null}
        onOpenChange={open => !open && setSendFor(null)}
        title={sendFor?.linkStatus === 'sent' ? 'Reenviar o link de contratação?' : 'Enviar o link de contratação?'}
        description={
          sendFor ? (
            <p>
              O e-mail com o link vai para <strong>{sendFor.applicant.email}</strong>
              {sendFor.lastDiscountRequest?.status === 'rejected' ? ', sem o desconto (o pedido foi recusado)' : ''}. O link não aparece
              para você: só o cliente o recebe.
            </p>
          ) : null
        }
        confirmLabel={sendFor?.linkStatus === 'sent' ? 'Reenviar link' : 'Enviar link'}
        onConfirm={async () => {
          if (!sendFor) return false
          const updated = await runCommand(sendSellerLinkAction(sendFor.id), `Link enviado para ${sendFor.applicant.email}`)
          if (updated) onUpdated(updated)
          return !!updated
        }}
      />
      <DiscountRequestWizard
        open={discountFor !== null}
        onOpenChange={open => !open && setDiscountFor(null)}
        proposal={discountFor}
        onSaved={result => onUpdated(result.proposal)}
      />
    </>
  )

  return { dialogs, sendLink: setSendFor, requestDiscount: setDiscountFor }
}

export function ProposalActionButtons({
  proposal,
  canWrite,
  onSend,
  onDiscount,
  size = 'default',
  busy = false,
}: {
  proposal: SellerProposal
  canWrite: boolean
  onSend: (proposal: SellerProposal) => void
  onDiscount: (proposal: SellerProposal) => void
  size?: 'default' | 'sm'
  busy?: boolean
}) {
  if (!canWrite) return null
  const send = canSendLink(proposal)
  const discount = canRequestDiscount(proposal)
  if (!send && !discount) return null
  const cls = size === 'sm' ? 'h-10 rounded-[10px] px-3 text-sm font-semibold' : 'h-11 rounded-[10px] px-4 font-semibold'
  return (
    <>
      {discount ? (
        <Button type="button" variant="outline" className={cls} onClick={() => onDiscount(proposal)} disabled={busy}>
          <BadgePercent aria-hidden="true" />
          Pedir desconto
        </Button>
      ) : null}
      {send ? (
        <Button type="button" variant={size === 'sm' ? 'outline' : 'default'} className={cls} onClick={() => onSend(proposal)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          {proposal.linkStatus === 'sent' ? 'Reenviar link' : 'Enviar link'}
        </Button>
      ) : null}
    </>
  )
}

/** Situação do desconto na lista: aprovado (com o resumo), aguardando ou recusado (com o motivo). */
export function DiscountCell({ proposal }: { proposal: SellerProposal }) {
  if (proposal.discount) {
    return (
      <div className="flex flex-col items-start gap-1">
        <DiscountStatusPill status="approved" />
        <span className="text-xs text-muted-foreground">{discountSummary(proposal.discount)}</span>
      </div>
    )
  }
  const last = proposal.lastDiscountRequest
  if (!last) return <span className="text-xs text-muted-foreground">Sem desconto</span>
  return (
    <div className="flex flex-col items-start gap-1">
      <DiscountStatusPill status={last.status} />
      {last.status === 'rejected' && last.rejectionReason ? (
        <span className="max-w-56 truncate text-xs text-[#B42318]" title={last.rejectionReason}>
          {last.rejectionReason}
        </span>
      ) : null}
    </div>
  )
}

/** Menu "⋯" da linha da lista de propostas: ver, (re)enviar o link e pedir desconto. */
export function ProposalActionsMenu({
  proposal,
  canWrite,
  onSend,
  onDiscount,
}: {
  proposal: SellerProposal
  canWrite: boolean
  onSend: (proposal: SellerProposal) => void
  onDiscount: (proposal: SellerProposal) => void
}) {
  const send = canWrite && canSendLink(proposal)
  const discount = canWrite && canRequestDiscount(proposal)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-lg" aria-label={`Ações da proposta ${proposal.code}`} className="text-muted-foreground hover:text-foreground">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild className="gap-2">
          <Link href={`/vendas/propostas/${proposal.id}`}>
            <FileSignature className="size-4" aria-hidden="true" />
            Ver proposta
          </Link>
        </DropdownMenuItem>
        {send ? (
          <DropdownMenuItem className="gap-2" onSelect={() => onSend(proposal)}>
            <Send className="size-4" aria-hidden="true" />
            {proposal.linkStatus === 'sent' ? 'Reenviar link' : 'Enviar link'}
          </DropdownMenuItem>
        ) : null}
        {discount ? (
          <DropdownMenuItem className="gap-2" onSelect={() => onDiscount(proposal)}>
            <BadgePercent className="size-4" aria-hidden="true" />
            Pedir desconto
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
