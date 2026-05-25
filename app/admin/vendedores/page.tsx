'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getAllSellers } from '@/lib/mock-data'
import type { Seller } from '@/lib/types'
import {
  Search,
  Plus,
  MoreHorizontal,
  Mail,
  Phone,
  MapPin,
  TrendingUp,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function VendedoresPage() {
  const [search, setSearch] = useState('')
  const sellers = getAllSellers()

  const filteredSellers = sellers.filter(seller =>
    seller.name.toLowerCase().includes(search.toLowerCase()) ||
    seller.email.toLowerCase().includes(search.toLowerCase()) ||
    seller.region.toLowerCase().includes(search.toLowerCase())
  )

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getPerformance = (seller: Seller) => {
    const percentage = (seller.totalSales / seller.salesGoal) * 100
    if (percentage >= 100) return { label: 'Excelente', color: 'bg-green-100 text-green-700' }
    if (percentage >= 75) return { label: 'Bom', color: 'bg-blue-100 text-blue-700' }
    if (percentage >= 50) return { label: 'Regular', color: 'bg-yellow-100 text-yellow-700' }
    return { label: 'Baixo', color: 'bg-red-100 text-red-700' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
          <p className="text-muted-foreground">Gerencie a equipe de vendas</p>
        </div>
        <Button className="bg-[#e84364] hover:bg-[#d42d50] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Novo Vendedor
        </Button>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou região..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sellers Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredSellers.map(seller => {
          const performance = getPerformance(seller)
          const progressPercent = Math.min((seller.totalSales / seller.salesGoal) * 100, 100)
          
          return (
            <Card key={seller.id} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 bg-[#26365f]">
                    <AvatarFallback className="bg-[#26365f] text-white text-lg">
                      {getInitials(seller.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground">{seller.name}</h3>
                        <Badge className={performance.color}>{performance.label}</Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          <DropdownMenuItem>Ver Clientes</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Desativar</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {seller.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {seller.phone}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {seller.region}
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1 text-sm">
                        <span className="text-muted-foreground">Meta do Mês</span>
                        <span className="font-medium">
                          R$ {seller.totalSales.toLocaleString('pt-BR')} / R$ {seller.salesGoal.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#26365f] rounded-full transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>Comissão: {(seller.commissionRate * 100).toFixed(0)}%</span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-green-500" />
                          {progressPercent.toFixed(0)}% da meta
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredSellers.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum vendedor encontrado</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
