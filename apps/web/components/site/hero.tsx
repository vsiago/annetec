'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BadgePercent, Check, QrCode, ShieldCheck, Users } from 'lucide-react'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { tenantForCard } from './brand'
import { categoriesPhrase } from './categories'
import { brl, percent, perDayCeiling, pluralize } from './format'
import { Reveal } from './section'
import { useVitrine } from './vitrine-context'

export function Hero() {
  const { tenant, content, stats, cheapestPlan, featuredPlan, plans, plansLoading, primaryCta } = useVitrine()
  const reduce = useReducedMotion()
  const hero = content.hero
  const desconto = stats.maxDiscount > 0 ? percent(stats.maxDiscount) : null
  const price = cheapestPlan && cheapestPlan.priceMonthly > 0 ? cheapestPlan.priceMonthly : null
  const perDay = price ? perDayCeiling(price) : null

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-gradient-to-b from-accent via-white to-white">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-1/2 size-[28rem] rounded-full bg-secondary/10 blur-3xl" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
          backgroundSize: '28px 28px',
          maskImage: 'linear-gradient(to bottom, black, transparent 70%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 70%)',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur sm:text-sm">
            <ShieldCheck className="size-4" aria-hidden="true" />
            {hero.eyebrow}
          </p>

          <h1
            id="hero-title"
            className="mt-6 text-[2.35rem] font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[3.6rem]"
          >
            {hero.title} <span className="text-primary">{hero.titleHighlight}</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {hero.subtitle(categoriesPhrase(stats.categories), desconto)}
          </p>

          <div className="mt-7 min-h-[3.5rem]" aria-live="polite">
            {plansLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-48" />
              </div>
            ) : price ? (
              <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
                <p className="text-foreground">
                  <span className="block text-sm text-muted-foreground">{plans.length > 1 ? 'A partir de' : 'Por apenas'}</span>
                  <span className="text-3xl font-bold tracking-tight sm:text-4xl">{brl(price)}</span>
                  <span className="text-base font-medium text-muted-foreground">/mês</span>
                </p>
                {perDay && (
                  <p className="mb-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    menos de {brl(perDay)} por dia
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-14 rounded-full px-8 text-base font-semibold shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5"
              asChild
            >
              <Link href={primaryCta.href}>
                {primaryCta.label}
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 rounded-full border-2 bg-white/70 px-8 text-base font-semibold" asChild>
              <a href="#planos">{hero.secondaryCta}</a>
            </Button>
          </div>

          <ul className="mt-6 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
            {hero.trust.map(item => (
              <li key={item} className="inline-flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
          className="relative mx-auto w-full max-w-[440px]"
        >
          <div aria-hidden="true" className="absolute inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/30 to-secondary/30 blur-2xl" />
          <DigitalCardMockup
            tenant={tenantForCard(tenant)}
            planName={featuredPlan ? `${tenant.name} ${featuredPlan.name}` : tenant.name}
            cardNumber={`${tenant.slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3)}-0000-00000`}
            size="md"
          />
          <HeroChip className="-left-3 top-2 sm:-left-8" icon={QrCode} text="Validação por QR Code" />
          {stats.maxDiscount > 0 && (
            <HeroChip
              className="-right-2 bottom-24 sm:-right-8"
              icon={BadgePercent}
              text={`Até ${percent(stats.maxDiscount)} de desconto`}
            />
          )}
          {stats.partnerCount > 0 && (
            <HeroChip
              className="-left-2 bottom-10 sm:-left-10"
              icon={Users}
              text={pluralize(stats.partnerCount, 'parceiro na rede', 'parceiros na rede')}
            />
          )}
        </motion.div>
      </div>
    </section>
  )
}

function HeroChip({ icon: Icon, text, className }: { icon: React.ElementType; text: string; className?: string }) {
  return (
    <div
      className={`absolute z-10 hidden items-center gap-2 rounded-2xl border border-border/70 bg-white/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur sm:flex ${className ?? ''}`}
    >
      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      {text}
    </div>
  )
}
