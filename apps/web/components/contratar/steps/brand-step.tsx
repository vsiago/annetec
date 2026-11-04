'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, ImagePlus, Loader2, Palette, Trash2, UserRound, WandSparkles } from 'lucide-react'
import {
  formatPhone,
  maskPhone,
  onboardingBrandInput,
  suggestSlug,
  type OnboardingApplicantView,
  type SlugAvailability,
} from '@annetec/contracts'
import { LOGO_GUIDANCE } from '@/components/branding/brand-upload'
import { Button } from '@/components/ui/button'
import { checkSlugAction, saveOnboardingBrandAction } from '@/lib/actions/contratacao-api'
import {
  errorsUnder,
  isSectionComplete,
  orphanErrors,
  titleCaseName,
  validate,
  type FieldErrors,
} from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { BrandPreview } from '../brand-preview'
import { useContratarDemo } from '../demo/use-demo'
import { safeAction } from '../hooks'
import { StepFooter } from '../step-footer'
import { LOGO_ACCEPT, checkUploadFile, uploadBrandLogo } from '../upload'
import { ActionError, Notice, SelectField, StepHeading, SubPanel, TextField } from '../ui'
import type { StepContext } from './types'

interface BrandForm {
  clubName: string
  tagline: string
  slug: string
  primaryColor: string
  secondaryColor: string
  logoFileId: string | null
  logoUrl: string | null
  admin: { name: string; email: string; phone: string }
}

const PRESETS = [
  { name: 'Rubi', primary: '#e84364', secondary: '#1e2a4a' },
  { name: 'Oceano', primary: '#0ea5e9', secondary: '#0c3b5e' },
  { name: 'Esmeralda', primary: '#10b981', secondary: '#064e3b' },
  { name: 'Âmbar', primary: '#f59e0b', secondary: '#3b2a12' },
  { name: 'Violeta', primary: '#8b5cf6', secondary: '#2e1065' },
  { name: 'Grafite', primary: '#ef4444', secondary: '#111827' },
]

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

type SlugState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'own' }
  | { state: 'done'; result: SlugAvailability }
  | { state: 'error'; message: string }

function companyName(view: OnboardingApplicantView): string {
  return view.company?.tradeName || view.receita?.tradeName || view.company?.legalName || view.receita?.legalName || ''
}

function initialForm(view: OnboardingApplicantView): BrandForm {
  const brand = view.brand
  if (brand) {
    return {
      clubName: brand.clubName,
      tagline: brand.tagline ?? '',
      slug: brand.slug,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      logoFileId: brand.logoFileId ?? null,
      logoUrl: brand.logoUrl,
      admin: { name: brand.admin.name, email: brand.admin.email, phone: formatPhone(brand.admin.phone) },
    }
  }
  const name = titleCaseName(companyName(view))
  const representative = view.people.find(person => person.isLegalRepresentative && person.email)
  return {
    clubName: name ? `Clube ${name}`.slice(0, 60) : '',
    tagline: '',
    slug: suggestSlug(companyName(view)),
    primaryColor: '#e84364',
    secondaryColor: '#1e2a4a',
    logoFileId: null,
    logoUrl: null,
    admin: {
      name: representative?.name ?? view.applicant.name,
      email: representative?.email ?? '',
      phone: formatPhone(representative?.phone ?? view.applicant.phone),
    },
  }
}

