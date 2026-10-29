'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Convenio, HealthPlan, PriceTable, TenantUser, UF } from '@annetec/contracts'
import { UFS } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAdminScope } from '@/contexts/admin-scope-context'
import {
  listOperatorConveniosAction,
  listOperatorPlansAction,
  listOperatorPriceTablesAction,
  listOperatorSellersAction,
  createOperatorContractAction,
} from '@/lib/actions/operator-api'
import {
  Calculator,
  CheckCircle2,
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

interface DependentForm {
  name: string
  cpf: string
  birthDate: string
  relationshipId: string
  kind: 'dependente' | 'agregado'
  motherName: string
  genderId: string
}

function emptyDependent(): DependentForm {
  return { name: '', cpf: '', birthDate: '', relationshipId: '', kind: 'dependente', motherName: '', genderId: '' }
}

/** Idade completa na data de referência — é assim que a faixa etária é lida. */
function idadeEm(nascimento: string, referencia: Date): number | null {
  if (!nascimento) return null
  const data = new Date(nascimento)
  if (Number.isNaN(data.getTime())) return null
  let idade = referencia.getFullYear() - data.getFullYear()
  const aniversarioPassou =
    referencia.getMonth() > data.getMonth() ||
    (referencia.getMonth() === data.getMonth() && referencia.getDate() >= data.getDate())
  if (!aniversarioPassou) idade -= 1
  return idade < 0 ? null : idade
}

function moeda(valor: number | null) {
  if (valor === null) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function NovaAdesaoPage() {
  const router = useRouter()

  const { slug: tenantSlug, error: scopeError } = useAdminScope()
  const [loadingBase, setLoadingBase] = useState(true)
  const [baseError, setBaseError] = useState('')

  // Tabela de preço do convênio — é o que dá o valor de cada vida por faixa
  // etária. Sem isso a adesão era fechada sem ninguém ver quanto custa:
  // `POST /calculo/` (a cotação) está bloqueado para o nosso token, e a lista
  // documentada de preços vem vazia, então a fonte é `tabelaPrecoApiList`.
  const [priceTables, setPriceTables] = useState<PriceTable[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)

  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [convenioCodigo, setConvenioCodigo] = useState('')
  const [plans, setPlans] = useState<HealthPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [planCodigo, setPlanCodigo] = useState('')

  const [sellerId, setSellerId] = useState('')
  const [proposalNumber, setProposalNumber] = useState('')
  const [signedAt, setSignedAt] = useState('')
  const [dueDay, setDueDay] = useState('10')
  const [notes, setNotes] = useState('')

  const [holderName, setHolderName] = useState('')
  const [holderCpf, setHolderCpf] = useState('')
  const [holderBirthDate, setHolderBirthDate] = useState('')
  const [holderEmail, setHolderEmail] = useState('')
  const [holderPhone, setHolderPhone] = useState('')
  const [holderMotherName, setHolderMotherName] = useState('')
  const [holderGenderId, setHolderGenderId] = useState('')
  const [holderMaritalStatusId, setHolderMaritalStatusId] = useState('')

  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState<UF | ''>('')
  const [zipCode, setZipCode] = useState('')

  const [dependents, setDependents] = useState<DependentForm[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ upstreamCodigo: string; holderName: string | null } | null>(null)

  useEffect(() => {
    if (!tenantSlug) {
      setBaseError(scopeError)
      return
    }
    setLoadingBase(true)
    Promise.all([
      listOperatorConveniosAction(tenantSlug),
      listOperatorSellersAction(tenantSlug),
    ]).then(([conveniosResult, sellersResult]) => {
      if (conveniosResult.success) setConvenios(conveniosResult.data)
      else setBaseError(conveniosResult.error)
      if (sellersResult.success) setSellers(sellersResult.data.filter(s => s.active))
      setLoadingBase(false)
    })
  }, [tenantSlug, scopeError])

  const selectedConvenio = useMemo(
    () => convenios.find(c => c.codigo === convenioCodigo) ?? null,
    [convenios, convenioCodigo],
  )

  useEffect(() => {
    if (!tenantSlug || !selectedConvenio?.productCodigo) {
      setPlans([])
      setPlanCodigo('')
      return
    }
    setLoadingPlans(true)
    setPlanCodigo('')
    listOperatorPlansAction(tenantSlug, selectedConvenio.productCodigo).then(result => {
      setLoadingPlans(false)
      if (result.success) setPlans(result.data)
    })
  }, [tenantSlug, selectedConvenio])

  useEffect(() => {
    if (!tenantSlug || !convenioCodigo) {
      setPriceTables([])
      return
    }
    setLoadingPrices(true)
    listOperatorPriceTablesAction(tenantSlug, convenioCodigo).then(result => {
      setLoadingPrices(false)
      setPriceTables(result.success ? result.data : [])
    })
  }, [tenantSlug, convenioCodigo])

  /** Faixas do plano escolhido, ordenadas por idade — o que a tela mostra. */
  const faixas = useMemo(() => {
    const entradas = priceTables
      .flatMap(tabela => tabela.entries)
      .filter(entrada => !planCodigo || entrada.planCodigo === planCodigo)
    return [...entradas].sort((a, b) => (a.ageFrom ?? 0) - (b.ageFrom ?? 0))
  }, [priceTables, planCodigo])

  /**
   * Preço de cada vida pela idade na data de assinatura, e o total. Sem data
   * de nascimento não há faixa: a linha aparece como pendente em vez de somar
   * um valor errado silenciosamente.
   */
  const orcamento = useMemo(() => {
    const referencia = signedAt ? new Date(signedAt) : new Date()

    const vidas = [
      { rotulo: holderName || 'Titular', nascimento: holderBirthDate, papel: 'Titular' },
      ...dependents.map((dep, index) => ({
        rotulo: dep.name || `Dependente ${index + 1}`,
        nascimento: dep.birthDate,
        papel: dep.kind === 'agregado' ? 'Agregado' : 'Dependente',
      })),
    ]

    const linhas = vidas.map(vida => {
      const idade = idadeEm(vida.nascimento, referencia)
      const faixa =
        idade === null
          ? null
          : faixas.find(
              f => idade >= (f.ageFrom ?? 0) && idade <= (f.ageTo ?? 200),
            ) ?? null
      return { ...vida, idade, faixa }
    })

    const total = linhas.reduce((soma, linha) => soma + (linha.faixa?.chargeValue ?? 0), 0)
    const completo = linhas.every(linha => linha.faixa !== null)
    return { linhas, total, completo }
  }, [holderName, holderBirthDate, dependents, faixas, signedAt])

  const addDependent = () => setDependents(current => [...current, emptyDependent()])
  const removeDependent = (index: number) =>
    setDependents(current => current.filter((_, i) => i !== index))
  const updateDependent = (index: number, patch: Partial<DependentForm>) =>
    setDependents(current => current.map((dep, i) => (i === index ? { ...dep, ...patch } : dep)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!tenantSlug) return
    if (!convenioCodigo || !planCodigo || !sellerId || !proposalNumber || !signedAt) {
      setError('Preencha convênio, plano, vendedor, número da proposta e data de assinatura.')
      return
    }
    if (!holderName || !holderCpf || !holderBirthDate || !holderEmail || !holderPhone) {
      setError('Preencha os dados obrigatórios do titular.')
      return
    }
    if (!street || !number || !neighborhood || !city || !state || !zipCode) {
      setError('Preencha o endereço completo do titular.')
      return
    }
    for (const dep of dependents) {
      if (!dep.name || !dep.birthDate || !dep.relationshipId) {
        setError('Preencha nome, nascimento e código de parentesco de todos os dependentes.')
        return
      }
    }

    setSubmitting(true)
    const result = await createOperatorContractAction(tenantSlug, {
      proposalNumber,
      signedAt,
      dueDay: Number(dueDay),
      planCodigo,
      convenioCodigo,
      sellerId,
      notes: notes || undefined,
      holder: {
        name: holderName,
        cpf: holderCpf,
        birthDate: holderBirthDate,
        email: holderEmail,
        phone: holderPhone,
        motherName: holderMotherName || undefined,
        genderId: holderGenderId ? Number(holderGenderId) : undefined,
        maritalStatusId: holderMaritalStatusId ? Number(holderMaritalStatusId) : undefined,
        address: { street, number, complement: complement || undefined, neighborhood, city, state, zipCode },
      },
      dependents: dependents.map(dep => ({
        name: dep.name,
        cpf: dep.cpf || undefined,
        birthDate: dep.birthDate,
        relationshipId: Number(dep.relationshipId),
        kind: dep.kind,
        motherName: dep.motherName || undefined,
        genderId: dep.genderId ? Number(dep.genderId) : undefined,
      })),
    })
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }
    setCreated({ upstreamCodigo: result.data.upstreamCodigo, holderName: result.data.holderName })
  }

  if (loadingBase) {
    return (
      <PageContainer size="form">
        <div>
          <BackLink href="/admin/clientes">Voltar para Clientes</BackLink>
        </div>
        <SectionCard>
          <SectionSkeleton rows={5} label="Carregando…" />
        </SectionCard>
      </PageContainer>
    )
  }

  if (created) {
    return (
      <PageContainer size="form">
        <EmptyState
          framed
          size="lg"
          tone="success"
          icon={CheckCircle2}
          title="Adesão registrada na Digital Saúde"
          description={
            <>
              {created.holderName} · contrato {created.upstreamCodigo}
            </>
          }
          role="status"
          action={
            <>
              <Button variant="outline" className="h-10" onClick={() => router.push('/admin/clientes')}>
                Ver lista de clientes
              </Button>
              <Button
                className="h-10"
                onClick={() => router.push(`/admin/clientes/${encodeURIComponent(created.upstreamCodigo)}`)}
              >
                Abrir contrato
              </Button>
            </>
          }
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer size="form">
      <PageHeader
        breadcrumb={<BackLink href="/admin/clientes">Voltar para Clientes</BackLink>}
        icon={FilePlus2}
        title="Nova adesão"
        description="Registra o contrato direto na Digital Saúde."
      />

      <div
        role="note"
        className="flex items-start gap-3 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-sm leading-relaxed text-[#93370D]"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#B54708]" aria-hidden="true" />
        <p className="m-0">
          Isto grava um contrato real no ERP — não existe "desfazer" depois de enviado. Confira os dados antes de
          registrar.
        </p>
      </div>

      {baseError && <ErrorState description={baseError} />}

      {!baseError && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <SectionCard icon={ClipboardList} title="Plano">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Convênio *</Label>
                <Select value={convenioCodigo} onValueChange={setConvenioCodigo}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Selecione o convênio" />
                  </SelectTrigger>
                  <SelectContent>
                    {convenios.map(c => (
                      <SelectItem key={c.codigo} value={c.codigo}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Plano *</Label>
                <Select value={planCodigo} onValueChange={setPlanCodigo} disabled={!convenioCodigo || loadingPlans}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={loadingPlans ? 'Carregando...' : 'Selecione o plano'} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.codigo} value={p.codigo}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Vendedor *</Label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map(s => (
                      <SelectItem key={s.id} value={s.id} disabled={!s.upstreamProdutorCodigo}>
                        {s.name}
                        {!s.upstreamProdutorCodigo ? ' (sem produtor vinculado)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Número da proposta *</Label>
                <Input className="h-10" value={proposalNumber} onChange={e => setProposalNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Data de assinatura *</Label>
                <Input className="h-10" type="date" value={signedAt} onChange={e => setSignedAt(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Dia de vencimento *</Label>
                <Input
                  className="h-10"
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={e => setDueDay(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Observações</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={UserRound} title="Titular">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Nome completo *</Label>
                <Input className="h-10" value={holderName} onChange={e => setHolderName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>CPF *</Label>
                <Input className="h-10" value={holderCpf} onChange={e => setHolderCpf(e.target.value)} placeholder="Só números" />
              </div>
              <div className="grid gap-1.5">
                <Label>Nascimento *</Label>
                <Input className="h-10" type="date" value={holderBirthDate} onChange={e => setHolderBirthDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>E-mail *</Label>
                <Input className="h-10" type="email" value={holderEmail} onChange={e => setHolderEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Celular (DDD + número) *</Label>
                <Input className="h-10" value={holderPhone} onChange={e => setHolderPhone(e.target.value)} placeholder="21999998888" />
              </div>
              <div className="grid gap-1.5">
                <Label>Nome da mãe</Label>
                <Input className="h-10" value={holderMotherName} onChange={e => setHolderMotherName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Sexo (código, opcional)</Label>
                <Input
                  className="h-10"
                  type="number"
                  value={holderGenderId}
                  onChange={e => setHolderGenderId(e.target.value)}
                  placeholder="Confira no cadastro da Digital Saúde"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Estado civil (código, opcional)</Label>
                <Input
                  className="h-10"
                  type="number"
                  value={holderMaritalStatusId}
                  onChange={e => setHolderMaritalStatusId(e.target.value)}
                  placeholder="Confira no cadastro da Digital Saúde"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={MapPin} title="Endereço do titular">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Endereço *</Label>
                <Input className="h-10" value={street} onChange={e => setStreet(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Número *</Label>
                <Input className="h-10" value={number} onChange={e => setNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Complemento</Label>
                <Input className="h-10" value={complement} onChange={e => setComplement(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Bairro *</Label>
                <Input className="h-10" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Município *</Label>
                <Input className="h-10" value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>UF *</Label>
                <Select value={state} onValueChange={v => setState(v as UF)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UFS.map(uf => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>CEP *</Label>
                <Input className="h-10" value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="Só números" />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Users}
            title="Dependentes"
            description="Opcional."
            actions={
              <Button type="button" variant="outline" className="h-10" onClick={addDependent}>
                <Plus aria-hidden="true" /> Adicionar
              </Button>
            }
          >
            {dependents.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Users}
                title="Nenhum dependente adicionado"
                description="Use “Adicionar” se o contrato tiver dependentes ou agregados."
                className="py-4"
              />
            ) : (
              <div className="flex flex-col gap-4">
                {dependents.map((dep, index) => (
                  <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between sm:col-span-2">
                      <p className="m-0 text-sm font-semibold text-foreground">Dependente {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-[#B42318] hover:text-[#B42318]"
                        aria-label={`Remover dependente ${index + 1}`}
                        onClick={() => removeDependent(index)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nome *</Label>
                      <Input className="h-10" value={dep.name} onChange={e => updateDependent(index, { name: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>CPF</Label>
                      <Input className="h-10" value={dep.cpf} onChange={e => updateDependent(index, { cpf: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nascimento *</Label>
                      <Input
                        className="h-10"
                        type="date"
                        value={dep.birthDate}
                        onChange={e => updateDependent(index, { birthDate: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Vínculo</Label>
                      <Select
                        value={dep.kind}
                        onValueChange={v => {
                          const kind = v as DependentForm['kind']
                          // "Agregado" é o único código de parentesco que confirmamos
                          // com contratos reais (id 2) — pré-preenche pra evitar erro
                          // de digitação. "Dependente" cobre cônjuge/filho/etc, cujos
                          // códigos a Digital Saúde não documenta em lugar nenhum;
                          // fica em aberto pro vendedor confirmar.
                          updateDependent(index, {
                            kind,
                            relationshipId: kind === 'agregado' ? '2' : '',
                          })
                        }}
                      >
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dependente">Dependente (cônjuge, filho...)</SelectItem>
                          <SelectItem value="agregado">Agregado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Parentesco (código) *</Label>
                      <Input
                        className="h-10"
                        type="number"
                        value={dep.relationshipId}
                        onChange={e => updateDependent(index, { relationshipId: e.target.value })}
                        placeholder={
                          dep.kind === 'agregado'
                            ? 'Confirmado: 2 = Agregado'
                            : 'Não confirmado — verifique com a Digital Saúde'
                        }
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nome da mãe</Label>
                      <Input
                        className="h-10"
                        value={dep.motherName}
                        onChange={e => updateDependent(index, { motherName: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/*
            Quanto a adesão vai custar. Antes disto a tela fechava contrato sem
            mostrar valor nenhum — nem mensalidade, nem taxa de cadastro.
          */}
          <SectionCard
            icon={Wallet}
            title="Valor da adesão"
            description="Calculado pela tabela de preço do convênio, por faixa etária na data de assinatura."
          >
            {loadingPrices && <SectionSkeleton rows={3} label="Buscando a tabela de preço no ERP…" />}

            {!loadingPrices && !convenioCodigo && (
              <EmptyState
                size="sm"
                icon={Calculator}
                title="Escolha o convênio para ver os valores"
                className="py-4"
              />
            )}

            {!loadingPrices && convenioCodigo && faixas.length === 0 && (
              <EmptyState
                size="sm"
                tone="warning"
                icon={Table2}
                title="Sem tabela de preço para este plano"
                description="Este convênio não tem tabela de preço vigente no ERP para o plano escolhido. Confira em Catálogo Digital Saúde antes de fechar a adesão."
                className="py-4"
              />
            )}

            {!loadingPrices && faixas.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="overflow-hidden rounded-xl border border-border">
                  <DataTable caption="Valor por vida, pela faixa etária" framed={false} minWidth="min-w-[640px]">
                    <thead>
                      <tr>
                        <Th>Vida</Th>
                        <Th>Papel</Th>
                        <Th>Idade</Th>
                        <Th>Faixa etária</Th>
                        <Th align="right">Mensalidade</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {orcamento.linhas.map((linha, index) => (
                        <Tr key={`${linha.rotulo}-${index}`}>
                          <Td className="font-semibold text-foreground">{linha.rotulo}</Td>
                          <Td className="text-muted-foreground">{linha.papel}</Td>
                          <Td className="tabular-nums text-foreground">
                            {linha.idade === null ? '—' : `${linha.idade} anos`}
                          </Td>
                          <Td className="text-muted-foreground">
                            {linha.faixa?.ageRangeName ?? (linha.idade === null ? 'Informe a data de nascimento' : 'Sem faixa para esta idade')}
                          </Td>
                          <Td align="right" className="font-semibold tabular-nums text-foreground">
                            {moeda(linha.faixa?.chargeValue ?? null)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">
                    {orcamento.completo
                      ? `${orcamento.linhas.length} vida(s)`
                      : 'Total parcial — há vida sem faixa definida'}
                    {selectedConvenio?.registrationFee
                      ? ` · taxa de cadastro ${moeda(selectedConvenio.registrationFee)}${
                          selectedConvenio.registrationFeeKind === 'por_vida' ? ' por vida' : ''
                        }`
                      : ''}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-secondary">
                    {moeda(orcamento.total)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {error && (
            <p role="alert" className="m-0 rounded-xl bg-[#FEF3F2] px-4 py-3 text-sm font-medium text-[#B42318]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="m-0 mr-auto text-sm text-muted-foreground">
              Registrar cria o contrato e a cobrança na Digital Saúde. Não há desfazer.
            </p>
            <Button type="submit" size="lg" className="h-11 px-6" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Registrar adesão
            </Button>
          </div>
        </form>
      )}
    </PageContainer>
  )
}
