'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { mockBenefits } from '@/lib/mock-data'
import type { Client } from '@/lib/types'
import {
  CreditCard,
  Users,
  Gift,
  Phone,
  Calendar,
  CheckCircle2,
  Heart,
  Stethoscope,
  Smile,
  Pill,
  Shield,
  Percent,
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

const benefitIcons: Record<string, React.ElementType> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  funeral: Shield,
  discount: Percent,
}

export default function ClientDashboard() {
  const { user } = useAuth()
  const client = user as Client

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground">
            Bem-vindo ao seu painel Annetec
          </p>
        </div>
        <Button className="bg-[#e5375b] hover:bg-[#d42d50] text-white" asChild>
          <Link href="/cliente/carteirinha">
            <CreditCard className="h-4 w-4 mr-2" />
            Ver Carteirinha
          </Link>
        </Button>
      </div>

      {/* Status Card */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-[#1c3670] to-[#2a4a8f] text-white">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-white/10">
                <Heart className="h-8 w-8" />
              </div>
              <div>
                <p className="text-white/80 text-sm">Seu Plano</p>
                <p className="text-xl font-bold">{client?.plan || 'Annetec'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-green-400">Ativo</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 md:gap-8">
              <div>
                <p className="text-white/60 text-xs">Carteirinha</p>
                <p className="font-mono font-medium">{client?.cardNumber}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Associado desde</p>
                <p className="font-medium">
                  {client?.contractDate ? new Date(client.contractDate).toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-xs">Dependentes</p>
                <p className="font-medium">{client?.dependents?.length || 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" asChild>
          <Link href="/cliente/carteirinha">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-[#1c3670]/10">
                <CreditCard className="h-6 w-6 text-[#1c3670]" />
              </div>
              <div>
                <p className="font-medium">Carteirinha</p>
                <p className="text-sm text-muted-foreground">Acesse sua carteirinha digital</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" asChild>
          <Link href="/cliente/dependentes">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-[#e5375b]/10">
                <Users className="h-6 w-6 text-[#e5375b]" />
              </div>
              <div>
                <p className="font-medium">Dependentes</p>
                <p className="text-sm text-muted-foreground">{client?.dependents?.length || 0} cadastrados</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" asChild>
          <Link href="/cliente/beneficios">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100">
                <Gift className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Benefícios</p>
                <p className="text-sm text-muted-foreground">Veja todos os benefícios</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" asChild>
          <Link href="/cliente/suporte">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-100">
                <Phone className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="font-medium">Teleorientação</p>
                <p className="text-sm text-muted-foreground">24h - Gratuito</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Benefits */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Seus Benefícios</CardTitle>
          <CardDescription>Aproveite todos os benefícios do seu plano</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockBenefits.map(benefit => {
              const Icon = benefitIcons[benefit.category] || Gift
              return (
                <div
                  key={benefit.id}
                  className="p-4 rounded-lg border border-border hover:border-[#1c3670]/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-[#1c3670]/10">
                      <Icon className="h-5 w-5 text-[#1c3670]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{benefit.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {benefit.description}
                      </p>
                      {benefit.discount && (
                        <Badge className="mt-2 bg-green-100 text-green-700">
                          Até {benefit.discount}% OFF
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Teleorientation */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-[#e5375b] to-[#f05a7a] text-white">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-full bg-white/10">
                <Phone className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xl font-bold">Teleorientação em Saúde 24h</p>
                <p className="text-white/80">
                  Orientação médica gratuita e ilimitada para você e sua família
                </p>
              </div>
            </div>
            <div className="text-center md:text-right">
              <p className="text-white/60 text-sm">Ligue agora</p>
              <p className="text-2xl font-bold">0800 000 0000</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
