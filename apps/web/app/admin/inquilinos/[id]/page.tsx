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
import { useTenants } from '@/contexts/tenants-context'
import type { Tenant, TenantStatus } from '@/lib/types'
import type { UF } from '@annetec/contracts'
import { AlertCircle, ArrowLeft, ExternalLink, Save } from 'lucide-react'

const statusLabel: Record<TenantStatus, string> = {
  trial: 'Trial',
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
}

export default function InquilinoDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { tenants, plans, updateTenant, isLoading } = useTenants()
  const [tenant, setTenant] = useState<Tenant | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTenant(tenants.find(t => t.id === params.id))
  }, [tenants, params.id])

  if (isLoading) return null

  if (!tenant) {
    return (
      <div className="space-y-4">
        <Link href="/admin/inquilinos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <p className="text-muted-foreground">Inquilino não encontrado.</p>
      </div>
    )
  }

  const handleSave = async () => {
    setError('')
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
    if (!result.success) setError(result.error || 'Não foi possível salvar as alterações')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/inquilinos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar para inquilinos
          </Link>
          <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
          <Link href={`/${tenant.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
            /{tenant.slug}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <Badge>{statusLabel[tenant.status]}</Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle>Dados Principais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome Fantasia</Label>
            <Input value={tenant.name} onChange={e => setTenant({ ...tenant, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Razão Social</Label>
            <Input value={tenant.legalName} onChange={e => setTenant({ ...tenant, legalName: e.target.value })} />
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

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle>Endereço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>CEP</Label>
            <Input value={tenant.address.cep} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, cep: e.target.value } })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Endereço</Label>
            <Input value={tenant.address.street} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, street: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>Número</Label>
            <Input value={tenant.address.number} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, number: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>Bairro</Label>
            <Input value={tenant.address.neighborhood} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, neighborhood: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>Cidade</Label>
            <Input value={tenant.address.city} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, city: e.target.value } })} />
          </div>
          <div className="space-y-2">
            <Label>Estado (UF)</Label>
            <Input value={tenant.address.state} maxLength={2} onChange={e => setTenant({ ...tenant, address: { ...tenant.address, state: e.target.value } })} />
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle>Marca</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Cor Primária</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tenant.branding.primaryColor}
                onChange={e => setTenant({ ...tenant, branding: { ...tenant.branding, primaryColor: e.target.value } })}
                className="h-10 w-14 rounded border border-input"
              />
              <Input
                value={tenant.branding.primaryColor}
                onChange={e => setTenant({ ...tenant, branding: { ...tenant.branding, primaryColor: e.target.value } })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor Secundária</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tenant.branding.secondaryColor}
                onChange={e => setTenant({ ...tenant, branding: { ...tenant.branding, secondaryColor: e.target.value } })}
                className="h-10 w-14 rounded border border-input"
              />
              <Input
                value={tenant.branding.secondaryColor}
                onChange={e => setTenant({ ...tenant, branding: { ...tenant.branding, secondaryColor: e.target.value } })}
              />
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>URL do Logo</Label>
            <Input
              value={tenant.branding.logoUrl ?? ''}
              onChange={e => setTenant({ ...tenant, branding: { ...tenant.branding, logoUrl: e.target.value } })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border border-red-200 shadow-xs bg-card">
        <CardHeader>
          <CardTitle className="text-red-600">Zona de Risco</CardTitle>
          <CardDescription>Alterar o status afeta imediatamente o acesso deste inquilino</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={tenant.status} onValueChange={v => setTenant({ ...tenant, status: v as TenantStatus })}>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/admin/inquilinos')}>
          Voltar
        </Button>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>
    </div>
  )
}
