'use client'

import Link from 'next/link'
import { ArrowRight, Clock, MessageCircle, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactLeadForm } from '@/components/site/lead-forms'
import { PageHero, Reveal, Section } from '@/components/site/section'
import { SiteShell } from '@/components/site/site-shell'
import { useVitrine } from '@/components/site/vitrine-context'

/**
 * "Fale com um consultor". O formulário grava direto no CRM do inquilino
 * pela rota pública de leads — antes ele chamava a rota do CRM, que exige
 * sessão de admin/vendedor, e o visitante recebia "enviado" sem o lead existir.
 */
export default function CadastroPage() {
  return (
    <SiteShell mobileCta={false}>
      <CadastroContent />
    </SiteShell>
  )
}

function CadastroContent() {
  const { content, primaryCta, whatsapp, paths } = useVitrine()
  return (
    <>
      <PageHero eyebrow="Atendimento" title={content.signup.title} description={content.signup.description} />
      <Section tone="soft" className="pt-10 sm:pt-12 lg:pt-14">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <Reveal>
            <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-border/60 sm:p-8">
              <h2 className="mb-6 text-xl font-bold text-foreground">Seus dados</h2>
              <ContactLeadForm />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="space-y-5">
            <div className="rounded-3xl bg-secondary p-7 text-secondary-foreground shadow-xl">
              <h2 className="text-xl font-bold">Prefere resolver agora?</h2>
              <p className="mt-2 text-sm leading-relaxed opacity-85">
                A adesão é 100% online e leva poucos minutos. Escolha o plano e pague com Pix, boleto ou cartão.
              </p>
              <Button size="lg" className="mt-5 h-12 w-full rounded-full font-semibold" asChild>
                <Link href={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="mt-3 h-12 w-full rounded-full border-2 border-current bg-transparent font-semibold text-secondary-foreground hover:bg-white/10 hover:text-secondary-foreground"
                asChild
              >
                <Link href={paths.plans}>Ver planos e preços</Link>
              </Button>
            </div>

            <ul className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-border/60">
              {content.signup.promises.map((promise, index) => {
                const Icon = index === 0 ? Clock : ShieldCheck
                return (
                  <li key={promise} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    {promise}
                  </li>
                )
              })}
              {whatsapp && (
                <li>
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MessageCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    Prefere o WhatsApp? Fale com a gente agora.
                  </a>
                </li>
              )}
            </ul>

            <p className="text-center text-sm text-muted-foreground">
              Já é associado?{' '}
              <Link href={paths.clientArea} className="font-semibold text-primary hover:underline">
                Acesse a Área do cliente
              </Link>
            </p>
          </Reveal>
        </div>
      </Section>
    </>
  )
}
