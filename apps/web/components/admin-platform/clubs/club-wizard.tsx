'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CheckCircle2,
  Globe,
  Info,
  Loader2,
  MapPin,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Tags,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { UFS, formatBRL, formatCep, formatPhone, isValidCnpj, onlyDigits } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  ColorField,
  FieldGrid,
  FieldSection,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SecretValue,
  SelectField,
  TextField,
  WizardDialog,
  WizardSuccess,
  maskCep,
  maskCnpj,
  maskPhone,
  successButton,
  useCepLookup,
  useWizard,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { useCnpjLookup, safeAction } from '@/components/contratar/hooks'
import { useTenants } from '@/contexts/tenants-context'
import { checkSlugAction } from '@/lib/actions/contratacao-api'
import { createTenantAction } from '@/lib/actions/tenants-api'
import { formatNumber } from '@/lib/adapters/contratacao'
import { useSiteAddress } from '@/lib/site-address'
import { readableTextColor } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  CLUB_STEP_FIELDS,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  EMPTY_CLUB,
  colorOr,
  contrastRatio,
  explainClubApiError,
  isSlugFormatValid,
  parseClubPayload,
  sanitizeSlugInput,
  slugify,
  trimSlug,
  validateBrandStep,
  validateClubStep,
  validateContactStep,
  validateOwnerStep,
  validatePlanStep,
  type ClubValues,
} from './club-wizard-model'

/**
 * "Cadastrar clube" — assistente em 5 etapas + revisão:
 *  1. Clube: nome, endereço do site (prévia e checagem de disponibilidade),
 *     CNPJ (consulta à Receita preenche razão social e endereço) e razão social;
 *  2. Contato e endereço (CEP preenche a rua pelo ViaCEP);
 *  3. Aparência: cores e logo, com prévia ao vivo do site;
 *  4. Plano;
 *  5. Responsável.
 * No fim, a senha provisória do responsável aparece uma única vez.
 *
 * Mesma rota da API de antes (`POST /platform/tenants` via `createTenantAction`).
 */

const UF_OPTIONS = UFS.map(uf => ({ value: uf, label: uf }))

interface CreatedClub {
  id: string
  name: string
  ownerName: string
  ownerEmail: string
  ownerPassword: string
}

// ---------------------------------------------------------------------------
// Disponibilidade do endereço do site
// ---------------------------------------------------------------------------

type SlugCheck =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'free' }
  | { state: 'blocked'; message: string; suggestions: string[] }
  | { state: 'warning'; message: string }
  | { state: 'error' }

/**
 * Pergunta à API se o endereço está livre (`GET /public/contratacao/slug-disponivel`),
 * 400 ms depois da última tecla. "Já é de outro clube" e "reservado" bloqueiam
 * (a API recusaria ou o site não abriria); proposta em andamento só avisa.
 * O servidor confirma de novo no cadastro.
 */
