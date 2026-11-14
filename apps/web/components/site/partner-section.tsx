'use client'

import Link from 'next/link'
import { ArrowRight, BarChart3, Handshake, Wallet } from 'lucide-react'
import { StartForm } from '@/components/seja-parceiro/start-form'
import { Reveal, Section, SectionHeader } from './section'
import { useVitrine } from './vitrine-context'

const BULLETS = [
  { icon: Wallet, text: 'Comissão sobre as primeiras mensalidades de cada venda.' },
  { icon: BarChart3, text: 'Painel próprio com funil, carteira e resultados.' },
  { icon: Handshake, text: 'Sem vínculo empregatício: atue como pessoa física ou jurídica.' },
]

/** Convite para virar parceiro comercial do clube, com o primeiro passo da candidatura. */
export function PartnerSection({ tone = 'soft' }: { tone?: 'white' | 'soft' }) {
  const { tenant, paths } = useVitrine()
  return (
    <Section id="seja-parceiro" tone={tone} labelledBy="seja-parceiro-titulo">
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHeader
            id="seja-parceiro-titulo"
            align="left"
            eyebrow="Rede comercial"
            title={`Seja um parceiro comercial do ${tenant.name}`}
            description="Venda nossos planos, acompanhe tudo em um painel e seja remunerado por cada cliente que você trouxer."
            className="mb-6 sm:mb-6"
          />
          <Reveal>
            <ul className="space-y-3">
              {BULLETS.map(item => (
                <li key={item.text} className="flex items-start gap-3 text-[15px] text-foreground/90">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="size-4" aria-hidden="true" />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
            <Link
              href={paths.partner}
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Saiba mais
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
        <Reveal>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-border/60 sm:p-7">
            <StartForm escopo={{ kind: 'tenant', slug: tenant.slug }} variant="home" />
          </div>
        </Reveal>
      </div>
    </Section>
  )
}
