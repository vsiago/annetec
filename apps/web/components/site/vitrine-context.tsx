'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import type { Benefit, Partner, PartnerCategory, Tenant } from '@/lib/types'
import { PARTNER_CATEGORY_ORDER } from './categories'
import { siteContentFor, type SiteContent } from './content'
import { formatPhone, normalize, splitCityUf, whatsappHref } from './format'
import { usePublicPlans, type VitrinePlan } from './use-public-plans'

export interface SitePaths {
  home: string
  plans: string
  network: string
  business: string
  about: string
  signup: string
  /** Login do próprio inquilino (`/[tenant]/login`): reconhece sozinho admin, vendedor ou associado. */
  clientArea: string
  checkout: (planId?: string) => string
}

export function buildSitePaths(slug: string): SitePaths {
  const base = `/${slug}`
  return {
    home: base,
    plans: `${base}/planos`,
    network: `${base}/rede`,
    business: `${base}/empresas`,
    about: `${base}/sobre`,
    signup: `${base}/cadastro`,
    clientArea: `${base}/login`,
    checkout: planId => (planId ? `${base}/assinar?plano=${encodeURIComponent(planId)}` : `${base}/assinar`),
  }
}

export interface NetworkStats {
  /** Parceiros distintos (mesmo nome em várias cidades conta uma vez). */
  partnerCount: number
  /** Unidades de atendimento (cada linha da rede). */
  unitCount: number
  cities: string[]
  ufs: string[]
  /** Categorias presentes, na ordem de exibição. */
  categories: PartnerCategory[]
  maxDiscount: number
  avgDiscount: number
}

export interface PartnerGroup {
  key: string
  name: string
  tagline?: string
  category: PartnerCategory
  maxDiscount: number
  cities: string[]
  specialties: string[]
}

interface VitrineValue {
  tenant: Tenant
  paths: SitePaths
  content: SiteContent
  plans: VitrinePlan[]
  plansLoading: boolean
  plansError: string | null
  featuredPlan: VitrinePlan | null
  cheapestPlan: VitrinePlan | null
  partners: Partner[]
  partnerGroups: PartnerGroup[]
  benefits: Benefit[]
  dataLoading: boolean
  stats: NetworkStats
  primaryCta: { href: string; label: string }
  whatsapp: string | null
  whatsappBusiness: string | null
  phoneLabel: string | null
}

const VitrineContext = createContext<VitrineValue | null>(null)

const TELE = /tele\s?(medicina|orienta|consulta|sa[uú]de)/i

/**
 * Tudo o que as seções da vitrine precisam, calculado uma vez por página.
 *
 * Parceiros e benefícios vêm do `TenantDataProvider` (vitrine pública para o
 * visitante; rota do inquilino para quem está logado — que traz também
 * parceiro INATIVO, filtrado aqui). Planos vêm sempre da vitrine pública:
 * o `clientPlans` do contexto não carrega `status` e mostraria plano
 * desativado para o admin que abre o próprio site.
 */
export function VitrineProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const { partners: allPartners, benefits, isLoading } = useTenantData()
  const { plans: rawPlans, isLoading: plansLoading, error: plansError } = usePublicPlans(tenant?.slug)

  const value = useMemo<VitrineValue | null>(() => {
    if (!tenant) return null

    const partners = allPartners.filter(p => p.status === 'active')
    // Já na ordem de exibição (`sortClubPlansForDisplay`, em `usePublicPlans`);
    // "a partir de" continua sendo o menor preço pago.
    const plans = rawPlans
    const cheapestPlan =
      plans.reduce<VitrinePlan | null>(
        (cheapest, plan) => (plan.priceMonthly > 0 && (!cheapest || plan.priceMonthly < cheapest.priceMonthly) ? plan : cheapest),
        null,
      ) ??
      plans[0] ??
      null
    const featuredPlan = plans.find(p => p.highlight) ?? cheapestPlan

    const paths = buildSitePaths(tenant.slug)
    const content = siteContentFor(tenant.slug, {
      nome: tenant.name,
      telefone: tenant.phone ? formatPhone(tenant.phone) : undefined,
      email: tenant.email || undefined,
      temTeleorientacao: benefits.some(b => TELE.test(`${b.name} ${b.description}`)),
    })

    // Todo CTA de compra vai para o checkout; o genérico leva o plano em
    // destaque (ou o mais barato, se nenhum estiver marcado). Sem plano
    // nenhum cadastrado, cai em `/assinar` puro e o checkout decide.
    const primaryCta = { href: paths.checkout(featuredPlan?.id), label: content.hero.primaryCta }

    return {
      tenant,
      paths,
      content,
      plans,
      plansLoading,
      plansError,
      featuredPlan,
      cheapestPlan,
      partners,
      partnerGroups: groupPartners(partners),
      benefits,
      dataLoading: isLoading,
      stats: networkStats(partners),
      primaryCta,
      whatsapp: whatsappHref(tenant.phone, content.whatsappMessage),
      whatsappBusiness: whatsappHref(tenant.phone, content.whatsappBusinessMessage),
      phoneLabel: tenant.phone ? formatPhone(tenant.phone) : null,
    }
  }, [tenant, allPartners, benefits, isLoading, rawPlans, plansLoading, plansError])

  if (!value) return null
  return <VitrineContext.Provider value={value}>{children}</VitrineContext.Provider>
}

export function useVitrine(): VitrineValue {
  const context = useContext(VitrineContext)
  if (!context) throw new Error('useVitrine precisa estar dentro de <SiteShell>')
  return context
}

function networkStats(partners: Partner[]): NetworkStats {
  const names = new Set<string>()
  const cities = new Set<string>()
  const ufs = new Set<string>()
  const categories = new Set<PartnerCategory>()
  let max = 0
  let sum = 0
  let counted = 0

  for (const partner of partners) {
    names.add(normalize(partner.name))
    const { city, uf } = splitCityUf(partner.city)
    if (city) cities.add(uf ? `${city} - ${uf}` : city)
    if (uf) ufs.add(uf)
    categories.add(partner.category)
    if (partner.discountPercent > 0) {
      max = Math.max(max, partner.discountPercent)
      sum += partner.discountPercent
      counted += 1
    }
  }

  return {
    partnerCount: names.size,
    unitCount: partners.length,
    cities: [...cities].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    ufs: [...ufs].sort(),
    categories: PARTNER_CATEGORY_ORDER.filter(c => categories.has(c)),
    maxDiscount: max,
    avgDiscount: counted > 0 ? sum / counted : 0,
  }
}

/** Mesmo parceiro em várias cidades vira um card só na prévia da rede. */
function groupPartners(partners: Partner[]): PartnerGroup[] {
  const groups = new Map<string, PartnerGroup>()
  for (const partner of partners) {
    const key = normalize(partner.name)
    const { city } = splitCityUf(partner.city)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, {
        key,
        name: partner.name,
        tagline: partner.tagline,
        category: partner.category,
        maxDiscount: partner.discountPercent,
        cities: city ? [city] : [],
        specialties: [...(partner.specialties ?? [])],
      })
      continue
    }
    group.maxDiscount = Math.max(group.maxDiscount, partner.discountPercent)
    if (city && !group.cities.includes(city)) group.cities.push(city)
    for (const specialty of partner.specialties ?? []) {
      if (!group.specialties.includes(specialty)) group.specialties.push(specialty)
    }
    if (!group.tagline && partner.tagline) group.tagline = partner.tagline
  }
  return [...groups.values()].sort((a, b) => b.maxDiscount - a.maxDiscount || a.name.localeCompare(b.name, 'pt-BR'))
}
