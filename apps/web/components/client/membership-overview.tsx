'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Heart,
  Lock,
  Phone,
  Receipt,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { formatBRL, formatDateBR, type ClubSubscriptionStatus, type MyClubMembership } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  CARD_NUMBER_PLACEHOLDER,
  TONE_DOT_CLASS,
  cardInfoLabel,
  cardStatusView,
  chargeDueText,
  chargeStatusView,
  chargeToRegularize,
  isChargeLate,
  paymentMethodLabel,
  pluralize,
  subscriptionStatusView,
} from '@/lib/adapters/cliente-assinatura'
import { PlanCoveragesSummary, hasPlanCoverages, useMembershipPlan } from './plan-coverages'
import { StatusNotice, ToneBadge } from './status-ui'

const STATUS_ICON: Record<ClubSubscriptionStatus, LucideIcon> = {
  active: CheckCircle2,
  pending_payment: Clock,
  past_due: AlertTriangle,
  suspended: Lock,
  canceled: XCircle,
}

interface MembershipOverviewProps {
  membership: MyClubMembership
  tenantSlug: string
  tenantPhone?: string
}

/**
 * Painel do associado com assinatura do Clube: status (com o texto certo
 * para cada situação), plano, valor, próxima cobrança e atalhos.
 */
export function MembershipOverview({ membership, tenantSlug, tenantPhone }: MembershipOverviewProps) {
  const { subscription, nextCharge, openCharges, cards } = membership
  const base = `/${tenantSlug}/cliente`
  const view = subscriptionStatusView(subscription)
  const regularize = chargeToRegularize(membership)
  const titularCard = cards.find(card => card.kind === 'titular') ?? null
  const cardView = titularCard ? cardStatusView(titularCard.status) : null
  const lateCount = openCharges.filter(isChargeLate).length
  // Plano com coberturas estruturadas (API nova ou vitrine): resumo de coberturas e regras.
  const { plan } = useMembershipPlan(membership, tenantSlug)

  const ctaHref =
    view.cta === 'faturas'
      ? `${base}/faturas${regularize ? `?cobranca=${encodeURIComponent(regularize.id)}` : ''}`
      : view.cta === 'planos'
        ? `/${tenantSlug}/planos`
        : null

  return (
    <div className="space-y-4">
      {/* Plano + status */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-secondary to-secondary/80 text-white overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-white/10 shrink-0">
                <Heart className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0">
                <p className="text-white/80 text-sm">Seu plano</p>
                <p className="text-xl font-bold leading-tight">{subscription.planName}</p>
                <div className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-0.5 text-sm font-medium">
                  <span className={cn('h-2 w-2 rounded-full', TONE_DOT_CLASS[view.tone], view.tone === 'success' && 'animate-pulse')} />
                  {view.label}
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 md:gap-x-8">
              <div className="min-w-0">
                <dt className="text-white/60 text-xs">Carteirinha</dt>
                <dd className="font-mono font-medium truncate">{subscription.cardNumber ?? CARD_NUMBER_PLACEHOLDER}</dd>
              </div>
              <div>
                <dt className="text-white/60 text-xs">Associado desde</dt>
                <dd className="font-medium">{subscription.startedAt ? formatDateBR(subscription.startedAt) : '—'}</dd>
              </div>
              <div>
                <dt className="text-white/60 text-xs">Dependentes</dt>
                <dd className="font-medium">{subscription.dependents.length}</dd>
              </div>
              <div>
                <dt className="text-white/60 text-xs">Mensalidade</dt>
                <dd className="font-medium whitespace-nowrap">
                  {formatBRL(subscription.amount)}
                  <span className="text-white/60 text-xs">/mês</span>
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* O que a situação pede */}
      <StatusNotice
        tone={view.tone}
        icon={STATUS_ICON[subscription.status]}
        title={view.title}
        description={view.description}
        actionHref={ctaHref}
        actionLabel={view.ctaLabel}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Próxima cobrança */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Próxima cobrança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextCharge ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{formatBRL(nextCharge.amount)}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Vencimento {formatDateBR(nextCharge.dueDate)}
                    </p>
                  </div>
                  <ToneBadge tone={chargeStatusView(nextCharge.status).tone}>
                    {chargeStatusView(nextCharge.status).label}
                  </ToneBadge>
                </div>
                <div className="text-sm space-y-1">
                  <p className={cn('font-medium', isChargeLate(nextCharge) ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
                    {chargeDueText(nextCharge)}
                  </p>
                  <p className="text-muted-foreground">
                    {nextCharge.method === 'credit_card'
                      ? `Cartão: ${cardInfoLabel(nextCharge.card ?? subscription.paymentCard)}`
                      : `Forma de pagamento: ${paymentMethodLabel(nextCharge.method)}`}
                  </p>
                </div>
                <Button asChild className="w-full bg-primary hover:opacity-90 text-white">
                  <Link href={`${base}/faturas?cobranca=${encodeURIComponent(nextCharge.id)}`}>
                    {nextCharge.method === 'credit_card' && nextCharge.status === 'pending' ? 'Ver fatura' : 'Pagar agora'}
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">Nenhuma fatura em aberto</p>
                    <p className="text-sm text-muted-foreground">
                      {subscription.status !== 'canceled' && subscription.nextDueDate
                        ? `Próxima mensalidade em ${formatDateBR(subscription.nextDueDate)} · ${formatBRL(subscription.amount)}`
                        : 'Você está em dia com o clube.'}
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`${base}/faturas`}>Ver minhas faturas</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Atalhos */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2 content-start">
          <Shortcut
            href={`${base}/carteirinha`}
            icon={CreditCard}
            label="Carteirinhas"
            detail={cardView ? cardView.label : 'Titular e dependentes'}
            iconClass="bg-secondary/10 text-secondary"
          />
          <Shortcut
            href={`${base}/faturas`}
            icon={Receipt}
            label="Minhas faturas"
            detail={
              openCharges.length === 0
                ? 'Tudo em dia'
                : lateCount > 0
                  ? pluralize(lateCount, 'vencida', 'vencidas')
                  : pluralize(openCharges.length, 'em aberto', 'em aberto')
            }
            iconClass={lateCount > 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300' : 'bg-primary/10 text-primary'}
          />
          <Shortcut
            href={`${base}/dependentes`}
            icon={Users}
            label="Dependentes"
            detail={pluralize(subscription.dependents.length, 'na assinatura', 'na assinatura')}
            iconClass="bg-primary/10 text-primary"
          />
          <Shortcut
            href={`${base}/beneficios`}
            icon={Gift}
            label="Benefícios"
            detail={hasPlanCoverages(plan) ? 'Coberturas e carências' : 'Veja o que está incluso'}
            iconClass="bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300"
          />
          <Shortcut
            href={`${base}/suporte`}
            icon={Phone}
            label="Suporte"
            detail={tenantPhone || 'Teleorientação e atendimento'}
            iconClass="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-300"
          />
        </div>
      </div>

      {hasPlanCoverages(plan) && <PlanCoveragesSummary membership={membership} plan={plan} tenantSlug={tenantSlug} />}
    </div>
  )
}

function Shortcut({
  href,
  icon: Icon,
  label,
  detail,
  iconClass,
}: {
  href: string
  icon: LucideIcon
  label: string
  detail: string
  iconClass: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border/40 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconClass)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 truncate">{detail}</span>
      </span>
    </Link>
  )
}

/** Esqueleto enquanto a assinatura carrega. */
export function MembershipOverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando sua assinatura">
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
