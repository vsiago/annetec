'use client'

import { BenefitsGrid, SavingsSimulator } from '@/components/site/benefits'
import { Hero } from '@/components/site/hero'
import { NetworkPreview } from '@/components/site/network'
import { PlansSection } from '@/components/site/plans'
import { SiteShell } from '@/components/site/site-shell'
import { FaqSection, Testimonials } from '@/components/site/trust'
import { FinalCta, Guarantees, HowItWorks, PainSolution, SocialProofBar } from '@/components/site/value-sections'

/**
 * Vitrine do inquilino: a página de venda do clube. A ordem das seções segue
 * o funil — dor, solução, prova, oferta, garantia e CTA — e todo número
 * exibido vem dos dados do próprio inquilino. Os fundos alternam branco e
 * suave para cada seção se destacar da anterior.
 */
export default function TenantLandingPage() {
  return (
    <SiteShell>
      <Hero />
      <SocialProofBar />
      <PainSolution />
      <HowItWorks tone="soft" />
      <BenefitsGrid />
      <SavingsSimulator />
      <PlansSection tone="white" />
      <NetworkPreview tone="soft" />
      <Testimonials tone="white" />
      <Guarantees tone="soft" />
      <FaqSection tone="white" />
      <FinalCta />
    </SiteShell>
  )
}
