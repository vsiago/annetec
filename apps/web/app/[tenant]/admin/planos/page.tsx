'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTenantData } from '@/contexts/tenant-data-context'
import { Plus, Wallet, Trash2 } from 'lucide-react'

export default function PlanosPage() {
  const { clientPlans, createClientPlan, deleteClientPlan } = useTenantData()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [priceMonthly, setPriceMonthly] = useState('')
  const [description, setDescription] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !priceMonthly) return
    await createClientPlan({ name, priceMonthly: Number(priceMonthly), description })
    setIsAddOpen(false)
    setName('')
    setPriceMonthly('')
    setDescription('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <p className="text-muted-foreground">Planos vendidos aos seus associados</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clientPlans.map(plan => (
          <Card key={plan.id} className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{plan.name}</CardTitle>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => deleteClientPlan(plan.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-secondary mb-2">
                R$ {plan.priceMonthly.toLocaleString('pt-BR')}<span className="text-sm text-muted-foreground">/mês</span>
              </p>
              <CardDescription>{plan.description || 'Sem descrição'}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {clientPlans.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum plano cadastrado ainda</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Novo Plano</DialogTitle>
              <DialogDescription>Adicione um plano ao seu catálogo de vendas</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Individual" required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Preço mensal (R$) *</label>
                <Input type="number" value={priceMonthly} onChange={e => setPriceMonthly(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
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
