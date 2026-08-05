'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTenantData } from '@/contexts/tenant-data-context'
import type { PartnerCategory } from '@/lib/types'
import { Plus, Search, MoreHorizontal, MapPin, Phone, Percent, Handshake } from 'lucide-react'

const categoryLabels: Record<PartnerCategory, string> = {
  health: 'Saúde',
  dental: 'Odontológico',
  pharmacy: 'Farmácia',
  wellness: 'Bem-estar',
  food: 'Alimentação',
  education: 'Educação',
  other: 'Outro',
}

export default function ParceirosPage() {
  const { partners, createPartner, updatePartner, deletePartner } = useTenantData()
  const [search, setSearch] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<PartnerCategory>('health')
  const [discountPercent, setDiscountPercent] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  const filtered = partners.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    await createPartner({
      name,
      category,
      discountPercent: Number(discountPercent) || 0,
      address,
      phone,
      status: 'active',
    })
    setIsAddOpen(false)
    setName('')
    setCategory('health')
    setDiscountPercent('')
    setAddress('')
    setPhone('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rede de Parceiros</h1>
          <p className="text-muted-foreground">Estabelecimentos credenciados que oferecem desconto aos associados</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Parceiro
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar parceiro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(partner => (
          <Card key={partner.id} className="border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Handshake className="h-5 w-5 text-primary" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => updatePartner(partner.id, { status: partner.status === 'active' ? 'inactive' : 'active' })}
                    >
                      {partner.status === 'active' ? 'Desativar' : 'Ativar'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => deletePartner(partner.id)}>
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h3 className="font-semibold mt-3">{partner.name}</h3>
              <Badge variant="outline" className="mt-1">{categoryLabels[partner.category]}</Badge>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {partner.address || 'Endereço não informado'}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  {partner.phone || '-'}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <span className="flex items-center gap-1 text-primary font-bold text-lg">
                  <Percent className="h-4 w-4" />
                  {partner.discountPercent}%
                </span>
                <Badge className={partner.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                  {partner.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum parceiro cadastrado</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>Novo Parceiro</DialogTitle>
              <DialogDescription>Cadastre um estabelecimento credenciado</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome *</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Categoria</label>
                <Select value={category} onValueChange={v => setCategory(v as PartnerCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Desconto (%)</label>
                <Input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Endereço</label>
                <Input value={address} onChange={e => setAddress(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
