'use client'

import { Landmark, Link2, Link2Off, TriangleAlert, UserRound, Users } from 'lucide-react'
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
import { Pill } from '@/components/admin-platform/billing/console-kit'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
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
    <div className="flex flex-col gap-6">
      <SectionCard
        padded={false}
        title="Pessoas informadas pelo clube"
        icon={Users}
        description={
          <>
            {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}
            {totalOwnership > 0 ? ` · participações somam ${totalOwnership.toLocaleString('pt-BR')}%` : ''}
            {proposal.hasPep ? ' · há pessoa politicamente exposta' : ''}
          </>
        }
      >
        {people.length === 0 ? (
          <EmptyState icon={Users} size="sm" title="O clube ainda não informou os sócios e representantes." />
        ) : (
          <DataTable
            caption="Pessoas informadas pelo clube: cargo, contato e conferência com a Receita Federal"
            minWidth="min-w-[760px]"
            framed={false}
          >
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Cargo e papéis</Th>
                <Th className="hidden md:table-cell">Contato</Th>
                <Th>Sócios na Receita</Th>
              </tr>
            </thead>
            <tbody>
              {people.map(person => (
                <Tr key={person.id}>
                  <Td className="align-top">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-secondary"
                        aria-hidden="true"
                      >
                        <UserRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 font-medium text-foreground">{person.name}</p>
                        <p className="m-0 font-mono text-xs text-muted-foreground">{formatCpf(person.cpf)}</p>
                        {person.birthDate && (
                          <p className="m-0 text-xs text-muted-foreground">Nasc. {formatDateBR(person.birthDate)}</p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td className="align-top">
                    <p className="m-0 text-foreground">{positionOf(person)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roleChips(person).map(chip => (
                        <span key={chip} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {chip}
                        </span>
                      ))}
                    </div>
                    {person.isPep && (
                      <p className="m-0 mt-1.5 inline-flex items-start gap-1 rounded-lg bg-[#FFFAEB] px-2 py-1 text-[11px] text-[#B54708]">
                        <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>
                          Politicamente exposta{person.pepRole ? ` — ${person.pepRole}` : ''}
                          {person.pepRelationship ? ` (${PEP_RELATIONSHIP_LABELS[person.pepRelationship]})` : ''}
                        </span>
                      </p>
                    )}
                  </Td>
                  <Td className="hidden align-top text-xs text-muted-foreground md:table-cell">
                    <p className="m-0">{person.email ?? '—'}</p>
                    <p className="m-0">{person.phone ?? ''}</p>
                  </Td>
                  <Td className="align-top">
                    <Pill meta={partnerMatchMeta(person.qsaMatch)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard
        padded={false}
        title="Sócios na Receita Federal"
        icon={Landmark}
        description={
          partners.length > 0
            ? `${partners.length} ${partners.length === 1 ? 'sócio ou administrador registrado' : 'sócios e administradores registrados'} · comparados com as pessoas informadas pelo clube`
            : undefined
        }
      >
        {partners.length > 0 ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {partners.map((partner, index) => {
              const match = partnerMatches(partner, people)
              return (
                <li
                  key={`${partner.name}-${index}`}
                  className="flex flex-wrap items-center gap-3 border-b border-[#EEF0F3] px-6 py-4 last:border-b-0"
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      match ? 'bg-[#ECFDF3] text-[#067647]' : 'bg-muted text-muted-foreground',
                    )}
                    aria-hidden="true"
                  >
                    {match ? <Link2 className="h-4 w-4" /> : <Link2Off className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-medium text-foreground">{partner.name}</p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {[partner.qualification, partner.document, partner.entryDate ? `desde ${formatDateBR(partner.entryDate)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <p className={cn('m-0 text-xs', match ? 'text-[#067647]' : 'text-muted-foreground')}>
                    {match ? `Informado pelo clube: ${match.name} (${positionOf(match)})` : 'Não informado pelo clube'}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Landmark}
            size="sm"
            title={
              proposal.receita
                ? 'A Receita não lista sócios para este CNPJ (comum em entidades sem capital).'
                : 'A consulta à Receita Federal não está disponível para este clube.'
            }
          />
        )}
        {notFound.length > 0 && (
          <div className={cn('p-6', partners.length > 0 && 'border-t border-border')}>
            <p className="m-0 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs text-[#B54708]">
              {notFound.map(person => person.name).join(', ')} não {notFound.length === 1 ? 'aparece' : 'aparecem'} entre os sócios
              da Receita Federal. Confira os poderes de representação no ato constitutivo, na ata de eleição ou na procuração.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
