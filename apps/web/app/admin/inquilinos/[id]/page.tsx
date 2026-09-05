'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTenants } from '@/contexts/tenants-context'
import { IntegrationPanel } from '@/components/admin-platform/integration-panel'
import { TenantAccessPanel } from '@/components/admin-platform/tenant-access-panel'
import { TenantShortcuts } from '@/components/admin-platform/tenant-shortcuts'
import type { Tenant, TenantStatus } from '@/lib/types'
import type { UF } from '@annetec/contracts'
import { AlertCircle, ArrowLeft, ExternalLink, Save } from 'lucide-react'

/**
 * Gestão de um inquilino.
 *
 * Dividida em abas porque as cinco coisas que se faz aqui têm ritmos e formas
 * de salvar diferentes: cadastro e marca são um formulário com um botão só;
 * acessos e integração salvam sozinhos, item a item. Misturar tudo numa
 * rolagem única fazia o botão "Salvar" parecer valer para a página inteira,
 * quando ele nunca valeu.
 */
const statusLabel: Record<TenantStatus, string> = {
  trial: 'Trial',
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
}

const statusVariante: Record<TenantStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  trial: 'outline',
  active: 'default',
  suspended: 'destructive',
  cancelled: 'destructive',
}

/** Abas em que o botão "Salvar alterações" tem o que salvar. */
const ABAS_DO_FORMULARIO = ['cadastro', 'marca']

