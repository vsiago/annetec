'use client'

import Link from 'next/link'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { TenantLogo } from './brand'
import { formatCep, formatCnpj, telHref } from './format'
import { useVitrine } from './vitrine-context'

export function SiteFooter() {
  const { tenant, paths, content, whatsapp, phoneLabel, primaryCta } = useVitrine()
  const address = tenant.address
  const tel = telHref(tenant.phone)
  const street = [address?.street, address?.number].filter(Boolean).join(', ')
  const addressLines = [
    [street, address?.complement].filter(Boolean).join(' — '),
    [address?.neighborhood, address?.city && `${address.city}${address.state ? ` - ${address.state}` : ''}`]
      .filter(Boolean)
      .join(', '),
    address?.cep ? `CEP ${formatCep(address.cep)}` : '',
  ].filter(Boolean)

  const columns = [
    {
      title: 'Clube',
      links: [
        { href: paths.plans, label: 'Planos e preços' },
        { href: paths.network, label: 'Rede credenciada' },
        { href: primaryCta.href, label: 'Assinar agora' },
        { href: paths.signup, label: 'Falar com um consultor' },
      ],
    },
    {
      title: 'Institucional',
      links: [
        { href: paths.about, label: 'Sobre nós' },
        { href: paths.business, label: 'Para empresas' },
        { href: paths.clientArea, label: 'Área do cliente' },
      ],
    },
  ]

  return (
    <footer className="border-t border-border bg-white text-sm">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:px-8">
        <div className="space-y-4">
          <TenantLogo tenant={tenant} />
          <p className="max-w-xs leading-relaxed text-muted-foreground">{content.about.description}</p>
        </div>

        {columns.map(column => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="mb-4 text-sm font-semibold text-foreground">{column.title}</h2>
            <ul className="space-y-2.5">
              {column.links.map(link => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="rounded text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Atendimento</h2>
          <ul className="space-y-3 text-muted-foreground">
            {tel && phoneLabel && (
              <li>
                <a href={tel} className="inline-flex items-center gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Phone className="size-4 shrink-0" aria-hidden="true" />
                  {phoneLabel}
                </a>
              </li>
            )}
            {whatsapp && (
              <li>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  WhatsApp
                </a>
              </li>
            )}
            {tenant.email && (
              <li>
                <a
                  href={`mailto:${tenant.email}`}
                  className="inline-flex items-center gap-2 break-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  {tenant.email}
                </a>
              </li>
            )}
            {addressLines.length > 0 && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <address className="not-italic leading-relaxed">
                  {addressLines.map(line => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border bg-accent/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p className="font-medium text-foreground/80">{content.legal.disclaimer}</p>
          <p>
            © {new Date().getFullYear()} {tenant.legalName || tenant.name}
            {tenant.document ? ` · CNPJ ${formatCnpj(tenant.document)}` : ''}
          </p>
        </div>
      </div>
    </footer>
  )
}
