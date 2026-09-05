'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { useTenants } from '@/contexts/tenants-context'
import { Building2, Users, DollarSign, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

const statusLabel: Record<string, { label: string; color: string }> = {
  trial: { label: 'Trial', color: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  suspended: { label: 'Suspenso', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700' },
}

export default function PlatformDashboard() {
  const { user } = usePlatformAuth()
  const { tenants, plans, isLoading } = useTenants()

  const activeTenants = tenants.filter(t => t.status === 'active')
  const mrr = activeTenants.reduce((sum, t) => {
    const plan = plans.find(p => p.id === t.planId)
    return sum + (plan?.priceMonthly ?? 0)
  }, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Olá, {user?.name?.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Visão geral da plataforma Annetec</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inquilinos</p>
                <p className="text-2xl font-bold mt-1">{tenants.length}</p>
                <p className="text-sm text-muted-foreground mt-1">{activeTenants.length} ativos</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/10">
                <Building2 className="h-5 w-5 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">MRR contratado</p>
                <p className="text-2xl font-bold mt-1">R$ {mrr.toLocaleString('pt-BR')}</p>
                {/*
                  Soma do preço de tabela dos inquilinos ativos. Não é
                  faturamento: a Annetec ainda não emite cobrança dos próprios
                  inquilinos, então nada aqui reflete recebimento.
                */}
                <p className="text-sm text-muted-foreground mt-1">
                  preço de tabela dos ativos — não é faturamento
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Planos Disponíveis</p>
                <p className="text-2xl font-bold mt-1">{plans.length}</p>
                <p className="text-sm text-muted-foreground mt-1">catálogo da plataforma</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Trial</p>
                <p className="text-2xl font-bold mt-1">{tenants.filter(t => t.status === 'trial').length}</p>
                <p className="text-sm text-muted-foreground mt-1">aguardando conversão</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-100">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Inquilinos Recentes</CardTitle>
            <CardDescription>Últimos clubes de benefícios cadastrados na plataforma</CardDescription>
          </div>
          <Link href="/admin/inquilinos" className="text-sm font-medium text-primary hover:underline">
            Ver todos
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Slug</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice(0, 6).map(tenant => (
                  <tr key={tenant.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 text-sm font-medium">{tenant.name}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground font-mono">/{tenant.slug}</td>
                    <td className="py-3 px-4 text-sm">{plans.find(p => p.id === tenant.planId)?.name ?? '-'}</td>
                    <td className="py-3 px-4">
                      <Badge className={statusLabel[tenant.status]?.color}>{statusLabel[tenant.status]?.label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && tenants.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum inquilino cadastrado ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