export default function InquilinoDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { tenants, plans, updateTenant, isLoading } = useTenants()
  const [tenant, setTenant] = useState<Tenant | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [aba, setAba] = useState('visao-geral')

  useEffect(() => {
    setTenant(tenants.find(t => t.id === params.id))
  }, [tenants, params.id])

  if (isLoading) return null

  if (!tenant) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/inquilinos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <p className="text-muted-foreground">Inquilino não encontrado.</p>
      </div>
    )
  }

  const plano = plans.find(p => p.id === tenant.planId)

  const handleSave = async () => {
    setError('')
    setSalvo(false)
    setIsSaving(true)
    const result = await updateTenant(tenant.id, {
      name: tenant.name,
      legalName: tenant.legalName,
      document: tenant.document,
      email: tenant.email,
      phone: tenant.phone,
      address: { ...tenant.address, state: tenant.address.state as UF },
      branding: tenant.branding,
      planId: tenant.planId,
      status: tenant.status,
    })
    setIsSaving(false)
    if (!result.success) {
      setError(result.error || 'Não foi possível salvar as alterações')
      return
    }
    setSalvo(true)
    setTimeout(() => setSalvo(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/inquilinos"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para inquilinos
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/${tenant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-secondary hover:underline"
            >
              /{tenant.slug}
              <ExternalLink className="h-3 w-3" />
            </a>
            {plano && <span className="text-sm text-muted-foreground">Plano {plano.name}</span>}
          </div>
        </div>
        <Badge variant={statusVariante[tenant.status]}>{statusLabel[tenant.status]}</Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={aba} onValueChange={setAba} className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="marca">Marca</TabsTrigger>
          <TabsTrigger value="acessos">Acessos</TabsTrigger>
          <TabsTrigger value="integracao">Integração</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ visão geral */}
        <TabsContent value="visao-geral" className="space-y-4">
          <TenantShortcuts slug={tenant.slug} />
        </TabsContent>

        {/* ---------------------------------------------------- cadastro */}
        <TabsContent value="cadastro" className="space-y-6">
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader>
              <CardTitle>Dados principais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome fantasia</Label>
                <Input value={tenant.name} onChange={e => setTenant({ ...tenant, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Razão social</Label>
                <Input
                  value={tenant.legalName}
                  onChange={e => setTenant({ ...tenant, legalName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={tenant.document} onChange={e => setTenant({ ...tenant, document: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={tenant.email} onChange={e => setTenant({ ...tenant, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={tenant.phone} onChange={e => setTenant({ ...tenant, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select value={tenant.planId} onValueChange={v => setTenant({ ...tenant, planId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — R$ {plan.priceMonthly.toLocaleString('pt-BR')}/mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader>
              <CardTitle>Endereço</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input
                  value={tenant.address.cep}
                  onChange={e => setTenant({ ...tenant, address: { ...tenant.address, cep: e.target.value } })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={tenant.address.street}
                  onChange={e => setTenant({ ...tenant, address: { ...tenant.address, street: e.target.value } })}
                />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input
                  value={tenant.address.number}
                  onChange={e => setTenant({ ...tenant, address: { ...tenant.address, number: e.target.value } })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input
                  value={tenant.address.neighborhood}
                  onChange={e =>
                    setTenant({ ...tenant, address: { ...tenant.address, neighborhood: e.target.value } })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={tenant.address.city}
                  onChange={e => setTenant({ ...tenant, address: { ...tenant.address, city: e.target.value } })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado (UF)</Label>
                <Input
                  value={tenant.address.state}
                  maxLength={2}
                  onChange={e => setTenant({ ...tenant, address: { ...tenant.address, state: e.target.value } })}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-red-200 bg-card shadow-xs">
            <CardHeader>
              <CardTitle className="text-red-600">Zona de risco</CardTitle>
              <CardDescription>
                Suspender ou cancelar corta o acesso deste inquilino assim que for salvo. Cancelamento
                é lógico — nada é apagado, o histórico continua acessível.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Select
                value={tenant.status}
                onValueChange={v => setTenant({ ...tenant, status: v as TenantStatus })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Salve as alterações para aplicar o novo status.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------------------------------- marca */}
        <TabsContent value="marca">
          <Card className="border border-border/80 bg-card shadow-xs">
            <CardHeader>
              <CardTitle>Marca</CardTitle>
              <CardDescription>
                Pinta o site do clube, a tela de login e os portais deste inquilino.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cor primária</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Cor primária"
                    value={tenant.branding.primaryColor}
                    onChange={e =>
                      setTenant({ ...tenant, branding: { ...tenant.branding, primaryColor: e.target.value } })
                    }
                    className="h-10 w-14 rounded border border-input"
                  />
                  <Input
                    value={tenant.branding.primaryColor}
                    onChange={e =>
                      setTenant({ ...tenant, branding: { ...tenant.branding, primaryColor: e.target.value } })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor secundária</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Cor secundária"
                    value={tenant.branding.secondaryColor}
                    onChange={e =>
                      setTenant({ ...tenant, branding: { ...tenant.branding, secondaryColor: e.target.value } })
                    }
                    className="h-10 w-14 rounded border border-input"
                  />
                  <Input
                    value={tenant.branding.secondaryColor}
                    onChange={e =>
                      setTenant({ ...tenant, branding: { ...tenant.branding, secondaryColor: e.target.value } })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>URL do logo</Label>
                <Input
                  value={tenant.branding.logoUrl ?? ''}
                  onChange={e =>
                    setTenant({ ...tenant, branding: { ...tenant.branding, logoUrl: e.target.value } })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------ acessos */}
        <TabsContent value="acessos">
          <TenantAccessPanel tenantId={tenant.id} />
        </TabsContent>

        {/* --------------------------------------------------- integração */}
        <TabsContent value="integracao">
          <IntegrationPanel tenantId={tenant.id} />
        </TabsContent>
      </Tabs>

      {/*
        A barra de salvar só aparece nas abas que editam o cadastro do
        inquilino. Acessos e Integração salvam por conta própria.
      */}
      {ABAS_DO_FORMULARIO.includes(aba) && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {salvo && <span className="mr-auto text-sm text-emerald-700">Alterações salvas.</span>}
          <Button variant="outline" onClick={() => router.push('/admin/inquilinos')}>
            Voltar
          </Button>
          <Button
            className="bg-primary text-white hover:opacity-90"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </div>
      )}
    </div>
  )
}
