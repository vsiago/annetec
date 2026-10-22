'use client'

import { Check } from 'lucide-react'
import { PlanComparison } from '@/components/site/plan-comparison'
import { PlansGrid } from '@/components/site/plans'
import { PageHero, Section } from '@/components/site/section'
import { SiteShell } from '@/components/site/site-shell'
import { FaqSection } from '@/components/site/trust'
import { Guarantees, InlineCta } from '@/components/site/value-sections'
import { useVitrine } from '@/components/site/vitrine-context'

export default function TenantPlansPage() {
  return (
    <SiteShell>
      <PlansContent />
    </SiteShell>
  )
}

function PlansContent() {
  const { content } = useVitrine()
  return (
    <>
      <PageHero eyebrow={content.plans.eyebrow} title="Planos e preços" description={content.plans.description}>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          {content.hero.trust.map(item => (
            <li key={item} className="inline-flex items-center gap-2">
              <Check className="size-4 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </PageHero>

      <Section tone="soft" labelledBy="lista-planos" className="pt-12 sm:pt-14 lg:pt-16">
        <h2 id="lista-planos" className="sr-only">
          Planos disponíveis
        </h2>
        {/* A grade já traz o aviso legal (`CLUB_PLAN_LEGAL_NOTICE`) logo abaixo dos cards. */}
        <PlansGrid />
      </Section>

      <PlanComparison />
      <Guarantees tone="soft" />
      <FaqSection id="cobranca" eyebrow="Cobrança" title={content.billingFaq.title} items={content.billingFaq.items} />

      <Section tone="white" className="pt-0 sm:pt-0 lg:pt-0">
        <InlineCta title="Ainda em dúvida sobre qual plano escolher?" text="Um consultor ajuda você a encontrar a melhor opção para a sua família." />
      </Section>
    </>
  )
}
