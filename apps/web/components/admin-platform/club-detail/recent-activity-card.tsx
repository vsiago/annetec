'use client'

import Link from 'next/link'
import { Activity, Building2, ClipboardList, CreditCard, History, Shield, Tag, User, type LucideIcon } from 'lucide-react'
import type { AuditEntry } from '@annetec/contracts'
import {
  activityActor,
  activityKind,
  activityWhen,
  type ActivityKind,
} from '@/components/admin-platform/club-detail/club-model'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { auditActionLabel, auditReason } from '@/lib/adapters/holding'

const ICONS: Record<ActivityKind, LucideIcon> = {
  access: Shield,
  people: User,
  plans: Tag,
  billing: CreditCard,
  club: Building2,
  other: ClipboardList,
}

const MAX_ITEMS = 5

/** "Atualizou os dados do clube" → "atualizou os dados do clube". */
function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

/**
 * "Atividade recente": as últimas ações da auditoria do clube, em frases
 * ("Iago Souza atualizou os dados do clube"). Ação que a tela ainda não sabe
 * nomear aparece como "fez uma alteração" — o código técnico fica no histórico
 * completo.
 */
export function RecentActivityCard({ entries, organizationId }: { entries: AuditEntry[]; organizationId: string }) {
  const recent = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ITEMS)

  return (
    <SectionCard
      id="club-activity"
      title="Atividade recente"
      icon={Activity}
      actions={
        <Link
          href={`/admin/holding/auditoria?organizationId=${encodeURIComponent(organizationId)}`}
          className="inline-flex min-h-10 items-center rounded-md text-[13px] font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
        >
          Ver histórico completo
        </Link>
      }
    >
      {recent.length === 0 ? (
        <EmptyState
          size="sm"
          icon={History}
          title="Ainda não há atividade registrada para este clube."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {recent.map(entry => {
            const Icon = ICONS[activityKind(entry.action)]
            const label = auditActionLabel(entry.action)
            const known = label !== entry.action
            const actor = activityActor(entry)
            const reason = auditReason(entry)
            return (
              <li key={entry.id} className="flex items-start gap-3.5 border-b border-[#EEF0F3] py-3.5 first:pt-0 last:border-b-0 last:pb-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-secondary">
                  <Icon className="size-[15px]" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    <strong>{actor.name}</strong> {known ? lowerFirst(label) : 'fez uma alteração'}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {activityWhen(entry.createdAt)}
                    {actor.role ? ` · ${actor.role}` : ''}
                    {reason ? ` · “${reason}”` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
