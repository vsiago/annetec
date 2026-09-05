'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTenants } from '@/contexts/tenants-context'
import {
  createTenantPlanAction,
  deleteTenantPlanAction,
  updateTenantPlanAction,
} from '@/lib/actions/tenants-api'
import { Plus, Wallet, Pencil, Trash2 } from 'lucide-react'

export default function PlatformConfiguracoesPage() {
  const { plans, refresh } = useTenants()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [priceMonthly, setPriceMonthly] = useState('')
  const [memberLimit, setMemberLimit] = useState('')
  const [featuresText, setFeaturesText] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  /** `null` = criando; com id = editando aquele plano. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [listError, setListError] = useState('')

  const abrirNovo = () => {
    setEditingId(null)
    setName('')
    setPriceMonthly('')
    setMemberLimit('')
    setFeaturesText('')
    setError('')
    setIsAddOpen(true)
  }

  const abrirEdicao = (plan: (typeof plans)[number]) => {
    setEditingId(plan.id)
    setName(plan.name)
    setPriceMonthly(String(plan.priceMonthly))
    setMemberLimit(String(plan.memberLimit))
    setFeaturesText(plan.features.join(', '))
    setError('')
    setIsAddOpen(true)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !priceMonthly) return

    const payload = {
      name,
      priceMonthly: Number(priceMonthly),
      memberLimit: Number(memberLimit) || 1,
      features: featuresText.split(',').map(f => f.trim()).filter(Boolean),
    }

    setIsSaving(true)
    const result = editingId
      ? await updateTenantPlanAction(editingId, payload)
      : await createTenantPlanAction(payload)
    setIsSaving(false)

    if (!result.success) {
      setError(result.error ?? 'Não foi possível salvar o plano')
      return
    }

    await refresh()
    setIsAddOpen(false)
    setEditingId(null)
    setName('')
    setPriceMonthly('')
    setMemberLimit('')
    setFeaturesText('')
  }

  /**
   * Remover só vale para plano que ninguém contratou — a API recusa com 422 e
   * a contagem de inquilinos em uso, que é o que aparece aqui.
   */
  const handleRemove = async (id: string) => {
    setListError('')
    setRemovingId(id)
    const result = await deleteTenantPlanAction(id)
    setRemovingId(null)
    if (!result.success) {
      setListError(result.error ?? 'Não foi possível remover o plano')
      return
    }
    await refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catálogo de Planos</h1>
          <p className="text-muted-foreground">Planos de assinatura oferecidos aos inquilinos da plataforma</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {listError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {listError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map(plan => (
          <Card key={plan.id} className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-secondary" />
                <CardTitle className="text-lg">{plan.name}</CardTitle>
              </div>
              <CardDescription>Até {plan.memberLimit.toLocaleString('pt-BR')} associados</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary mb-4">
                R$ {plan.priceMonthly.toLocaleString('pt-BR')}<span className="text-sm text-muted-foreground">/mês</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {plan.features.map((f, i) => (
                  <Badge key={i} variant="outline">{f}</Badge>
                ))}
              </div>
              <div className="mt-4 flex gap-2 border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(plan)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRemove(plan.id)}
                  disabled={removingId === plan.id}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {removingId === plan.id ? 'Removendo…' : 'Remover'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar plano' : 'Novo plano'}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? 'Alterar preço ou limite vale para os inquilinos que já usam este plano.'
                  : 'Adicione um novo plano ao catálogo da plataforma'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome *</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Preço mensal (R$) *</label>
                <Input type="number" value={priceMonthly} onChange={e => setPriceMonthly(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Limite de associados</label>
                <Input type="number" value={memberLimit} onChange={e => setMemberLimit(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Recursos (separados por vírgula)</label>
                <Input value={featuresText} onChange={e => setFeaturesText(e.target.value)} placeholder="Ex: Carteirinha digital, Suporte prioritário" />
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-primary hover:opacity-90 text-white"
              >
                {isSaving ? 'Salvando…' : editingId ? 'Salvar plano' : 'Criar plano'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
