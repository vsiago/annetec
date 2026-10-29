'use client'

import type { ReactNode } from 'react'
import { Building, CircleAlert, CircleCheck } from 'lucide-react'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  formatBRL,
  formatCep,
  formatDateBR,
  formatPhone,
  onlyDigits,
  type OnboardingContact,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/admin-platform/billing/console-kit'
import { formatCnpj } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Empresa: o que o clube informou lado a lado com o que a Receita Federal
 * devolveu. Diferença fica marcada — é o primeiro lugar que a equipe olha
 * antes de abrir o contrato social.
 */

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function Compare({
  label,
  declared,
  receita,
  compare = true,
}: {
  label: string
  declared: ReactNode
  receita: ReactNode
  /** Texto para comparar (quando o nó exibido é formatado). `false` desliga. */
  compare?: boolean | [string | null | undefined, string | null | undefined]
}) {
  let diverges = false
  if (Array.isArray(compare)) {
    const [a, b] = compare
    diverges = !!a && !!b && normalize(a) !== normalize(b)
  } else if (compare && typeof declared === 'string' && typeof receita === 'string') {
    diverges = !!declared && !!receita && normalize(declared) !== normalize(receita)
  }
  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <th className="w-40 px-6 py-2.5 text-left text-xs font-medium text-muted-foreground">{label}</th>
      <td className="px-4 py-2.5 text-sm text-foreground">{declared || '—'}</td>
      <td className={cn('px-4 py-2.5 text-sm', diverges ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
        <span className="inline-flex items-start gap-1.5">
          {receita || '—'}
          {diverges && <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Diferente do que o clube informou" />}
        </span>
      </td>
    </tr>
  )
}

function ContactCard({ title, contact }: { title: string; contact: OnboardingContact | undefined }) {
  return (
    <div className="rounded-lg border border-border/70 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {contact ? (
        <div className="mt-1 space-y-0.5 text-sm">
          <p className="font-medium text-foreground">
            {contact.name}
            {contact.role ? <span className="font-normal text-muted-foreground"> · {contact.role}</span> : null}
          </p>
          <p className="text-muted-foreground">{contact.email}</p>
          <p className="text-muted-foreground">{formatPhone(contact.phone)}</p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Não informado</p>
      )}
    </div>
  )
}

