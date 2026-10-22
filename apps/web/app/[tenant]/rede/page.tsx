'use client'

import { NetworkCta, PartnerDirectory } from '@/components/site/network'
import { PageHero, Section } from '@/components/site/section'
import { SiteShell } from '@/components/site/site-shell'
import { useVitrine } from '@/components/site/vitrine-context'
import { percent, pluralize } from '@/components/site/format'

export default function TenantNetworkPage() {
  return (
    <SiteShell>
      <NetworkContent />
    </SiteShell>
  )
}

function NetworkContent() {
  const { tenant, content, stats } = useVitrine()
  const numbers = [
    stats.partnerCount > 0 && pluralize(stats.partnerCount, 'parceiro', 'parceiros'),
    stats.unitCount > stats.partnerCount && pluralize(stats.unitCount, 'unidade', 'unidades'),
    stats.cities.length > 0 && pluralize(stats.cities.length, 'cidade', 'cidades'),
    stats.maxDiscount > 0 && `descontos de até ${percent(stats.maxDiscount)}`,
  ].filter(Boolean)

  return (
    <>
      <PageHero
        eyebrow={content.network.eyebrow}
        title="Rede credenciada"
        description={`Encontre parceiros do ${tenant.name} perto de você. ${content.network.description}`}
      >
        {numbers.length > 0 && (
          <p className="inline-flex flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-white/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-border/60">
            {numbers.join(' · ')}
          </p>
        )}
      </PageHero>

      <Section tone="soft" className="pt-10 sm:pt-12 lg:pt-14">
        <div className="mb-8">
          <NetworkCta />
        </div>
        <PartnerDirectory />
        <p className="mt-10 text-center text-xs text-muted-foreground">
          {content.network.conditions} {content.legal.disclaimer}
        </p>
      </Section>
    </>
  )
}
