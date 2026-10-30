'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ClipboardList,
  FilePlus2,
  Loader2,
  MapPin,
  Plus,
  Table2,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import {
  UFS,
  formatCep,
  formatCpf,
  formatDateBR,
  formatPhone,
  type Contract,
  type Convenio,
  type HealthPlan,
  type PriceTable,
  type TenantUser,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  FieldSection,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextareaField,
  TextField,
  WizardDialog,
  WizardSuccess,
  maskCep,
  maskCpf,
  maskDigits,
  maskPhone,
  successButton,
  useCepLookup,
  useWizard,
  type FieldBinding,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { safeAction } from '@/components/contratar/hooks'
import { useAdminScope } from '@/contexts/admin-scope-context'
import {
  createOperatorContractAction,
  listOperatorConveniosAction,
  listOperatorPlansAction,
  listOperatorPriceTablesAction,
  listOperatorSellersAction,
} from '@/lib/actions/operator-api'
import { cn } from '@/lib/utils'
import {
  DEPENDENT_FIELDS,
  EMPTY_ENROLLMENT,
  ENROLLMENT_STEP_FIELDS,
  calcularOrcamento,
  emptyDependent,
  explainEnrollmentApiError,
  faixaDePreco,
  faixasDoPlano,
  idadeEm,
  moeda,
  notaTaxaCadastro,
  parseContractPayload,
  validateAddressStep,
  validateDependent,
  validateDependentsStep,
  validateHolderStep,
  validatePlanStep,
  withKind,
  type DependentField,
  type DependentKind,
  type DependentValues,
  type EnrollmentValues,
} from './enrollment-model'

/**
 * "Nova adesão" — contrato direto na Digital Saúde, em 4 etapas + revisão:
 *  1. Plano: convênio, plano (do produto do convênio), vendedor e proposta;
 *  2. Titular;
 *  3. Endereço do titular (CEP preenche pelo ViaCEP);
 *  4. Dependentes (opcional, lista com adicionar/remover).
 * Na revisão, o valor da adesão por faixa etária (tabela de preço do convênio).
 *
 * Mesmas actions da tela antiga (`createOperatorContractAction` e as listas do
 * catálogo), no clube escolhido no seletor do topo (`useAdminScope`).
 */

const UF_OPTIONS = UFS.map(uf => ({ value: uf, label: uf }))

const KIND_OPTIONS = [
  { value: 'dependente', title: 'Dependente', description: 'Cônjuge, filho e outros parentes.' },
  {
    value: 'agregado',
    title: 'Agregado',
    description: 'Já preenche o parentesco com o código 2, o confirmado pela Digital Saúde.',
  },
] as const

type Load = 'idle' | 'loading' | 'ready' | 'error'

interface BaseData {
  status: Load
  convenios: Convenio[]
  sellers: TenantUser[]
  error: string
}

interface CreatedContract {
  code: string
  holderName: string
}

/** Erros por dependente (pelo `uid`), campo a campo. */
type DependentErrors = Record<string, Partial<Record<DependentField, string>>>

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function LoadingNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-xl border border-border bg-accent/60 p-3.5 text-[13px] text-foreground sm:col-span-12"
    >
      <Loader2 className="size-4 shrink-0 animate-spin text-secondary motion-reduce:animate-none" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function retryButton(onClick: () => void) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-10 rounded-[10px] border-[#D0D5DD] px-3 text-[13px] font-semibold text-[#344054]"
    >
      Tentar de novo
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Assistente
// ---------------------------------------------------------------------------

export function NovaAdesaoWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Depois de registrar (ex.: recarregar a lista de clientes). */
  onCreated?: (contract: Contract) => void
}) {
  const router = useRouter()
  const { slug, isLoading: scopeLoading, error: scopeError, current: scope } = useAdminScope()

  const [base, setBase] = useState<BaseData>({ status: 'idle', convenios: [], sellers: [], error: '' })
  const [baseReload, setBaseReload] = useState(0)
  const [plans, setPlans] = useState<{ status: Load; items: HealthPlan[] }>({ status: 'idle', items: [] })
  const [plansReload, setPlansReload] = useState(0)
  // Tabela de preço do convênio — é o que dá o valor de cada vida por faixa
  // etária. `POST /calculo/` (a cotação) está bloqueado para o nosso token, e
  // a lista documentada de preços vem vazia, então a fonte é `tabelaPrecoApiList`.
  const [prices, setPrices] = useState<{ status: Load; tables: PriceTable[] }>({ status: 'idle', tables: [] })
  const [created, setCreated] = useState<CreatedContract | null>(null)

  // Dependentes: o assistente só conhece a chave `dependents`; o "mexeu no
  // campo" e o erro por campo de cada item ficam aqui.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [shownItems, setShownItems] = useState<ReadonlySet<string>>(() => new Set())
  const [apiDependentErrors, setApiDependentErrors] = useState<DependentErrors>({})
  const [listAnnouncement, setListAnnouncement] = useState('')
  const edited = useRef(new Set<string>())
  const uidSeq = useRef(0)
  const pendingFocus = useRef<string | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const steps = useMemo<WizardStep<EnrollmentValues>[]>(
    () => [
      {
        id: 'plano',
        title: 'Plano',
        icon: ClipboardList,
        description: 'Convênio, plano e os dados da proposta assinada.',
        fields: ENROLLMENT_STEP_FIELDS.plano,
        validate: validatePlanStep,
      },
      {
        id: 'titular',
        title: 'Titular',
        icon: UserRound,
        description: 'Quem assina o contrato. Os dados vão como estão para a Digital Saúde.',
        fields: ENROLLMENT_STEP_FIELDS.titular,
        validate: validateHolderStep,
      },
      {
        id: 'endereco',
        title: 'Endereço',
        icon: MapPin,
        description: 'Endereço do titular. Digite o CEP: rua, bairro e município vêm sozinhos.',
        fields: ENROLLMENT_STEP_FIELDS.endereco,
        validate: validateAddressStep,
      },
      {
        id: 'dependentes',
        title: 'Dependentes',
        icon: Users,
        description: 'Opcional. Inclua cônjuge, filhos e agregados que entram no contrato.',
        fields: ENROLLMENT_STEP_FIELDS.dependentes,
        validate: validateDependentsStep,
      },
    ],
    [],
  )

  const wizard = useWizard<EnrollmentValues>({
    steps,
    initialValues: EMPTY_ENROLLMENT,
    onSubmit: async values => {
      if (!slug) {
        return { ok: false, message: 'Escolha um clube no seletor do topo da página antes de registrar a adesão.' }
      }
      const parsed = parseContractPayload(values)
      if (!parsed.ok) return { ok: false, message: 'Confira os campos destacados e tente de novo.' }
      const result = await createOperatorContractAction(slug, parsed.data)
      if (!result.success) {
        const explained = explainEnrollmentApiError(result.error, result.fieldErrors)
        const byUid: DependentErrors = {}
        for (const [index, errors] of Object.entries(explained.dependents)) {
          const dependent = values.dependents[Number(index)]
          if (dependent) byUid[dependent.uid] = errors
        }
        setApiDependentErrors(byUid)
        return { ok: false, message: explained.message, fieldErrors: explained.fieldErrors }
      }
      setCreated({ code: result.data.upstreamCodigo, holderName: result.data.holderName ?? parsed.data.holder.name })
      onCreated?.(result.data)
      return { ok: true }
    },
  })
  const { values, set, setMany } = wizard
  const valuesRef = useRef(values)
  valuesRef.current = values

  const resetLocal = () => {
    setCreated(null)
    setTouched(new Set())
    setShownItems(new Set())
    setApiDependentErrors({})
    setListAnnouncement('')
    edited.current.clear()
    pendingFocus.current = null
  }

  // Ao abrir de novo: o estado local também recomeça (o assistente recomeça sozinho).
  useEffect(() => {
    if (open) resetLocal()
    // `resetLocal` só mexe em estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // --- Dados base: convênios e vendedores do clube (ao abrir) --------------
  useEffect(() => {
    if (!open || !slug) return
    let alive = true
    setBase(current => ({ ...current, status: 'loading', error: '' }))
    void Promise.all([
      safeAction(() => listOperatorConveniosAction(slug)),
      safeAction(() => listOperatorSellersAction(slug)),
    ]).then(([conveniosResult, sellersResult]) => {
      if (!alive) return
      const failed = !conveniosResult.success ? conveniosResult : !sellersResult.success ? sellersResult : null
      setBase({
        status: failed ? 'error' : 'ready',
        convenios: conveniosResult.success ? conveniosResult.data : [],
        sellers: sellersResult.success ? sellersResult.data.filter(seller => seller.active) : [],
        error: failed && !failed.success ? failed.error : '',
      })
    })
    return () => {
      alive = false
    }
  }, [open, slug, baseReload])

  const selectedConvenio = base.convenios.find(convenio => convenio.codigo === values.convenioCodigo) ?? null
  const productCodigo = selectedConvenio?.productCodigo ?? null

  // --- Planos do produto do convênio ----------------------------------------
  useEffect(() => {
    if (!open || !slug || !productCodigo) {
      setPlans({ status: 'idle', items: [] })
      return
    }
    let alive = true
    setPlans({ status: 'loading', items: [] })
    void safeAction(() => listOperatorPlansAction(slug, productCodigo)).then(result => {
      if (!alive) return
      if (!result.success) {
        setPlans({ status: 'error', items: [] })
        return
      }
      setPlans({ status: 'ready', items: result.data })
      const chosen = valuesRef.current.planCodigo
      if (chosen && !result.data.some(plan => plan.codigo === chosen)) setMany({ planCodigo: '' })
    })
    return () => {
      alive = false
    }
  }, [open, slug, productCodigo, plansReload, setMany])

  // --- Tabela de preço do convênio --------------------------------------------
  useEffect(() => {
    if (!open || !slug || !values.convenioCodigo) {
      setPrices({ status: 'idle', tables: [] })
      return
    }
    let alive = true
    setPrices({ status: 'loading', tables: [] })
    void safeAction(() => listOperatorPriceTablesAction(slug, values.convenioCodigo)).then(result => {
      if (!alive) return
      // Como antes: falha na tabela = sem tabela (a tela avisa e não soma nada).
      setPrices({ status: 'ready', tables: result.success ? result.data : [] })
    })
    return () => {
      alive = false
    }
  }, [open, slug, values.convenioCodigo])

  const faixas = useMemo(() => faixasDoPlano(prices.tables, values.planCodigo), [prices.tables, values.planCodigo])
  const orcamento = useMemo(
    () =>
      calcularOrcamento(
        {
          holderName: values.holderName,
          holderBirthDate: values.holderBirthDate,
          dependents: values.dependents,
          signedAt: values.signedAt,
        },
        faixas,
      ),
    [values.holderName, values.holderBirthDate, values.dependents, values.signedAt, faixas],
  )

  // --- CEP ----------------------------------------------------------------------
  const cepState = useCepLookup(values.cep, address => {
    const current = valuesRef.current
    const patch: Partial<EnrollmentValues> = {}
    if (address.street && !current.street.trim()) patch.street = address.street
    if (address.neighborhood && !current.neighborhood.trim()) patch.neighborhood = address.neighborhood
    if (address.city && !current.city.trim()) patch.city = address.city
    if (address.state && !current.state && (UFS as readonly string[]).includes(address.state)) patch.state = address.state
    setMany(patch, { reveal: true })
  })

  // --- Dependentes ---------------------------------------------------------------
  const dependentsKey = wizard.fieldId('dependents')

  const itemErrors = useMemo(() => {
    const out: DependentErrors = {}
    for (const dependent of values.dependents) {
      out[dependent.uid] = { ...validateDependent(dependent), ...apiDependentErrors[dependent.uid] }
    }
    return out
  }, [values.dependents, apiDependentErrors])

  // O primeiro campo com erro recebe o id que o assistente procura para dar
  // foco ao tentar avançar (`wizard.fieldId('dependents')`).
  const focusTarget = useMemo(() => {
    for (const dependent of values.dependents) {
      const errors = itemErrors[dependent.uid] ?? {}
      const field = DEPENDENT_FIELDS.find(key => errors[key])
      if (field) return { uid: dependent.uid, field }
    }
    return null
  }, [values.dependents, itemErrors])

  const inputId = (uid: string, field: DependentField) =>
    focusTarget?.uid === uid && focusTarget.field === field ? dependentsKey : `${dependentsKey}-${uid}-${field}`

  // Tentou avançar (ou a API recusou) com a etapa de dependentes errada: os
  // erros de todos os itens que existem agora aparecem.
  const focusToken = wizard.focusRequest.token
  useEffect(() => {
    if (wizard.focusRequest.target !== 'invalid' || wizard.currentStep?.id !== 'dependentes') return
    setShownItems(new Set(valuesRef.current.dependents.map(dependent => dependent.uid)))
    // Só reage a um novo pedido de foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken])

  // Foco no 1º campo do dependente recém-adicionado.
  useEffect(() => {
    const uid = pendingFocus.current
    if (!uid) return
    pendingFocus.current = null
    const element = document.getElementById(inputId(uid, 'name'))
    if (element) {
      element.focus({ preventScroll: true })
      element.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
    // `inputId` é deste render, junto com a lista nova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.dependents])

  const updateDependent = (uid: string, patch: Partial<DependentValues>) => {
    setMany({
      dependents: valuesRef.current.dependents.map(dependent => (dependent.uid === uid ? { ...dependent, ...patch } : dependent)),
    })
    const fields = Object.keys(patch) as DependentField[]
    setApiDependentErrors(current => {
      const item = current[uid]
      if (!item || !fields.some(field => item[field])) return current
      const nextItem = { ...item }
      for (const field of fields) delete nextItem[field]
      return { ...current, [uid]: nextItem }
    })
  }

  const addDependent = () => {
    uidSeq.current += 1
    const uid = `d${uidSeq.current}`
    const count = valuesRef.current.dependents.length + 1
    setMany({ dependents: [...valuesRef.current.dependents, emptyDependent(uid)] })
    pendingFocus.current = uid
    setListAnnouncement(`Dependente ${count} adicionado.`)
  }

  const removeDependent = (uid: string, index: number) => {
    setMany({ dependents: valuesRef.current.dependents.filter(dependent => dependent.uid !== uid) })
    const prefix = `${uid}:`
    for (const key of [...edited.current]) if (key.startsWith(prefix)) edited.current.delete(key)
    setTouched(current => new Set([...current].filter(key => !key.startsWith(prefix))))
    setShownItems(current => new Set([...current].filter(key => key !== uid)))
    setApiDependentErrors(current => {
      if (!(uid in current)) return current
      const next = { ...current }
      delete next[uid]
      return next
    })
    setListAnnouncement(`Dependente ${index + 1} removido.`)
    window.requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  const bindDependent = (dependent: DependentValues, field: Exclude<DependentField, 'uid' | 'kind'>): FieldBinding<string> => {
    const key = `${dependent.uid}:${field}`
    const error = itemErrors[dependent.uid]?.[field]
    const value = dependent[field]
    const shown = touched.has(key) || shownItems.has(dependent.uid) || !!apiDependentErrors[dependent.uid]?.[field]
    return {
      id: inputId(dependent.uid, field),
      name: `${dependentsKey}-${dependent.uid}-${field}`,
      value,
      onValueChange: next => {
        edited.current.add(key)
        updateDependent(dependent.uid, { [field]: next })
      },
      onBlur: () => {
        const now = valuesRef.current.dependents.find(item => item.uid === dependent.uid)?.[field] ?? ''
        // Passar pelo campo sem mexer não acusa erro (mesma regra do assistente).
        if (edited.current.has(key) || now.trim() !== '') setTouched(current => (current.has(key) ? current : new Set(current).add(key)))
      },
      error: shown ? error : undefined,
      valid: shown && !error && value.trim() !== '',
    }
  }

  const bindKind = (dependent: DependentValues): FieldBinding<string> => ({
    id: inputId(dependent.uid, 'kind'),
    name: `${dependentsKey}-${dependent.uid}-kind`,
    value: dependent.kind,
    onValueChange: next => {
      if (next !== 'dependente' && next !== 'agregado') return
      const changed = withKind(dependent, next as DependentKind)
      updateDependent(dependent.uid, { kind: changed.kind, relationshipId: changed.relationshipId })
      const relationshipKey = `${dependent.uid}:relationshipId`
      // Agregado já vem com o código: mostra o ✓. Voltar para dependente limpa sem acusar erro.
      setTouched(current => {
        const nextSet = new Set(current)
        if (changed.relationshipId) nextSet.add(relationshipKey)
        else nextSet.delete(relationshipKey)
        return nextSet
      })
      if (!changed.relationshipId) edited.current.delete(relationshipKey)
    },
    onBlur: () => undefined,
    error: undefined,
    valid: false,
  })

  // ---------------------------------------------------------------------------
  // Etapas
  // ---------------------------------------------------------------------------

  const today = todayIso()
  const referenceLabel = values.signedAt ? 'na data de assinatura' : 'hoje'
  const referenceDate = (() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(values.signedAt)
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date()
  })()

  const renderScopeNotice = () => {
    if (scopeLoading && !slug) return <LoadingNotice>Carregando o clube selecionado…</LoadingNotice>
    if (!slug) {
      return (
        <Notice tone="warning" icon={TriangleAlert} title="Nenhum clube selecionado" role="alert">
          {scopeError || 'Escolha um clube no seletor do topo da página e abra a adesão de novo.'}
        </Notice>
      )
    }
    if (base.status === 'loading') return <LoadingNotice>Carregando convênios e vendedores do clube…</LoadingNotice>
    if (base.status === 'error') {
      return (
        <Notice
          tone="danger"
          icon={AlertCircle}
          title="Não foi possível carregar convênios e vendedores"
          role="alert"
          action={retryButton(() => setBaseReload(n => n + 1))}
        >
          {base.error}
        </Notice>
      )
    }
    return null
  }

  const renderPriceHint = () => {
    if (!values.convenioCodigo) return null
    if (prices.status === 'loading') return <LoadingNotice>Buscando a tabela de preço no ERP…</LoadingNotice>
    if (prices.status !== 'ready' || !values.planCodigo) return null
    if (faixas.length === 0) {
      return (
        <Notice tone="warning" icon={Table2} title="Sem tabela de preço para este plano">
          Este convênio não tem tabela de preço vigente no ERP para o plano escolhido. Confira em Catálogo Digital Saúde antes
          de fechar a adesão.
        </Notice>
      )
    }
    const range = faixaDePreco(faixas)
    const partial = orcamento.linhas.some(linha => linha.faixa !== null)
    return (
      <Notice tone="info" icon={Wallet}>
        {range ? (
          <>
            Mensalidade por vida neste plano:{' '}
            <strong className="font-semibold">
              {range.min === range.max ? moeda(range.min) : `de ${moeda(range.min)} a ${moeda(range.max)}`}
            </strong>
            , conforme a faixa etária{notaTaxaCadastro(selectedConvenio)}.
          </>
        ) : (
          'A tabela de preço deste plano não traz valores.'
        )}
        {partial ? (
          <>
            {' '}
            Com as vidas preenchidas até agora:{' '}
            <strong className="font-semibold">{moeda(orcamento.total)}/mês</strong>
            {orcamento.completo ? '' : ' (parcial)'}.
          </>
        ) : (
          ' O valor de cada vida aparece na revisão.'
        )}
      </Notice>
    )
  }

  const renderPlanStep = () => {
    const baseReady = base.status === 'ready'
    const noProduct = !!selectedConvenio && !productCodigo
    const hasUnlinkedSeller = base.sellers.some(seller => !seller.upstreamProdutorCodigo)

    let planPlaceholder = 'Escolha o plano'
    if (!values.convenioCodigo) planPlaceholder = 'Escolha o convênio primeiro'
    else if (plans.status === 'loading') planPlaceholder = 'Carregando planos…'

    let planHint: ReactNode = undefined
    if (noProduct) planHint = 'Este convênio não tem produto vinculado no ERP, então não há plano para escolher.'
    else if (plans.status === 'ready' && plans.items.length === 0) planHint = 'Nenhum plano encontrado no ERP para este convênio.'
    else if (plans.status === 'error') {
      planHint = (
        <>
          Não foi possível carregar os planos.{' '}
          <button
            type="button"
            onClick={() => setPlansReload(n => n + 1)}
            className="rounded-md font-semibold text-secondary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
          >
            Tentar de novo
          </button>
        </>
      )
    }

    return (
      <FieldGrid>
        {renderScopeNotice()}
        <SelectField
          {...wizard.field('convenioCodigo')}
          onValueChange={value => {
            if (value === values.convenioCodigo) return
            set('convenioCodigo', value)
            // Plano é do produto do convênio: trocar o convênio desfaz a escolha.
            if (values.planCodigo) setMany({ planCodigo: '' })
          }}
          label="Convênio"
          required
          span={6}
          disabled={!baseReady || base.convenios.length === 0}
          placeholder={base.status === 'loading' ? 'Carregando convênios…' : 'Escolha o convênio'}
          options={base.convenios.map(convenio => ({ value: convenio.codigo, label: convenio.name }))}
          hint={baseReady && base.convenios.length === 0 ? 'Nenhum convênio encontrado no ERP para este clube.' : undefined}
        />
        <SelectField
          {...wizard.field('planCodigo')}
          label="Plano"
          required
          span={6}
          disabled={!values.convenioCodigo || plans.status === 'loading' || plans.items.length === 0}
          placeholder={planPlaceholder}
          options={plans.items.map(plan => ({ value: plan.codigo, label: plan.name }))}
          hint={planHint}
        />
        <div aria-live="polite" className="empty:hidden sm:col-span-12">
          {renderPriceHint()}
        </div>
        <SelectField
          {...wizard.field('sellerId')}
          label="Vendedor"
          required
          span={6}
          disabled={!baseReady || base.sellers.length === 0}
          placeholder={base.status === 'loading' ? 'Carregando vendedores…' : 'Escolha o vendedor'}
          options={base.sellers.map(seller => ({
            value: seller.id,
            label: seller.upstreamProdutorCodigo ? seller.name : `${seller.name} (sem produtor vinculado)`,
            disabled: !seller.upstreamProdutorCodigo,
          }))}
          hint={
            baseReady && base.sellers.length === 0
              ? 'Nenhum vendedor ativo neste clube. Cadastre um em Vendedores.'
              : hasUnlinkedSeller
                ? 'Vendedor sem produtor vinculado na Digital Saúde não pode registrar adesão.'
                : undefined
          }
        />
        <TextField
          {...wizard.field('proposalNumber')}
          label="Número da proposta"
          required
          span={6}
          autoComplete="off"
          hint="Como está na proposta assinada."
        />
        <TextField {...wizard.field('signedAt')} label="Data de assinatura" required span={6} type="date" />
        <TextField
          {...wizard.field('dueDay')}
          label="Dia de vencimento"
          required
          span={6}
          mask={value => maskDigits(value, 2)}
          inputMode="numeric"
          maxLength={2}
          placeholder="10"
          hint="Dia do mês da mensalidade, de 1 a 31."
        />
        <TextareaField {...wizard.field('notes')} label="Observações" optional span={12} rows={3} />
      </FieldGrid>
    )
  }

  const renderHolderStep = () => {
    const holderAge = idadeEm(values.holderBirthDate, referenceDate)
    return (
      <FieldGrid>
        <TextField {...wizard.field('holderName')} label="Nome completo" required span={12} autoComplete="off" />
        <TextField
          {...wizard.field('holderCpf')}
          label="CPF"
          required
          span={6}
          mask={maskCpf}
          inputMode="numeric"
          placeholder="000.000.000-00"
          maxLength={14}
          autoComplete="off"
        />
        <TextField
          {...wizard.field('holderBirthDate')}
          label="Data de nascimento"
          required
          span={6}
          type="date"
          max={today}
          hint={holderAge !== null ? `${holderAge} ${holderAge === 1 ? 'ano' : 'anos'} ${referenceLabel} — é a idade que define a faixa de preço.` : undefined}
        />
        <TextField
          {...wizard.field('holderEmail')}
          label="E-mail"
          required
          span={7}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="nome@exemplo.com.br"
        />
        <TextField
          {...wizard.field('holderPhone')}
          label="Celular com DDD"
          required
          span={5}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          mask={maskPhone}
          placeholder="(21) 99999-8888"
          maxLength={15}
        />
        <TextField {...wizard.field('holderMotherName')} label="Nome da mãe" optional span={12} autoComplete="off" />
        <FieldSection
          title="Códigos da Digital Saúde"
          description="Opcionais. Use os códigos do cadastro da Digital Saúde — confira lá antes de preencher."
        >
          <TextField
            {...wizard.field('holderGenderId')}
            label="Sexo (código)"
            optional
            span={6}
            mask={value => maskDigits(value, 4)}
            inputMode="numeric"
            hint="Confira no cadastro da Digital Saúde."
          />
          <TextField
            {...wizard.field('holderMaritalStatusId')}
            label="Estado civil (código)"
            optional
            span={6}
            mask={value => maskDigits(value, 4)}
            inputMode="numeric"
            hint="Confira no cadastro da Digital Saúde."
          />
        </FieldSection>
      </FieldGrid>
    )
  }

  const renderAddressStep = () => (
    <FieldGrid>
      <TextField
        {...wizard.field('cep')}
        label="CEP"
        required
        span={3}
        mask={maskCep}
        inputMode="numeric"
        autoComplete="off"
        placeholder="00000-000"
        maxLength={9}
        status={
          cepState === 'loading' ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Buscando o CEP" />
          ) : null
        }
        hint={cepState === 'not-found' ? 'CEP não encontrado nos Correios. Preencha o endereço à mão.' : undefined}
      />
      <TextField {...wizard.field('street')} label="Rua" required span={9} autoComplete="off" />
      <TextField {...wizard.field('number')} label="Número" required span={3} placeholder="Ex.: 120" />
      <TextField
        {...wizard.field('complement')}
        label="Complemento"
        optional
        span={4}
        autoComplete="off"
        placeholder="Apto, bloco, casa"
      />
      <TextField {...wizard.field('neighborhood')} label="Bairro" required span={5} autoComplete="off" />
      <TextField {...wizard.field('city')} label="Município" required span={9} autoComplete="off" />
      <SelectField {...wizard.field('state')} label="UF" required span={3} options={UF_OPTIONS} placeholder="UF" />
    </FieldGrid>
  )

  const renderDependentsStep = () => {
    const listError = wizard.field('dependents').error
    const addButton = (label: string) => (
      <Button
        ref={addButtonRef}
        type="button"
        variant="outline"
        onClick={addDependent}
        className="h-11 self-start rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
      >
        <Plus aria-hidden="true" />
        {label}
      </Button>
    )

    return (
      <div className="flex flex-col gap-4">
        <p aria-live="polite" className="sr-only">
          {listAnnouncement}
        </p>
        {listError ? (
          <p id={`${dependentsKey}-erro`} className="m-0 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-[#B42318]">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{listError}</span>
          </p>
        ) : null}

        {values.dependents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#D0D5DD] bg-[#FCFCFD] px-5 py-8 text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-secondary" aria-hidden="true">
              <Users className="size-5" />
            </span>
            <div>
              <p className="m-0 text-sm font-semibold text-foreground">Nenhum dependente adicionado</p>
              <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Se o contrato tiver cônjuge, filhos ou agregados, adicione cada um. Sem dependentes, é só continuar.
              </p>
            </div>
            <div className="flex justify-center">{addButton('Adicionar dependente')}</div>
          </div>
        ) : (
          <>
            <ul aria-label="Dependentes do contrato" className="m-0 flex list-none flex-col gap-4 p-0">
              {values.dependents.map((dependent, index) => {
                const number = index + 1
                return (
                  <li key={dependent.uid}>
                    <fieldset className="m-0 min-w-0 rounded-2xl border border-border bg-white p-4 sm:p-5">
                      <legend className="sr-only">Dependente {number}</legend>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3" aria-hidden="true">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-secondary">
                            {number}
                          </span>
                          <div className="min-w-0">
                            <p className="m-0 text-sm font-semibold text-foreground">Dependente {number}</p>
                            <p className="m-0 truncate text-[13px] text-muted-foreground">
                              {dependent.name.trim() || 'Sem nome ainda'}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeDependent(dependent.uid, index)}
                          aria-label={`Remover dependente ${number}`}
                          className="h-10 shrink-0 rounded-[10px] px-3 text-sm font-semibold text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                        >
                          <Trash2 aria-hidden="true" />
                          <span className="hidden sm:inline" aria-hidden="true">
                            Remover
                          </span>
                        </Button>
                      </div>
                      <FieldGrid>
                        <TextField {...bindDependent(dependent, 'name')} label="Nome completo" required span={12} autoComplete="off" />
                        <TextField
                          {...bindDependent(dependent, 'cpf')}
                          label="CPF"
                          optional
                          span={6}
                          mask={maskCpf}
                          inputMode="numeric"
                          placeholder="000.000.000-00"
                          maxLength={14}
                          autoComplete="off"
                        />
                        <TextField
                          {...bindDependent(dependent, 'birthDate')}
                          label="Data de nascimento"
                          required
                          span={6}
                          type="date"
                          max={today}
                        />
                        <ChoiceField {...bindKind(dependent)} label="Vínculo" required span={12} columns={2} options={KIND_OPTIONS} />
                        <TextField
                          {...bindDependent(dependent, 'relationshipId')}
                          label="Parentesco (código)"
                          required
                          span={6}
                          mask={value => maskDigits(value, 4)}
                          inputMode="numeric"
                          hint={
                            dependent.kind === 'agregado'
                              ? 'Confirmado: 2 = Agregado.'
                              : 'Código não confirmado — verifique com a Digital Saúde.'
                          }
                        />
                        <TextField
                          {...bindDependent(dependent, 'motherName')}
                          label="Nome da mãe"
                          optional
                          span={6}
                          autoComplete="off"
                        />
                      </FieldGrid>
                    </fieldset>
                  </li>
                )
              })}
            </ul>
            {addButton('Adicionar dependente')}
          </>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Revisão
  // ---------------------------------------------------------------------------

  const renderPriceSummary = () => {
    let body: ReactNode
    if (prices.status === 'loading') {
      body = (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Buscando a tabela de preço no ERP…</span>
          {[0, 1, 2].map(i => (
            <span key={i} className="h-9 animate-pulse rounded-lg bg-accent motion-reduce:animate-none" />
          ))}
        </div>
      )
    } else if (!values.convenioCodigo) {
      body = <p className="m-0 text-sm text-muted-foreground">Escolha o convênio para ver os valores.</p>
    } else if (faixas.length === 0) {
      body = (
        <Notice tone="warning" icon={Table2} title="Sem tabela de preço para este plano">
          Este convênio não tem tabela de preço vigente no ERP para o plano escolhido. Confira em Catálogo Digital Saúde antes de
          fechar a adesão.
        </Notice>
      )
    } else {
      const lives = orcamento.linhas.length
      body = (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Valor por vida, pela faixa etária</caption>
              <thead className="bg-[#F9FAFB] text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3.5 py-2.5 font-semibold">
                    Vida
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 font-semibold">
                    Papel
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 font-semibold">
                    Idade
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 font-semibold">
                    Faixa etária
                  </th>
                  <th scope="col" className="px-3.5 py-2.5 text-right font-semibold">
                    Mensalidade
                  </th>
                </tr>
              </thead>
              <tbody>
                {orcamento.linhas.map((linha, index) => (
                  <tr key={`${linha.rotulo}-${index}`} className="border-t border-[#EEF0F3]">
                    <th scope="row" className="px-3.5 py-2.5 text-left font-semibold text-foreground">
                      {linha.rotulo}
                    </th>
                    <td className="px-3.5 py-2.5 text-muted-foreground">{linha.papel}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-foreground">
                      {linha.idade === null ? '—' : `${linha.idade} anos`}
                    </td>
                    <td className={cn('px-3.5 py-2.5', linha.faixa ? 'text-muted-foreground' : 'font-medium text-[#B54708]')}>
                      {linha.faixa?.ageRangeName ??
                        (linha.idade === null ? 'Informe a data de nascimento' : 'Sem faixa para esta idade')}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                      {moeda(linha.faixa?.chargeValue ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-4">
            <span className={cn('flex items-center gap-1.5 text-sm', orcamento.completo ? 'text-muted-foreground' : 'font-medium text-[#B54708]')}>
              {orcamento.completo ? null : <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}
              <span>
                {orcamento.completo ? `${lives} ${lives === 1 ? 'vida' : 'vidas'}` : 'Total parcial — há vida sem faixa definida'}
                {notaTaxaCadastro(selectedConvenio)}
              </span>
            </span>
            <span className="text-2xl font-bold tabular-nums text-secondary">
              {moeda(orcamento.total)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
            </span>
          </div>
        </div>
      )
    }

    return (
      <section aria-labelledby={`${dependentsKey}-valor`} className="overflow-hidden rounded-2xl border border-border bg-white">
        <header className="flex items-center gap-3 border-b border-[#EEF0F3] bg-[#FCFCFD] px-4 py-2.5 sm:px-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-secondary" aria-hidden="true">
            <Wallet className="size-4" />
          </span>
          <div className="min-w-0">
            <h4 id={`${dependentsKey}-valor`} className="m-0 text-sm font-semibold text-foreground">
              Valor da adesão
            </h4>
            <p className="m-0 text-[13px] text-muted-foreground">
              Pela tabela de preço do convênio, por faixa etária na data de assinatura.
            </p>
          </div>
        </header>
        <div className="px-4 py-4 sm:px-5">{body}</div>
      </section>
    )
  }

  const renderReview = () => {
    const selectedPlan = plans.items.find(plan => plan.codigo === values.planCodigo)
    const selectedSeller = base.sellers.find(seller => seller.id === values.sellerId)
    const holderAge = idadeEm(values.holderBirthDate, referenceDate)
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
        <Notice tone="warning" icon={TriangleAlert} role="note" title="Isto grava um contrato real no ERP">
          Depois de registrar não há como desfazer: o contrato e a cobrança passam a existir na Digital Saúde. Confira os dados
          antes.
        </Notice>
        <ReviewSection title="Plano" icon={ClipboardList} onEdit={() => wizard.goToStep('plano')}>
          <ReviewItem label="Convênio" value={selectedConvenio?.name ?? values.convenioCodigo} />
          <ReviewItem label="Plano" value={selectedPlan?.name ?? values.planCodigo} />
          <ReviewItem label="Vendedor" value={selectedSeller?.name} />
          <ReviewItem label="Número da proposta" value={values.proposalNumber.trim()} />
          <ReviewItem label="Data de assinatura" value={formatDateBR(values.signedAt)} />
          <ReviewItem label="Dia de vencimento" value={values.dueDay ? `Todo dia ${Number(values.dueDay)}` : null} />
          <ReviewItem label="Observações" value={values.notes.trim()} wide empty="Sem observações" />
        </ReviewSection>
        <ReviewSection title="Titular" icon={UserRound} onEdit={() => wizard.goToStep('titular')}>
          <ReviewItem label="Nome completo" value={values.holderName.trim()} wide />
          <ReviewItem label="CPF" value={formatCpf(values.holderCpf)} />
          <ReviewItem
            label="Data de nascimento"
            value={
              values.holderBirthDate
                ? `${formatDateBR(values.holderBirthDate)}${holderAge !== null ? ` (${holderAge} ${holderAge === 1 ? 'ano' : 'anos'})` : ''}`
                : null
            }
          />
          <ReviewItem label="E-mail" value={values.holderEmail.trim().toLowerCase()} />
          <ReviewItem label="Celular" value={formatPhone(values.holderPhone)} />
          <ReviewItem label="Nome da mãe" value={values.holderMotherName.trim()} wide />
          <ReviewItem label="Sexo (código)" value={values.holderGenderId} />
          <ReviewItem label="Estado civil (código)" value={values.holderMaritalStatusId} />
        </ReviewSection>
        <ReviewSection title="Endereço" icon={MapPin} onEdit={() => wizard.goToStep('endereco')}>
          <ReviewItem label="Endereço do titular" value={address} wide />
        </ReviewSection>
        <ReviewSection title="Dependentes" icon={Users} onEdit={() => wizard.goToStep('dependentes')}>
          {values.dependents.length === 0 ? (
            <ReviewItem label="Dependentes" value={null} wide empty="Nenhum dependente" />
          ) : (
            values.dependents.map((dependent, index) => {
              const details = [
                dependent.birthDate ? `nascimento ${formatDateBR(dependent.birthDate)}` : null,
                dependent.relationshipId ? `parentesco ${dependent.relationshipId}` : null,
                dependent.cpf.trim() ? `CPF ${formatCpf(dependent.cpf)}` : null,
                dependent.motherName.trim() ? `mãe ${dependent.motherName.trim()}` : null,
              ].filter(Boolean)
              return (
                <ReviewItem
                  key={dependent.uid}
                  label={`Dependente ${index + 1} · ${dependent.kind === 'agregado' ? 'Agregado' : 'Dependente'}`}
                  wide
                  value={
                    <>
                      {dependent.name.trim()}
                      {details.length > 0 ? (
                        <span className="font-normal text-muted-foreground"> · {details.join(' · ')}</span>
                      ) : null}
                    </>
                  }
                />
              )
            })
          )}
        </ReviewSection>
        {renderPriceSummary()}
      </ReviewList>
    )
  }

  const renderSuccess = () =>
    created ? (
      <WizardSuccess
        title="Adesão registrada na Digital Saúde"
        description={`O contrato ${created.code} de ${created.holderName} foi criado no ERP.`}
        actions={
          <>
            <Button type="button" variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button
              type="button"
              variant="outline"
              className={successButton.secondary}
              onClick={() => {
                resetLocal()
                wizard.reset()
              }}
            >
              <Plus aria-hidden="true" />
              Registrar outra
            </Button>
            <Button
              type="button"
              className={successButton.primary}
              onClick={() => {
                // Só navega: a troca de tela desmonta o modal. Fechar antes faria a rota
                // /admin/clientes/nova-adesao voltar para a lista no meio da navegação.
                router.push(`/admin/clientes/${encodeURIComponent(created.code)}`)
              }}
            >
              Abrir contrato
            </Button>
          </>
        }
      />
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      wizard={wizard}
      icon={FilePlus2}
      title="Nova adesão"
      description={
        scope ? (
          <>
            Registra o contrato direto na Digital Saúde, em <strong className="font-semibold text-[#344054]">{scope.name}</strong>.
          </>
        ) : (
          'Registra o contrato direto na Digital Saúde.'
        )
      }
      submitLabel="Registrar adesão"
      submittingLabel="Registrando…"
      discardTitle="Descartar a adesão?"
      renderStep={id => {
        if (id === 'plano') return renderPlanStep()
        if (id === 'titular') return renderHolderStep()
        if (id === 'endereco') return renderAddressStep()
        return renderDependentsStep()
      }}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}

/**
 * Botão "Nova adesão" que abre o assistente ali mesmo (lista de clientes).
 * A rota /admin/clientes/nova-adesao continua existindo para links antigos.
 */
export function NovaAdesaoButton({
  className,
  onCreated,
}: {
  className?: string
  onCreated?: (contract: Contract) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className={cn('h-10', className)}>
        <Plus aria-hidden="true" /> Nova adesão
      </Button>
      <NovaAdesaoWizard open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  )
}
