'use client'

import type { ReactNode } from 'react'
import {
  BadgePercent,
  Brain,
  CalendarCheck2,
  FlaskConical,
  Gift,
  HeartPulse,
  Info,
  LifeBuoy,
  Pill,
  Smile,
  Stethoscope,
  TicketPercent,
  UserRound,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  CLUB_PLAN_LEGAL_NOTICE,
  describeLoyalty,
  formatBRL,
  type ClubCoverageCategory,
  type ClubPaymentMethod,
  type ClubPlan,
} from '@annetec/contracts'
import {
  describeMethods,
  enrollmentFeeView,
  hasHolderAgeRule,
  holderAgeHint,
  methodsFor,
  quoteFor,
  type EnrollmentFeeView,
} from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'

/**
 * Um ícone por categoria de cobertura (mesma convenção da vitrine e do admin,
 * exceto `other`: aqui Gift, o fallback de benefício do portal; lá ainda Sparkles).
 */
export const COVERAGE_ICONS: Record<ClubCoverageCategory, LucideIcon> = {
  telemedicine: Video,
  consultations: Stethoscope,
  exams: FlaskConical,
  pharmacy: Pill,
  dental: Smile,
  mental_health: Brain,
  wellness: HeartPulse,
  assistance: LifeBuoy,
  discounts: BadgePercent,
  other: Gift,
}

/** "Adesão isenta ~~R$ 29,90~~", "Adesão de R$ 49,90, só na 1ª cobrança" ou "Sem taxa de adesão". */
export function EnrollmentFeeText({ fee, className }: { fee: EnrollmentFeeView; className?: string }) {
  if (fee.kind === 'none') return <span className={className}>Sem taxa de adesão</span>
  if (fee.kind === 'waived') {
    return (
      <span className={className}>
        Adesão isenta{' '}
        <s className="text-muted-foreground/80" aria-label={`de ${formatBRL(fee.listPrice)}`}>
          {formatBRL(fee.listPrice)}
        </s>
      </span>
    )
  }
  return (
    <span className={className}>
      Adesão de <strong className="font-semibold text-foreground">{formatBRL(fee.amount)}</strong>, só na 1ª cobrança
    </span>
  )
}

/**
 * Regras resumidas do plano: dependentes, adesão, fidelidade, formas de
 * pagamento efetivas (clube ∩ plano) e, quando o plano restringe, a idade do titular.
 */
export function PlanRulesList({
  plan,
  enabledMethods,
  dependentsLabel,
  className,
}: {
  plan: ClubPlan
  enabledMethods: readonly ClubPaymentMethod[]
  dependentsLabel: string
  className?: string
}) {
  const quote = quoteFor(plan, 0)
  const rows: Array<{ icon: LucideIcon; content: ReactNode; key: string }> = [
    { key: 'dependentes', icon: Users, content: dependentsLabel },
    { key: 'adesao', icon: TicketPercent, content: quote ? <EnrollmentFeeText fee={enrollmentFeeView(quote)} /> : null },
    { key: 'fidelidade', icon: CalendarCheck2, content: describeLoyalty(plan.loyaltyMonths) },
    { key: 'pagamento', icon: Wallet, content: describeMethods(methodsFor(plan, enabledMethods)) },
  ]
  if (hasHolderAgeRule(plan)) rows.push({ key: 'idade', icon: UserRound, content: holderAgeHint(plan) })

  return (
    <ul className={cn('space-y-1.5 text-[13px] text-muted-foreground', className)}>
      {rows.map(({ key, icon: Icon, content }) => (
        <li key={key} className="flex items-start gap-2">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden />
          <span className="min-w-0">{content}</span>
        </li>
      ))}
    </ul>
  )
}

/** Aviso legal obrigatório onde o plano é vendido (`CLUB_PLAN_LEGAL_NOTICE`). */
export function LegalNotice({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-xs leading-relaxed text-muted-foreground', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{CLUB_PLAN_LEGAL_NOTICE}</span>
    </p>
  )
}
