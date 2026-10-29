'use client'

import { Link2, Link2Off, TriangleAlert, UserRound } from 'lucide-react'
import {
  PEP_RELATIONSHIP_LABELS,
  PERSON_POSITION_LABELS,
  formatCpf,
  formatDateBR,
  matchPartnerInQsa,
  type CnpjLookupPartner,
  type OnboardingPerson,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pill } from '@/components/admin-platform/billing/console-kit'
import { qsaMatchMeta, type StatusMeta } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Sócios e representantes informados pelo clube × sócios que a Receita Federal
 * registra (o QSA). A correspondência usa a MESMA regra da verificação
 * automática (`matchPartnerInQsa`: nome normalizado + dígitos visíveis do CPF
 * mascarado), então o que a tela liga é exatamente o que a API considerou.
 */

const QSA_LABEL: Record<string, string> = {
  matched: 'Consta na Receita',
  not_found: 'Não consta na Receita',
  not_applicable: 'Não se aplica',
}

function partnerMatchMeta(match: Parameters<typeof qsaMatchMeta>[0]): StatusMeta {
  return { ...qsaMatchMeta(match), label: (match && QSA_LABEL[match]) || 'Ainda não verificado' }
}

function positionOf(person: OnboardingPerson): string {
  if (person.position === 'outro' && person.positionOther) return person.positionOther
  return PERSON_POSITION_LABELS[person.position] ?? person.position
}

function roleChips(person: OnboardingPerson): string[] {
  const chips: string[] = []
  if (person.isLegalRepresentative) chips.push('Representante legal')
  if (person.isPartner) {
    chips.push(person.ownershipPercent !== null ? `Sócio · ${person.ownershipPercent.toLocaleString('pt-BR')}%` : 'Sócio')
  }
  if (person.isBeneficialOwner) chips.push('Beneficiário final')
  if (person.actsByPowerOfAttorney) chips.push('Por procuração')
  return chips
}

function partnerMatches(partner: CnpjLookupPartner, people: OnboardingPerson[]): OnboardingPerson | null {
  return people.find(person => matchPartnerInQsa({ name: person.name, cpf: person.cpf }, [partner])) ?? null
}

export function PeoplePanel({ proposal }: { proposal: OnboardingProposalDetail }) {
  const people = proposal.people ?? []
  const partners = proposal.receita?.partners ?? []
  const totalOwnership = people.reduce((acc, person) => acc + (person.ownershipPercent ?? 0), 0)
  const notFound = people.filter(person => person.qsaMatch === 'not_found')

  return (
    <div className="space-y-4">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Pessoas informadas pelo clube</CardTitle>
          <CardDescription>
            {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}
            {totalOwnership > 0 ? ` · participações somam ${totalOwnership.toLocaleString('pt-BR')}%` : ''}
            {proposal.hasPep ? ' · há pessoa politicamente exposta' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {people.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">O clube ainda não informou os sócios e representantes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-6 py-2.5 font-medium">Pessoa</th>
                    <th className="px-4 py-2.5 font-medium">Cargo e papéis</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Contato</th>
                    <th className="px-4 py-2.5 font-medium">Sócios na Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(person => (
                    <tr key={person.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="px-6 py-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                            <UserRound className="h-4 w-4 text-muted-foreground" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{person.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{formatCpf(person.cpf)}</p>
                            {person.birthDate && (
                              <p className="text-xs text-muted-foreground">Nasc. {formatDateBR(person.birthDate)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-foreground">{positionOf(person)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {roleChips(person).map(chip => (
                            <span key={chip} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {chip}
                            </span>
                          ))}
                        </div>
                        {person.isPep && (
                          <p className="mt-1.5 inline-flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                            <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                            <span>
                              Politicamente exposta{person.pepRole ? ` — ${person.pepRole}` : ''}
                              {person.pepRelationship ? ` (${PEP_RELATIONSHIP_LABELS[person.pepRelationship]})` : ''}
                            </span>
                          </p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                        <p>{person.email ?? '—'}</p>
                        <p>{person.phone ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Pill meta={partnerMatchMeta(person.qsaMatch)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Sócios na Receita Federal</CardTitle>
          <CardDescription>
            {proposal.receita
              ? partners.length > 0
                ? `${partners.length} ${partners.length === 1 ? 'sócio ou administrador registrado' : 'sócios e administradores registrados'} · comparados com as pessoas informadas pelo clube`
                : 'A Receita não lista sócios para este CNPJ (comum em entidades sem capital).'
              : 'A consulta à Receita Federal não está disponível para este clube.'}
          </CardDescription>
        </CardHeader>
        {partners.length > 0 && (
          <CardContent className="p-0">
            <ul className="divide-y divide-border border-t border-border">
              {partners.map((partner, index) => {
                const match = partnerMatches(partner, people)
                return (
                  <li key={`${partner.name}-${index}`} className="flex flex-wrap items-center gap-3 px-6 py-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        match ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {match ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{partner.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[partner.qualification, partner.document, partner.entryDate ? `desde ${formatDateBR(partner.entryDate)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <p className={cn('text-xs', match ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                      {match ? `Informado pelo clube: ${match.name} (${positionOf(match)})` : 'Não informado pelo clube'}
                    </p>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        )}
        {notFound.length > 0 && (
          <CardContent>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {notFound.map(person => person.name).join(', ')} não {notFound.length === 1 ? 'aparece' : 'aparecem'} entre os sócios
              da Receita Federal. Confira os poderes de representação no ato constitutivo, na ata de eleição ou na procuração.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
