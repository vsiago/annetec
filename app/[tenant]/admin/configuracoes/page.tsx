'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/dashboard/page-header'
import { useTenant } from '@/contexts/tenant-context'
import { updateTenant } from '@/lib/actions/tenants'
import { AlertCircle, CheckCircle2, Save } from 'lucide-react'

export default function AdminConfiguracoesPage() {
  const { tenant, refresh } = useTenant()
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [name, setName] = useState('')
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

  // Seed the form once the tenant record resolves.
  useEffect(() => {
    if (!tenant) return
    setName(tenant.name)
    setLegalName(tenant.legalName)
    setDocument(tenant.document)
    setEmail(tenant.email)
    setPhone(tenant.phone)
    setCep(tenant.address.cep)
    setStreet(tenant.address.street)
    setNumber(tenant.address.number)
    setNeighborhood(tenant.address.neighborhood)
    setCity(tenant.address.city)
    setState(tenant.address.state)
    setPrimaryColor(tenant.branding.primaryColor)
    setSecondaryColor(tenant.branding.secondaryColor)
    setLogoUrl(tenant.branding.logoUrl ?? '')
  }, [tenant])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant) return
    setIsSaving(true)
    setFeedback(null)

    const result = await updateTenant(tenant.id, {
      name,
      legalName,
      document,
      email,
      phone,
      address: { cep, street, number, neighborhood, city, state },
      branding: { primaryColor, secondaryColor, logoUrl: logoUrl || undefined },
    })

    // Re-reading the tenant re-applies the palette in the layout, so a color
    // change is visible immediately without a page reload.
    if (result.success) {
      await refresh()
      setFeedback({ type: 'success', message: 'Configurações salvas com sucesso.' })
    } else {
      setFeedback({ type: 'error', message: result.error })
    }
    setIsSaving(false)
  }

  if (!tenant) return null

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <PageHeader title="Configurações do Clube" description="Dados cadastrais e identidade visual">
        <Button type="submit" disabled={isSaving} className="bg-primary hover:opacity-90 text-white">
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </PageHeader>

      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          {feedback.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Dados do Clube</CardTitle>
              <CardDescription>Identificação usada nas telas dos associados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Fantasia</Label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Razão Social</Label>
                <Input value={legalName} onChange={e => setLegalName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={document} onChange={e => setDocument(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Endereço de acesso</Label>
                <Input value={`/${tenant.slug}`} disabled />
                <p className="text-xs text-muted-foreground">
                  O identificador só pode ser alterado pela equipe Annetec.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Contato</CardTitle>
              <CardDescription>Exibido aos associados na tela de suporte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>E-mail de suporte</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Telefone / WhatsApp</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Usado no botão &quot;Falar no WhatsApp&quot; do portal do associado.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Identidade Visual</CardTitle>
              <CardDescription>As cores são aplicadas em todo o portal do clube</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cor Primária</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 rounded border border-input"
                    />
                    <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor Secundária</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className="h-10 w-14 rounded border border-input"
                    />
                    <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>URL do Logo</Label>
                <Input
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://.../logo.svg"
                />
                <p className="text-xs text-muted-foreground">
                  Em branco, o portal exibe o nome do clube.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="mb-3 text-sm font-medium">Prévia</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="rounded-md px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Botão primário
                  </span>
                  <span
                    className="rounded-md px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    Botão secundário
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Endereço</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={cep} onChange={e => setCep(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Logradouro</Label>
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
        </div>
      </div>
    </form>
  )
}
