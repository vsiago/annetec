'use client'

import Link from 'next/link'
import { MessageCircle, Quote } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import { SITE_FLAGS, type FaqItem } from './content'
import { Reveal, Section, SectionHeader } from './section'
import { useVitrine } from './vitrine-context'

/** Depoimentos — hoje de EXEMPLO (ver `content.ts`); desliga em `SITE_FLAGS`. */
export function Testimonials({ tone = 'soft' }: { tone?: 'white' | 'soft' }) {
  const { content } = useVitrine()
  const t = content.testimonials
  if (!SITE_FLAGS.showTestimonials || t.items.length === 0) return null

  return (
    <Section tone={tone} labelledBy="depoimentos-titulo">
      <SectionHeader id="depoimentos-titulo" eyebrow={t.eyebrow} title={t.title} />
      <div className="grid gap-5 md:grid-cols-3">
        {t.items.map((item, index) => (
          <Reveal key={item.name} delay={index * 0.08} className="h-full">
            <figure className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border/60 sm:p-7">
              <Quote className="size-8 text-primary/30" aria-hidden="true" />
              <blockquote className="mt-4 flex-1 text-base leading-relaxed text-foreground">“{item.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                >
                  {getInitials(item.name)}
                </span>
                <span>
                  <span className="block font-semibold text-foreground">{item.name}</span>
                  <span className="block text-sm text-muted-foreground">{item.context}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
      {t.illustrativeNote && <p className="mt-6 text-center text-xs text-muted-foreground">{t.illustrativeNote}</p>}
    </Section>
  )
}

export function FaqSection({
  items,
  title,
  eyebrow,
  tone = 'white',
  id = 'duvidas',
}: {
  items?: FaqItem[]
  title?: string
  eyebrow?: string
  tone?: 'white' | 'soft'
  id?: string
}) {
  const { content, whatsapp, paths } = useVitrine()
  const faq = items ?? content.faq.items

  return (
    <Section id={id} tone={tone} labelledBy={`${id}-titulo`}>
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHeader
            id={`${id}-titulo`}
            align="left"
            eyebrow={eyebrow ?? content.faq.eyebrow}
            title={title ?? content.faq.title}
            description="Não encontrou sua resposta? Fale com a nossa equipe."
            className="mb-6 sm:mb-6"
          />
          <Reveal className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            {whatsapp && (
              <Button size="lg" className="h-12 rounded-full px-6 font-semibold" asChild>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Falar no WhatsApp
                </a>
              </Button>
            )}
            <Button size="lg" variant="outline" className="h-12 rounded-full border-2 px-6 font-semibold" asChild>
              <Link href={paths.signup}>Falar com um consultor</Link>
            </Button>
          </Reveal>
        </div>
        <Reveal>
          <Accordion type="single" collapsible className="rounded-3xl bg-white px-5 shadow-sm ring-1 ring-border/60 sm:px-7">
            {faq.map((item, index) => (
              <AccordionItem key={item.question} value={`item-${index}`}>
                <AccordionTrigger className="py-5 text-base font-semibold text-foreground hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </Section>
  )
}