export function CompanyPanel({ proposal }: { proposal: OnboardingProposalDetail }) {
  const company = proposal.company
  const receita = proposal.receita
  const status = receita?.registrationStatus ?? null
  const active = status?.toUpperCase() === 'ATIVA'

  const declaredAddress = company
    ? [
        `${company.address.street}, ${company.address.number}${company.address.complement ? ` — ${company.address.complement}` : ''}`,
        `${company.address.neighborhood} · ${company.address.city}/${company.address.state}`,
        formatCep(company.address.cep),
      ].join('\n')
    : ''
  const receitaAddress = receita
    ? [
        [receita.address.street, receita.address.number].filter(Boolean).join(', '),
        [receita.address.neighborhood, [receita.address.city, receita.address.state].filter(Boolean).join('/')]
          .filter(Boolean)
          .join(' · '),
        receita.address.cep ? formatCep(receita.address.cep) : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  return (
    <div className="space-y-4">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Building className="h-4 w-4 text-muted-foreground" />
            {receita?.legalName ?? company?.legalName ?? 'Empresa'}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{formatCnpj(proposal.cnpj)}</span>
            <span aria-hidden>·</span>
            <span>
              {CONTRACTOR_TYPE_LABELS[proposal.contractorType]} · {LEGAL_FORM_LABELS[proposal.legalForm]}
            </span>
            {status && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  active
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-red-50 text-[#B42318] dark:bg-red-500/15 dark:text-red-300',
                )}
              >
                {active ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
                Receita: {status}
                {receita?.registrationStatusDate ? ` desde ${formatDateBR(receita.registrationStatusDate)}` : ''}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-6 py-2.5 font-medium" />
                  <th className="px-4 py-2.5 font-medium">Informado pelo clube</th>
                  <th className="px-4 py-2.5 font-medium">
                    Receita Federal{receita?.provider === 'simulated' ? ' (dados de demonstração)' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                <Compare label="Razão social" declared={company?.legalName ?? ''} receita={receita?.legalName ?? ''} />
                <Compare label="Nome fantasia" declared={company?.tradeName ?? ''} receita={receita?.tradeName ?? ''} />
                <Compare
                  label="Natureza jurídica"
                  declared={
                    company?.legalNatureCode ? `${company.legalNatureCode} — ${company.legalNatureName ?? ''}` : ''
                  }
                  receita={receita?.legalNatureCode ? `${receita.legalNatureCode} — ${receita.legalNatureName ?? ''}` : ''}
                  compare={[company?.legalNatureCode, receita?.legalNatureCode]}
                />
                <Compare
                  label="Atividade principal (CNAE)"
                  declared={company?.mainCnae ? `${company.mainCnae.code} — ${company.mainCnae.description}` : ''}
                  receita={receita?.mainCnae ? `${receita.mainCnae.code} — ${receita.mainCnae.description}` : ''}
                  compare={[onlyDigits(company?.mainCnae?.code), onlyDigits(receita?.mainCnae?.code)]}
                />
                <Compare
                  label="Atividades secundárias"
                  declared={company ? `${company.secondaryCnaes?.length ?? 0} atividade(s)` : ''}
                  receita={receita ? `${receita.secondaryCnaes.length} atividade(s)` : ''}
                  compare={false}
                />
                <Compare
                  label="Abertura"
                  declared={company?.openingDate ? formatDateBR(company.openingDate) : ''}
                  receita={receita?.openingDate ? formatDateBR(receita.openingDate) : ''}
                />
                <Compare
                  label="Endereço da sede"
                  declared={<span className="whitespace-pre-line">{declaredAddress}</span>}
                  receita={<span className="whitespace-pre-line">{receitaAddress}</span>}
                  compare={[
                    `${onlyDigits(company?.address.cep)}${company?.address.number ?? ''}`,
                    `${onlyDigits(receita?.address.cep)}${receita?.address.number ?? ''}`,
                  ]}
                />
                <Compare label="E-mail" declared={company?.email ?? ''} receita={receita?.email ?? ''} compare={false} />
                <Compare
                  label="Telefone"
                  declared={company?.phone ? formatPhone(company.phone) : ''}
                  receita={receita?.phone ?? ''}
                  compare={false}
                />
                <Compare
                  label="Porte e capital"
                  declared=""
                  receita={
                    receita
                      ? [receita.size, receita.shareCapital !== null ? formatBRL(receita.shareCapital) : null]
                          .filter(Boolean)
                          .join(' · ')
                      : ''
                  }
                  compare={false}
                />
              </tbody>
            </table>
          </div>
          {receita && receita.registrationStatusReason && (
            <p className="px-6 pt-3 text-xs text-muted-foreground">Motivo da situação: {receita.registrationStatusReason}</p>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Contatos</CardTitle>
          <CardDescription>Quem fez o cadastro e os responsáveis de cada área.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Quem fez o cadastro">
              <span className="font-medium">{proposal.applicant.name}</span>
              <br />
              <span className="text-muted-foreground">{proposal.applicant.email}</span>
              <br />
              <span className="text-muted-foreground">{formatPhone(proposal.applicant.phone)}</span>
            </Field>
            <Field label="Site">{company?.website ?? '—'}</Field>
            <Field label="Inscrições">
              {company?.stateRegistration || company?.municipalRegistration
                ? [company.stateRegistration && `IE ${company.stateRegistration}`, company.municipalRegistration && `IM ${company.municipalRegistration}`]
                    .filter(Boolean)
                    .join(' · ')
                : '—'}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ContactCard title="Comercial" contact={company?.contacts.commercial} />
            <ContactCard title="Financeiro" contact={company?.contacts.financial} />
            <ContactCard title="Técnico" contact={company?.contacts.technical} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
