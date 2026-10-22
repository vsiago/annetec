'use client'

import { Briefcase, CheckCircle2, CircleDollarSign, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { percent, pluralize } from '@/components/site/format'
import { CompanyLeadForm } from '@/components/site/lead-forms'
import { IconBadge, PageHero, Reveal, Section, SectionHeader } from '@/components/site/section'
import { SiteShell } from '@/components/site/site-shell'
import { useVitrine } from '@/components/site/vitrine-context'

export default function TenantBusinessPage() {
  return (
    <SiteShell mobileCta={false}>
      <BusinessContent />
    </SiteShell>
  )
}

function BusinessContent() {
  const { content, stats, whatsappBusiness } = useVitrine()
  const b = content.business
  const proof = [
    stats.partnerCount > 0 && pluralize(stats.partnerCount, 'parceiro credenciado', 'parceiros credenciados'),
    stats.cities.length > 0 && pluralize(stats.cities.length, 'cidade atendida', 'cidades atendidas'),
    stats.maxDiscount > 0 && `até ${percent(stats.maxDiscount)} de desconto`,
  ].filter(Boolean)

  return (
    <>
      <PageHero eyebrow={b.eyebrow} title={b.title} description={b.description}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="h-13 rounded-full px-7 text-base font-semibold shadow-lg shadow-primary/20" asChild>
            <a href="#proposta">
              <Briefcase className="size-5" aria-hidden="true" />
              {b.primaryCta}
            </a>
          </Button>
          {whatsappBusiness && (
            <Button size="lg" variant="outline" className="h-13 rounded-full border-2 bg-white/70 px-7 text-base font-semibold" asChild>
              <a href={whatsappBusiness} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-5" aria-hidden="true" />
                {b.secondaryCta}
              </a>
            </Button>
          )}
        </div>
        {proof.length > 0 && <p className="mt-5 text-sm font-medium text-muted-foreground">{proof.join(' · ')}</p>}
      </PageHero>

      <Section tone="white" labelledBy="dores-rh">
        <SectionHeader id="dores-rh" eyebrow="O desafio do RH" title="Benefício bom é benefício usado" />
        <div className="grid gap-5 md:grid-cols-3">
          {b.pains.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.08}>
              <article className="h-full rounded-3xl border border-border/70 bg-white p-6">
                <IconBadge icon={item.icon} className="bg-destructive/10 text-destructive" />
                <h3 className="mt-5 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="soft" labelledBy="solucao-empresas">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <SectionHeader id="solucao-empresas" align="left" eyebrow="A solução" title={b.solutionTitle} className="mb-0 sm:mb-0" />
          <Reveal>
            <ul className="space-y-4 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-border/60">
              {b.solutionBullets.map(item => (
                <li key={item} className="flex items-start gap-3 text-foreground">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <Section tone="white" labelledBy="como-funciona-empresas">
        <SectionHeader id="como-funciona-empresas" eyebrow="Como funciona" title="Da proposta ao benefício em uso" />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {b.steps.map((step, index) => (
            <li key={step.title} className="h-full">
              <Reveal delay={index * 0.08} className="h-full">
                <div className="h-full rounded-3xl bg-white p-6 ring-1 ring-border/60">
                  <div className="flex items-center justify-between">
                    <IconBadge icon={step.icon} />
                    <span className="text-3xl font-bold text-primary/25" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="proposta" tone="soft" labelledBy="proposta-titulo">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeader
              id="proposta-titulo"
              align="left"
              eyebrow="Proposta"
              title={b.formTitle}
              description={b.formDescription}
              className="mb-8 sm:mb-8"
            />
            <Reveal>
              <div className="rounded-3xl bg-secondary p-7 text-secondary-foreground shadow-xl">
                <CircleDollarSign className="size-8" aria-hidden="true" />
                <h3 className="mt-4 text-2xl font-bold">{b.pricingTitle}</h3>
                <p className="mt-2 leading-relaxed opacity-85">{b.pricingText}</p>
              </div>
            </Reveal>
          </div>
          <Reveal>
            <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-border/60 sm:p-8">
              <CompanyLeadForm />
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  )
}
