'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useTenantData } from '@/contexts/tenant-data-context'
import type { PartnerCategory } from '@/lib/types'
import { Search, MapPin, Phone, Percent, Handshake } from 'lucide-react'

const categoryLabels: Record<PartnerCategory, string> = {
  health: 'Saúde',
  dental: 'Odontológico',
  pharmacy: 'Farmácia',
  wellness: 'Bem-estar',
  food: 'Alimentação',
  education: 'Educação',
  other: 'Outro',
}

export default function ClienteParceirosPage() {
  const { partners } = useTenantData()
  const [search, setSearch] = useState('')

  const activePartners = partners.filter(
    p => p.status === 'active' && p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rede de Parceiros</h1>
        <p className="text-muted-foreground">Descontos exclusivos nos estabelecimentos credenciados</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar parceiro..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activePartners.map(partner => (
          <Card key={partner.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="p-2 rounded-lg bg-primary/10 w-fit">
                <Handshake className="h-5 w-5 text-primary" />
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
              <div className="mt-4 pt-4 border-t border-border">
                <span className="flex items-center gap-1 text-primary font-bold text-xl">
                  <Percent className="h-4 w-4" />
                  {partner.discountPercent}% de desconto
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activePartners.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum parceiro encontrado</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
