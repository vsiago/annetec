'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Calculator, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { BENEFIT_CATEGORIES, BENEFIT_CATEGORY_ORDER, PARTNER_CATEGORIES } from './categories'
import { SITE_FLAGS } from './content'
import { brl, percent, pluralize } from './format'
import { IconBadge, Reveal, Section, SectionHeader } from './section'
import { useVitrine } from './vitrine-context'

interface BenefitCard {
  key: string
  icon: React.ElementType
  label?: string
  title: string
  text: string
  discount?: number
}

/**
 * Benefícios cadastrados pelo inquilino, agrupados por categoria. Sem nenhum
 * benefício, a rede credenciada vira o conteúdo (uma carta por categoria);
 * sem os dois, entram os benefícios genéricos do clube.
 */
export function BenefitsGrid() {
  const { content, benefits, stats, partners, dataLoading } = useVitrine()
  const section = content.benefits

  const cards = useMemo<BenefitCard[]>(() => {
    if (benefits.length > 0) {
      return [...benefits]
        .sort(
          (a, b) =>
            BENEFIT_CATEGORY_ORDER.indexOf(a.category) - BENEFIT_CATEGORY_ORDER.indexOf(b.category) ||
            a.name.localeCompare(b.name, 'pt-BR'),
        )
        .map(benefit => {
          const meta = BENEFIT_CATEGORIES[benefit.category] ?? BENEFIT_CATEGORIES.discount
          return {
            key: benefit.id,
            icon: meta.icon,
            label: meta.label,
            title: benefit.name,
            text: benefit.description || (benefit.provider ? `Com ${benefit.provider}.` : ''),
            discount: benefit.discount && benefit.discount > 0 ? benefit.discount : undefined,
          }
        })
    }
    if (partners.length > 0) {
      return stats.categories.map(category => {
        const inCategory = partners.filter(p => p.category === category)
        const names = new Set(inCategory.map(p => p.name.toLowerCase()))
        const max = Math.max(0, ...inCategory.map(p => p.discountPercent))
        const meta = PARTNER_CATEGORIES[category]
        return {
          key: category,
          icon: meta.icon,
          label: 'Rede credenciada',
          title: meta.label,
          text: `${pluralize(names.size, 'parceiro', 'parceiros')} com desconto para associados.`,
          discount: max > 0 ? max : undefined,
        }
      })
    }
    return section.fallback.map(item => ({ key: item.title, icon: item.icon, title: item.title, text: item.text }))
  }, [benefits, partners, stats.categories, section.fallback])

  return (
    <Section tone="white" labelledBy="beneficios-titulo">
      <SectionHeader id="beneficios-titulo" eyebrow={section.eyebrow} title={section.title} description={section.description} />
      {dataLoading && benefits.length === 0 && partners.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <Reveal key={card.key} delay={Math.min(index, 6) * 0.05}>
              <article className="group relative h-full rounded-3xl border border-border/70 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
                <div className="flex items-start justify-between gap-3">
                  <IconBadge icon={card.icon} className="transition-colors group-hover:bg-primary group-hover:text-primary-foreground" />
                  {card.discount !== undefined && (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      até {percent(card.discount)} OFF
                    </span>
                  )}
                </div>
                {card.label && (
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
                )}
                <h3 className="mt-1 text-lg font-semibold text-foreground">{card.title}</h3>
                {card.text && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.text}</p>}
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </Section>
  )
}

const GASTO_MIN = 50
const GASTO_MAX = 2000
const GASTO_PADRAO = 300

/**
 * Simulador honesto: aplica o desconto MÉDIO da rede ativa ao gasto que a
 * pessoa informa. Sem rede com desconto cadastrado, não há base para estimar
 * e a seção não aparece.
 */
export function SavingsSimulator() {
  const { content, stats, cheapestPlan, primaryCta } = useVitrine()
  const [gasto, setGasto] = useState(GASTO_PADRAO)
  const inputId = useId()
  const sim = content.simulator

  if (!SITE_FLAGS.showSavingsSimulator || stats.avgDiscount <= 0) return null

  const economiaMensal = (gasto * stats.avgDiscount) / 100
  const economiaAnual = economiaMensal * 12
  const mensalidade = cheapestPlan && cheapestPlan.priceMonthly > 0 ? cheapestPlan.priceMonthly : null
  const saldo = mensalidade ? economiaMensal - mensalidade : null

  return (
    <Section tone="soft" labelledBy="simulador-titulo">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <SectionHeader
          id="simulador-titulo"
          align="left"
          eyebrow={sim.eyebrow}
          title={sim.title}
          description={sim.description}
          className="mb-0 sm:mb-0"
        />

        <Reveal>
          <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-border/60 sm:p-8">
            <div className="flex items-center gap-3">
              <IconBadge icon={Calculator} className="size-10 rounded-xl" />
              <label htmlFor={inputId} className="font-semibold text-foreground">
                {sim.inputLabel}
              </label>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <span className="text-lg font-semibold text-muted-foreground">R$</span>
              <Input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={GASTO_MIN}
                max={GASTO_MAX * 5}
                step={10}
                value={gasto}
                onChange={event => {
                  const value = Number(event.target.value)
                  setGasto(Number.isFinite(value) ? Math.max(0, Math.min(value, GASTO_MAX * 5)) : 0)
                }}
                className="h-12 max-w-[10rem] rounded-xl text-xl font-bold"
              />
              <span className="text-sm text-muted-foreground">por mês</span>
            </div>
            <Slider
              className="mt-6"
              min={GASTO_MIN}
              max={GASTO_MAX}
              step={10}
              value={[Math.min(Math.max(gasto, GASTO_MIN), GASTO_MAX)]}
              onValueChange={([value]) => setGasto(value ?? GASTO_PADRAO)}
              aria-label={sim.inputLabel}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{brl(GASTO_MIN)}</span>
              <span>{brl(GASTO_MAX)}</span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-live="polite">
              <div className="rounded-2xl bg-primary/10 p-5">
                <p className="text-sm font-medium text-primary">Economia estimada por mês</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{brl(economiaMensal)}</p>
              </div>
              <div className="rounded-2xl bg-accent p-5">
                <p className="text-sm font-medium text-muted-foreground">Em um ano</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{brl(economiaAnual)}</p>
              </div>
            </div>

            {mensalidade !== null && saldo !== null && (
              <p className="mt-5 text-sm leading-relaxed text-foreground">
                {saldo > 0 ? (
                  <>
                    A estimativa cobre a mensalidade a partir de <strong>{brl(mensalidade)}</strong> e ainda sobram{' '}
                    <strong className="text-primary">{brl(saldo)}</strong> por mês.
                  </>
                ) : (
                  <>
                    Planos a partir de <strong>{brl(mensalidade)}</strong>/mês. Compare e veja qual faz mais sentido
                    para o uso da sua família.
                  </>
                )}
              </p>
            )}

            <Button size="lg" className="mt-6 h-12 w-full rounded-full font-semibold" asChild>
              <Link href={primaryCta.href}>
                {sim.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <p className="mt-5 flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {sim.disclaimer(percent(stats.avgDiscount))}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
