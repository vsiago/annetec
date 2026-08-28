'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTenants } from '@/contexts/tenants-context'
import { createTenantUser } from '@/lib/actions/tenant-users'
import { AlertCircle, ArrowLeft, Building2 } from 'lucide-react'
import Link from 'next/link'

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function NovoInquilinoPage() {
  const router = useRouter()
  const { plans, createTenant } = useTenants()
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [document, setDocument] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#e84364')
  const [secondaryColor, setSecondaryColor] = useState('#26365f')
  const [logoUrl, setLogoUrl] = useState('')
  const [planId, setPlanId] = useState('')

  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!name || !slug || !email || !planId || !adminName || !adminEmail || !adminPassword) {
      setError('Preencha todos os campos obrigatórios (*)')
      return
    }

    setIsSubmitting(true)

    const tenantResult = await createTenant({
      name,
      legalName: legalName || name,
      slug,
      document,
      email,
      phone,
      address: { cep, street, number, neighborhood, city, state },
      branding: { primaryColor, secondaryColor, logoUrl: logoUrl || undefined },
      planId,
    })

    if (!tenantResult.success || !tenantResult.data) {
      setError(tenantResult.error || 'Não foi possível criar o inquilino')
      setIsSubmitting(false)
      return
    }

    const adminResult = await createTenantUser({
      id: '',
      tenantId: tenantResult.data.id,
      name: adminName,
      email: adminEmail,
      role: 'admin',
      createdAt: new Date(),
      password: adminPassword,
    })

    if (!adminResult.success) {
      setError(adminResult.error || 'Inquilino criado, mas não foi possível criar o administrador')
      setIsSubmitting(false)
      return
    }

    router.push(`/admin/inquilinos/${tenantResult.data.id}`)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/inquilinos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar para inquilinos
        </Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Novo Inquilino
        </h1>
        <p className="text-muted-foreground">Cadastre um novo clube de benefícios na plataforma</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Dados Principais</CardTitle>
            <CardDescription>Identificação do inquilino na plataforma</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome Fantasia *</Label>
              <Input value={name} onChange={e => handleNameChange(e.target.value)} placeholder="Ex: Clínica Vida" required />
            </div>
            <div className="space-y-2">
              <Label>Identificador (slug) *</Label>
              <Input
                value={slug}
                onChange={e => { setSlug(slugify(e.target.value)); setSlugEdited(true) }}
                placeholder="clinica-vida"
                required
              />
              <p className="text-xs text-muted-foreground">Acesso em /{slug || 'slug'}</p>
            </div>
            <div className="space-y-2">
              <Label>Razão Social</Label>
              <Input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Ex: Clínica Vida Ltda." />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={document} onChange={e => setDocument(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <div className="space-y-2">
              <Label>E-mail de contato *</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@clinicavida.com.br" required />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 4000-0000" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input value={cep} onChange={e => setCep(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Endereço</Label>
              <Input value={street} onChange={e => setStreet(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={number} onChange={e => setNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estado (UF)</Label>
              <Input value={state} onChange={e => setState(e.target.value)} maxLength={2} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Marca e Plano</CardTitle>
            <CardDescription>Personalização visual e plano de assinatura</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cor Primária</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-14 rounded border border-input" />
                <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor Secundária</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-10 w-14 rounded border border-input" />
                <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>URL do Logo</Label>
              <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://.../logo.svg" />
              <p className="text-xs text-muted-foreground">Deixe em branco para usar apenas o nome do inquilino</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Plano *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
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

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Administrador Inicial</CardTitle>
            <CardDescription>Primeiro usuário admin deste inquilino</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={adminName} onChange={e => setAdminName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Senha inicial *</Label>
              <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/inquilinos')}>
            Cancelar
          </Button>
          <Button type="submit" className="bg-primary hover:opacity-90 text-white" disabled={isSubmitting}>
            {isSubmitting ? 'Criando...' : 'Criar Inquilino'}
          </Button>
        </div>
      </form>
    </div>
  )
}
