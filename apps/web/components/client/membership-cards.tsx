'use client'

import { useState } from 'react'
import { AlertTriangle, Calendar, Clock, CreditCard, Lock, Phone, ShieldCheck, XCircle } from 'lucide-react'
import { formatCpf, formatDateBR, type MyClubMembership } from '@annetec/contracts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import type { Tenant } from '@/lib/types'
import { cn, getInitials } from '@/lib/utils'
import {
  CARD_NUMBER_PLACEHOLDER,
  cardStatusView,
  chargeToRegularize,
  firstName,
  membershipCardKey,
  membershipCards,
  relationshipLabel,
} from '@/lib/adapters/cliente-assinatura'
import { CopyButton } from './copy-button'
import { StatusNotice, ToneBadge } from './status-ui'

interface MembershipCardsProps {
  membership: MyClubMembership
  tenant: Tenant | null
  /** `?pessoa=` — id do dependente (ou `titular`) que abre selecionado. */
  initialKey?: string | null
}

/**
 * Carteirinhas reais da assinatura: seletor Titular + cada dependente e o
 * cartão com número, nome, plano e situação (bloqueado quando a assinatura
 * está suspensa ou cancelada).
 */
export function MembershipCards({ membership, tenant, initialKey }: MembershipCardsProps) {
  const cards = membershipCards(membership)
  const [selectedKey, setSelectedKey] = useState(() =>
    initialKey && cards.some(card => membershipCardKey(card) === initialKey) ? initialKey : membershipCardKey(cards[0]),
  )
  const card = cards.find(item => membershipCardKey(item) === selectedKey) ?? cards[0]
  const { subscription } = membership
  const slug = tenant?.slug ?? ''
  const base = `/${slug}/cliente`
  const view = cardStatusView(card.status)
  const regularize = chargeToRegularize(membership)
  const faturasHref = `${base}/faturas${regularize ? `?cobranca=${encodeURIComponent(regularize.id)}` : ''}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{cards.length > 1 ? 'Carteirinhas Digitais' : 'Carteirinha Digital'}</h1>
        <p className="text-muted-foreground">
          {cards.length > 1
            ? 'A sua e a de cada dependente. Escolha de quem é a carteirinha para apresentar.'
            : 'Apresente sua carteirinha digital para liberar benefícios e descontos'}
        </p>
      </div>

      {/* Seletor de pessoa */}
      {cards.length > 1 && (
        <div
          role="tablist"
          aria-label="De quem é a carteirinha"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {cards.map(item => {
            const key = membershipCardKey(item)
            const active = key === selectedKey
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedKey(key)}
                className={cn(
                  'flex shrink-0 snap-start items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm transition-colors',
                  active ? 'border-primary bg-primary text-white shadow-sm' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold',
                    active ? 'bg-white/20 text-white' : 'bg-secondary/10 text-secondary',
                  )}
                >
                  {getInitials(item.name)}
                </span>
                <span className="text-left leading-tight">
                  <span className="block font-medium">{firstName(item.name)}</span>
                  <span className={cn('block text-[11px]', active ? 'text-white/80' : 'text-muted-foreground')}>
                    {item.kind === 'titular' ? 'Titular' : relationshipLabel(item.relationship)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Situação */}
      {card.status === 'blocked' && (
        <StatusNotice
          tone="danger"
          icon={Lock}
          title="Carteirinha bloqueada"
          description="A assinatura está suspensa por falta de pagamento. Regularize para liberar as carteirinhas de toda a família."
          actionHref={faturasHref}
          actionLabel="Regularizar agora"
        />
      )}
      {card.status === 'pending' && (
        <StatusNotice
          tone="warning"
          icon={Clock}
          title="Carteirinha em emissão"
          description="Ela é liberada automaticamente assim que o pagamento da adesão for confirmado."
          actionHref={faturasHref}
          actionLabel="Ver minha fatura"
        />
      )}
      {card.status === 'canceled' && (
        <StatusNotice
          tone="neutral"
          icon={XCircle}
          title="Carteirinha cancelada"
          description="A assinatura foi encerrada e esta carteirinha não dá mais acesso aos benefícios."
          actionHref={slug ? `/${slug}/planos` : null}
          actionLabel="Conhecer os planos"
        />
      )}
      {card.status === 'active' && subscription.status === 'past_due' && (
        <StatusNotice
          tone="warning"
          icon={AlertTriangle}
          title="Pagamento em atraso"
          description="A carteirinha continua valendo por enquanto. Regularize para ela não ser suspensa."
          actionHref={faturasHref}
          actionLabel="Regularizar agora"
        />
      )}

      {/* Cartão */}
      <div className="py-2">
        <DigitalCardMockup
          key={selectedKey}
          tenant={tenant}
          clientName={card.name}
          cardNumber={card.cardNumber ?? CARD_NUMBER_PLACEHOLDER}
          planName={card.planName}
          cpf={card.cpf ? formatCpf(card.cpf) : ''}
          contractDate={card.validSince ?? undefined}
          dependentsCount={subscription.dependents.length}
          status={card.status}
          holderKind={card.kind}
          relationshipLabel={card.kind === 'dependente' ? relationshipLabel(card.relationship) : undefined}
          supportPhone={tenant?.phone || undefined}
          size="lg"
          interactive
          showFlip
        />
      </div>

      {/* Dados */}
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile icon={CreditCard} iconClass="bg-secondary/10 text-secondary" label="Número da carteirinha">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-mono text-sm font-medium">{card.cardNumber ?? CARD_NUMBER_PLACEHOLDER}</span>
            {card.cardNumber && (
              <CopyButton
                value={card.cardNumber}
                label="Copiar número da carteirinha"
                successMessage="Número da carteirinha copiado."
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7"
              />
            )}
          </span>
        </InfoTile>
        <InfoTile icon={ShieldCheck} iconClass="bg-primary/10 text-primary" label="Situação">
          <ToneBadge tone={view.tone}>{view.label}</ToneBadge>
        </InfoTile>
        <InfoTile icon={Calendar} iconClass="bg-primary/10 text-primary" label={card.kind === 'titular' ? 'Associado desde' : 'Nascimento'}>
          <span className="text-sm font-medium">
            {card.kind === 'titular'
              ? card.validSince
                ? formatDateBR(card.validSince)
                : '—'
              : card.birthDate
                ? formatDateBR(card.birthDate)
                : '—'}
          </span>
        </InfoTile>
        <InfoTile icon={Phone} iconClass="bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300" label="Central do clube">
          <span className="text-sm font-medium">{tenant?.phone || '—'}</span>
        </InfoTile>
      </div>

      {/* Como usar */}
      <Card className="mx-auto max-w-3xl border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Como usar sua carteirinha</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              'Apresente a carteirinha digital (ou o número dela) nos estabelecimentos parceiros',
              'Informe o número da carteirinha ao ligar para a central do clube',
              'Nas farmácias parceiras, informe o CPF para obter os descontos',
              cards.length > 1
                ? 'Cada dependente tem a própria carteirinha — escolha a pessoa no seletor acima'
                : 'Para consultas e exames, agende com antecedência direto na rede parceira',
            ].map((text, index) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-white">
                  {index + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoTile({
  icon: Icon,
  iconClass,
  label,
  children,
}: {
  icon: typeof CreditCard
  iconClass: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('shrink-0 rounded-lg p-2', iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
