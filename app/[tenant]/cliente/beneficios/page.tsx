'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTenantData } from '@/contexts/tenant-data-context'
import {
  Stethoscope,
  Smile,
  Pill,
  Shield,
  Percent,
  Gift,
  MapPin,
  Phone,
  ExternalLink,
  CheckCircle2,
  Heart,
  Baby,
  Users as UsersIcon,
  ShoppingBag,
  Utensils,
  GraduationCap,
  Dumbbell,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/contexts/tenant-context'
import { EmptyState } from '@/components/dashboard/empty-state'

const benefitCategories = [
  { id: 'all', label: 'Todos' },
  { id: 'health', label: 'Saúde' },
  { id: 'dental', label: 'Odontológico' },
  { id: 'pharmacy', label: 'Farmácia' },
  { id: 'discount', label: 'Descontos' },
]

const categoryIcons: Record<string, React.ElementType> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  funeral: Shield,
  discount: Percent,
}

// Icon per partner category, used by the "Club de Vantagens" grid below.
const partnerCategoryIcons: Record<string, React.ElementType> = {
  health: Stethoscope,
  dental: Smile,
  pharmacy: Pill,
  wellness: Dumbbell,
  food: Utensils,
  education: GraduationCap,
  other: ShoppingBag,
}

const healthServices = [
  { name: 'Ginecologia', icon: Heart, description: 'Consultas preventivas para saúde da mulher' },
  { name: 'Pediatria', icon: Baby, description: 'Acompanhamento infantil completo' },
  { name: 'Geriatria', icon: UsersIcon, description: 'Cuidados especializados para idosos 50+' },
]

export default function BeneficiosPage() {
  const { benefits, partners } = useTenantData()
  const { tenant } = useTenant()

  // Top discounts from the tenant's own accredited network.
  const topPartners = [...partners]
    .filter(p => p.status === 'active')
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, 4)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
        <p className="text-muted-foreground">
          Conheça todos os benefícios do seu plano {tenant?.name ?? ''}
        </p>
      </div>

      {/* Highlight Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Teleorientation */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-secondary to-secondary/80 text-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-white/10">
                <Phone className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Teleorientação 24h</h3>
                <p className="text-white/80 text-sm mt-1">
                  Orientação médica gratuita e ilimitada
                </p>
                <p className="font-bold text-xl mt-3">0800 000 0000</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pharmacy */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-primary to-primary/80 text-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-white/10">
                <Pill className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Desconto Farmácia</h3>
                <p className="text-white/80 text-sm mt-1">
                  Em todas as farmácias parceiras
                </p>
                <p className="font-bold text-xl mt-3">Até 60% OFF</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dental */}
        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-600 to-green-500 text-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-white/10">
                <Smile className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Plano Odontológico</h3>
                <p className="text-white/80 text-sm mt-1">
                  Cobertura completa para toda família
                </p>
                <Badge className="mt-3 bg-white/20 text-white border-0">
                  Incluso no plano
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Services */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Consultas Preventivas</CardTitle>
          <CardDescription>Especialidades disponíveis sem custo adicional</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {healthServices.map((service, index) => {
              const Icon = service.icon
              return (
                <div key={index} className="p-4 rounded-lg border border-border hover:border-secondary/30 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-secondary/10">
                      <Icon className="h-5 w-5 text-secondary" />
                    </div>
                    <h4 className="font-medium">{service.name}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* All Benefits */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Todos os Benefícios</CardTitle>
          <CardDescription>Lista completa de benefícios do seu plano</CardDescription>
        </CardHeader>
        <CardContent>
          {benefits.length === 0 && (
            <EmptyState
              icon={Gift}
              title="Nenhum benefício cadastrado"
              description="O clube ainda não publicou os benefícios deste plano."
            />
          )}
          <div className="space-y-4">
            {benefits.map(benefit => {
              const Icon = categoryIcons[benefit.category] || Gift
              return (
                <div key={benefit.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="p-2 rounded-lg bg-secondary/10 flex-shrink-0">
                    <Icon className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium">{benefit.name}</h4>
                      {benefit.discount && (
                        <Badge className="bg-green-100 text-green-700">
                          Até {benefit.discount}% OFF
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{benefit.description}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Club de Vantagens */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Club de Vantagens</CardTitle>
          <CardDescription>Descontos exclusivos em parceiros</CardDescription>
        </CardHeader>
        <CardContent>
          {topPartners.length === 0 ? (
            <EmptyState
              icon={Gift}
              title="Nenhum parceiro credenciado ainda"
              description="Assim que o clube cadastrar estabelecimentos parceiros, os descontos aparecem aqui."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {topPartners.map(partner => {
                const Icon = partnerCategoryIcons[partner.category] ?? ShoppingBag
                return (
                  <div
                    key={partner.id}
                    className="p-4 rounded-lg border border-border text-center hover:border-primary/30 transition-colors"
                  >
                    <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-3">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h4 className="font-medium truncate">{partner.name}</h4>
                    <p className="text-2xl font-bold text-primary mt-1">{partner.discountPercent}%</p>
                    <p className="text-xs text-muted-foreground">de desconto</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funeral Assistance */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Auxílio Funeral</CardTitle>
          <CardDescription>Amparo financeiro em momentos difíceis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="p-3 rounded-lg bg-secondary/10">
              <Shield className="h-8 w-8 text-secondary" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-lg">Reembolso de até R$ 3.000</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Em caso de falecimento do titular ou dependente, sua família receberá um auxílio
                para despesas com funeral, sem burocracia.
              </p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-3xl font-bold text-secondary">R$ 3.000</p>
              <p className="text-sm text-muted-foreground">reembolso máximo</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