function useSlugCheck(slug: string): SlugCheck {
  const [check, setCheck] = useState<SlugCheck>({ state: 'idle' })
  useEffect(() => {
    const value = trimSlug(slug)
    if (!isSlugFormatValid(value)) {
      setCheck({ state: 'idle' })
      return
    }
    setCheck({ state: 'checking' })
    let alive = true
    const timer = window.setTimeout(async () => {
      const result = await safeAction(() => checkSlugAction(value))
      if (!alive) return
      if (!result.success) {
        setCheck({ state: 'error' })
        return
      }
      const data = result.data
      if (data.available) setCheck({ state: 'free' })
      else if (data.reason === 'pending_proposal')
        setCheck({
          state: 'warning',
          message: 'Este endereço está reservado por uma proposta de contratação em andamento. Se ela for aprovada antes, o cadastro vai falhar.',
        })
      else if (data.reason === 'taken')
        setCheck({ state: 'blocked', message: 'Este endereço já é de outro clube. Escolha outro.', suggestions: data.suggestions })
      else if (data.reason === 'reserved')
        setCheck({
          state: 'blocked',
          message: 'Este endereço é reservado pela plataforma (é uma página do sistema). Escolha outro.',
          suggestions: data.suggestions,
        })
      else setCheck({ state: 'idle' })
    }, 400)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [slug])
  return check
}

// ---------------------------------------------------------------------------
// Prévia da aparência
// ---------------------------------------------------------------------------

function BrandPreview({
  name,
  primary,
  secondary,
  logoUrl,
  site,
  onLogoError,
}: {
  name: string
  primary: string
  secondary: string
  logoUrl: string
  site: string
  onLogoError: (failed: boolean) => void
}) {
  const p = colorOr(primary, DEFAULT_PRIMARY_COLOR)
  const s = colorOr(secondary, DEFAULT_SECONDARY_COLOR)
  const onPrimary = readableTextColor(p)
  const onSecondary = readableTextColor(s)
  const [failed, setFailed] = useState(false)
  const url = logoUrl.trim()
  const showLogo = /^https?:\/\/.+/i.test(url) && !failed

  useEffect(() => {
    setFailed(false)
    onLogoError(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-border bg-white shadow-sm sm:col-span-12">
      <figcaption className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] bg-[#F9FAFB] px-4 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2 rounded-full bg-[#FDA29B]" />
            <span className="size-2 rounded-full bg-[#FEC84B]" />
            <span className="size-2 rounded-full bg-[#75E0A7]" />
          </span>
          Prévia do site do clube
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{site}</span>
      </figcaption>
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ background: s, color: onSecondary }}>
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="h-8 max-w-[160px] object-contain"
              onError={() => {
                setFailed(true)
                onLogoError(true)
              }}
            />
          ) : (
            <span className="truncate text-sm font-bold">{name.trim() || 'Nome do clube'}</span>
          )}
          <span className="hidden gap-4 text-xs font-medium opacity-90 sm:flex">
            <span>Planos</span>
            <span>Rede</span>
            <span>Sobre</span>
          </span>
          <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: p, color: onPrimary }}>
            Entrar
          </span>
        </div>
        <div className="bg-[#F8FAFC] px-5 py-6">
          <p className="m-0 text-lg font-bold leading-snug" style={{ color: s }}>
            Saúde e benefícios para quem faz parte do {name.trim() || 'clube'}
          </p>
          <p className="m-0 mt-1 text-[13px] text-[#475569]">Planos com carteirinha digital e rede de parceiros.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg px-4 py-2 text-[13px] font-semibold" style={{ background: p, color: onPrimary }}>
              Assinar um plano
            </span>
            <span className="rounded-lg border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: s, color: s }}>
              Ver a rede
            </span>
          </div>
        </div>
      </div>
    </figure>
  )
}

