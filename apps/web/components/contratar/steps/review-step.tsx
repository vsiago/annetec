'use client'

import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, Pencil, Send } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  ONBOARDING_SECTION_LABELS,
  PERSON_POSITION_LABELS,
  formatBRL,
  formatCep,
  formatPhone,
  type OnboardingSection,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { submitOnboardingAction } from '@/lib/actions/contratacao-api'
import { formatCnpj, formatDateTime, formatLives } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { CancelProposalButton } from '../cancel-dialog'
import { safeAction } from '../hooks'
import { StepFooter } from '../step-footer'
import { ActionError, Notice, StepHeading } from '../ui'
import type { StepContext } from './types'

function ReviewBlock({
  section,
  complete,
  missing,
  onEdit,
  children,
}: {
  section: OnboardingSection
  complete: boolean
  missing: string[]
  onEdit: () => void
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4', !complete && 'border-amber-300 dark:border-amber-500/40')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
          {complete ? (
            <Check className="size-4 text-emerald-600" strokeWidth={3} aria-hidden />
          ) : (
            <CircleAlert className="size-4 text-amber-600" aria-hidden />
          )}
          {ONBOARDING_SECTION_LABELS[section]}
          <span className="sr-only">{complete ? '(completa)' : '(incompleta)'}</span>
        </h3>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
      </div>
      <div className="mt-2 text-[13px] leading-relaxed text-foreground/85">{children}</div>
      {!complete && missing.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-amber-800 dark:text-amber-200">
          {missing.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function ReviewStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack, goTo } = ctx
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<string[]>([])
  const resubmit = view.status === 'pending_info'

  const item = (section: OnboardingSection) => {
    const entry = view.completeness.find(candidate => candidate.section === section)
    return { complete: entry?.complete ?? false, missing: entry?.missing ?? [] }
  }

  async function submit() {
    setError(null)
    setDetails([])
    setBusy(true)
    const result = await safeAction(() => submitOnboardingAction(proposalId, chave))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setDetails(Object.values(result.fieldErrors ?? {}))
      return
    }
    onSaved(result.data, { message: resubmit ? 'Proposta reenviada para análise' : 'Proposta enviada para análise' })
  }

  const company = view.company
  const brand = view.brand
  const documentsSent = view.requirements.filter(row => row.state === 'uploaded' || row.state === 'approved').length
  const requiredTotal = view.requirements.filter(row => row.required).length
  const requiredMissing = view.requirements.filter(row => row.required && (row.state === 'missing' || row.state === 'rejected')).length

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-review"
        eyebrow="Revisão e envio"
        title={resubmit ? 'Confira os ajustes e reenvie' : 'Confira e envie para análise'}
        description="Depois do envio, os dados ficam travados enquanto o compliance analisa. Se algo precisar mudar, pediremos por aqui mesmo."
      />

      <div className="grid gap-3">
        <ReviewBlock section="plan" {...item('plan')} onEdit={() => goTo('plan')}>
          {view.plan.offer && view.plan.quote ? (
            <p>
              Plano <strong>{view.plan.offer.name}</strong> para {formatLives(view.plan.expectedLives)} ·{' '}
              {formatBRL(view.plan.quote.monthlyTotal)}/mês · ativação {formatBRL(view.plan.quote.activationTotal)}
            </p>
          ) : (
            <p className="text-muted-foreground">Plano não escolhido.</p>
          )}
        </ReviewBlock>

        <ReviewBlock section="company" {...item('company')} onEdit={() => goTo('company')}>
          <p>
            <strong>{company?.legalName ?? view.receita?.legalName ?? 'Razão social a informar'}</strong> · CNPJ {formatCnpj(view.cnpj)}
          </p>
          <p>
            {CONTRACTOR_TYPE_LABELS[view.contractorType]} · {LEGAL_FORM_LABELS[view.legalForm]}
          </p>
          {company ? (
            <>
              <p>
                {company.address.street}, {company.address.number}
                {company.address.complement ? ` — ${company.address.complement}` : ''} · {company.address.neighborhood} ·{' '}
                {company.address.city}/{company.address.state} · {formatCep(company.address.cep)}
              </p>
              <p>
                Comercial: {company.contacts.commercial.name} · Financeiro: {company.contacts.financial.name} · Técnico:{' '}
                {company.contacts.technical.name}
              </p>
            </>
          ) : null}
        </ReviewBlock>

        <ReviewBlock section="people" {...item('people')} onEdit={() => goTo('people')}>
          {view.people.length ? (
            <ul className="space-y-0.5">
              {view.people.map(person => (
                <li key={person.id}>
                  <strong>{person.name}</strong> · {person.cpf} · {PERSON_POSITION_LABELS[person.position]}
                  {person.isLegalRepresentative ? ' · representante legal' : ''}
                  {person.isPartner && person.ownershipPercent !== null ? ` · ${person.ownershipPercent}%` : ''}
                  {person.isPep ? ' · PEP' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Nenhuma pessoa cadastrada.</p>
          )}
        </ReviewBlock>

        <ReviewBlock section="documents" {...item('documents')} onEdit={() => goTo('documents')}>
          <p>
            {documentsSent} documento(s) enviado(s)
            {requiredTotal ? ` · ${requiredTotal - requiredMissing} de ${requiredTotal} obrigatórios` : ''}
          </p>
        </ReviewBlock>

        <ReviewBlock section="brand" {...item('brand')} onEdit={() => goTo('brand')}>
          {brand ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex -space-x-1" aria-hidden>
                <span className="size-4 rounded-full border-2 border-white" style={{ background: brand.primaryColor }} />
                <span className="size-4 rounded-full border-2 border-white" style={{ background: brand.secondaryColor }} />
              </span>
              <strong>{brand.clubName}</strong>
              <span className="font-mono text-[12px] text-muted-foreground">{brand.siteUrl}</span>
              <span>· administrador: {brand.admin.email}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Marca e endereço do site a definir.</p>
          )}
        </ReviewBlock>

        <ReviewBlock section="contract" {...item('contract')} onEdit={() => goTo('contract')}>
          {view.contract ? (
            <p>
              Aceito por <strong>{view.contract.signerName}</strong> em {formatDateTime(view.contract.acceptedAt)} (termo{' '}
              {view.contract.termsVersion}, LGPD {view.contract.dpaVersion})
            </p>
          ) : (
            <p className="text-muted-foreground">Contrato ainda não aceito.</p>
          )}
        </ReviewBlock>

        <ReviewBlock section="payment" {...item('payment')} onEdit={() => goTo('payment')}>
          <p>{view.paymentMethod ? CLUB_PAYMENT_METHOD_LABELS[view.paymentMethod] : 'Forma de pagamento a escolher'}</p>
        </ReviewBlock>
      </div>

      {view.canSubmit ? (
        <Notice tone="success" title="Tudo pronto para a análise.">
          Ao enviar, rodamos as verificações automáticas (Receita, quadro societário, documentos) e a proposta entra na fila
          do compliance. Você acompanha tudo por este mesmo link e pelo e-mail {view.applicant.email}.
        </Notice>
      ) : (
        <Notice tone="warning" title="Ainda falta completar algumas etapas.">
          Use os botões Editar acima para resolver os itens destacados.
        </Notice>
      )}

      <ActionError message={error} details={details} />

      <StepFooter
        onBack={goBack}
        onPrimary={() => void submit()}
        primaryLabel={resubmit ? 'Reenviar para análise' : 'Enviar para análise'}
        busyLabel="Enviando…"
        busy={busy}
        disabled={!view.canSubmit}
        primaryIcon={<Send className="size-5" aria-hidden />}
      />

      <div className="flex flex-col items-start gap-1 border-t pt-4 text-[13px] text-muted-foreground">
        <p>
          Contato cadastrado: {view.applicant.name} · {view.applicant.email} · {formatPhone(view.applicant.phone)}
        </p>
        <CancelProposalButton
          view={view}
          proposalId={proposalId}
          chave={chave}
          onCanceled={next => onSaved(next, { message: 'Proposta cancelada' })}
        />
      </div>
    </div>
  )
}
