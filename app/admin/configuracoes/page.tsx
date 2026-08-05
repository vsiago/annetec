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
import { createPlan } from '@/lib/actions/tenant-plans'
import { Plus, Wallet } from 'lucide-react'

export default function PlatformConfiguracoesPage() {
  const { plans, refresh } = useTenants()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [priceMonthly, setPriceMonthly] = useState('')
  const [memberLimit, setMemberLimit] = useState('')
  const [featuresText, setFeaturesText] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !priceMonthly) return
    await createPlan({
      name,
      priceMonthly: Number(priceMonthly),
      memberLimit: Number(memberLimit) || 0,
      features: featuresText.split(',').map(f => f.trim()).filter(Boolean),
    })
    await refresh()
    setIsAddOpen(false)
    setName('')
    setPriceMonthly('')
    setMemberLimit('')
    setFeaturesText('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catálogo de Planos</h1>
          <p className="text-muted-foreground">Planos de assinatura oferecidos aos inquilinos da plataforma</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano
        </Button>
      </div>

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
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Novo Plano</DialogTitle>
              <DialogDescription>Adicione um novo plano ao catálogo da plataforma</DialogDescription>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                Criar Plano
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
