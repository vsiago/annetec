'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle, Send } from 'lucide-react'
import {
  ASAAS_COMPANY_TYPE_LABELS,
  MANAGED_ACCOUNT_TERMS_TEXT,
  MANAGED_ACCOUNT_TERMS_VERSION,
  formatBRL,
  parseBRL,
  requestManagedAccountInput,
  type AsaasCompanyType,
  type ClubManagedAccountStatus,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormField, FormRow, FormSelect } from '@/components/dashboard/form-dialog'
import { requestManagedAccountAction } from '@/lib/actions/faturamento-api'
import { formatPhone } from '@/lib/form-schemas'
import { cn } from '@/lib/utils'

const STEPS = ['Empresa', 'Contato e endereço', 'Termo', 'Revisão'] as const

/** Etapa em que cada campo da API aparece (para levar a pessoa ao erro certo). */
function stepOfField(path: string): number {
  if (path === 'companyType' || path === 'birthDate' || path === 'incomeValue') return 0
  if (path === 'acceptTerms' || path === 'termsVersion') return 2
  return 1
}

const digits = (value: string) => value.replace(/\D/g, '')

function maskCep(value: string): string {
  const only = digits(value).slice(0, 8)
  return only.length > 5 ? `${only.slice(0, 5)}-${only.slice(5)}` : only
}

function maskPhone(value: string): string {
  const only = digits(value).slice(0, 11)
  return only.length >= 10 ? formatPhone(only) : only
}

interface FormState {
  companyType: string
  birthDate: string
  income: string
  email: string
  loginEmail: string
  mobilePhone: string
  phone: string
  site: string
  postalCode: string
  street: string
  number: string
  complement: string
  province: string
  city: string
  state: string
  accepted: boolean
}

function initialState(defaults: ClubManagedAccountStatus['defaults']): FormState {
  const phone = digits(defaults.phone ?? '')
  const address = defaults.address ?? {}
  return {
    companyType: '',
    birthDate: '',
    income: '',
    email: defaults.email ?? '',
    loginEmail: defaults.email ?? '',
    mobilePhone: phone.length === 11 ? maskPhone(phone) : '',
    phone: phone.length === 10 ? maskPhone(phone) : '',
    site: '',
    postalCode: address.postalCode ? maskCep(address.postalCode) : '',
    street: address.street ?? '',
    number: address.number ?? '',
    complement: address.complement ?? '',
    province: address.province ?? '',
    city: address.city ?? '',
    state: address.state ?? '',
    accepted: false,
  }
}

/** `termsVersion` = a versão do termo EXIBIDO (vinda da API junto com o texto): a API recusa se não for a atual. */
function buildPayload(form: FormState, personType: 'PJ' | 'PF' | null, termsVersion: string) {
  const income = parseBRL(form.income)
  return {
    companyType: personType === 'PF' ? undefined : form.companyType || undefined,
    birthDate: personType === 'PF' ? form.birthDate || undefined : undefined,
    incomeValue: income ?? 0,
    email: form.email,
    loginEmail: form.loginEmail,
    phone: form.phone.trim() ? form.phone : undefined,
    mobilePhone: form.mobilePhone,
    site: form.site.trim() ? form.site.trim() : undefined,
    address: {
      postalCode: form.postalCode,
      street: form.street,
      number: form.number,
      complement: form.complement.trim() ? form.complement.trim() : undefined,
      province: form.province,
      city: form.city.trim() ? form.city.trim() : undefined,
      state: form.state.trim() ? form.state.trim().toUpperCase() : undefined,
    },
    acceptTerms: form.accepted ? (true as const) : (false as unknown as true),
    termsVersion,
  }
}

/**
 * Assistente do pedido de conta de recebimento gerenciada: Empresa → Contato e
 * endereço → Termo (aceite obrigatório) → Revisão e envio. Erros da API
 * aparecem no campo; se o campo está em outra etapa, a pessoa volta até ele.
 */
