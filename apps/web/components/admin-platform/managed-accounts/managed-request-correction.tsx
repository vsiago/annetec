'use client'

import { useEffect, useState } from 'react'
import { CircleAlert, Loader2 } from 'lucide-react'
import {
  ASAAS_COMPANY_TYPE_LABELS,
  formatBRL,
  parseBRL,
  updateManagedAccountRequestInput,
  type ManagedAccountDetail,
  type ManagedAccountRequest,
  type UpdateManagedAccountRequestInput,
} from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FormField, FormRow, FormSelect } from '@/components/dashboard/form-dialog'
import { Button } from '@/components/admin-platform/ui/button'
import { runCommand } from '@/components/admin-platform/billing/console-kit'
import { updateManagedAccountRequestAction } from '@/lib/actions/platform-managed-accounts-api'
import { formatPhone } from '@/lib/form-schemas'

/**
 * Correção dos dados do pedido de conta gerenciada pelo superadmin ANTES de
 * aprovar (ex.: o clube marcou "MEI" sendo associação). Só os campos alterados
 * vão para a API (`PATCH …/pedido`), que audita o antes/depois. Nome e CNPJ vêm
 * do cadastro do clube; o aceite do termo continua o original.
 */

const digits = (value: string) => value.replace(/\D/g, '')

function maskPhone(value: string): string {
  const only = digits(value).slice(0, 11)
  return only.length >= 10 ? formatPhone(only) : only
}

function maskCep(value: string): string {
  const only = digits(value).slice(0, 8)
  return only.length > 5 ? `${only.slice(0, 5)}-${only.slice(5)}` : only
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
}

function stateOf(request: ManagedAccountRequest): FormState {
  return {
    companyType: request.companyType ?? '',
    birthDate: request.birthDate ?? '',
    income: formatBRL(request.incomeValue).replace(/^R\$\s?/, ''),
    email: request.email,
    loginEmail: request.loginEmail,
    mobilePhone: maskPhone(request.mobilePhone),
    phone: request.phone ? maskPhone(request.phone) : '',
    site: request.site ?? '',
    postalCode: maskCep(request.address.postalCode),
    street: request.address.street,
    number: request.address.number,
    complement: request.address.complement ?? '',
    province: request.address.province,
    city: request.address.city ?? '',
    state: request.address.state ?? '',
  }
}

const trimOrNull = (value: string) => (value.trim() ? value.trim() : null)

/** Só o que mudou em relação ao pedido (comparado já normalizado). */
function changesOf(request: ManagedAccountRequest, form: FormState): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (request.personType === 'PJ' && form.companyType && form.companyType !== (request.companyType ?? '')) patch.companyType = form.companyType
  if (request.personType === 'PF' && form.birthDate && form.birthDate !== (request.birthDate ?? '')) patch.birthDate = form.birthDate
  const income = parseBRL(form.income)
  patch.incomeValue = income ?? 0
  if (income !== null && Math.abs(income - request.incomeValue) < 0.005) delete patch.incomeValue
  if (form.email.trim().toLowerCase() !== request.email) patch.email = form.email
  if (form.loginEmail.trim().toLowerCase() !== request.loginEmail) patch.loginEmail = form.loginEmail
  if (digits(form.mobilePhone) !== digits(request.mobilePhone)) patch.mobilePhone = form.mobilePhone
  if ((digits(form.phone) || null) !== (request.phone ? digits(request.phone) : null)) patch.phone = form.phone.trim() ? form.phone : null
  if (trimOrNull(form.site) !== (request.site ?? null)) patch.site = trimOrNull(form.site)
  const address = {
    postalCode: digits(form.postalCode),
    street: form.street.trim(),
    number: form.number.trim(),
    complement: trimOrNull(form.complement),
    province: form.province.trim(),
    city: trimOrNull(form.city),
    state: form.state.trim() ? form.state.trim().toUpperCase() : null,
  }
  const before = {
    postalCode: digits(request.address.postalCode),
    street: request.address.street,
    number: request.address.number,
    complement: request.address.complement ?? null,
    province: request.address.province,
    city: request.address.city ?? null,
    state: request.address.state ?? null,
  }
  if (JSON.stringify(address) !== JSON.stringify(before)) patch.address = address
  return patch
}

