'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Convenio, HealthPlan, TenantUser, UF } from '@annetec/contracts'
import { UFS } from '@annetec/contracts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  getOperatorAction,
  listOperatorConveniosAction,
  listOperatorPlansAction,
  listOperatorSellersAction,
  createOperatorContractAction,
} from '@/lib/actions/operator-api'
import { ArrowLeft, Loader2, AlertTriangle, Plus, Trash2, CheckCircle2 } from 'lucide-react'

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

export default function NovaAdesaoPage() {
  const router = useRouter()

  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [loadingBase, setLoadingBase] = useState(true)
  const [baseError, setBaseError] = useState('')

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
    getOperatorAction().then(async result => {
      if (!result.success) {
        setBaseError(result.error)
        setLoadingBase(false)
        return
      }
      if (!result.data) {
        setBaseError('A Annetec ainda não está configurada como operadora.')
        setLoadingBase(false)
        return
      }
      const slug = result.data.slug
      setTenantSlug(slug)

      const [conveniosResult, sellersResult] = await Promise.all([
        listOperatorConveniosAction(slug),
        listOperatorSellersAction(slug),
      ])
      if (conveniosResult.success) setConvenios(conveniosResult.data)
      if (sellersResult.success) setSellers(sellersResult.data.filter(s => s.active))
      setLoadingBase(false)
    })
  }, [])

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
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
      </div>
    )
  }

  if (created) {
    return (
      <div className="space-y-4 max-w-lg">
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="py-8 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <div>
              <p className="font-semibold text-foreground">Adesão registrada na Digital Saúde</p>
              <p className="text-sm text-muted-foreground mt-1">
                {created.holderName} · contrato {created.upstreamCodigo}
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={() => router.push('/admin/clientes')}>
                Ver lista de clientes
              </Button>
              <Button onClick={() => router.push(`/admin/clientes/${encodeURIComponent(created.upstreamCodigo)}`)}>
                Abrir contrato
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Clientes
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova adesão</h1>
        <p className="text-muted-foreground">Registra o contrato direto na Digital Saúde.</p>
      </div>

      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="py-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          Isto grava um contrato real no ERP — não existe "desfazer" depois de enviado. Confira os dados antes de
          registrar.
        </CardContent>
      </Card>

      {baseError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{baseError}</CardContent>
        </Card>
      )}

      {!baseError && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border border-border/80 shadow-xs bg-card">
            <CardHeader>
              <CardTitle className="text-base">Plano</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Convênio *</Label>
                <Select value={convenioCodigo} onValueChange={setConvenioCodigo}>
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                  <SelectTrigger>
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
                <Input value={proposalNumber} onChange={e => setProposalNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Data de assinatura *</Label>
                <Input type="date" value={signedAt} onChange={e => setSignedAt(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Dia de vencimento *</Label>
                <Input
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
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-xs bg-card">
            <CardHeader>
              <CardTitle className="text-base">Titular</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Nome completo *</Label>
                <Input value={holderName} onChange={e => setHolderName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>CPF *</Label>
                <Input value={holderCpf} onChange={e => setHolderCpf(e.target.value)} placeholder="Só números" />
              </div>
              <div className="grid gap-1.5">
                <Label>Nascimento *</Label>
                <Input type="date" value={holderBirthDate} onChange={e => setHolderBirthDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>E-mail *</Label>
                <Input type="email" value={holderEmail} onChange={e => setHolderEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Celular (DDD + número) *</Label>
                <Input value={holderPhone} onChange={e => setHolderPhone(e.target.value)} placeholder="21999998888" />
              </div>
              <div className="grid gap-1.5">
                <Label>Nome da mãe</Label>
                <Input value={holderMotherName} onChange={e => setHolderMotherName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Sexo (código, opcional)</Label>
                <Input
                  type="number"
                  value={holderGenderId}
                  onChange={e => setHolderGenderId(e.target.value)}
                  placeholder="Confira no cadastro da Digital Saúde"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Estado civil (código, opcional)</Label>
                <Input
                  type="number"
                  value={holderMaritalStatusId}
                  onChange={e => setHolderMaritalStatusId(e.target.value)}
                  placeholder="Confira no cadastro da Digital Saúde"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-xs bg-card">
            <CardHeader>
              <CardTitle className="text-base">Endereço do titular</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Endereço *</Label>
                <Input value={street} onChange={e => setStreet(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Número *</Label>
                <Input value={number} onChange={e => setNumber(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Complemento</Label>
                <Input value={complement} onChange={e => setComplement(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Bairro *</Label>
                <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Município *</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>UF *</Label>
                <Select value={state} onValueChange={v => setState(v as UF)}>
                  <SelectTrigger>
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
                <Input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="Só números" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80 shadow-xs bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Dependentes</CardTitle>
                <CardDescription>Opcional.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addDependent}>
                <Plus className="h-4 w-4 mr-1.5" /> Adicionar
              </Button>
            </CardHeader>
            {dependents.length > 0 && (
              <CardContent className="space-y-4">
                {dependents.map((dep, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border p-4">
                    <div className="sm:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeDependent(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nome *</Label>
                      <Input value={dep.name} onChange={e => updateDependent(index, { name: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>CPF</Label>
                      <Input value={dep.cpf} onChange={e => updateDependent(index, { cpf: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Nascimento *</Label>
                      <Input
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
                        <SelectTrigger>
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
                        value={dep.motherName}
                        onChange={e => updateDependent(index, { motherName: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar adesão
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
