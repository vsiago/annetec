'use client'

import Link from 'next/link'
import { ArrowRightLeft, CalendarClock, FileSignature, Link2, Loader2, MessagesSquare, MoreHorizontal, Users } from 'lucide-react'
import type { Prospect, ProspectStage } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MANUAL_STAGES,
  SELLER_PROPOSAL_STATUS,
  STAGE_META,
  actionDue,
  formatDay,
  formatInt,
  formatMoney,
} from '@/components/sales/sales-ui'
import { cn } from '@/lib/utils'
import { AUTOMATIC_STAGE_HINT, canMoveTo, proposalInProgress } from './prospect-actions'
import { canGenerateLink } from './prospect-picker'

/** Menu "Mover para…" e ações rápidas de um prospect (cartão do quadro e linha da lista). */
export function ProspectMenu({
  prospect,
  canWrite,
  busy,
  onMove,
  onInteraction,
  onLink,
  compact = false,
}: {
  prospect: Prospect
  canWrite: boolean
  busy?: boolean
  onMove: (prospect: Prospect, stage: ProspectStage) => void
  onInteraction: (prospect: Prospect) => void
  onLink: (prospect: Prospect) => void
  compact?: boolean
}) {
  const locked = proposalInProgress(prospect)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'icon-lg'}
          disabled={busy}
          aria-label={`Ações de ${prospect.name}`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MoreHorizontal aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {canWrite ? (
          <>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              Mover para
            </DropdownMenuLabel>
            {MANUAL_STAGES.map(stage => (
              <DropdownMenuItem
                key={stage}
                disabled={!canMoveTo(prospect, stage)}
                onSelect={() => onMove(prospect, stage)}
                className={cn('gap-2', stage === 'perdido' && 'text-[#B42318] focus:text-[#B42318]')}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: STAGE_META[stage].bar }} aria-hidden="true" />
                {STAGE_META[stage].label}
                {stage === prospect.stage ? <span className="ml-auto text-xs text-muted-foreground">atual</span> : null}
              </DropdownMenuItem>
            ))}
            {locked ? (
              <p className="m-0 px-2 pb-1.5 pt-1 text-xs leading-snug text-muted-foreground">
                A etapa acompanha a proposta {prospect.proposal?.code} enquanto ela estiver em andamento.
              </p>
            ) : (
              <p className="m-0 px-2 pb-1.5 pt-1 text-xs leading-snug text-muted-foreground">{AUTOMATIC_STAGE_HINT}</p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={() => onInteraction(prospect)}>
              <MessagesSquare className="size-4" aria-hidden="true" />
              Registrar interação
            </DropdownMenuItem>
            {canGenerateLink(prospect) ? (
              <DropdownMenuItem className="gap-2" onSelect={() => onLink(prospect)}>
                <Link2 className="size-4" aria-hidden="true" />
                Gerar link de contratação
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild className="gap-2">
          <Link href={`/vendas/funil/${prospect.id}`}>Abrir o prospect</Link>
        </DropdownMenuItem>
        {prospect.proposal ? (
          <DropdownMenuItem asChild className="gap-2">
            <Link href={`/vendas/propostas/${prospect.proposal.id}`}>
              <FileSignature className="size-4" aria-hidden="true" />
              Ver proposta {prospect.proposal.code}
            </Link>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Próxima ação com a data (atrasada em vermelho, hoje em âmbar). */
export function NextAction({ prospect, className }: { prospect: Pick<Prospect, 'nextAction' | 'nextActionAt'>; className?: string }) {
  if (!prospect.nextAction && !prospect.nextActionAt) return null
  const due = actionDue(prospect.nextActionAt)
  return (
    <p
      className={cn(
        'm-0 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-xs leading-snug',
        due === 'late' ? 'bg-[#FEF3F2] text-[#B42318]' : due === 'today' ? 'bg-[#FFFAEB] text-[#B54708]' : 'bg-[#F6F8FB] text-[#475467]',
        className,
      )}
    >
      <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {prospect.nextActionAt ? (
          <strong className="font-semibold">
            {due === 'late' ? 'Atrasada · ' : due === 'today' ? 'Hoje · ' : ''}
            {formatDay(prospect.nextActionAt)}
          </strong>
        ) : null}
        {prospect.nextAction ? <span className="block break-words">{prospect.nextAction}</span> : null}
      </span>
    </p>
  )
}

/** Cartão do quadro (kanban). Arrastável quando o vendedor pode mover. */
export function ProspectCard({
  prospect,
  canWrite,
  busy,
  draggable,
  onDragStart,
  onDragEnd,
  onMove,
  onInteraction,
  onLink,
}: {
  prospect: Prospect
  canWrite: boolean
  busy?: boolean
  draggable: boolean
  onDragStart: (prospect: Prospect) => void
  onDragEnd: () => void
  onMove: (prospect: Prospect, stage: ProspectStage) => void
  onInteraction: (prospect: Prospect) => void
  onLink: (prospect: Prospect) => void
}) {
  const proposal = prospect.proposal
  return (
    <article
      draggable={draggable}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', prospect.id)
        onDragStart(prospect)
      }}
      onDragEnd={onDragEnd}
      aria-label={prospect.name}
      className={cn(
        'group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-[0_4px_12px_-4px_rgba(16,24,40,0.12)]',
        draggable && 'cursor-grab active:cursor-grabbing',
        busy && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/vendas/funil/${prospect.id}`}
            className="block rounded text-sm font-semibold leading-snug text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
          >
            {prospect.name}
          </Link>
          <p className="m-0 truncate text-xs text-muted-foreground">
            {[prospect.contactName, prospect.city && prospect.state ? `${prospect.city}/${prospect.state}` : prospect.city]
              .filter(Boolean)
              .join(' · ') || 'Sem contato cadastrado'}
          </p>
        </div>
        <ProspectMenu
          prospect={prospect}
          canWrite={canWrite}
          busy={busy}
          onMove={onMove}
          onInteraction={onInteraction}
          onLink={onLink}
          compact
        />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          <dt className="sr-only">Vidas</dt>
          <dd className="m-0 truncate">{prospect.estimatedLives ? `${formatInt(prospect.estimatedLives)} vidas` : 'Vidas a definir'}</dd>
        </div>
        <div className="min-w-0 text-right">
          <dt className="sr-only">Valor estimado</dt>
          <dd className="m-0 truncate font-semibold tabular-nums text-foreground">
            {prospect.estimatedValue ? `${formatMoney(prospect.estimatedValue)}/mês` : '—'}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 text-muted-foreground">
          <dt className="sr-only">Plano de interesse</dt>
          <dd className="m-0 truncate">{prospect.interestPlanName ? `Plano ${prospect.interestPlanName}` : 'Plano a definir'}</dd>
        </div>
      </dl>
      <NextAction prospect={prospect} />
      {proposal ? (
        <Link
          href={`/vendas/propostas/${proposal.id}`}
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-[#D0D5DD] px-2 py-1.5 text-xs outline-none hover:border-secondary focus-visible:ring-2 focus-visible:ring-secondary/40"
        >
          <FileSignature className="size-3.5 text-secondary" aria-hidden="true" />
          <span className="font-mono text-[11px] text-foreground">{proposal.code}</span>
          <StatusPill tone={SELLER_PROPOSAL_STATUS[proposal.status].tone}>{SELLER_PROPOSAL_STATUS[proposal.status].label}</StatusPill>
        </Link>
      ) : null}
      {prospect.stage === 'perdido' && prospect.lostReason ? (
        <p className="m-0 text-xs text-[#B42318]">Motivo: {prospect.lostReason}</p>
      ) : null}
    </article>
  )
}
