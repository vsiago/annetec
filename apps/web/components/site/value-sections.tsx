'use client'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { brl, percent } from './format'
import { IconBadge, Reveal, Section, SectionHeader } from './section'
import { useVitrine } from './vitrine-context'

/** Números da rede calculados dos dados reais — nunca digitados. */
export function SocialProofBar() {
  const { stats, dataLoading } = useVitrine()

  const items = [
    stats.partnerCount > 0 && {
      value: stats.partnerCount.toLocaleString('pt-BR'),
      label: stats.partnerCount === 1 ? 'parceiro credenciado' : 'parceiros credenciados',
    },
    stats.unitCount > stats.partnerCount && {
      value: stats.unitCount.toLocaleString('pt-BR'),
      label: 'unidades de atendimento',
    },
    stats.cities.length > 0 && {
      value: stats.cities.length.toLocaleString('pt-BR'),
      label: stats.cities.length === 1 ? 'cidade atendida' : 'cidades atendidas',
    },
    stats.categories.length > 1 && {
      value: stats.categories.length.toLocaleString('pt-BR'),
      label: 'categorias de benefícios',
    },
    stats.maxDiscount > 0 && { value: `até ${percent(stats.maxDiscount)}`, label: 'de desconto na rede' },
  ].filter((item): item is { value: string; label: string } => Boolean(item))

  if (dataLoading && items.length === 0) {
    return (
      <div className="border-y border-border/60 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4 lg:px-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (items.length === 0) return null

  return (
    <section aria-label="A rede em números" className="border-y border-border/60 bg-white">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-6 px-4 py-8 sm:grid-cols-3 sm:px-6 lg:flex lg:justify-between lg:px-8">
        {items.map((item, index) => (
          <Reveal key={item.label} delay={index * 0.05} className="flex flex-col-reverse">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-3xl font-bold tracking-tight text-foreground">{item.value}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  )
}

export function PainSolution() {
  const { content, primaryCta } = useVitrine()
  const pain = content.pain
  return (
    <Section tone="white" labelledBy="dor-titulo">
      <SectionHeader id="dor-titulo" eyebrow={pain.eyebrow} title={pain.title} description={pain.description} />
      <div className="grid gap-5 md:grid-cols-3">
        {pain.items.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.08}>
            <article className="h-full rounded-3xl border border-border/70 bg-white p-6 shadow-sm">
              <IconBadge icon={item.icon} className="bg-destructive/10 text-destructive" />
              <h3 className="mt-5 text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-secondary p-8 text-primary-foreground shadow-xl sm:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h3 className="text-2xl font-bold sm:text-3xl">{pain.solutionTitle}</h3>
              <p className="mt-3 text-base leading-relaxed opacity-90">{pain.solutionText}</p>
            </div>
            <div className="space-y-5">
              <ul className="space-y-3">
                {pain.solutionBullets.map(bullet => (
                  <li key={bullet} className="flex items-start gap-3 text-sm font-medium sm:text-base">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>
              <Button size="lg" className="h-12 rounded-full bg-white px-7 font-semibold text-foreground hover:bg-white/90" asChild>
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

export function HowItWorks({ tone = 'soft' }: { tone?: 'white' | 'soft' }) {
  const { content } = useVitrine()
  const how = content.howItWorks
  return (
    <Section tone={tone} labelledBy="como-funciona-titulo">
      <SectionHeader id="como-funciona-titulo" eyebrow={how.eyebrow} title={how.title} />
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute left-[16%] right-[16%] top-14 hidden h-px bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 md:block"
        />
        <ol className="relative grid gap-6 md:grid-cols-3">
          {how.steps.map((step, index) => (
            <li key={step.title} className="h-full">
              <Reveal delay={index * 0.1} className="h-full">
                <div className="flex h-full flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-border/60">
                  <span className="relative inline-flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                    <step.icon className="size-7" aria-hidden="true" />
                    <span className="absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground ring-4 ring-white">
                      <span className="sr-only">Passo </span>
                      {index + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}

export function Guarantees({ tone = 'white' }: { tone?: 'white' | 'soft' }) {
  const { content } = useVitrine()
  const g = content.guarantees
  return (
    <Section tone={tone} labelledBy="garantias-titulo">
      <SectionHeader id="garantias-titulo" eyebrow={g.eyebrow} title={g.title} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {g.items.map((item, index) => (
          <Reveal key={item.title} delay={index * 0.06}>
            <article className="h-full rounded-3xl border border-border/70 bg-white p-6">
              <IconBadge icon={item.icon} />
              <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

export function FinalCta() {
  const { content, primaryCta, whatsapp, paths, cheapestPlan } = useVitrine()
  const cta = content.finalCta
  return (
    <section aria-labelledby="cta-final-titulo" className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] bg-secondary px-6 py-12 text-center text-secondary-foreground shadow-2xl sm:px-12 sm:py-16">
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/40 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 size-72 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <h2 id="cta-final-titulo" className="text-3xl font-bold leading-tight sm:text-4xl">
              {cta.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed opacity-85 sm:text-lg">{cta.text}</p>
            {cheapestPlan && cheapestPlan.priceMonthly > 0 && (
              <p className="mt-4 text-sm font-semibold opacity-90">
                Planos a partir de {brl(cheapestPlan.priceMonthly)}/mês
              </p>
            )}
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-14 rounded-full px-8 text-base font-semibold shadow-lg" asChild>
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="size-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-full border-2 border-current bg-transparent px-8 text-base font-semibold text-secondary-foreground hover:bg-white/10 hover:text-secondary-foreground"
                asChild
              >
                {whatsapp ? (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-5" aria-hidden="true" />
                    {cta.secondary}
                  </a>
                ) : (
                  <Link href={paths.signup}>{cta.secondary}</Link>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/** Faixa curta de conversão para o fim das páginas internas. */
export function InlineCta({ title, text }: { title: string; text?: string }) {
  const { primaryCta, paths, content } = useVitrine()
  return (
    <Reveal>
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-r from-primary to-secondary p-8 text-primary-foreground shadow-xl sm:flex-row sm:items-center sm:p-10">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
          {text && <p className="mt-2 opacity-90">{text}</p>}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" className="h-12 rounded-full bg-white px-7 font-semibold text-foreground hover:bg-white/90" asChild>
            <Link href={primaryCta.href}>
              {primaryCta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-2 border-current bg-transparent px-7 font-semibold text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            asChild
          >
            <Link href={paths.signup}>{content.finalCta.secondary}</Link>
          </Button>
        </div>
      </div>
    </Reveal>
  )
}
