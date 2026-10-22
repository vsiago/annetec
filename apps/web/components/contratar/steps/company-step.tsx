'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, WandSparkles } from 'lucide-react'
import {
  UFS,
  formatCep,
  formatPhone,
  maskCep,
  maskPhone,
  onboardingCompanyInput,
  onlyDigits,
  type OnboardingApplicantView,
  type OnboardingContact,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { saveOnboardingCompanyAction } from '@/lib/actions/contratacao-api'
import {
  errorsUnder,
  isSectionComplete,
  orphanErrors,
  validate,
  type FieldErrors,
} from '@/lib/adapters/contratacao'
import { useContratarDemo } from '../demo/use-demo'
import { safeAction } from '../hooks'
import { ReceitaCard } from '../receita-card'
import { StepFooter } from '../step-footer'
import { ActionError, Notice, SelectField, StepHeading, SubPanel, TextField } from '../ui'
import type { StepContext } from './types'

type ContactKey = 'commercial' | 'financial' | 'technical'

interface ContactForm {
  name: string
  email: string
  phone: string
  role: string
}

interface CompanyForm {
  legalName: string
  tradeName: string
  legalNatureCode: string
  legalNatureName: string
  mainCnaeCode: string
  mainCnaeDescription: string
  secondaryCnaes: { code: string; description: string }[]
  openingDate: string
  stateRegistration: string
  municipalRegistration: string
  website: string
  email: string
  phone: string
  address: { cep: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string }
  contacts: Record<ContactKey, ContactForm>
}

const CONTACTS: { key: ContactKey; title: string; description: string }[] = [
  { key: 'commercial', title: 'Contato comercial', description: 'Fala com a ANNETEC sobre plano, contrato e expansão do clube.' },
  { key: 'financial', title: 'Contato financeiro', description: 'Recebe as faturas da plataforma e os avisos de cobrança.' },
  { key: 'technical', title: 'Contato técnico', description: 'Configura o clube, a rede credenciada e as integrações.' },
]

const EMPTY_CONTACT: ContactForm = { name: '', email: '', phone: '', role: '' }

function contactForm(contact: OnboardingContact | undefined): ContactForm {
  if (!contact) return { ...EMPTY_CONTACT }
  return { name: contact.name, email: contact.email, phone: formatPhone(contact.phone), role: contact.role ?? '' }
}

function initialForm(view: OnboardingApplicantView): CompanyForm {
  const saved = view.company
  if (saved) {
    return {
      legalName: saved.legalName,
      tradeName: saved.tradeName ?? '',
      legalNatureCode: saved.legalNatureCode ?? '',
      legalNatureName: saved.legalNatureName ?? '',
      mainCnaeCode: saved.mainCnae?.code ?? '',
      mainCnaeDescription: saved.mainCnae?.description ?? '',
      secondaryCnaes: saved.secondaryCnaes ?? [],
      openingDate: saved.openingDate ?? '',
      stateRegistration: saved.stateRegistration ?? '',
      municipalRegistration: saved.municipalRegistration ?? '',
      website: saved.website ?? '',
      email: saved.email,
      phone: formatPhone(saved.phone),
      address: {
        cep: formatCep(saved.address.cep),
        street: saved.address.street,
        number: saved.address.number,
        complement: saved.address.complement ?? '',
        neighborhood: saved.address.neighborhood,
        city: saved.address.city,
        state: saved.address.state,
      },
      contacts: {
        commercial: contactForm(saved.contacts.commercial),
        financial: contactForm(saved.contacts.financial),
        technical: contactForm(saved.contacts.technical),
      },
    }
  }
  const receita = view.receita
  return {
    legalName: receita?.legalName ?? '',
    tradeName: receita?.tradeName ?? '',
    legalNatureCode: receita?.legalNatureCode ?? '',
    legalNatureName: receita?.legalNatureName ?? '',
    mainCnaeCode: receita?.mainCnae?.code ?? '',
    mainCnaeDescription: receita?.mainCnae?.description ?? '',
    secondaryCnaes: receita?.secondaryCnaes ?? [],
    openingDate: receita?.openingDate ?? '',
    stateRegistration: '',
    municipalRegistration: '',
    website: '',
    email: receita?.email ?? view.applicant.email,
    phone: formatPhone(receita?.phone ?? view.applicant.phone),
    address: {
      cep: formatCep(receita?.address.cep),
      street: receita?.address.street ?? '',
      number: receita?.address.number ?? '',
      complement: receita?.address.complement ?? '',
      neighborhood: receita?.address.neighborhood ?? '',
      city: receita?.address.city ?? '',
      state: (receita?.address.state ?? '').toUpperCase(),
    },
    contacts: {
      commercial: { name: view.applicant.name, email: view.applicant.email, phone: formatPhone(view.applicant.phone), role: '' },
      financial: { ...EMPTY_CONTACT },
      technical: { ...EMPTY_CONTACT },
    },
  }
}

function withScheme(url: string): string {
  const value = url.trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function toPayload(form: CompanyForm, sameAs: Record<'financial' | 'technical', boolean>) {
  const contact = (key: ContactKey) => {
    const source = key !== 'commercial' && sameAs[key] ? { ...form.contacts.commercial, role: form.contacts[key].role } : form.contacts[key]
    return { name: source.name, email: source.email, phone: source.phone, role: source.role }
  }
  const cnae = onlyDigits(form.mainCnaeCode)
  return {
    legalName: form.legalName,
    tradeName: form.tradeName,
    legalNatureCode: onlyDigits(form.legalNatureCode),
    legalNatureName: form.legalNatureName,
    mainCnae: cnae ? { code: cnae, description: form.mainCnaeDescription.trim() } : undefined,
    secondaryCnaes: form.secondaryCnaes,
    openingDate: form.openingDate,
    stateRegistration: form.stateRegistration,
    municipalRegistration: form.municipalRegistration,
    website: withScheme(form.website),
    email: form.email,
    phone: form.phone,
    address: {
      cep: form.address.cep,
      street: form.address.street,
      number: form.address.number,
      complement: form.address.complement || undefined,
      neighborhood: form.address.neighborhood,
      city: form.address.city,
      state: form.address.state,
    },
    contacts: { commercial: contact('commercial'), financial: contact('financial'), technical: contact('technical') },
  }
}

/** Endereço pelo CEP (ViaCEP, direto do navegador). Falha não bloqueia nada. */
async function lookupCep(cep: string): Promise<{ street: string; neighborhood: string; city: string; state: string } | null> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
    if (!response.ok) return null
    const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (data.erro) return null
    return { street: data.logradouro ?? '', neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' }
  } catch {
    return null
  }
}

export function CompanyStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack } = ctx
  // Atalhos só em ambiente de demonstração (API) E com CNPJ de cenário fictício.
  const loadedDemo = useContratarDemo(view)
  const demo = loadedDemo?.isDemoCnpj(view.cnpj) ? loadedDemo : null
  const [form, setForm] = useState<CompanyForm>(() => initialForm(view))
  const [sameAs, setSameAs] = useState<Record<'financial' | 'technical', boolean>>(() => ({
    financial: Boolean(view.company && view.company.contacts.financial.email === view.company.contacts.commercial.email),
    technical: Boolean(view.company && view.company.contacts.technical.email === view.company.contacts.commercial.email),
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cepBusy, setCepBusy] = useState(false)
  const initialPayload = useMemo(() => JSON.stringify(toPayload(initialForm(view), sameAs)), [view]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastCep = useRef(onlyDigits(form.address.cep))

  const cepDigits = onlyDigits(form.address.cep)
  useEffect(() => {
    if (cepDigits.length !== 8 || cepDigits === lastCep.current) return
    lastCep.current = cepDigits
    let alive = true
    setCepBusy(true)
    void lookupCep(cepDigits).then(found => {
      if (!alive) return
      setCepBusy(false)
      if (!found) return
      setForm(current => ({
        ...current,
        address: {
          ...current.address,
          street: found.street || current.address.street,
          neighborhood: found.neighborhood || current.address.neighborhood,
          city: found.city || current.address.city,
          state: found.state || current.address.state,
        },
      }))
    })
    return () => {
      alive = false
    }
  }, [cepDigits])

  function set<K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => {
      const next = { ...current }
      delete next[key as string]
      return next
    })
  }

  function setAddress(key: keyof CompanyForm['address'], value: string) {
    setForm(current => ({ ...current, address: { ...current.address, [key]: value } }))
    setErrors(current => {
      const next = { ...current }
      delete next[`address.${key}`]
      return next
    })
  }

  function setContact(which: ContactKey, key: keyof ContactForm, value: string) {
    setForm(current => ({
      ...current,
      contacts: { ...current.contacts, [which]: { ...current.contacts[which], [key]: value } },
    }))
    setErrors(current => {
      const next = { ...current }
      delete next[`contacts.${which}.${key}`]
      return next
    })
  }

  function fillDemo() {
    if (!demo) return
    const people = demo.demoPeopleFor(view.cnpj)
    const domain = demo.demoDomain(view.cnpj)
    const first = people[0]
    const second = people[1] ?? people[0]
    setForm(current => ({
      ...current,
      website: current.website || `https://www.${domain}`,
      stateRegistration: current.stateRegistration || 'Isento',
      contacts: {
        commercial: first
          ? { name: first.name, email: first.email, phone: maskPhone(first.phone), role: 'Diretoria' }
          : current.contacts.commercial,
        financial: second
          ? { name: second.name, email: `financeiro@${domain}`, phone: maskPhone(second.phone), role: 'Financeiro' }
          : current.contacts.financial,
        technical: demo.demoTechnicalContact(view.cnpj),
      },
    }))
    setSameAs({ financial: false, technical: false })
    setErrors({})
  }

  async function save() {
    setError(null)
    const payload = toPayload(form, sameAs)
    const parsed = validate(onboardingCompanyInput, payload)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setError('Confira os campos destacados.')
      return
    }
    if (JSON.stringify(payload) === initialPayload && isSectionComplete(view, 'company')) {
      ctx.goNext()
      return
    }
    setBusy(true)
    const result = await safeAction(() => saveOnboardingCompanyAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    onSaved(result.data, { advance: true, message: 'Dados cadastrais salvos' })
  }

  const shown = [
    'legalName',
    'tradeName',
    'legalNatureCode',
    'legalNatureName',
    'mainCnae',
    'secondaryCnaes',
    'openingDate',
    'stateRegistration',
    'municipalRegistration',
    'website',
    'email',
    'phone',
    'address',
    'contacts',
  ]

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-company"
        eyebrow="Dados cadastrais"
        title="Dados da instituição"
        description="Trouxemos o que consta na Receita Federal. Complete o que faltar e diga quem responde por cada assunto."
        action={
          demo ? (
            <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={fillDemo}>
              <WandSparkles className="size-4" aria-hidden />
              Preencher com dados de exemplo
            </Button>
          ) : null
        }
      />

      {view.receita ? (
        <ReceitaCard result={view.receita} legalForm={view.legalForm} compact />
      ) : (
        <Notice tone="info" title="Preenchimento manual">
          A consulta à Receita Federal não trouxe dados agora. Preencha como está no cartão CNPJ — a situação cadastral é
          verificada novamente na análise.
        </Notice>
      )}

      <SubPanel title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Razão social"
            value={form.legalName}
            onChange={event => set('legalName', event.target.value)}
            error={errors.legalName}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Nome fantasia"
            optional
            value={form.tradeName}
            onChange={event => set('tradeName', event.target.value)}
            error={errors.tradeName}
          />
          <TextField
            label="Data de abertura"
            type="date"
            optional
            value={form.openingDate}
            onChange={event => set('openingDate', event.target.value)}
            error={errors.openingDate}
          />
          <TextField
            label="Natureza jurídica (código)"
            optional
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={form.legalNatureCode}
            onChange={event => set('legalNatureCode', onlyDigits(event.target.value).slice(0, 4))}
            error={errors.legalNatureCode}
          />
          <TextField
            label="Natureza jurídica (descrição)"
            optional
            value={form.legalNatureName}
            onChange={event => set('legalNatureName', event.target.value)}
            error={errors.legalNatureName}
          />
          <TextField
            label="CNAE principal (código)"
            optional
            inputMode="numeric"
            placeholder="0000000"
            value={form.mainCnaeCode}
            onChange={event => {
              set('mainCnaeCode', onlyDigits(event.target.value).slice(0, 7))
              setErrors(current => {
                const next = { ...current }
                delete next['mainCnae.code']
                return next
              })
            }}
            error={errors['mainCnae.code'] ?? errors.mainCnae}
          />
          <TextField
            label="CNAE principal (descrição)"
            optional
            value={form.mainCnaeDescription}
            onChange={event => set('mainCnaeDescription', event.target.value)}
            error={errors['mainCnae.description']}
          />
          <TextField
            label="Inscrição estadual"
            optional
            placeholder="Número ou “Isento”"
            value={form.stateRegistration}
            onChange={event => set('stateRegistration', event.target.value)}
            error={errors.stateRegistration}
          />
          <TextField
            label="Inscrição municipal"
            optional
            value={form.municipalRegistration}
            onChange={event => set('municipalRegistration', event.target.value)}
            error={errors.municipalRegistration}
          />
        </div>
        {form.secondaryCnaes.length ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Atividades secundárias da Receita: {form.secondaryCnaes.map(item => `${item.code} (${item.description})`).join('; ')}
          </p>
        ) : null}
      </SubPanel>

      <SubPanel title="Contato institucional" description="Viram o e-mail e o telefone oficiais do clube.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="E-mail institucional"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={event => set('email', event.target.value)}
            error={errors.email}
          />
          <TextField
            label="Telefone institucional"
            type="tel"
            inputMode="tel"
            placeholder="(21) 3333-4444"
            value={form.phone}
            onChange={event => set('phone', maskPhone(event.target.value))}
            error={errors.phone}
          />
          <TextField
            label="Site"
            optional
            inputMode="url"
            placeholder="https://www.suainstituicao.org.br"
            value={form.website}
            onChange={event => set('website', event.target.value)}
            onBlur={() => set('website', withScheme(form.website))}
            error={errors.website}
            containerClassName="sm:col-span-2"
          />
        </div>
      </SubPanel>

      <SubPanel title="Endereço da sede" description="Precisa bater com o comprovante de endereço que você vai enviar.">
        <div className="grid gap-4 sm:grid-cols-6">
          <TextField
            label="CEP"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={form.address.cep}
            onChange={event => setAddress('cep', maskCep(event.target.value))}
            error={errors['address.cep']}
            adornment={cepBusy ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Logradouro"
            autoComplete="address-line1"
            value={form.address.street}
            onChange={event => setAddress('street', event.target.value)}
            error={errors['address.street']}
            containerClassName="sm:col-span-4"
          />
          <TextField
            label="Número"
            value={form.address.number}
            onChange={event => setAddress('number', event.target.value)}
            error={errors['address.number']}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Complemento"
            optional
            value={form.address.complement}
            onChange={event => setAddress('complement', event.target.value)}
            error={errors['address.complement']}
            containerClassName="sm:col-span-4"
          />
          <TextField
            label="Bairro"
            value={form.address.neighborhood}
            onChange={event => setAddress('neighborhood', event.target.value)}
            error={errors['address.neighborhood']}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Cidade"
            autoComplete="address-level2"
            value={form.address.city}
            onChange={event => setAddress('city', event.target.value)}
            error={errors['address.city']}
            containerClassName="sm:col-span-3"
          />
          <SelectField
            label="UF"
            value={form.address.state}
            onChange={value => setAddress('state', value)}
            options={UFS.map(uf => ({ value: uf, label: uf }))}
            placeholder="UF"
            error={errors['address.state']}
            containerClassName="sm:col-span-1"
          />
        </div>
      </SubPanel>

      <SubPanel title="Contatos da operação" description="Quem a ANNETEC procura para cada assunto (pode ser a mesma pessoa).">
        <div className="space-y-5">
          {CONTACTS.map(({ key, title, description }) => {
            const contactErrors = errorsUnder(errors, `contacts.${key}.`)
            const copying = key !== 'commercial' && sameAs[key]
            const value = form.contacts[key]
            return (
              <fieldset key={key} className="rounded-xl border bg-card p-4">
                <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
                <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">{description}</p>
                {key !== 'commercial' ? (
                  <div className="mb-3 flex items-center gap-2">
                    <Checkbox
                      id={`same-${key}`}
                      checked={copying}
                      onCheckedChange={checked => setSameAs(current => ({ ...current, [key]: checked === true }))}
                    />
                    <label htmlFor={`same-${key}`} className="cursor-pointer text-sm text-foreground">
                      Mesma pessoa do contato comercial
                    </label>
                  </div>
                ) : null}
                {copying ? (
                  <p className="text-[13px] text-muted-foreground">
                    {form.contacts.commercial.name || 'Contato comercial'} · {form.contacts.commercial.email || 'e-mail a informar'}
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Nome completo"
                      value={value.name}
                      onChange={event => setContact(key, 'name', event.target.value)}
                      error={contactErrors.name}
                    />
                    <TextField
                      label="Cargo ou área"
                      optional
                      value={value.role}
                      onChange={event => setContact(key, 'role', event.target.value)}
                      error={contactErrors.role}
                    />
                    <TextField
                      label="E-mail"
                      type="email"
                      value={value.email}
                      onChange={event => setContact(key, 'email', event.target.value)}
                      error={contactErrors.email}
                    />
                    <TextField
                      label="Telefone"
                      type="tel"
                      inputMode="tel"
                      value={value.phone}
                      onChange={event => setContact(key, 'phone', maskPhone(event.target.value))}
                      error={contactErrors.phone}
                    />
                  </div>
                )}
                {copying && Object.keys(contactErrors).length ? (
                  <p className="mt-2 text-[13px] text-destructive" role="alert">
                    Complete primeiro o contato comercial.
                  </p>
                ) : null}
              </fieldset>
            )
          })}
        </div>
      </SubPanel>

      <ActionError message={error} details={orphanErrors(errors, shown)} />
      <StepFooter onBack={goBack} onPrimary={() => void save()} busy={busy} />
    </div>
  )
}
