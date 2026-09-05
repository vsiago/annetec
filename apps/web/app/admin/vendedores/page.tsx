'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TenantUser } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import {
  discoverTenantIntegrationAction,
  getTenantIntegrationAction,
} from '@/lib/actions/tenants-api'
import { getInitials } from '@/lib/utils'
import {
  listOperatorSellersAction,
  createOperatorSellerAction,
  linkOperatorSellerProdutorAction,
  createOperatorSellerProdutorAction,
  deactivateOperatorSellerAction,
} from '@/lib/actions/operator-api'
import { Plus, Loader2, UserCog, Link2, CheckCircle2, Mail, Phone, UserX, Receipt } from 'lucide-react'

export default function OperatorVendedoresPage() {
  // De qual inquilino são os dados desta tela — ver AdminScopeProvider.
  const {
    slug: tenantSlug,
    tenantId,
    isLoading: loadingOperator,
    error: operatorError,
  } = useAdminScope()

  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loadingSellers, setLoadingSellers] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState<TenantUser | null>(null)


  const refresh = async (slug: string) => {
    setLoadingSellers(true)
    const result = await listOperatorSellersAction(slug)
    setLoadingSellers(false)
    if (result.success) setSellers(result.data)
  }

  useEffect(() => {
    if (tenantSlug) refresh(tenantSlug)
  }, [tenantSlug])

  const handleDeactivate = async (sellerId: string) => {
    if (!tenantSlug) return
    const result = await deactivateOperatorSellerAction(tenantSlug, sellerId)
    if (result.success) await refresh(tenantSlug)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
          <p className="text-muted-foreground">
            Vendedores do inquilino selecionado acima, vinculados a um produtor na Digital Saúde.
          </p>
        </div>
        {tenantSlug && (
          <AddSellerDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            onCreated={() => refresh(tenantSlug)}
            tenantSlug={tenantSlug}
          />
        )}
      </div>

      {operatorError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{operatorError}</CardContent>
        </Card>
      )}

      {!operatorError && (
        <Card className="border border-border/80 shadow-xs bg-card">
          <CardContent className="p-0">
            {loadingSellers || loadingOperator ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
              </div>
            ) : sellers.length === 0 ? (
              <EmptyStateCard
                icon={UserCog}
                title="Nenhum vendedor cadastrado"
                description='Clique em "Novo vendedor" para começar.'
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Vendedor</th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Produtor (Digital Saúde)</th>
                      <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map(seller => (
                      <tr key={seller.id} className="border-b border-border last:border-0">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9 bg-primary">
                              <AvatarFallback className="bg-primary text-white text-xs font-medium">
                                {getInitials(seller.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">{seller.name}</p>
                              {!seller.active && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inativo</Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="flex items-center gap-1.5 text-sm text-foreground">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {seller.email}
                          </p>
                          {seller.phone && (
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <Phone className="h-3 w-3" /> {seller.phone}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {seller.upstreamProdutorCodigo ? (
                            <Badge variant="secondary" className="font-mono text-xs">
                              {seller.upstreamProdutorCodigo}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Não vinculado</Badge>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-1">
                            {seller.upstreamProdutorCodigo && (
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/admin/vendedores/${seller.id}/comissoes`}>
                                  <Receipt className="h-4 w-4 mr-1.5" />
                                  Comissões
                                </Link>
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setLinkOpen(seller)}>
                              <Link2 className="h-4 w-4 mr-1.5" />
                              {seller.upstreamProdutorCodigo ? 'Trocar' : 'Vincular'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeactivate(seller.id)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {linkOpen && tenantSlug && (
        <LinkProdutorDialog
          tenantId={tenantId}
          seller={linkOpen}
          tenantSlug={tenantSlug}
          onOpenChange={open => !open && setLinkOpen(null)}
          onLinked={() => {
            setLinkOpen(null)
            refresh(tenantSlug)
          }}
        />
      )}
    </div>
  )
}

function AddSellerDialog({
  open,
  onOpenChange,
  onCreated,
  tenantSlug,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  tenantSlug: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !email) {
      setError('Preencha nome e e-mail')
      return
    }
    setSubmitting(true)
    const result = await createOperatorSellerAction(tenantSlug, {
      name,
      email,
      phone: phone || null,
      role: 'seller',
      password: password || undefined,
      active: true,
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setName('')
    setEmail('')
    setPhone('')
    setPassword('')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:opacity-90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Novo vendedor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo vendedor</DialogTitle>
          <DialogDescription>Cria a conta na Annetec. O vínculo com a Digital Saúde é o próximo passo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Telefone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Senha provisória (opcional)</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar vendedor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LinkProdutorDialog({
  seller,
  tenantSlug,
  tenantId,
  onOpenChange,
  onLinked,
}: {
  seller: TenantUser
  tenantSlug: string
  tenantId: string | null
  onOpenChange: (open: boolean) => void
  onLinked: () => void
}) {
  // O grupo de produtor é obrigatório no POST /produtor/ e a Digital Saúde
  // não tem endpoint que o liste — vem da descoberta, que o encontra dentro do
  // cadastro de um produtor existente. Enquanto não vier, o campo aceita
  // digitação, porque um inquilino novo pode não ter produtor nenhum ainda.
  const [gruposProdutor, setGruposProdutor] = useState<{ codigo: string; nome: string }[]>([])
  const [carregandoGrupos, setCarregandoGrupos] = useState(false)

  const [codigo, setCodigo] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [newNome, setNewNome] = useState(seller.name)
  const [newEmail, setNewEmail] = useState(seller.email)
  const [newDocumento, setNewDocumento] = useState('')
  const [grupoProdutorCodigo, setGrupoProdutorCodigo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleLinkExisting = async () => {
    setError('')
    if (!codigo) {
      setError('Informe o código do produtor')
      return
    }
    setSubmitting(true)
    const result = await linkOperatorSellerProdutorAction(tenantSlug, seller.id, {
      codigo,
      login: login || undefined,
      password: password || undefined,
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onLinked()
  }

  useEffect(() => {
    if (!tenantId) return
    setCarregandoGrupos(true)
    getTenantIntegrationAction(tenantId).then(async result => {
      const salvo = result.success ? result.data?.defaultGrupoProdutorCodigo : undefined
      if (salvo) setGrupoProdutorCodigo(atual => atual || salvo)

      const descoberta = await discoverTenantIntegrationAction(tenantId)
      setCarregandoGrupos(false)
      if (!descoberta.success) return
      setGruposProdutor(descoberta.data.gruposProdutor)
      const sugerido = descoberta.data.sugestao.defaultGrupoProdutorCodigo
      if (sugerido) setGrupoProdutorCodigo(atual => atual || sugerido)
    })
  }, [tenantId])

  const handleCreateNew = async () => {
    setError('')
    if (!newNome || !newEmail || !grupoProdutorCodigo) {
      setError('Preencha nome, e-mail e o código do grupo produtor')
      return
    }
    setSubmitting(true)
    const result = await createOperatorSellerProdutorAction(tenantSlug, seller.id, {
      nome: newNome,
      email: newEmail,
      numeroDocumento: newDocumento || undefined,
      grupoProdutorCodigo,
    })
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    onLinked()
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular produtor — {seller.name}</DialogTitle>
          <DialogDescription>
            O contrato só é registrado na Digital Saúde se o vendedor tiver um código de produtor válido.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">Já tenho o código</TabsTrigger>
            <TabsTrigger value="new" className="flex-1">Criar produtor novo</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="grid gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label>Código do produtor</Label>
              <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex: C16KMF9F1R" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Login do produtor</Label>
                <Input value={login} onChange={e => setLogin(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="grid gap-1.5">
                <Label>Senha do produtor</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Login e senha são só necessários para consultar recibos de comissão — sem isso, o vendedor pode
              vender normalmente, mas a tela de Comissões não funciona para ele.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button onClick={handleLinkExisting} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Vincular
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="new" className="grid gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label>Nome do produtor</Label>
              <Input value={newNome} onChange={e => setNewNome(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>CPF/CNPJ (opcional)</Label>
              <Input value={newDocumento} onChange={e => setNewDocumento(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Grupo de produtor *</Label>
              {gruposProdutor.length > 0 ? (
                <Select value={grupoProdutorCodigo} onValueChange={setGrupoProdutorCodigo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {gruposProdutor.map(grupo => (
                      <SelectItem key={grupo.codigo} value={grupo.codigo}>
                        {grupo.nome || grupo.codigo} · {grupo.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    value={grupoProdutorCodigo}
                    onChange={e => setGrupoProdutorCodigo(e.target.value)}
                    placeholder={carregandoGrupos ? 'Procurando no ERP…' : 'Ex: HE83KX6KA2'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {carregandoGrupos
                      ? 'Procurando os grupos disponíveis na Digital Saúde…'
                      : 'Nenhum grupo encontrado no ERP ainda — a descoberta precisa de pelo menos um produtor já cadastrado. Informe o código do painel da Digital Saúde.'}
                  </p>
                </>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button onClick={handleCreateNew} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Criar e vincular
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
