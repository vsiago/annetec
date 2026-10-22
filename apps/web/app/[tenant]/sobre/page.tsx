'use client'

import { Building2, Mail, MapPin, MessageCircle, Phone, Target } from 'lucide-react'
import { formatCep, formatCnpj, telHref } from '@/components/site/format'
import { IconBadge, PageHero, Reveal, Section, SectionHeader } from '@/components/site/section'
import { SiteShell } from '@/components/site/site-shell'
import { FinalCta, HowItWorks, SocialProofBar } from '@/components/site/value-sections'
import { useVitrine } from '@/components/site/vitrine-context'

export default function TenantAboutPage() {
  return (
    <SiteShell>
      <AboutContent />
    </SiteShell>
  )
}

function AboutContent() {
  const { tenant, content, whatsapp, phoneLabel } = useVitrine()
  const about = content.about
  const address = tenant.address
  const tel = telHref(tenant.phone)
  const addressText = [
    [address?.street, address?.number].filter(Boolean).join(', '),
    address?.complement,
    address?.neighborhood,
    address?.city && `${address.city}${address.state ? ` - ${address.state}` : ''}`,
    address?.cep && `CEP ${formatCep(address.cep)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const facts = [
    { label: 'Razão social', value: tenant.legalName },
    { label: 'CNPJ', value: tenant.document ? formatCnpj(tenant.document) : '' },
    { label: 'Sede', value: address?.city ? `${address.city}${address.state ? ` - ${address.state}` : ''}` : '' },
  ].filter(fact => fact.value)

  return (
    <>
      <PageHero eyebrow={about.eyebrow} title={about.title} description={about.description} />
      <SocialProofBar />

      <Section tone="white" labelledBy="quem-somos">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <SectionHeader id="quem-somos" align="left" eyebrow="Quem somos" title={`${tenant.name}, perto de você`} className="mb-6 sm:mb-6" />
            <Reveal>
              <div className="rounded-3xl bg-gradient-to-br from-primary to-secondary p-7 text-primary-foreground shadow-xl">
                <div className="flex items-center gap-3">
                  <Target className="size-6" aria-hidden="true" />
                  <h3 className="text-lg font-bold">Nossa missão</h3>
                </div>
                <p className="mt-3 text-base leading-relaxed opacity-95">{about.mission}</p>
              </div>
            </Reveal>
          </div>
          <Reveal>
            <dl className="divide-y divide-border rounded-3xl bg-white shadow-sm ring-1 ring-border/60">
              {facts.map(fact => (
                <div key={fact.label} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:justify-between sm:gap-6">
                  <dt className="text-sm text-muted-foreground">{fact.label}</dt>
                  <dd className="font-medium text-foreground sm:text-right">{fact.value}</dd>
                </div>
              ))}
              <div className="flex items-start gap-3 px-6 py-4">
                <Building2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  O {tenant.name} é um clube de benefícios, não um plano de saúde.
                </p>
              </div>
            </dl>
          </Reveal>
        </div>
      </Section>

      <Section tone="soft" labelledBy="valores">
        <SectionHeader id="valores" eyebrow="Valores" title="O que guia o nosso trabalho" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {about.values.map((value, index) => (
            <Reveal key={value.title} delay={index * 0.06}>
              <article className="h-full rounded-3xl bg-white p-6 ring-1 ring-border/60">
                <IconBadge icon={value.icon} />
                <h3 className="mt-4 font-semibold text-foreground">{value.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <HowItWorks tone="white" />

      <Section tone="soft" labelledBy="lgpd">
        <SectionHeader
          id="lgpd"
          eyebrow="Segurança e LGPD"
          title="Seus dados em boas mãos"
          description="Tratamos dados pessoais conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)."
        />
        <div className="grid gap-5 md:grid-cols-3">
          {about.security.map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06}>
              <article className="h-full rounded-3xl bg-white p-6 ring-1 ring-border/60">
                <IconBadge icon={item.icon} />
                <h3 className="mt-4 font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="white" labelledBy="contato">
        <SectionHeader id="contato" eyebrow="Contato" title="Fale com a gente" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {tel && phoneLabel && <ContactCard icon={Phone} label="Telefone" value={phoneLabel} href={tel} />}
          {whatsapp && <ContactCard icon={MessageCircle} label="WhatsApp" value="Enviar mensagem" href={whatsapp} external />}
          {tenant.email && <ContactCard icon={Mail} label="E-mail" value={tenant.email} href={`mailto:${tenant.email}`} />}
          {addressText && <ContactCard icon={MapPin} label="Endereço" value={addressText} />}
        </div>
      </Section>

      <FinalCta />
    </>
  )
}

function ContactCard({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ElementType
  label: string
  value: string
  href?: string
  external?: boolean
}) {
  const body = (
    <>
      <IconBadge icon={icon} className="size-11 rounded-xl" />
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold text-foreground">{value}</p>
    </>
  )
  const className =
    'block h-full rounded-3xl bg-white p-6 ring-1 ring-border/60 transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <Reveal className="h-full">
      {href ? (
        <a href={href} className={className} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {body}
        </a>
      ) : (
        <div className={className}>{body}</div>
      )}
    </Reveal>
  )
}
