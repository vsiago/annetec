'use client'

import { useState } from 'react'
import { FileSignature, Fingerprint, ScrollText, ShieldCheck, WandSparkles } from 'lucide-react'
import {
  PLATFORM_DPA,
  PLATFORM_TERMS,
  normalizePersonName,
  onboardingContractAcceptanceInput,
  type PlatformContractDocument,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { acceptOnboardingContractAction } from '@/lib/actions/contratacao-api'
import { formatDateTime, orphanErrors, validate, type FieldErrors } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { useContratarDemo } from '../demo/use-demo'
import { safeAction } from '../hooks'
import { StepFooter } from '../step-footer'
import { ActionError, Notice, Pill, SelectField, StepHeading, TextField } from '../ui'
import type { StepContext } from './types'

function ContractDocument({ doc, icon }: { doc: PlatformContractDocument; icon: typeof ScrollText }) {
  const Icon = icon
  return (
    <article className="overflow-hidden rounded-2xl border bg-card" aria-labelledby={`doc-${doc.key}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
        <h3 id={`doc-${doc.key}`} className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
          <Icon className="size-4 text-primary" aria-hidden />
          {doc.title}
        </h3>
        <Pill tone="neutral">Versão {doc.version}</Pill>
      </header>
      <ol
        className="max-h-72 list-decimal space-y-2 overflow-y-auto px-4 py-4 pl-9 text-[13px] leading-relaxed text-foreground/85"
        tabIndex={0}
        aria-label={`Cláusulas de ${doc.title}`}
      >
        {doc.clauses.map(clause => (
          <li key={clause}>{clause}</li>
        ))}
      </ol>
    </article>
  )
}

export function ContractStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack, goTo } = ctx
  // Atalho só em ambiente de demonstração (API) E com CNPJ de cenário fictício.
  const loadedDemo = useContratarDemo(view)
  const demoCnpj = Boolean(loadedDemo?.isDemoCnpj(view.cnpj))
  const representatives = view.people.filter(person => person.isLegalRepresentative)
  const accepted = view.contract
  const current =
    accepted &&
    accepted.termsVersion === PLATFORM_TERMS.version &&
    accepted.dpaVersion === PLATFORM_DPA.version &&
    representatives.some(person => person.id === accepted.signerPersonId)
  const [signerId, setSignerId] = useState(() =>
    representatives.length === 1 ? (representatives[0]?.id ?? '') : (accepted?.signerPersonId ?? ''),
  )
  const [typedName, setTypedName] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptDpa, setAcceptDpa] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [redo, setRedo] = useState(false)
  const signer = representatives.find(person => person.id === signerId) ?? null

  async function accept() {
    setError(null)
    const found: FieldErrors = {}
    if (signer && typedName.trim() && normalizePersonName(typedName) !== normalizePersonName(signer.name)) {
      found.signerName = `Digite o nome exatamente como cadastrado: ${signer.name}`
    }
    const parsed = validate(onboardingContractAcceptanceInput, {
      signerPersonId: signerId,
      signerName: typedName,
      acceptTerms,
      acceptDpa,
      termsVersion: PLATFORM_TERMS.version,
      dpaVersion: PLATFORM_DPA.version,
    })
    const all = parsed.ok ? found : { ...parsed.errors, ...found }
    if (!signerId) all.signerPersonId = 'Escolha quem assina pela instituição'
    if (Object.keys(all).length || !parsed.ok) {
      setErrors(all)
      return
    }
    setBusy(true)
    const result = await safeAction(() => acceptOnboardingContractAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    setRedo(false)
    onSaved(result.data, { advance: true, message: 'Contrato aceito eletronicamente' })
  }

  const showForm = !current || redo

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-contract"
        eyebrow="Contrato"
        title="Termos da contratação e tratamento de dados"
        description="Leia os dois documentos. O aceite é feito por um representante legal e fica registrado com data, hora, IP e o resumo criptográfico (SHA-256) do texto aceito."
      />

      <div className="grid gap-4">
        <ContractDocument doc={PLATFORM_TERMS} icon={ScrollText} />
        <ContractDocument doc={PLATFORM_DPA} icon={ShieldCheck} />
      </div>

      {current && !redo && accepted ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50">
          <p className="flex items-center gap-2 font-semibold">
            <FileSignature className="size-4" aria-hidden />
            Aceito por {accepted.signerName} em {formatDateTime(accepted.acceptedAt)}
          </p>
          <dl className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="inline opacity-75">Versões: </dt>
              <dd className="inline">
                termo {accepted.termsVersion} · LGPD {accepted.dpaVersion}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Fingerprint className="size-3.5 opacity-75" aria-hidden />
              <dt className="sr-only">Resumo do texto</dt>
              <dd className="truncate font-mono text-[12px]" title={accepted.termsHash}>
                SHA-256 {accepted.termsHash.slice(0, 16)}…
              </dd>
            </div>
          </dl>
          <Button type="button" variant="link" className="mt-1 h-auto p-0 text-emerald-900 dark:text-emerald-100" onClick={() => setRedo(true)}>
            Registrar um novo aceite
          </Button>
        </div>
      ) : null}

      {accepted && !current && !redo ? (
        <Notice tone="warning" title="É preciso aceitar de novo.">
          O aceite anterior foi feito em outra versão dos documentos ou por alguém que não é mais representante legal.
        </Notice>
      ) : null}

      {showForm ? (
        representatives.length === 0 ? (
          <Notice
            tone="warning"
            title="Cadastre um representante legal"
            action={
              <Button type="button" size="sm" variant="outline" className="bg-background" onClick={() => goTo('people')}>
                Ir para representantes
              </Button>
            }
          >
            Só um representante legal pode aceitar o contrato em nome da instituição.
          </Notice>
        ) : (
          <div className="space-y-4 rounded-2xl border bg-muted/25 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Quem assina"
                value={signerId}
                onChange={value => {
                  setSignerId(value)
                  setErrors(current => ({ ...current, signerPersonId: '' }))
                }}
                options={representatives.map(person => ({ value: person.id, label: person.name }))}
                error={errors.signerPersonId || undefined}
              />
              <TextField
                label="Digite o nome completo de quem assina"
                autoComplete="off"
                value={typedName}
                onChange={event => {
                  setTypedName(event.target.value)
                  setErrors(current => ({ ...current, signerName: '' }))
                }}
                error={errors.signerName || undefined}
                hint={signer ? `Igual ao cadastro: ${signer.name}` : undefined}
              />
            </div>
            {[
              {
                id: 'accept-terms',
                checked: acceptTerms,
                set: setAcceptTerms,
                error: errors.acceptTerms,
                text: `Li e aceito o ${PLATFORM_TERMS.title} (versão ${PLATFORM_TERMS.version}).`,
              },
              {
                id: 'accept-dpa',
                checked: acceptDpa,
                set: setAcceptDpa,
                error: errors.acceptDpa,
                text: `Li e aceito o ${PLATFORM_DPA.title} (versão ${PLATFORM_DPA.version}).`,
              },
            ].map(item => (
              <div key={item.id} className={cn('rounded-xl border bg-card p-3', item.error && 'border-destructive/50')}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={checked => item.set(checked === true)}
                    className="mt-0.5 size-5"
                    aria-invalid={item.error ? true : undefined}
                  />
                  <label htmlFor={item.id} className="cursor-pointer text-sm text-foreground">
                    {item.text}
                  </label>
                </div>
                {item.error ? (
                  <p className="mt-1.5 pl-8 text-[13px] text-destructive" role="alert">
                    {item.error}
                  </p>
                ) : null}
              </div>
            ))}
            {demoCnpj && signer ? (
              // Só o nome digitado: o aceite dos termos e do DPA é ato jurídico
              // e nunca é marcado por atalho, nem em demonstração.
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setTypedName(signer.name)
                  setErrors(current => {
                    const next = { ...current }
                    delete next.signerName
                    return next
                  })
                }}
              >
                <WandSparkles className="size-3.5" aria-hidden />
                Preencher o nome do signatário
              </Button>
            ) : null}
          </div>
        )
      ) : null}

      <ActionError message={error} details={orphanErrors(errors, ['signerPersonId', 'signerName', 'acceptTerms', 'acceptDpa'])} />
      <StepFooter
        onBack={goBack}
        onPrimary={showForm ? () => void accept() : ctx.goNext}
        primaryLabel={showForm ? 'Aceitar e continuar' : 'Continuar'}
        busy={busy}
        busyLabel="Registrando aceite…"
        disabled={showForm && representatives.length === 0}
      />
    </div>
  )
}
