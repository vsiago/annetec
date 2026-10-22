'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, CreditCard, HeadphonesIcon, Heart, Info, Phone, Plus, User, Users } from 'lucide-react'
import { ageOn, formatBRL, formatCpf, formatDateBR, onlyDigits, type MyClubMembership } from '@annetec/contracts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Tenant } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import {
  CARD_NUMBER_PLACEHOLDER,
  cardStatusFromSubscription,
  cardStatusView,
  extraDependentQuote,
  pluralize,
  relationshipLabel,
} from '@/lib/adapters/cliente-assinatura'
import { CopyButton } from './copy-button'
import { ToneBadge } from './status-ui'

interface MembershipDependentsProps {
  membership: MyClubMembership
  tenant: Tenant | null
}

/**
 * Dependentes da assinatura do Clube, cada um com a própria carteirinha.
 * Incluir dependente muda o contrato e o valor — não há rota de inclusão no
 * portal (blueprint §0.3), então o botão explica o caminho (atendimento) e
 * já mostra quanto a mensalidade passa a custar.
 */
export function MembershipDependents({ membership, tenant }: MembershipDependentsProps) {
  const [addOpen, setAddOpen] = useState(false)
  const { subscription } = membership
  const dependents = subscription.dependents
  const cardsByDependent = new Map(
    membership.cards.filter(card => card.dependentId).map(card => [card.dependentId as string, card]),
  )
  const fallbackCardStatus = cardStatusFromSubscription(subscription.status)
  const quote = extraDependentQuote(subscription)
  const slug = tenant?.slug ?? ''
  const base = `/${slug}/cliente`
  const canAdd = subscription.status !== 'canceled'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dependentes</h1>
          <p className="text-muted-foreground">Quem está incluído na sua assinatura do {subscription.planName}</p>
        </div>
        {canAdd && (
          <Button className="bg-primary text-white hover:opacity-90" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Dependente
          </Button>
        )}
      </div>

      {/* Resumo */}
      <Card className="border-0 bg-gradient-to-r from-secondary to-secondary/80 text-white shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-full bg-white/10 p-3">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm text-white/80">Dependentes na assinatura</p>
              <p className="text-3xl font-bold">{dependents.length}</p>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-right">
              <p className="text-sm text-white/60">Por dependente</p>
              <p className="text-sm text-white/60">Mensalidade total</p>
              <p className="font-medium">{quote.policy}</p>
              <p className="font-medium">{formatBRL(subscription.amount)}/mês</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {dependents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[...dependents]
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            .map(dependent => {
              const card = cardsByDependent.get(dependent.id)
              const cardNumber = card?.cardNumber ?? dependent.cardNumber
              const cardView = cardStatusView(card?.status ?? fallbackCardStatus)
              const age = dependent.birthDate ? ageOn(dependent.birthDate) : null
              return (
                <Card key={dependent.id} className="border-0 shadow-sm">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12 bg-secondary sm:h-14 sm:w-14">
                        <AvatarFallback className="bg-secondary text-white">{getInitials(dependent.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold leading-tight">{dependent.name}</h3>
                            <span className="mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium">
                              <Heart className="h-3 w-3" />
                              {relationshipLabel(dependent.relationship)}
                            </span>
                          </div>
                          <ToneBadge tone={cardView.tone}>{cardView.label}</ToneBadge>
                        </div>

                        <dl className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 shrink-0" />
                            <dt className="sr-only">Carteirinha</dt>
                            <dd className="flex min-w-0 items-center gap-1">
                              <span className="truncate font-mono text-foreground">{cardNumber ?? CARD_NUMBER_PLACEHOLDER}</span>
                              {cardNumber && (
                                <CopyButton
                                  value={cardNumber}
                                  label={`Copiar carteirinha de ${dependent.name}`}
                                  successMessage="Número da carteirinha copiado."
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7"
                                />
                              )}
                            </dd>
                          </div>
                          {dependent.birthDate && (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <dt className="sr-only">Nascimento</dt>
                              <dd>
                                {age !== null ? `${age} ${age === 1 ? 'ano' : 'anos'} · ` : ''}
                                {formatDateBR(dependent.birthDate)}
                              </dd>
                            </div>
                          )}
                          {dependent.cpf && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 shrink-0" />
                              <dt className="sr-only">CPF</dt>
                              <dd>CPF {formatCpf(dependent.cpf)}</dd>
                            </div>
                          )}
                        </dl>

                        <Button asChild variant="outline" size="sm" className="mt-4">
                          <Link href={`${base}/carteirinha?pessoa=${encodeURIComponent(dependent.id)}`}>
                            <CreditCard />
                            Ver carteirinha
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">Nenhum dependente na sua assinatura</h3>
            <p className="mx-auto mb-5 max-w-md text-muted-foreground">
              Inclua quem você ama para que também aproveite os benefícios do clube — cada pessoa ganha a própria carteirinha.
            </p>
            {canAdd && (
              <Button className="bg-primary text-white hover:opacity-90" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Dependente
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Informações */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Informações Importantes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              'Dependentes têm acesso a todos os benefícios do plano',
              'Cada dependente tem a própria carteirinha digital, com número próprio',
              quote.allIncluded
                ? 'No seu plano, dependentes estão inclusos na mensalidade'
                : quote.includedDependents > 0
                  ? `Sua mensalidade já inclui ${pluralize(quote.includedDependents, 'dependente', 'dependentes')}; cada extra adiciona ${formatBRL(quote.unitPrice)}`
                  : `Cada dependente adiciona ${formatBRL(quote.unitPrice)} à mensalidade`,
              'Para dependentes menores de idade, o titular é responsável pelo uso dos benefícios',
            ].map(text => (
              <li key={text} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                {text}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Inclusão: orientação + preço atualizado */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir um dependente</DialogTitle>
            <DialogDescription>
              A inclusão é feita pelo nosso atendimento, que confere os dados com você e já ajusta a carteirinha nova.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Info className="h-4 w-4 text-primary" />
                Quanto fica a mensalidade
              </p>
              {quote.included ? (
                <p className="mt-1 text-muted-foreground">
                  {quote.allIncluded
                    ? `No ${subscription.planName}, dependentes estão inclusos`
                    : `Seu plano inclui ${pluralize(quote.includedDependents, 'dependente', 'dependentes')} na mensalidade e ainda há vaga`}
                  : a mensalidade continua <strong className="text-foreground">{formatBRL(subscription.amount)}</strong>.
                </p>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  Cada dependente {quote.includedDependents > 0 ? 'extra ' : ''}adiciona{' '}
                  <strong className="text-foreground">{formatBRL(quote.unitPrice)}/mês</strong>.
                  Com mais um, sua mensalidade passa de{' '}
                  <strong className="text-foreground">{formatBRL(quote.current)}</strong> para{' '}
                  <strong className="text-foreground">{formatBRL(quote.next)}</strong>.
                </p>
              )}
            </div>

            <div className="text-sm">
              <p className="font-medium">Tenha em mãos</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Nome completo e data de nascimento</li>
                <li>CPF (se tiver)</li>
                <li>Grau de parentesco com você</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button asChild className="h-11 bg-primary text-white hover:opacity-90">
                <Link href={`${base}/suporte`} onClick={() => setAddOpen(false)}>
                  <HeadphonesIcon />
                  Falar com o atendimento
                </Link>
              </Button>
              {tenant?.phone && onlyDigits(tenant.phone).length >= 8 && (
                <Button asChild variant="outline" className="h-11">
                  <a href={`tel:${onlyDigits(tenant.phone)}`}>
                    <Phone />
                    Ligar para {tenant.phone}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
