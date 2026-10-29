'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Check, Copy } from 'lucide-react'
import { UFS, formatBRL, maskCep, maskPhone } from '@annetec/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTenants } from '@/contexts/tenants-context'
import { createTenantAction } from '@/lib/actions/tenants-api'
import { maskCnpj, formatNumber } from '@/lib/adapters/contratacao'
import { ColorField, SelectField, StepSection, TextField } from '@/components/admin-platform/clubs/club-form-fields'
import {
  CLUB_FIELD_ORDER,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  EMPTY_CLUB_FORM,
  explainApiError,
  fieldKeyOf,
  sanitizeSlugInput,
  slugify,
  toLongHex,
  trimSlug,
  validateClubForm,
  type ClubFieldKey,
  type ClubFormErrors,
  type ClubFormValues,
} from '@/components/admin-platform/clubs/club-form-model'
import { useSiteAddress } from '@/lib/site-address'
import { cn } from '@/lib/utils'

const UF_OPTIONS = UFS.map(uf => ({ value: uf, label: uf }))

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const primaryButton = cn(buttonBase, 'min-h-11 border border-secondary bg-secondary px-5 text-white hover:bg-secondary/90')
const secondaryButton = cn(buttonBase, 'min-h-11 border border-[#D0D5DD] bg-white px-4 text-[#344054] hover:bg-[#F9FAFB]')

interface CreatedClub {
  id: string
  name: string
  ownerName: string
  ownerPassword: string
}

