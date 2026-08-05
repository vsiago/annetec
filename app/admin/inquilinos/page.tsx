'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useTenants } from '@/contexts/tenants-context'
import { Search, Plus, ExternalLink } from 'lucide-react'

const statusLabel: Record<string, { label: string; color: string }> = {
  trial: { label: 'Trial', color: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'Suspenso', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700' },
}

export default function InquilinosPage() {
  const { tenants, plans, isLoading } = useTenants()
  const [search, setSearch] = useState('')

  const filtered = tenants.filter(
    t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inquilinos</h1>
          <p className="text-muted-foreground">Clubes de benefícios cadastrados na plataforma</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" asChild>
          <Link href="/admin/inquilinos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Inquilino
          </Link>
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, slug ou e-mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Inquilino</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Endereço</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tenant => (
                  <tr key={tenant.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: tenant.branding.primaryColor }}
                        >
                          {tenant.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <Link
                        href={`/${tenant.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-mono text-secondary hover:underline"
                      >
                        /{tenant.slug}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="py-4 px-6 text-sm">{plans.find(p => p.id === tenant.planId)?.name ?? '-'}</td>
                    <td className="py-4 px-6">
                      <Badge className={statusLabel[tenant.status]?.color}>{statusLabel[tenant.status]?.label}</Badge>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/inquilinos/${tenant.id}`}>Gerenciar</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-12">Nenhum inquilino encontrado</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