function receitaMessage(filled: string[]): string {
  const legal = filled.includes('legalName')
  const other = filled.some(key => key !== 'legalName')
  if (legal && other) {
    return 'Preenchemos a razão social e, na próxima etapa, o contato e o endereço com os dados da Receita. Confira antes de continuar.'
  }
  if (legal) return 'Preenchemos a razão social com o nome registrado na Receita. Confira antes de continuar.'
  if (other) return 'Preenchemos o contato e o endereço da próxima etapa com os dados da Receita.'
  return 'Os campos já estavam preenchidos, então nada foi trocado.'
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono">
      <span className="size-4 rounded border border-black/10" style={{ background: color }} aria-hidden="true" />
      {color.toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Assistente
// ---------------------------------------------------------------------------

export function ClubWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Depois de cadastrar (ex.: recarregar a lista). */
  onCreated?: (club: { id: string; name: string }) => void
}) {
  const router = useRouter()
  const siteAddress = useSiteAddress()
  const { plans, isLoading: plansLoading, refresh } = useTenants()
  const [created, setCreated] = useState<CreatedClub | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [receitaFilled, setReceitaFilled] = useState<string[]>([])

  const steps = useMemo<WizardStep<ClubValues>[]>(
    () => [
      {
        id: 'clube',
        title: 'Clube',
        icon: Building2,
        description: 'Como o clube aparece no site e nos documentos. Com o CNPJ, buscamos os dados na Receita Federal.',
        fields: CLUB_STEP_FIELDS.clube,
        validate: validateClubStep,
      },
      {
        id: 'contato',
        title: 'Contato e endereço',
        icon: MapPin,
        description: 'Onde o clube recebe e-mails, ligações e correspondência.',
        fields: CLUB_STEP_FIELDS.contato,
        validate: validateContactStep,
      },
      {
        id: 'aparencia',
        title: 'Aparência',
        icon: Palette,
        description: 'Cores e logo do site do clube. Dá para mudar depois — sem isso, o site usa as cores padrão.',
        fields: CLUB_STEP_FIELDS.aparencia,
        validate: validateBrandStep,
      },
      {
        id: 'plano',
        title: 'Plano',
        icon: Tags,
        description: 'O plano do clube com a ANNETEC. O clube começa em teste.',
        fields: CLUB_STEP_FIELDS.plano,
        validate: validatePlanStep,
      },
      {
        id: 'responsavel',
        title: 'Responsável',
        icon: UserRound,
        description: 'Quem vai administrar o painel do clube.',
        fields: CLUB_STEP_FIELDS.responsavel,
        validate: validateOwnerStep,
      },
    ],
    [],
  )

  const wizard = useWizard<ClubValues>({
    steps,
    initialValues: EMPTY_CLUB,
    onSubmit: async values => {
      const parsed = parseClubPayload(values)
      if (!parsed.ok) return { ok: false, message: 'Confira os campos destacados e tente de novo.' }
      const result = await createTenantAction(parsed.data)
      if (!result.success) {
        const explained = explainClubApiError(result.error, result.fieldErrors)
        return { ok: false, message: explained.message, fieldErrors: explained.fieldErrors }
      }
      void refresh()
      setCreated({
        id: result.data.tenant.id,
        name: result.data.tenant.name,
        ownerName: parsed.data.ownerName,
        ownerEmail: parsed.data.ownerEmail,
        ownerPassword: result.data.ownerPassword,
      })
      onCreated?.({ id: result.data.tenant.id, name: result.data.tenant.name })
      return { ok: true }
    },
  })
  const { values, set, setMany, setExternalError } = wizard

  // Ao abrir de novo: estado local também recomeça.
  useEffect(() => {
    if (!open) return
    setCreated(null)
    setSlugEdited(false)
    setLogoFailed(false)
    setReceitaFilled([])
  }, [open])

  // --- Endereço do site --------------------------------------------------
  const slugCheck = useSlugCheck(values.slug)
  useEffect(() => {
    if (slugCheck.state === 'blocked') setExternalError('slug', slugCheck.message)
    else if (slugCheck.state === 'free' || slugCheck.state === 'warning') setExternalError('slug', null)
  }, [slugCheck, setExternalError])

  const onNameChange = (name: string) => {
    set('name', name)
    // O endereço acompanha o nome sem acusar erro nele: quem digita é o nome.
    if (!slugEdited) setMany({ slug: slugify(name) })
  }

  // --- CNPJ na Receita ----------------------------------------------------
  const { lookup, retry } = useCnpjLookup(values.document)
  const autofill = useRef<Partial<ClubValues>>({})
  const filledFor = useRef('')
  const valuesRef = useRef(values)
  valuesRef.current = values

  useEffect(() => {
    if (lookup.state !== 'done') return
    const result = lookup.response.result
    const digits = onlyDigits(valuesRef.current.document)
    if (!lookup.response.found || !result || filledFor.current === digits) return
    filledFor.current = digits
    const state = result.address.state?.toUpperCase() ?? ''
    const proposed: Partial<ClubValues> = {
      legalName: result.legalName,
      cep: result.address.cep ? maskCep(result.address.cep) : '',
      street: result.address.street ?? '',
      number: result.address.number ?? '',
      complement: result.address.complement ?? '',
      neighborhood: result.address.neighborhood ?? '',
      city: result.address.city ?? '',
      state: (UFS as readonly string[]).includes(state) ? state : '',
      email: result.email?.toLowerCase() ?? '',
      phone: result.phone ? maskPhone(result.phone) : '',
    }
    const current = valuesRef.current
    const patch: Partial<ClubValues> = {}
    for (const key of Object.keys(proposed) as (keyof ClubValues)[]) {
      const next = proposed[key]
      if (!next) continue
      const now = current[key]
      // Só preenche o que está vazio ou o que a consulta anterior tinha preenchido.
      if (now.trim() === '' || now === autofill.current[key]) patch[key] = next
    }
    autofill.current = proposed
    setMany(patch, { reveal: true })
    setReceitaFilled(Object.keys(patch))
  }, [lookup, setMany])

  // --- CEP ------------------------------------------------------------------
  const cepState = useCepLookup(values.cep, address => {
    const current = valuesRef.current
    const patch: Partial<ClubValues> = {}
    if (address.street && !current.street.trim()) patch.street = address.street
    if (address.neighborhood && !current.neighborhood.trim()) patch.neighborhood = address.neighborhood
    if (address.city && !current.city.trim()) patch.city = address.city
    if (address.state && !current.state && (UFS as readonly string[]).includes(address.state)) patch.state = address.state
    setMany(patch, { reveal: true })
  })

  const slugPreview = trimSlug(values.slug) || 'endereco-do-clube'
  const site = siteAddress(slugPreview)
  const selectedPlan = plans.find(plan => plan.id === values.planId)
  const noPlans = !plansLoading && plans.length === 0

  // ---------------------------------------------------------------------------

  const renderClubStep = () => {
    const cnpjDigits = onlyDigits(values.document)
    const cnpjComplete = cnpjDigits.length === 14 && isValidCnpj(cnpjDigits)
    const receita = lookup.state === 'done' ? lookup.response : null
    const situation = receita?.result?.registrationStatus

    let slugStatus: ReactNode = null
    if (slugCheck.state === 'checking') {
      slugStatus = <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Verificando o endereço" />
    } else if (slugCheck.state === 'free' && !wizard.field('slug').error) {
      slugStatus = <CheckCircle2 className="size-4 text-[#067647]" aria-hidden="true" />
    }

    return (
      <FieldGrid>
        <TextField
          {...wizard.field('name')}
          onValueChange={onNameChange}
          label="Nome do clube"
          required
          span={12}
          maxLength={120}
          placeholder="Ex.: Clube dos Servidores"
          autoComplete="organization"
          hint="É o nome que os associados veem no site, na carteirinha e nos e-mails."
        />
        <div className="flex flex-col gap-2 sm:col-span-12">
          <TextField
            {...wizard.field('slug')}
            onValueChange={value => {
              setSlugEdited(true)
              set('slug', sanitizeSlugInput(value))
            }}
            onBlur={() => {
              if (values.slug !== trimSlug(values.slug)) set('slug', trimSlug(values.slug))
              wizard.field('slug').onBlur()
            }}
            label="Endereço do site"
            required
            maxLength={40}
            showCounter
            prefix={<Globe className="size-4" />}
            status={slugStatus}
            mono
            placeholder="clube-dos-servidores"
            autoComplete="off"
            hint={
              <>
                O site ficará em <strong className="font-semibold text-[#344054]">{site}</strong>. Só letras minúsculas, números e
                hífen.
              </>
            }
            labelAside={
              slugEdited && values.name.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setSlugEdited(false)
                    set('slug', slugify(values.name))
                  }}
                  className="min-h-8 rounded-md px-1.5 text-[13px] font-semibold text-secondary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
                >
                  Usar o nome do clube
                </button>
              ) : null
            }
          />
          <div aria-live="polite" className="flex flex-col gap-2">
            {slugCheck.state === 'free' && !wizard.field('slug').error ? (
              <p className="m-0 flex items-center gap-1.5 text-[13px] font-medium text-[#067647]">
                <CheckCircle2 className="size-3.5" aria-hidden="true" /> Endereço livre.
              </p>
            ) : null}
            {slugCheck.state === 'warning' ? (
              <Notice tone="warning" icon={TriangleAlert}>
                {slugCheck.message}
              </Notice>
            ) : null}
            {slugCheck.state === 'error' ? (
              <p className="m-0 text-[13px] text-muted-foreground">
                Não foi possível conferir se o endereço está livre agora. A plataforma confere de novo ao cadastrar.
              </p>
            ) : null}
            {slugCheck.state === 'blocked' && slugCheck.suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-muted-foreground">Livres:</span>
                {slugCheck.suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setSlugEdited(true)
                      set('slug', suggestion)
                    }}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[#D0D5DD] bg-white px-3 font-mono text-[13px] text-[#344054] outline-none hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-secondary/40"
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <FieldSection title="Dados da empresa" icon={ShieldCheck} description="Como estão no cartão CNPJ.">
          <TextField
            {...wizard.field('document')}
            label="CNPJ"
            required
            span={5}
            mask={maskCnpj}
            inputMode="numeric"
            placeholder="00.000.000/0001-00"
            maxLength={18}
            status={lookup.state === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Consultando a Receita" /> : null}
            hint="Ao completar o CNPJ, buscamos os dados na Receita Federal."
          />
          <TextField
            {...wizard.field('legalName')}
            label="Razão social"
            required
            span={7}
            maxLength={160}
            placeholder="Ex.: Clube dos Servidores Ltda."
          />
          <div aria-live="polite" className="sm:col-span-12">
            {cnpjComplete && lookup.state === 'loading' ? (
              <Notice tone="neutral" icon={Search}>
                Consultando o CNPJ na Receita Federal…
              </Notice>
            ) : null}
            {cnpjComplete && receita?.found && receita.result ? (
              <Notice
                tone={situation && situation.toUpperCase() !== 'ATIVA' ? 'warning' : 'success'}
                icon={situation && situation.toUpperCase() !== 'ATIVA' ? TriangleAlert : CheckCircle2}
                title={
                  situation && situation.toUpperCase() !== 'ATIVA'
                    ? `Na Receita, a situação deste CNPJ é ${situation}.`
                    : 'CNPJ encontrado na Receita Federal.'
                }
              >
                {receitaMessage(receitaFilled)}
              </Notice>
            ) : null}
            {cnpjComplete && receita && !receita.found && !receita.unavailable ? (
              <Notice tone="warning" icon={TriangleAlert}>
                Não encontramos este CNPJ na Receita Federal. Confira o número ou preencha os dados à mão.
              </Notice>
            ) : null}
            {cnpjComplete && (receita?.unavailable || lookup.state === 'error') ? (
              <Notice
                tone="neutral"
                icon={Info}
                action={
                  <Button type="button" variant="outline" onClick={retry} className="h-10 rounded-[10px] border-[#D0D5DD] px-3 text-[13px] font-semibold text-[#344054]">
                    Tentar de novo
                  </Button>
                }
              >
                A consulta à Receita não respondeu agora. Preencha os dados à mão — a plataforma não depende dela para cadastrar.
              </Notice>
            ) : null}
          </div>
        </FieldSection>
      </FieldGrid>
    )
  }

  const renderContactStep = () => (
    <FieldGrid>
      {receitaFilled.some(key => key !== 'legalName') ? (
        <Notice tone="info" icon={Info}>
          Alguns campos vieram da Receita Federal. Confira e ajuste o que precisar — o contato do clube pode ser diferente
          do cadastro na Receita.
        </Notice>
      ) : null}
      <FieldSection title="Contato" icon={UserRound}>
        <TextField
          {...wizard.field('email')}
          label="E-mail do clube"
          required
          span={7}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="contato@clube.com.br"
          hint="Recebe os avisos da plataforma."
        />
        <TextField
          {...wizard.field('phone')}
          label="Telefone com DDD"
          required
          span={5}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          mask={maskPhone}
          placeholder="(21) 99999-9999"
          maxLength={15}
        />
      </FieldSection>
      <FieldSection title="Endereço" icon={MapPin} description="Digite o CEP: rua, bairro e cidade vêm sozinhos.">
        <TextField
          {...wizard.field('cep')}
          label="CEP"
          required
          span={3}
          mask={maskCep}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          status={cepState === 'loading' ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando o CEP" /> : null}
          hint={cepState === 'not-found' ? 'CEP não encontrado nos Correios. Preencha o endereço à mão.' : undefined}
        />
        <TextField {...wizard.field('street')} label="Rua" required span={9} autoComplete="address-line1" maxLength={160} />
        <TextField {...wizard.field('number')} label="Número" required span={3} placeholder="Ex.: 120" maxLength={20} />
        <TextField
          {...wizard.field('complement')}
          label="Complemento"
          optional
          span={4}
          autoComplete="address-line2"
          placeholder="Sala, andar, bloco"
          maxLength={80}
        />
        <TextField {...wizard.field('neighborhood')} label="Bairro" required span={5} maxLength={80} />
        <TextField {...wizard.field('city')} label="Cidade" required span={9} autoComplete="address-level2" maxLength={80} />
        <SelectField
          {...wizard.field('state')}
          label="Estado"
          required
          span={3}
          options={UF_OPTIONS}
          placeholder="UF"
          autoComplete="address-level1"
        />
      </FieldSection>
    </FieldGrid>
  )

  const renderBrandStep = () => {
    const p = colorOr(values.primaryColor, DEFAULT_PRIMARY_COLOR)
    const s = colorOr(values.secondaryColor, DEFAULT_SECONDARY_COLOR)
    const similar = (contrastRatio(p, s) ?? 21) < 1.6
    return (
      <FieldGrid>
        <ColorField
          {...wizard.field('primaryColor')}
          label="Cor principal"
          span={6}
          fallback={DEFAULT_PRIMARY_COLOR}
          hint="Botões e destaques do site."
        />
        <ColorField
          {...wizard.field('secondaryColor')}
          label="Cor secundária"
          span={6}
          fallback={DEFAULT_SECONDARY_COLOR}
          hint="Cabeçalho, títulos e textos de apoio."
        />
        {similar ? (
          <Notice tone="warning" icon={TriangleAlert}>
            As duas cores estão muito parecidas: os botões quase somem sobre o cabeçalho. Escolha tons mais diferentes.
          </Notice>
        ) : null}
        <TextField
          {...wizard.field('logoUrl')}
          label="Link da logo"
          optional
          span={12}
          type="url"
          inputMode="url"
          placeholder="https://…/logo.svg"
          hint={
            logoFailed
              ? 'Não conseguimos abrir a imagem deste link. Confira se o endereço está certo e é público.'
              : 'Cole o endereço de uma imagem que já esteja na internet (PNG ou SVG, de preferência com fundo transparente).'
          }
        />
        <BrandPreview
          name={values.name}
          primary={values.primaryColor}
          secondary={values.secondaryColor}
          logoUrl={values.logoUrl}
          site={site}
          onLogoError={setLogoFailed}
        />
      </FieldGrid>
    )
  }

  const renderPlanStep = () => {
    if (plansLoading && plans.length === 0) {
      return (
        <div role="status" aria-busy="true" className="grid gap-3 sm:grid-cols-2">
          <span className="sr-only">Carregando planos…</span>
          {[0, 1].map(i => (
            <span key={i} className="h-24 animate-pulse rounded-xl bg-accent motion-reduce:animate-none" />
          ))}
        </div>
      )
    }
    if (noPlans) {
      return (
        <Notice
          tone="warning"
          icon={Tags}
          title="Cadastre um plano antes de criar o clube"
          action={
            <Button asChild variant="outline" className="h-10 rounded-[10px] border-[#D0D5DD] px-3 text-[13px] font-semibold text-[#344054]">
              <Link href="/admin/configuracoes">Ir para Planos e preços</Link>
            </Button>
          }
        >
          Todo clube precisa de um plano. Crie o primeiro em Planos e preços e volte aqui — o que você preencheu se perde ao sair.
        </Notice>
      )
    }
    return (
      <FieldGrid>
        <ChoiceField
          {...wizard.field('planId')}
          label="Plano do clube"
          required
          span={12}
          columns={plans.length > 2 ? 2 : 1}
          options={plans.map(plan => ({
            value: plan.id,
            title: plan.name,
            aside: `${formatBRL(plan.priceMonthly)}/mês`,
            description: [
              `Até ${formatNumber(plan.memberLimit)} vidas`,
              ...plan.features.slice(0, 3),
              plan.features.length > 3 ? `+${plan.features.length - 3}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
        <Notice tone="info" icon={Info}>
          O clube começa em teste. Clube cadastrado por aqui não recebe faturas automáticas da ANNETEC: elas só existem para
          quem contrata pelo site.
        </Notice>
      </FieldGrid>
    )
  }

  const renderOwnerStep = () => (
    <FieldGrid>
      <TextField
        {...wizard.field('ownerName')}
        label="Nome do responsável"
        required
        span={6}
        autoComplete="off"
        maxLength={120}
        placeholder="Nome e sobrenome"
      />
      <TextField
        {...wizard.field('ownerEmail')}
        label="E-mail do responsável"
        required
        span={6}
        type="email"
        inputMode="email"
        autoComplete="off"
        placeholder="responsavel@clube.com.br"
        hint="É o login do painel do clube."
      />
      <Notice tone="neutral" icon={ShieldCheck}>
        Criamos o acesso ao painel com uma senha provisória. Ela aparece uma única vez, na tela final — tenha um canal seguro
        para enviar a {values.ownerName.trim().split(/\s+/)[0] || 'essa pessoa'}.
      </Notice>
    </FieldGrid>
  )

  const renderReview = () => {
    const address = [
      `${values.street.trim()}, ${values.number.trim()}`,
      values.complement.trim(),
      values.neighborhood.trim(),
      `${values.city.trim()} – ${values.state}`,
      formatCep(values.cep),
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <ReviewList>
        <ReviewSection title="Clube" icon={Building2} onEdit={() => wizard.goToStep('clube')}>
          <ReviewItem label="Nome do clube" value={values.name.trim()} />
          <ReviewItem label="Endereço do site" value={<span className="font-mono">{site}</span>} />
          <ReviewItem label="CNPJ" value={maskCnpj(values.document)} />
          <ReviewItem label="Razão social" value={values.legalName.trim()} />
        </ReviewSection>
        <ReviewSection title="Contato e endereço" icon={MapPin} onEdit={() => wizard.goToStep('contato')}>
          <ReviewItem label="E-mail" value={values.email.trim()} />
          <ReviewItem label="Telefone" value={formatPhone(values.phone)} />
          <ReviewItem label="Endereço" value={address} wide />
        </ReviewSection>
        <ReviewSection title="Aparência" icon={Palette} onEdit={() => wizard.goToStep('aparencia')}>
          <ReviewItem label="Cor principal" value={<ColorSwatch color={colorOr(values.primaryColor, DEFAULT_PRIMARY_COLOR)} />} />
          <ReviewItem label="Cor secundária" value={<ColorSwatch color={colorOr(values.secondaryColor, DEFAULT_SECONDARY_COLOR)} />} />
          <ReviewItem
            label="Logo"
            wide
            value={values.logoUrl.trim() ? <span className="break-all">{values.logoUrl.trim()}</span> : null}
            empty="Sem logo — o site mostra o nome do clube"
          />
        </ReviewSection>
        <ReviewSection title="Plano" icon={Tags} onEdit={() => wizard.goToStep('plano')}>
          <ReviewItem label="Plano" value={selectedPlan?.name} />
          <ReviewItem
            label="Mensalidade"
            value={selectedPlan ? `${formatBRL(selectedPlan.priceMonthly)} · até ${formatNumber(selectedPlan.memberLimit)} vidas` : null}
          />
          <ReviewItem label="Situação inicial" value="Em teste" />
        </ReviewSection>
        <ReviewSection title="Responsável" icon={UserRound} onEdit={() => wizard.goToStep('responsavel')}>
          <ReviewItem label="Nome" value={values.ownerName.trim()} />
          <ReviewItem label="E-mail (login)" value={values.ownerEmail.trim().toLowerCase()} />
        </ReviewSection>
      </ReviewList>
    )
  }

  // Qualquer saída (X, "Descartar", "Fechar" do sucesso) tira a senha provisória da memória.
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setCreated(null)
      filledFor.current = ''
      autofill.current = {}
    }
  }

  // "Cadastrar outro": a senha do clube anterior some e o estado local recomeça como ao abrir.
  const startAnother = () => {
    setCreated(null)
    setSlugEdited(false)
    setLogoFailed(false)
    setReceitaFilled([])
    filledFor.current = ''
    autofill.current = {}
    wizard.reset()
  }

  const renderSuccess = () =>
    created ? (
      <WizardSuccess
        title="Clube cadastrado"
        description={`${created.name} foi cadastrado e começa em teste. O acesso de ${created.ownerName} ao painel já está criado.`}
        actions={
          <>
            <Button type="button" variant="outline" className={successButton.secondary} onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
            <Button type="button" variant="outline" className={successButton.secondary} onClick={startAnother}>
              <Plus aria-hidden="true" />
              Cadastrar outro
            </Button>
            <Button
              type="button"
              className={successButton.primary}
              onClick={() => {
                // Só navega: a troca de tela desmonta o modal. Fechar antes faria a rota
                // /admin/inquilinos/novo voltar para a lista no meio da navegação.
                router.push(`/admin/inquilinos/${created.id}`)
              }}
            >
              Abrir clube
            </Button>
          </>
        }
      >
        <SecretValue
          label={`Senha provisória de ${created.ownerName}`}
          value={created.ownerPassword}
          caption={
            <>
              <strong className="font-semibold text-[#93370D]">Guarde esta senha: ela só aparece agora.</strong> Envie para{' '}
              {created.ownerName} por um canal seguro. O login é {created.ownerEmail}.
            </>
          }
        />
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      icon={Building2}
      title="Cadastrar clube"
      description="Cinco passos rápidos. No fim, você recebe a senha provisória do responsável."
      submitLabel="Cadastrar clube"
      submittingLabel="Cadastrando…"
      lockSuccess
      renderStep={id => {
        if (id === 'clube') return renderClubStep()
        if (id === 'contato') return renderContactStep()
        if (id === 'aparencia') return renderBrandStep()
        if (id === 'plano') return renderPlanStep()
        return renderOwnerStep()
      }}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}

/**
 * Botão "Cadastrar clube" que abre o assistente ali mesmo (lista de clubes,
 * Início). A rota /admin/inquilinos/novo continua existindo para links.
 */
export function ClubWizardButton({
  className,
  onCreated,
  children,
}: {
  className?: string
  onCreated?: (club: { id: string; name: string }) => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className={cn('min-h-11 rounded-[10px] px-4 text-sm font-semibold', className)}>
        {children ?? (
          <>
            <Plus aria-hidden="true" />
            Cadastrar clube
          </>
        )}
      </Button>
      <ClubWizard open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  )
}