export default function CadastrarClubePage() {
  const router = useRouter()
  const siteAddress = useSiteAddress()
  const { plans, isLoading: plansLoading, refresh } = useTenants()

  const [values, setValues] = useState<ClubFormValues>(EMPTY_CLUB_FORM)
  const [slugEdited, setSlugEdited] = useState(false)
  const [touched, setTouched] = useState<Partial<Record<ClubFieldKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  /** Erros que só a API sabe (CNPJ já cadastrado, endereço do site em uso). */
  const [serverErrors, setServerErrors] = useState<ClubFormErrors>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedClub | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const validation = useMemo(() => validateClubForm(values), [values])
  const invalidCount = Object.keys(validation.errors).length

  const set = <K extends ClubFieldKey>(key: K, value: ClubFormValues[K]) => {
    setValues(current => ({ ...current, [key]: value }))
    setServerErrors(current => (current[key] ? { ...current, [key]: undefined } : current))
  }
  const touch = (key: ClubFieldKey) => setTouched(current => (current[key] ? current : { ...current, [key]: true }))

  /** Mensagem de um campo: só aparece depois de a pessoa passar por ele (ou tentar enviar). */
  const errorOf = (key: ClubFieldKey): string | undefined => {
    if (serverErrors[key]) return serverErrors[key]
    return touched[key] || submitted ? validation.errors[key] : undefined
  }
  const field = (key: ClubFieldKey) => ({ id: `clube-${key}`, error: errorOf(key), onBlur: () => touch(key) })

  const handleNameChange = (name: string) => {
    setValues(current => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }))
    setServerErrors(current => (current.name || current.slug ? { ...current, name: undefined, slug: undefined } : current))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')
    setSubmitted(true)

    if (!validation.ok) {
      const first = CLUB_FIELD_ORDER.find(key => validation.errors[key])
      if (first) document.getElementById(`clube-${first}`)?.focus()
      return
    }

    setIsSubmitting(true)
    const result = await createTenantAction(validation.data)
    setIsSubmitting(false)

    if (!result.success) {
      // Erros de campo que a API devolveu vão para o campo; o resto, para o aviso do topo.
      const next: ClubFormErrors = {}
      for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
        const key = fieldKeyOf(path.split('.'))
        if (key && !next[key]) next[key] = message
      }
      const explained = explainApiError(result.error)
      if (explained.field) next[explained.field] = explained.text
      setServerErrors(next)

      const firstKey = CLUB_FIELD_ORDER.find(key => next[key])
      if (firstKey) {
        document.getElementById(`clube-${firstKey}`)?.focus()
        setFormError('Confira o campo destacado e tente de novo.')
      } else {
        setFormError(`${explained.text} Confira os dados e tente de novo.`)
      }
      return
    }

    void refresh()
    setCreated({
      id: result.data.tenant.id,
      name: result.data.tenant.name,
      ownerName: validation.data.ownerName,
      ownerPassword: result.data.ownerPassword,
    })
  }

  const copyPassword = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.ownerPassword)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2500)
    } catch {
      setCopyState('failed')
    }
  }

  const noPlans = !plansLoading && plans.length === 0
  const slugPreview = trimSlug(values.slug) || 'endereco-do-clube'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/inquilinos"
          className="inline-flex w-fit items-center gap-1.5 rounded text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-secondary/40"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para clubes
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Cadastrar clube</h1>
        <p className="text-[15px] text-muted-foreground">
          Preencha os três passos abaixo. Os campos marcados com{' '}
          <span className="font-semibold text-[#B42318]" aria-hidden="true">
            *
          </span>
          <span className="sr-only">asterisco</span> são obrigatórios.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError || (submitted && !validation.ok) ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-[#FDA29B] bg-[#FEF3F2] p-4 text-sm text-[#B42318]"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {formError ||
                `Falta ${invalidCount === 1 ? 'corrigir 1 campo' : `corrigir ${invalidCount} campos`}. Os campos com problema estão destacados abaixo.`}
            </span>
          </div>
        ) : null}

        <StepSection step={1} title="Dados do clube" description="Como o clube aparece no site e nos documentos.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              {...field('name')}
              label="Nome do clube"
              required
              value={values.name}
              onChange={handleNameChange}
              placeholder="Ex.: Clube dos Servidores"
              autoComplete="organization"
            />
            <TextField
              {...field('slug')}
              label="Endereço do site"
              required
              value={values.slug}
              onChange={value => {
                setSlugEdited(true)
                set('slug', sanitizeSlugInput(value))
              }}
              onBlur={() => {
                set('slug', trimSlug(values.slug))
                touch('slug')
              }}
              placeholder="clube-dos-servidores"
              hint={
                <>
                  O site do clube ficará em{' '}
                  <strong className="font-semibold text-[#344054]">
                    {siteAddress(slugPreview)}
                  </strong>
                  . Só letras minúsculas, números e hífen.
                </>
              }
            />
            <TextField
              {...field('legalName')}
              label="Razão social"
              required
              value={values.legalName}
              onChange={value => set('legalName', value)}
              placeholder="Ex.: Clube dos Servidores Ltda."
            />
            <TextField
              {...field('document')}
              label="CNPJ"
              required
              value={values.document}
              onChange={value => set('document', maskCnpj(value))}
              inputMode="numeric"
              placeholder="00.000.000/0001-00"
              maxLength={18}
            />
            <TextField
              {...field('email')}
              label="E-mail do clube"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              onChange={value => set('email', value)}
              placeholder="contato@clube.com.br"
            />
            <TextField
              {...field('phone')}
              label="Telefone com DDD"
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={value => set('phone', maskPhone(value))}
              placeholder="(21) 99999-9999"
              maxLength={15}
            />
          </div>

          <fieldset className="mt-6 border-t border-[#EEF0F3] pt-5">
            <legend className="mb-3 pr-2 text-sm font-semibold text-foreground">Endereço do clube</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <TextField
                {...field('cep')}
                className="sm:col-span-2"
                label="CEP"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                value={values.cep}
                onChange={value => set('cep', maskCep(value))}
                placeholder="00000-000"
                maxLength={9}
              />
              <TextField
                {...field('street')}
                className="sm:col-span-4"
                label="Rua"
                required
                autoComplete="address-line1"
                value={values.street}
                onChange={value => set('street', value)}
              />
              <TextField
                {...field('number')}
                className="sm:col-span-2"
                label="Número"
                required
                value={values.number}
                onChange={value => set('number', value)}
                placeholder="Ex.: 120"
              />
              <TextField
                {...field('complement')}
                className="sm:col-span-4"
                label="Complemento"
                optional
                autoComplete="address-line2"
                value={values.complement}
                onChange={value => set('complement', value)}
                placeholder="Sala, andar, bloco"
              />
              <TextField
                {...field('neighborhood')}
                className="sm:col-span-2"
                label="Bairro"
                required
                value={values.neighborhood}
                onChange={value => set('neighborhood', value)}
              />
              <TextField
                {...field('city')}
                className="sm:col-span-3"
                label="Cidade"
                required
                autoComplete="address-level2"
                value={values.city}
                onChange={value => set('city', value)}
              />
              <SelectField
                {...field('state')}
                className="sm:col-span-1"
                label="Estado"
                required
                autoComplete="address-level1"
                value={values.state}
                onChange={value => set('state', value)}
                placeholder="UF"
                options={UF_OPTIONS}
              />
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-[#EEF0F3] pt-5">
            <legend className="mb-1 pr-2 text-sm font-semibold text-foreground">Aparência (opcional)</legend>
            <p className="mb-3 text-[13px] text-muted-foreground">
              Dá para mudar depois. Sem isso, o site usa as cores padrão e mostra só o nome do clube.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                {...field('primaryColor')}
                label="Cor principal"
                value={values.primaryColor}
                pickerValue={toLongHex(values.primaryColor, DEFAULT_PRIMARY_COLOR)}
                onChange={value => set('primaryColor', value)}
              />
              <ColorField
                {...field('secondaryColor')}
                label="Cor secundária"
                value={values.secondaryColor}
                pickerValue={toLongHex(values.secondaryColor, DEFAULT_SECONDARY_COLOR)}
                onChange={value => set('secondaryColor', value)}
              />
              <TextField
                {...field('logoUrl')}
                className="sm:col-span-2"
                label="Link da logo"
                optional
                type="url"
                inputMode="url"
                value={values.logoUrl}
                onChange={value => set('logoUrl', value)}
                placeholder="https://…/logo.svg"
                hint="Cole o endereço de uma imagem que já esteja na internet."
              />
            </div>
          </fieldset>
        </StepSection>

        <StepSection
          step={2}
          title="Plano"
          description="O plano do clube com a ANNETEC. O clube começa em teste. Clube cadastrado por aqui não recebe faturas automáticas da ANNETEC: elas só existem para quem contrata pelo site."
        >
          {plansLoading && plans.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando planos…
            </p>
          ) : noPlans ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-[#F9FAFB] p-5">
              <strong className="text-base text-foreground">Cadastre um plano antes de criar o clube</strong>
              <span className="text-sm leading-relaxed text-muted-foreground">
                Todo clube precisa de um plano. Crie o primeiro em Planos e preços e volte aqui.
              </span>
              <Link href="/admin/configuracoes" className={secondaryButton}>
                Ir para Planos e preços
              </Link>
            </div>
          ) : (
            <div className="max-w-xl">
              <SelectField
                {...field('planId')}
                label="Plano do clube"
                required
                value={values.planId}
                onChange={value => set('planId', value)}
                placeholder="Escolha um plano"
                options={plans.map(plan => ({
                  value: plan.id,
                  label: `${plan.name} — ${formatBRL(plan.priceMonthly)} por mês · até ${formatNumber(plan.memberLimit)} vidas`,
                }))}
              />
            </div>
          )}
        </StepSection>

        <StepSection
          step={3}
          title="Responsável"
          description="Quem vai administrar o painel do clube. A senha provisória aparece uma única vez, ao final."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              {...field('ownerName')}
              label="Nome do responsável"
              required
              autoComplete="off"
              value={values.ownerName}
              onChange={value => set('ownerName', value)}
            />
            <TextField
              {...field('ownerEmail')}
              label="E-mail do responsável"
              required
              type="email"
              inputMode="email"
              autoComplete="off"
              value={values.ownerEmail}
              onChange={value => set('ownerEmail', value)}
              placeholder="responsavel@clube.com.br"
            />
          </div>
        </StepSection>

        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className={secondaryButton} onClick={() => router.push('/admin/inquilinos')}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton} disabled={isSubmitting || noPlans}>
            {isSubmitting ? 'Cadastrando…' : 'Cadastrar clube'}
          </button>
        </div>
      </form>

      {/*
        A senha só existe nesta tela: o diálogo não fecha por Esc, clique fora ou
        gesto de arrastar. A saída é o botão, depois que a pessoa a guardou.
      */}
      <Dialog open={!!created} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={event => event.preventDefault()}
          onPointerDownOutside={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Clube cadastrado</DialogTitle>
            <DialogDescription>
              Guarde esta senha: ela só aparece agora. Envie para {created?.ownerName} por um canal seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-[#F9FAFB] p-3">
            <code className="flex-1 break-all font-mono text-base text-foreground">{created?.ownerPassword}</code>
            <button type="button" onClick={copyPassword} className={cn(secondaryButton, 'min-h-10 px-3')}>
              {copyState === 'copied' ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copyState === 'copied' ? 'Senha copiada' : 'Copiar senha'}
            </button>
          </div>
          {copyState === 'failed' ? (
            <p role="alert" className="text-sm text-[#B42318]">
              Não foi possível copiar. Selecione a senha acima e copie com Ctrl+C.
            </p>
          ) : null}
          <DialogFooter>
            <button
              type="button"
              className={primaryButton}
              onClick={() => created && router.push(`/admin/inquilinos/${created.id}`)}
            >
              Já guardei a senha, abrir o clube
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