export function ManagedAccountWizard({
  open,
  onOpenChange,
  tenantSlug,
  status,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  status: ClubManagedAccountStatus
  onSubmitted: (status: ClubManagedAccountStatus) => void
}) {
  const { defaults } = status
  const personType = defaults.personType
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(() => initialState(defaults))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setForm(initialState(defaults))
    setErrors({})
    setFormError(null)
    // Reabrir recomeça com os dados do cadastro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const termsVersion = status.terms.version || MANAGED_ACCOUNT_TERMS_VERSION
  const termsText = status.terms.text || MANAGED_ACCOUNT_TERMS_TEXT

  function set<K extends keyof FormState>(key: K, value: FormState[K], errorKeys: string[] = []) {
    setForm(current => ({ ...current, [key]: value }))
    if (errorKeys.length > 0 || formError) {
      setErrors(current => {
        const next = { ...current }
        for (const k of errorKeys) delete next[k]
        return next
      })
      setFormError(null)
    }
  }

  function issuesOf(): Record<string, string> {
    const parsed = requestManagedAccountInput.safeParse(buildPayload(form, personType, termsVersion))
    const found: Record<string, string> = {}
    if (parsed.success) return found
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.')
      if (!(path in found)) found[path] = issue.message
    }
    // Campos que o schema deixa opcionais mas a API exige conforme o tipo de pessoa.
    if (personType !== 'PF' && !form.companyType) found.companyType = 'Escolha o tipo de empresa'
    if (personType === 'PF' && !form.birthDate) found.birthDate = 'Informe a data de nascimento'
    if (parseBRL(form.income) === null) found.incomeValue = 'Informe o faturamento mensal estimado'
    return found
  }

  function validateStep(target: number): boolean {
    const all = issuesOf()
    const inStep = Object.fromEntries(Object.entries(all).filter(([path]) => stepOfField(path) === target))
    setErrors(inStep)
    return Object.keys(inStep).length === 0
  }

  function next() {
    if (!validateStep(step)) return
    setStep(current => Math.min(current + 1, STEPS.length - 1))
  }

  async function submit() {
    if (busy) return
    const all = issuesOf()
    if (Object.keys(all).length > 0) {
      setErrors(all)
      const first = Math.min(...Object.keys(all).map(stepOfField))
      setStep(first)
      return
    }
    const parsed = requestManagedAccountInput.safeParse(buildPayload(form, personType, termsVersion))
    if (!parsed.success) return
    setBusy(true)
    setFormError(null)
    try {
      const result = await requestManagedAccountAction(tenantSlug, parsed.data)
      if (!result.success) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setErrors(result.fieldErrors)
          setStep(Math.min(...Object.keys(result.fieldErrors).map(stepOfField)))
        }
        setFormError(result.error)
        return
      }
      onSubmitted(result.data)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const reviewRows = useMemo(
    () => [
      ['Empresa', defaults.name],
      ['CPF/CNPJ', defaults.cpfCnpj ?? '—'],
      personType === 'PF'
        ? ['Data de nascimento', form.birthDate ? form.birthDate.split('-').reverse().join('/') : '—']
        : ['Tipo de empresa', ASAAS_COMPANY_TYPE_LABELS[form.companyType as AsaasCompanyType] ?? '—'],
      ['Faturamento mensal estimado', parseBRL(form.income) === null ? '—' : formatBRL(parseBRL(form.income) ?? 0)],
      ['E-mail de contato', form.email],
      ['E-mail de acesso à conta', form.loginEmail],
      ['Celular', form.mobilePhone],
      ['Telefone fixo', form.phone || '—'],
      ['Site', form.site || '—'],
      [
        'Endereço',
        `${form.street}, ${form.number}${form.complement ? ` — ${form.complement}` : ''} · ${form.province} · CEP ${form.postalCode}${
          form.city ? ` · ${form.city}${form.state ? `/${form.state.toUpperCase()}` : ''}` : ''
        }`,
      ],
    ],
    [defaults.name, defaults.cpfCnpj, personType, form],
  )

  const last = step === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-160">
        <DialogHeader>
          <DialogTitle>Solicitar conta gerenciada</DialogTitle>
          <DialogDescription>
            Etapa {step + 1} de {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1.5" aria-label="Etapas do pedido">
          {STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                index <= step ? 'bg-primary' : 'bg-muted',
              )}
              title={label}
            />
          ))}
        </ol>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto py-1 pr-1">
          {formError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {formError}
            </p>
          )}

          {step === 0 && (
            <>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">{defaults.name}</p>
                <p className="text-xs text-muted-foreground">
                  {personType === 'PF' ? 'CPF' : 'CNPJ'} do cadastro: {defaults.cpfCnpj ?? '—'} (não pode ser alterado aqui)
                </p>
              </div>
              {personType === 'PF' ? (
                <FormField label="Data de nascimento" htmlFor="mg-nasc" required error={errors.birthDate}>
                  <Input
                    id="mg-nasc"
                    type="date"
                    value={form.birthDate}
                    onChange={event => set('birthDate', event.target.value, ['birthDate'])}
                    aria-invalid={!!errors.birthDate}
                  />
                </FormField>
              ) : (
                <FormField label="Tipo de empresa" required error={errors.companyType}>
                  <FormSelect
                    value={form.companyType}
                    onChange={value => set('companyType', value, ['companyType'])}
                    placeholder="Escolha o tipo"
                    invalid={!!errors.companyType}
                    options={Object.entries(ASAAS_COMPANY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                  />
                </FormField>
              )}
              <FormField
                label="Faturamento mensal estimado (R$)"
                htmlFor="mg-renda"
                required
                error={errors.incomeValue}
                hint="Uma estimativa do que o clube recebe por mês. O Asaas exige essa informação."
              >
                <Input
                  id="mg-renda"
                  inputMode="decimal"
                  placeholder="Ex.: 15.000,00"
                  value={form.income}
                  onChange={event => set('income', event.target.value, ['incomeValue'])}
                  aria-invalid={!!errors.incomeValue}
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormRow>
                <FormField label="E-mail de contato" htmlFor="mg-email" required error={errors.email}>
                  <Input
                    id="mg-email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={event => set('email', event.target.value, ['email'])}
                    aria-invalid={!!errors.email}
                  />
                </FormField>
                <FormField
                  label="E-mail de acesso à conta"
                  htmlFor="mg-login"
                  required
                  error={errors.loginEmail}
                  hint="Usado para entrar na conta e receber os avisos de documentos."
                >
                  <Input
                    id="mg-login"
                    type="email"
                    value={form.loginEmail}
                    onChange={event => set('loginEmail', event.target.value, ['loginEmail'])}
                    aria-invalid={!!errors.loginEmail}
                  />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Celular" htmlFor="mg-cel" required error={errors.mobilePhone}>
                  <Input
                    id="mg-cel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={form.mobilePhone}
                    onChange={event => set('mobilePhone', maskPhone(event.target.value), ['mobilePhone'])}
                    aria-invalid={!!errors.mobilePhone}
                  />
                </FormField>
                <FormField label="Telefone fixo (opcional)" htmlFor="mg-tel" error={errors.phone}>
                  <Input
                    id="mg-tel"
                    inputMode="tel"
                    placeholder="(00) 0000-0000"
                    value={form.phone}
                    onChange={event => set('phone', maskPhone(event.target.value), ['phone'])}
                    aria-invalid={!!errors.phone}
                  />
                </FormField>
              </FormRow>
              <FormField label="Site (opcional)" htmlFor="mg-site" error={errors.site}>
                <Input
                  id="mg-site"
                  inputMode="url"
                  placeholder="https://"
                  value={form.site}
                  onChange={event => set('site', event.target.value, ['site'])}
                  aria-invalid={!!errors.site}
                />
              </FormField>
              <FormRow>
                <FormField label="CEP" htmlFor="mg-cep" required error={errors['address.postalCode']}>
                  <Input
                    id="mg-cep"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder="00000-000"
                    value={form.postalCode}
                    onChange={event => set('postalCode', maskCep(event.target.value), ['address.postalCode'])}
                    aria-invalid={!!errors['address.postalCode']}
                  />
                </FormField>
                <FormField label="Bairro" htmlFor="mg-bairro" required error={errors['address.province']}>
                  <Input
                    id="mg-bairro"
                    value={form.province}
                    onChange={event => set('province', event.target.value, ['address.province'])}
                    aria-invalid={!!errors['address.province']}
                  />
                </FormField>
              </FormRow>
              <FormField label="Rua ou avenida" htmlFor="mg-rua" required error={errors['address.street']}>
                <Input
                  id="mg-rua"
                  autoComplete="address-line1"
                  value={form.street}
                  onChange={event => set('street', event.target.value, ['address.street'])}
                  aria-invalid={!!errors['address.street']}
                />
              </FormField>
              <FormRow>
                <FormField label="Número" htmlFor="mg-num" required error={errors['address.number']}>
                  <Input
                    id="mg-num"
                    value={form.number}
                    onChange={event => set('number', event.target.value, ['address.number'])}
                    aria-invalid={!!errors['address.number']}
                  />
                </FormField>
                <FormField label="Complemento (opcional)" htmlFor="mg-comp" error={errors['address.complement']}>
                  <Input
                    id="mg-comp"
                    value={form.complement}
                    onChange={event => set('complement', event.target.value, ['address.complement'])}
                  />
                </FormField>
              </FormRow>
              <FormRow>
                <FormField label="Cidade (opcional)" htmlFor="mg-cidade" error={errors['address.city']}>
                  <Input
                    id="mg-cidade"
                    value={form.city}
                    onChange={event => set('city', event.target.value, ['address.city'])}
                  />
                </FormField>
                <FormField label="UF (opcional)" htmlFor="mg-uf" error={errors['address.state']}>
                  <Input
                    id="mg-uf"
                    maxLength={2}
                    value={form.state}
                    onChange={event => set('state', event.target.value.toUpperCase(), ['address.state'])}
                  />
                </FormField>
              </FormRow>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Termo de aceite · versão {termsVersion}
                </p>
                <p className="text-sm leading-relaxed text-foreground">{termsText}</p>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="mg-aceite"
                  checked={form.accepted}
                  onCheckedChange={value => set('accepted', value === true, ['acceptTerms', 'termsVersion'])}
                  aria-invalid={!!errors.acceptTerms}
                  className="mt-0.5"
                />
                <label htmlFor="mg-aceite" className="text-sm leading-relaxed text-foreground">
                  Li e aceito o termo acima.
                </label>
              </div>
              {errors.acceptTerms && <p className="text-xs text-destructive">{errors.acceptTerms}</p>}
              <p className="text-xs text-muted-foreground">
                Registramos a data, o seu nome e o endereço de rede (IP) deste aceite.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                Confira os dados. Depois do envio, a ANNETEC analisa o pedido e avisa você pelo sino de notificações.
              </p>
              <dl className="divide-y divide-border rounded-lg border border-border">
                {reviewRows.map(([label, value]) => (
                  <div key={label} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Termo aceito: versão {termsVersion}. Para corrigir algo, volte à etapa correspondente.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            disabled={busy}
          >
            {step > 0 && <ArrowLeft className="h-4 w-4" />}
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          {last ? (
            <Button type="button" className="gap-2" onClick={() => void submit()} disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? 'Enviando…' : 'Enviar pedido'}
            </Button>
          ) : (
            <Button type="button" className="gap-2" onClick={next}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