export function ManagedRequestCorrectionDialog({
  open,
  onOpenChange,
  orgId,
  request,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  request: ManagedAccountRequest
  onSaved: (detail: ManagedAccountDetail) => void
}) {
  const [form, setForm] = useState<FormState>(() => stateOf(request))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(stateOf(request))
    setErrors({})
    setFormError(null)
    // Reabrir recomeça dos dados atuais do pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function set<K extends keyof FormState>(key: K, value: FormState[K], errorKey: string = key) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => {
      if (!(errorKey in current)) return current
      const next = { ...current }
      delete next[errorKey]
      return next
    })
    setFormError(null)
  }

  async function save() {
    if (busy) return
    const patch = changesOf(request, form)
    if (Object.keys(patch).length === 0) {
      setFormError('Nada mudou em relação ao pedido.')
      return
    }
    const parsed = updateManagedAccountRequestInput.safeParse(patch)
    if (!parsed.success) {
      const found: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (!(path in found)) found[path] = issue.message
      }
      if (patch.incomeValue === 0) found.incomeValue = 'Informe o faturamento mensal estimado'
      setErrors(found)
      return
    }
    setBusy(true)
    const detail = await runCommand(
      updateManagedAccountRequestAction(orgId, parsed.data as UpdateManagedAccountRequestInput),
      'Pedido corrigido. A alteração ficou registrada na auditoria.',
    )
    setBusy(false)
    if (detail) {
      onSaved(detail)
      onOpenChange(false)
    }
  }

  const field = (key: keyof FormState, label: string, options: { required?: boolean; type?: string; mask?: (value: string) => string; errorKey?: string; inputMode?: 'numeric' | 'tel' | 'email' | 'url' | 'decimal'; placeholder?: string; maxLength?: number } = {}) => {
    const errorKey = options.errorKey ?? key
    const id = `mg-fix-${key}`
    return (
      <FormField label={label} htmlFor={id} required={options.required} error={errors[errorKey]}>
        <Input
          id={id}
          type={options.type}
          inputMode={options.inputMode}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          value={form[key]}
          onChange={event => set(key, options.mask ? options.mask(event.target.value) : event.target.value, errorKey)}
          aria-invalid={!!errors[errorKey]}
        />
      </FormField>
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-160">
        <DialogHeader>
          <DialogTitle>Corrigir os dados do pedido</DialogTitle>
          <DialogDescription>
            Ajuste o que o clube informou antes de aprovar. Nome e {request.personType === 'PF' ? 'CPF' : 'CNPJ'} ({request.cpfCnpj ?? '—'}) vêm
            do cadastro do clube. O aceite do termo continua o original e a correção fica na auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-1 pr-1">
          {formError ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          ) : null}

          <FormRow>
            {request.personType === 'PF' ? (
              field('birthDate', 'Data de nascimento', { required: true, type: 'date' })
            ) : (
              <FormField label="Tipo de empresa" required error={errors.companyType}>
                <FormSelect
                  value={form.companyType}
                  onChange={value => set('companyType', value)}
                  placeholder="Escolha o tipo"
                  invalid={!!errors.companyType}
                  options={Object.entries(ASAAS_COMPANY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </FormField>
            )}
            {field('income', 'Faturamento mensal estimado (R$)', { required: true, inputMode: 'decimal', errorKey: 'incomeValue', placeholder: 'Ex.: 15.000,00' })}
          </FormRow>
          <FormRow>
            {field('email', 'E-mail de contato', { required: true, type: 'email' })}
            {field('loginEmail', 'E-mail de acesso à conta', { required: true, type: 'email' })}
          </FormRow>
          <FormRow>
            {field('mobilePhone', 'Celular', { required: true, inputMode: 'tel', mask: maskPhone, placeholder: '(00) 00000-0000' })}
            {field('phone', 'Telefone fixo (opcional)', { inputMode: 'tel', mask: maskPhone, placeholder: '(00) 0000-0000' })}
          </FormRow>
          {field('site', 'Site (opcional)', { inputMode: 'url', placeholder: 'https://' })}
          <FormRow>
            {field('postalCode', 'CEP', { required: true, inputMode: 'numeric', mask: maskCep, errorKey: 'address.postalCode', placeholder: '00000-000' })}
            {field('province', 'Bairro', { required: true, errorKey: 'address.province' })}
          </FormRow>
          {field('street', 'Rua ou avenida', { required: true, errorKey: 'address.street' })}
          <FormRow>
            {field('number', 'Número', { required: true, errorKey: 'address.number' })}
            {field('complement', 'Complemento (opcional)', { errorKey: 'address.complement' })}
          </FormRow>
          <FormRow>
            {field('city', 'Cidade (opcional)', { errorKey: 'address.city' })}
            {field('state', 'UF (opcional)', { errorKey: 'address.state', maxLength: 2, mask: value => value.toUpperCase() })}
          </FormRow>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
