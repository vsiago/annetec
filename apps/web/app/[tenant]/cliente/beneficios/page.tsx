'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTenantData } from '@/contexts/tenant-data-context'
import {
  Stethoscope,
  Smile,
  Pill,
  Shield,
  Percent,
  Gift,
  CheckCircle2,
  ShoppingBag,
  Utensils,
  GraduationCap,
  Dumbbell,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useTenant } from '@/contexts/tenant-context'
import { EmptyState } from '@/components/dashboard/empty-state'
import { useClubMembership } from '@/components/client/club-membership-provider'
import {
  PlanCoverages,
  PlanCoveragesSkeleton,
  hasPlanCoverages,
  useMembershipPlan,
} from '@/components/client/plan-coverages'

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


export default function BeneficiosPage() {
  const { benefits, partners } = useTenantData()
  const { tenant } = useTenant()
  const tenantSlug = tenant?.slug ?? ''
  const { membership, isLoading: membershipLoading } = useClubMembership()
  const { plan, isLoading: planLoading } = useMembershipPlan(membership, tenantSlug)
  const resolving = membershipLoading || planLoading
  // Assinatura do clube com plano estruturado: as coberturas reais vão para o
  // topo e os destaques ilustrativos saem. Sem isso, a página de sempre.
  const clubPlan = membership && hasPlanCoverages(plan) ? { membership, plan } : null
  const legacy = !resolving && !clubPlan

  // Top discounts from the tenant's own accredited network — o mesmo parceiro
  // em várias cidades aparece uma vez só.
  const seenPartners = new Set<string>()
  const topPartners = [...partners]
    .filter(p => p.status === 'active')
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .filter(p => {
      const key = p.name.trim().toLowerCase()
      if (seenPartners.has(key)) return false
      seenPartners.add(key)
      return true
    })
    .slice(0, 4)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
        <p className="text-muted-foreground">
          {clubPlan
            ? `O que o seu plano ${clubPlan.membership.subscription.planName} inclui e quando cada cobertura libera`
            : `Conheça todos os benefícios do seu plano ${tenant?.name ?? ''}`}
        </p>
      </div>

      {resolving && <PlanCoveragesSkeleton />}
      {clubPlan && <PlanCoverages membership={clubPlan.membership} plan={clubPlan.plan} tenantSlug={tenantSlug} />}

      {/* All Benefits — com plano estruturado, quem diz o que vale são as coberturas acima */}
      {legacy && (
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
      )}

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

    </div>
  )
}