function ColorField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const valid = HEX.test(value)
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground" htmlFor={`color-${label}`}>
        {label}
      </label>
      <div className={cn('flex h-11 items-center gap-2 rounded-xl border bg-background px-2', error && 'border-destructive')}>
        <input
          type="color"
          aria-label={`${label}: seletor`}
          value={valid && value.length === 7 ? value : '#000000'}
          onChange={event => onChange(event.target.value)}
          className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
        <input
          id={`color-${label}`}
          value={value}
          onChange={event => {
            const next = event.target.value.trim()
            onChange(next.startsWith('#') ? next : `#${next}`)
          }}
          maxLength={7}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm uppercase outline-none"
        />
      </div>
      {error ? (
        <p className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function BrandStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack } = ctx
  // Atalhos só em ambiente de demonstração (API) E com CNPJ de cenário fictício.
  const loadedDemo = useContratarDemo(view)
  const demo = loadedDemo?.isDemoCnpj(view.cnpj) ? loadedDemo : null
  const [form, setForm] = useState<BrandForm>(() => initialForm(view))
  const [slugState, setSlugState] = useState<SlugState>({ state: 'idle' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [logoProgress, setLogoProgress] = useState<number | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [siteBase, setSiteBase] = useState('annetec.org.br')
  const logoInput = useRef<HTMLInputElement>(null)
  const initialJson = useRef(JSON.stringify(initialForm(view)))

  useEffect(() => {
    if (view.brand?.siteUrl) {
      try {
        const url = new URL(view.brand.siteUrl)
        setSiteBase(url.host)
        return
      } catch {
        // cai no host atual
      }
    }
    setSiteBase(window.location.host)
  }, [view.brand?.siteUrl])

  // Disponibilidade do endereço: confere ao digitar (com espera), exceto o já reservado por esta proposta.
  useEffect(() => {
    const slug = form.slug.trim().toLowerCase()
    if (!slug) {
      setSlugState({ state: 'idle' })
      return
    }
    const local = onboardingBrandInput.shape.slug.safeParse(slug)
    if (!local.success) {
      setSlugState({ state: 'idle' })
      return
    }
    if (view.brand?.slug === slug) {
      setSlugState({ state: 'own' })
      return
    }
    setSlugState({ state: 'checking' })
    let alive = true
    const timer = window.setTimeout(async () => {
      const result = await safeAction(() => checkSlugAction(slug))
      if (!alive) return
      setSlugState(result.success ? { state: 'done', result: result.data } : { state: 'error', message: result.error })
    }, 400)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [form.slug, view.brand?.slug])

  function set<K extends keyof BrandForm>(key: K, value: BrandForm[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => {
      const next = { ...current }
      delete next[key as string]
      return next
    })
  }

  function setAdmin(key: keyof BrandForm['admin'], value: string) {
    setForm(current => ({ ...current, admin: { ...current.admin, [key]: value } }))
    setErrors(current => {
      const next = { ...current }
      delete next[`admin.${key}`]
      return next
    })
  }

  async function uploadLogo(file: File) {
    setLogoError(null)
    const problem = checkUploadFile(file, 'logo')
    if (problem) {
      setLogoError(problem)
      return
    }
    setLogoProgress(0)
    const result = await uploadBrandLogo({ proposalId, chave, file, onProgress: setLogoProgress })
    setLogoProgress(null)
    if (!result.ok) {
      setLogoError(result.error)
      return
    }
    setForm(current => ({ ...current, logoFileId: result.data.fileId, logoUrl: result.data.url }))
  }

  async function generateLogo() {
    if (!demo) return
    const file = await demo.buildSampleLogo(form.clubName || 'Clube', form.primaryColor, form.secondaryColor)
    if (file) await uploadLogo(file)
  }

  function fillDemo() {
    if (!demo) return
    const person = demo.demoPeopleFor(view.cnpj)[0]
    const base = titleCaseName(companyName(view)) || 'Demonstração'
    setForm(current => ({
      ...current,
      clubName: `Clube ${base}`.slice(0, 60),
      tagline: 'Saúde, bem-estar e economia para os associados e suas famílias',
      slug: suggestSlug(view.receita?.tradeName || companyName(view)),
      primaryColor: '#0ea5e9',
      secondaryColor: '#0c3b5e',
      admin: person
        ? { name: person.name, email: demo.demoAdminEmail(view.cnpj), phone: maskPhone(person.phone) }
        : current.admin,
    }))
    setErrors({})
  }

  const representatives = view.people.filter(person => person.isLegalRepresentative || person.email)

  async function save() {
    setError(null)
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      clubName: form.clubName,
      tagline: form.tagline,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      logoFileId: form.logoFileId,
      admin: form.admin,
    }
    const parsed = validate(onboardingBrandInput, payload)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setError('Confira os campos destacados.')
      return
    }
    if (slugState.state === 'done' && !slugState.result.available) {
      setErrors({ slug: slugState.result.message ?? 'Este endereço não está disponível' })
      setError('Escolha outro endereço para o site.')
      return
    }
    if (JSON.stringify(form) === initialJson.current && isSectionComplete(view, 'brand')) {
      ctx.goNext()
      return
    }
    setBusy(true)
    const result = await safeAction(() => saveOnboardingBrandAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    onSaved(result.data, { advance: true, message: 'Marca e site salvos' })
  }

  const adminErrors = errorsUnder(errors, 'admin.')

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-brand"
        eyebrow="Marca e site"
        title="A cara do seu clube"
        description="Nome, endereço, cores e logo da vitrine onde seus associados vão assinar. Dá para ajustar tudo depois, no painel."
        action={
          demo ? (
            <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={fillDemo}>
              <WandSparkles className="size-4" aria-hidden />
              Preencher com dados de exemplo
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <SubPanel title="Identidade">
            <div className="grid gap-4">
              <TextField
                label="Nome do clube"
                maxLength={60}
                value={form.clubName}
                onChange={event => set('clubName', event.target.value)}
                error={errors.clubName}
              />
              <TextField
                label="Frase de destaque"
                optional
                maxLength={120}
                placeholder="Ex.: Saúde e economia para quem faz parte"
                value={form.tagline}
                onChange={event => set('tagline', event.target.value)}
                error={errors.tagline}
              />
              <div className="space-y-1.5">
                <TextField
                  label="Endereço do site"
                  value={form.slug}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={event => set('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))}
                  error={errors.slug}
                  hint={`${siteBase}/${form.slug || 'seu-clube'} — letras minúsculas, números e hífens.`}
                  adornment={
                    slugState.state === 'checking' ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : slugState.state === 'own' || (slugState.state === 'done' && slugState.result.available) ? (
                      <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                    ) : slugState.state === 'done' ? (
                      <CircleX className="size-4 text-destructive" aria-hidden />
                    ) : null
                  }
                />
                <div aria-live="polite" className="min-h-5 text-[13px]">
                  {slugState.state === 'own' ? (
                    <p className="text-emerald-700 dark:text-emerald-300">Endereço reservado para a sua proposta.</p>
                  ) : null}
                  {slugState.state === 'done' && slugState.result.available ? (
                    <p className="text-emerald-700 dark:text-emerald-300">Disponível!</p>
                  ) : null}
                  {slugState.state === 'done' && !slugState.result.available ? (
                    <div className="space-y-1.5">
                      <p className="text-destructive">{slugState.result.message ?? 'Este endereço não está disponível.'}</p>
                      {slugState.result.suggestions.length ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                          Sugestões:
                          {slugState.result.suggestions.map(suggestion => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => set('slug', suggestion)}
                              className="rounded-full border bg-card px-2.5 py-0.5 font-mono text-[12px] text-foreground transition-colors hover:border-primary hover:text-primary"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {slugState.state === 'error' ? <p className="text-amber-700">{slugState.message}</p> : null}
                </div>
              </div>
            </div>
          </SubPanel>

          <SubPanel title="Cores" description="A principal vai nos botões e destaques; a secundária, no fundo e nos títulos.">
            <div className="mb-4 flex flex-wrap gap-2" role="list" aria-label="Paletas prontas">
              {PRESETS.map(preset => {
                const active = preset.primary === form.primaryColor && preset.secondary === form.secondaryColor
                return (
                  <button
                    key={preset.name}
                    type="button"
                    role="listitem"
                    onClick={() => {
                      set('primaryColor', preset.primary)
                      set('secondaryColor', preset.secondary)
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-[12px] font-medium transition-colors hover:border-primary/50',
                      active && 'border-primary ring-2 ring-primary/20',
                    )}
                    aria-pressed={active}
                  >
                    <span className="flex -space-x-1" aria-hidden>
                      <span className="size-5 rounded-full border-2 border-white" style={{ background: preset.primary }} />
                      <span className="size-5 rounded-full border-2 border-white" style={{ background: preset.secondary }} />
                    </span>
                    {preset.name}
                  </button>
                )
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Cor principal" value={form.primaryColor} onChange={value => set('primaryColor', value)} error={errors.primaryColor} />
              <ColorField
                label="Cor secundária"
                value={form.secondaryColor}
                onChange={value => set('secondaryColor', value)}
                error={errors.secondaryColor}
              />
            </div>
          </SubPanel>

          <SubPanel
            title="Logo"
            description={`${LOGO_GUIDANCE.lead} ${LOGO_GUIDANCE.detail} Sem logo, a vitrine mostra as iniciais.`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo enviado" className="max-h-16 max-w-16 object-contain" />
                ) : (
                  <Palette className="size-6 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <input
                  ref={logoInput}
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={event => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void uploadLogo(file)
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 rounded-xl"
                  onClick={() => logoInput.current?.click()}
                  disabled={logoProgress !== null}
                >
                  {logoProgress !== null ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                  {logoProgress !== null ? `Enviando ${logoProgress}%` : form.logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {form.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setForm(current => ({ ...current, logoFileId: null, logoUrl: null }))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remover
                  </Button>
                ) : null}
                {demo ? (
                  <Button type="button" variant="ghost" className="h-10 gap-2 rounded-xl" onClick={() => void generateLogo()} disabled={logoProgress !== null}>
                    <WandSparkles className="size-4" aria-hidden />
                    Gerar logo de exemplo
                  </Button>
                ) : null}
              </div>
            </div>
            {logoError ? (
              <p className="mt-2 text-[13px] text-destructive" role="alert">
                {logoError}
              </p>
            ) : null}
          </SubPanel>

          <SubPanel
            title="Administrador do painel"
            description="Recebe por e-mail a senha provisória do painel quando o clube for ativado. Use um e-mail que ainda não tenha conta na ANNETEC."
          >
            {representatives.length ? (
              <SelectField
                label="Usar os dados de"
                optional
                value=""
                placeholder="Escolha uma pessoa cadastrada"
                onChange={value => {
                  const person = view.people.find(item => item.id === value)
                  if (!person) return
                  setForm(current => ({
                    ...current,
                    admin: { name: person.name, email: person.email ?? current.admin.email, phone: formatPhone(person.phone) },
                  }))
                }}
                options={representatives.map(person => ({ value: person.id, label: person.name }))}
                containerClassName="mb-4"
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nome completo"
                value={form.admin.name}
                onChange={event => setAdmin('name', event.target.value)}
                error={adminErrors.name}
                containerClassName="sm:col-span-2"
                adornment={<UserRound className="size-4 text-muted-foreground" aria-hidden />}
              />
              <TextField
                label="E-mail de acesso"
                type="email"
                value={form.admin.email}
                onChange={event => setAdmin('email', event.target.value)}
                error={adminErrors.email}
              />
              <TextField
                label="Telefone"
                type="tel"
                optional
                value={form.admin.phone}
                onChange={event => setAdmin('phone', maskPhone(event.target.value))}
                error={adminErrors.phone}
              />
            </div>
          </SubPanel>
        </div>

        <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prévia da vitrine</p>
          <BrandPreview
            clubName={form.clubName}
            tagline={form.tagline}
            slug={form.slug}
            primaryColor={form.primaryColor}
            secondaryColor={form.secondaryColor}
            logoUrl={form.logoUrl}
            siteBase={siteBase}
          />
          <Notice tone="info">A vitrine entra no ar com três planos prontos, que você ajusta no painel.</Notice>
        </div>
      </div>

      <ActionError message={error} details={orphanErrors(errors, ['slug', 'clubName', 'tagline', 'primaryColor', 'secondaryColor', 'logoFileId', 'admin'])} />
      <StepFooter onBack={goBack} onPrimary={() => void save()} busy={busy} />
    </div>
  )
}
