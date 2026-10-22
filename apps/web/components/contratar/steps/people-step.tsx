'use client'

import { useMemo, useState } from 'react'
import { Plus, ShieldAlert, Trash2, UserCheck, UserPlus, WandSparkles } from 'lucide-react'
import {
  PEP_RELATIONSHIP_LABELS,
  PERSON_POSITION_LABELS,
  formatPhone,
  isValidCpf,
  maskCpf,
  maskCpfPartially,
  maskPhone,
  normalizePersonName,
  onboardingPeopleInput,
  onlyDigits,
  pepRelationship as pepRelationshipSchema,
  personPosition as personPositionSchema,
  type OnboardingApplicantView,
  type PepRelationship,
  type PersonPosition,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { saveOnboardingPeopleAction } from '@/lib/actions/contratacao-api'
import {
  errorsUnder,
  isSectionComplete,
  positionFromQualification,
  titleCaseName,
  validate,
  type FieldErrors,
} from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { useContratarDemo } from '../demo/use-demo'
import { safeAction } from '../hooks'
import { StepFooter } from '../step-footer'
import { ActionError, Notice, Pill, SelectField, StepHeading, SubPanel, TextField } from '../ui'
import type { StepContext } from './types'

interface PersonForm {
  key: string
  id?: string
  name: string
  cpf: string
  /** CPF mascarado vindo da API (pessoa já salva cujo CPF completo não conhecemos). */
  maskedCpf: string | null
  birthDate: string
  email: string
  phone: string
  position: PersonPosition | ''
  positionOther: string
  isLegalRepresentative: boolean
  isPartner: boolean
  isBeneficialOwner: boolean
  ownershipPercent: string
  actsByPowerOfAttorney: boolean
  isPep: boolean
  pepRole: string
  pepRelationship: PepRelationship | ''
}

let localKey = 0
const newKey = () => `p-${Date.now().toString(36)}-${localKey++}`

function emptyPerson(): PersonForm {
  return {
    key: newKey(),
    name: '',
    cpf: '',
    maskedCpf: null,
    birthDate: '',
    email: '',
    phone: '',
    position: '',
    positionOther: '',
    isLegalRepresentative: false,
    isPartner: false,
    isBeneficialOwner: false,
    ownershipPercent: '',
    actsByPowerOfAttorney: false,
    isPep: false,
    pepRole: '',
    pepRelationship: '',
  }
}

function fromView(view: OnboardingApplicantView, cache: Map<string, string>): PersonForm[] {
  return view.people.map(person => {
    const digits = onlyDigits(person.cpf)
    const known = digits.length === 11 && isValidCpf(digits) ? digits : (cache.get(person.id) ?? '')
    return {
      key: person.id,
      id: person.id,
      name: person.name,
      cpf: known ? maskCpf(known) : '',
      maskedCpf: known ? null : person.cpf,
      birthDate: person.birthDate ?? '',
      email: person.email ?? '',
      phone: formatPhone(person.phone),
      position: person.position,
      positionOther: person.positionOther ?? '',
      isLegalRepresentative: person.isLegalRepresentative,
      isPartner: person.isPartner,
      isBeneficialOwner: person.isBeneficialOwner,
      ownershipPercent: person.ownershipPercent === null ? '' : String(person.ownershipPercent).replace('.', ','),
      actsByPowerOfAttorney: person.actsByPowerOfAttorney,
      isPep: person.isPep,
      pepRole: person.pepRole ?? '',
      pepRelationship: person.pepRelationship ?? '',
    }
  })
}

function parsePercent(value: string): number | null {
  const normalized = value.replace(/\s|%/g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function toPayload(people: PersonForm[]) {
  return {
    people: people.map(person => ({
      ...(person.id ? { id: person.id } : {}),
      name: person.name,
      cpf: person.cpf,
      birthDate: person.birthDate,
      email: person.email,
      phone: person.phone,
      position: person.position || undefined,
      positionOther: person.position === 'outro' ? person.positionOther : '',
      isLegalRepresentative: person.isLegalRepresentative,
      isPartner: person.isPartner,
      isBeneficialOwner: person.isBeneficialOwner,
      ownershipPercent: person.isPartner ? parsePercent(person.ownershipPercent) : null,
      actsByPowerOfAttorney: person.actsByPowerOfAttorney,
      isPep: person.isPep,
      pepRole: person.isPep ? person.pepRole : '',
      pepRelationship: person.isPep && person.pepRelationship ? person.pepRelationship : undefined,
    })),
  }
}

const ROLE_FLAGS: { key: 'isLegalRepresentative' | 'isPartner' | 'isBeneficialOwner' | 'actsByPowerOfAttorney'; label: string; hint: string }[] = [
  { key: 'isLegalRepresentative', label: 'Representante legal', hint: 'Assina pela instituição (inclusive o contrato com a ANNETEC).' },
  { key: 'isPartner', label: 'Sócio com participação', hint: 'Tem parte do capital social. Não se aplica a associações e fundações.' },
  { key: 'isBeneficialOwner', label: 'Beneficiário final', hint: 'Detém 25% ou mais, ou exerce o controle de fato.' },
  { key: 'actsByPowerOfAttorney', label: 'Representa por procuração', hint: 'Pede o envio da procuração na etapa de documentos.' },
]

export function PeopleStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack, cpfCache } = ctx
  // Atalhos só em ambiente de demonstração (API) E com CNPJ de cenário fictício.
  const loadedDemo = useContratarDemo(view)
  const demoTools = loadedDemo?.isDemoCnpj(view.cnpj) ? loadedDemo : null
  const [people, setPeople] = useState<PersonForm[]>(() => {
    const loaded = fromView(view, cpfCache)
    return loaded.length ? loaded : [{ ...emptyPerson(), isLegalRepresentative: true }]
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const initialPayload = useMemo(() => JSON.stringify(toPayload(fromView(view, cpfCache))), [view, cpfCache])
  const partners = view.receita?.partners ?? []
  const isCompany = view.contractorType === 'empresa'
  const ownershipTotal = people.reduce((acc, person) => acc + (person.isPartner ? (parsePercent(person.ownershipPercent) ?? 0) : 0), 0)

  function update(key: string, patch: Partial<PersonForm>) {
    setPeople(current => current.map(person => (person.key === key ? { ...person, ...patch } : person)))
    const index = people.findIndex(person => person.key === key)
    if (index >= 0) {
      setErrors(current => {
        const next: FieldErrors = {}
        for (const [path, message] of Object.entries(current)) {
          const field = path.split('.')[2]
          if (path.startsWith(`people.${index}.`) && field && field in patch) continue
          if (path === 'people') continue
          next[path] = message
        }
        return next
      })
    }
  }

  function addFromQsa(name: string, qualification: string | null) {
    const position = positionFromQualification(qualification)
    const lower = (qualification ?? '').toLowerCase()
    setPeople(current => [
      ...current.filter(person => person.name.trim() || person.cpf.trim()),
      {
        ...emptyPerson(),
        name: titleCaseName(name),
        position,
        isPartner: isCompany && lower.includes('sóci'),
        isLegalRepresentative: !current.some(person => person.isLegalRepresentative && person.name.trim()),
      },
    ])
  }

  function fillDemo() {
    if (!demoTools) return
    const demo = demoTools.demoPeopleFor(view.cnpj)
    const share = demo.length ? Math.round((100 / demo.length) * 100) / 100 : 0
    setPeople(
      demo.map((person, index) => {
        const existing = people.find(item => item.id && normalizePersonName(item.name) === normalizePersonName(person.name))
        return {
          ...emptyPerson(),
          key: existing?.key ?? newKey(),
          id: existing?.id,
          name: person.name,
          cpf: maskCpf(person.cpf),
          maskedCpf: null,
          birthDate: person.birthDate,
          email: person.email,
          phone: maskPhone(person.phone),
          position: person.position,
          isLegalRepresentative: index === 0,
          isPartner: isCompany,
          isBeneficialOwner: isCompany,
          ownershipPercent: isCompany ? String(share).replace('.', ',') : '',
          isPep: person.isPep,
          pepRole: person.pepRole ?? '',
          pepRelationship: person.isPep ? 'titular' : '',
        }
      }),
    )
    setErrors({})
    setError(null)
  }

  async function save() {
    setError(null)
    const missingCpf = people
      .map((person, index) => (person.id && !person.cpf && person.maskedCpf ? index : -1))
      .filter(index => index >= 0)
    const payload = toPayload(people)
    const unchanged = JSON.stringify(payload) === initialPayload
    if (unchanged && isSectionComplete(view, 'people')) {
      ctx.goNext()
      return
    }
    if (missingCpf.length) {
      const next: FieldErrors = {}
      for (const index of missingCpf) {
        next[`people.${index}.cpf`] = 'Por segurança o CPF salvo aparece mascarado. Digite o CPF completo para gravar as alterações.'
      }
      setErrors(next)
      setError('Digite novamente o CPF das pessoas destacadas.')
      return
    }
    const parsed = validate(onboardingPeopleInput, payload)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setError(parsed.errors.people ?? 'Confira os campos destacados.')
      return
    }
    setBusy(true)
    const result = await safeAction(() => saveOnboardingPeopleAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    // Lembra os CPFs completos desta sessão para regravar sem pedir de novo.
    for (const saved of result.data.people) {
      const match = parsed.data.people.find(
        person =>
          (person.id && person.id === saved.id) ||
          (normalizePersonName(person.name) === normalizePersonName(saved.name) &&
            (onlyDigits(saved.cpf) === person.cpf || maskCpfPartially(person.cpf) === saved.cpf)),
      )
      if (match) cpfCache.set(saved.id, match.cpf)
    }
    onSaved(result.data, { advance: true, message: 'Representantes e sócios salvos' })
  }

  const inList = (name: string) => people.some(person => normalizePersonName(person.name) === normalizePersonName(name))

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-people"
        eyebrow="Representantes e sócios"
        title="Quem representa e quem controla a instituição"
        description="Informe os representantes legais e, em empresas, os sócios e beneficiários finais. Conferimos os nomes com o quadro societário da Receita."
        action={
          demoTools ? (
            <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={fillDemo}>
              <WandSparkles className="size-4" aria-hidden />
              Preencher com dados de exemplo
            </Button>
          ) : null
        }
      />

      {partners.length ? (
        <SubPanel
          title="Quadro societário na Receita Federal"
          description="Toque em adicionar para começar a partir destes nomes — o CPF aparece mascarado na Receita, então você completa."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {partners.map(partner => (
              <li key={`${partner.name}-${partner.document ?? ''}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{titleCaseName(partner.name)}</p>
                  <p className="text-xs text-muted-foreground">{partner.qualification ?? 'Qualificação não informada'}</p>
                </div>
                {inList(partner.name) ? (
                  <Pill tone="success">
                    <UserCheck className="size-3" aria-hidden />
                    Na lista
                  </Pill>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 gap-1 rounded-lg"
                    onClick={() => addFromQsa(partner.name, partner.qualification)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Adicionar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SubPanel>
      ) : null}

      <div className="space-y-4">
        {people.map((person, index) => {
          const personErrors = errorsUnder(errors, `people.${index}.`)
          return (
            <fieldset key={person.key} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <legend className="sr-only">Pessoa {index + 1}</legend>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
                    {index + 1}
                  </span>
                  <p className="truncate font-semibold text-foreground">{person.name.trim() || 'Nova pessoa'}</p>
                  {person.isLegalRepresentative ? <Pill tone="brand">Representante</Pill> : null}
                  {person.isPep ? (
                    <Pill tone="warning">
                      <ShieldAlert className="size-3" aria-hidden />
                      PEP
                    </Pill>
                  ) : null}
                </div>
                {people.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPeople(current => current.filter(item => item.key !== person.key))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remover
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nome completo"
                  autoComplete="off"
                  value={person.name}
                  onChange={event => update(person.key, { name: event.target.value })}
                  error={personErrors.name}
                  containerClassName="sm:col-span-2"
                />
                <TextField
                  label="CPF"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={person.maskedCpf ?? '000.000.000-00'}
                  value={person.cpf}
                  onChange={event => update(person.key, { cpf: maskCpf(event.target.value) })}
                  error={personErrors.cpf}
                  hint={person.maskedCpf ? `Salvo como ${person.maskedCpf}. Só redigite se for alterar esta lista.` : undefined}
                />
                <TextField
                  label="Data de nascimento"
                  type="date"
                  value={person.birthDate}
                  onChange={event => update(person.key, { birthDate: event.target.value })}
                  error={personErrors.birthDate}
                />
                <TextField
                  label="E-mail"
                  type="email"
                  optional={!person.isLegalRepresentative}
                  value={person.email}
                  onChange={event => update(person.key, { email: event.target.value })}
                  error={personErrors.email}
                  hint={person.isLegalRepresentative ? 'Representante legal recebe os avisos da proposta.' : undefined}
                />
                <TextField
                  label="Telefone"
                  type="tel"
                  inputMode="tel"
                  optional
                  value={person.phone}
                  onChange={event => update(person.key, { phone: maskPhone(event.target.value) })}
                  error={personErrors.phone}
                />
                <SelectField
                  label="Cargo"
                  value={person.position}
                  onChange={value => update(person.key, { position: value as PersonPosition })}
                  options={personPositionSchema.options.map(option => ({ value: option, label: PERSON_POSITION_LABELS[option] }))}
                  error={personErrors.position}
                />
                {person.position === 'outro' ? (
                  <TextField
                    label="Qual cargo?"
                    value={person.positionOther}
                    onChange={event => update(person.key, { positionOther: event.target.value })}
                    error={personErrors.positionOther}
                  />
                ) : null}
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {ROLE_FLAGS.map(flag => {
                  const id = `${person.key}-${flag.key}`
                  const disabled = flag.key === 'isPartner' && !isCompany && !person.isPartner
                  return (
                    <div
                      key={flag.key}
                      className={cn(
                        'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                        person[flag.key] ? 'border-primary/40 bg-primary/5' : 'bg-background',
                        disabled && 'opacity-60',
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={person[flag.key]}
                        disabled={disabled}
                        onCheckedChange={checked => update(person.key, { [flag.key]: checked === true } as Partial<PersonForm>)}
                        className="mt-0.5"
                      />
                      <label htmlFor={id} className="cursor-pointer text-sm">
                        <span className="block font-medium text-foreground">{flag.label}</span>
                        <span className="block text-[12px] leading-snug text-muted-foreground">{flag.hint}</span>
                      </label>
                    </div>
                  )
                })}
              </div>

              {person.isPartner ? (
                <TextField
                  label="Participação no capital (%)"
                  inputMode="decimal"
                  placeholder="Ex.: 50"
                  value={person.ownershipPercent}
                  onChange={event => update(person.key, { ownershipPercent: event.target.value.replace(/[^\d,.]/g, '') })}
                  error={personErrors.ownershipPercent}
                  containerClassName="mt-4 max-w-xs"
                />
              ) : null}

              <div className={cn('mt-4 rounded-xl border p-3', person.isPep ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-500/10' : 'bg-background')}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`${person.key}-pep`}
                    checked={person.isPep}
                    onCheckedChange={checked => update(person.key, { isPep: checked === true })}
                    className="mt-0.5"
                  />
                  <label htmlFor={`${person.key}-pep`} className="cursor-pointer text-sm">
                    <span className="block font-medium text-foreground">Pessoa politicamente exposta (PEP)</span>
                    <span className="block text-[12px] leading-snug text-muted-foreground">
                      Exerce ou exerceu cargo público relevante nos últimos 5 anos, ou é familiar/colaborador próximo de quem exerce.
                      Não impede a contratação: pede uma diligência reforçada.
                    </span>
                  </label>
                </div>
                {person.isPep ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Cargo ou função pública"
                      value={person.pepRole}
                      onChange={event => update(person.key, { pepRole: event.target.value })}
                      error={personErrors.pepRole}
                    />
                    <SelectField
                      label="Relação"
                      optional
                      value={person.pepRelationship}
                      onChange={value => update(person.key, { pepRelationship: value as PepRelationship })}
                      options={pepRelationshipSchema.options.map(option => ({ value: option, label: PEP_RELATIONSHIP_LABELS[option] }))}
                      error={personErrors.pepRelationship}
                    />
                  </div>
                ) : null}
              </div>
            </fieldset>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="h-11 gap-2 rounded-xl"
          onClick={() => setPeople(current => [...current, emptyPerson()])}
          disabled={people.length >= 20}
        >
          <UserPlus className="size-4" aria-hidden />
          Adicionar pessoa
        </Button>
        {isCompany ? (
          <p className={cn('text-sm', ownershipTotal > 100.01 ? 'text-destructive' : 'text-muted-foreground')}>
            Soma das participações: {ownershipTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
          </p>
        ) : null}
      </div>

      {!people.some(person => person.isLegalRepresentative) ? (
        <Notice tone="warning">Marque ao menos uma pessoa como representante legal — é ela quem assina o contrato.</Notice>
      ) : null}

      <ActionError message={error} details={errors.people && errors.people !== error ? [errors.people] : undefined} />
      <StepFooter onBack={goBack} onPrimary={() => void save()} busy={busy} />
    </div>
  )
}
