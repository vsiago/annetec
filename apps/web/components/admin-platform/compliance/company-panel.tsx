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
import { Field } from '@/components/admin-platform/billing/console-kit'
import { DataTable, TD, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
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
    <Tr className="align-top">
      <th scope="row" className={cn(TD, 'w-44 text-left align-top text-xs font-medium text-muted-foreground')}>
        {label}
      </th>
      <td className={cn(TD, 'align-top text-sm text-foreground')}>{declared || '—'}</td>
      <td className={cn(TD, 'align-top text-sm', diverges ? 'text-[#B54708]' : 'text-foreground')}>
        <span className="inline-flex items-start gap-1.5">
          {receita || '—'}
          {diverges && <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Diferente do que o clube informou" />}
        </span>
      </td>
    </Tr>
  )
}

function ContactCard({ title, contact }: { title: string; contact: OnboardingContact | undefined }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="m-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {contact ? (
        <div className="mt-1 flex flex-col gap-0.5 text-sm">
          <p className="m-0 font-medium text-foreground">
            {contact.name}
            {contact.role ? <span className="font-normal text-muted-foreground"> · {contact.role}</span> : null}
          </p>
          <p className="m-0 text-muted-foreground">{contact.email}</p>
          <p className="m-0 text-muted-foreground">{formatPhone(contact.phone)}</p>
        </div>
      ) : (
        <p className="m-0 mt-1 text-sm text-muted-foreground">Não informado</p>
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
    <div className="flex flex-col gap-6">
      <SectionCard
        padded={false}
        icon={Building}
        title={receita?.legalName ?? company?.legalName ?? 'Empresa'}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{formatCnpj(proposal.cnpj)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {CONTRACTOR_TYPE_LABELS[proposal.contractorType]} · {LEGAL_FORM_LABELS[proposal.legalForm]}
            </span>
            {status && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  active ? 'bg-[#ECFDF3] text-[#067647]' : 'bg-[#FEF3F2] text-[#B42318]',
                )}
              >
                {active ? <CircleCheck className="h-3 w-3" aria-hidden="true" /> : <CircleAlert className="h-3 w-3" aria-hidden="true" />}
                Receita: {status}
                {receita?.registrationStatusDate ? ` desde ${formatDateBR(receita.registrationStatusDate)}` : ''}
              </span>
            )}
          </span>
        }
      >
        <DataTable
          caption="Dados da empresa: o que o clube informou comparado com a Receita Federal"
          minWidth="min-w-[720px]"
          framed={false}
        >
          <thead>
            <tr>
              <Th>
                <span className="sr-only">Dado</span>
              </Th>
              <Th>Informado pelo clube</Th>
              <Th>Receita Federal{receita?.provider === 'simulated' ? ' (dados de demonstração)' : ''}</Th>
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
        </DataTable>
        {receita && receita.registrationStatusReason && (
          <p className="m-0 border-t border-border px-6 py-4 text-xs text-muted-foreground">
            Motivo da situação: {receita.registrationStatusReason}
          </p>
        )}
      </SectionCard>

      <SectionCard title="Contatos" description="Quem fez o cadastro e os responsáveis de cada área.">
        <div className="flex flex-col gap-6">
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
          <div className="grid gap-4 sm:grid-cols-3">
            <ContactCard title="Comercial" contact={company?.contacts.commercial} />
            <ContactCard title="Financeiro" contact={company?.contacts.financial} />
            <ContactCard title="Técnico" contact={company?.contacts.technical} />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
