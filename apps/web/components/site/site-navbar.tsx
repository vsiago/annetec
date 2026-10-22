'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, LogIn, Menu, Phone } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { TenantLogo } from './brand'
import { telHref } from './format'
import { useVitrine } from './vitrine-context'

/** Quem já tem sessão neste clube vai direto para a própria área. */
const AREA_POR_PAPEL = {
  client: { label: 'Minha área', path: 'cliente' },
  admin: { label: 'Painel', path: 'admin' },
  seller: { label: 'Portal do vendedor', path: 'vendedor' },
} as const

export function SiteNavbar() {
  const { tenant, paths, primaryCta, phoneLabel } = useVitrine()
  const { user } = useAuth()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { href: paths.plans, label: 'Planos' },
    { href: paths.network, label: 'Rede credenciada' },
    { href: paths.business, label: 'Para empresas' },
    { href: paths.about, label: 'Sobre' },
  ]

  const area = user ? AREA_POR_PAPEL[user.role] : null
  const areaLink = area
    ? { href: `/${tenant.slug}/${area.path}`, label: area.label }
    : { href: paths.clientArea, label: 'Área do cliente' }
  const tel = telHref(tenant.phone)

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-[background-color,box-shadow,border-color] duration-300',
        scrolled
          ? 'border-border/70 bg-white/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/80'
          : 'border-transparent bg-white',
      )}
    >
      <nav aria-label="Principal" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link
          href={paths.home}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${tenant.name} — página inicial`}
        >
          <TenantLogo tenant={tenant} />
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {links.map(link => {
            const active = pathname === link.href
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-primary/10 text-primary' : 'text-foreground/75 hover:bg-accent hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden text-foreground/80 md:inline-flex" asChild>
            <Link href={areaLink.href}>
              <LogIn className="size-4" aria-hidden="true" />
              {areaLink.label}
            </Link>
          </Button>
          <Button className="hidden h-10 rounded-full px-5 font-semibold shadow-sm sm:inline-flex" asChild>
            <Link href={primaryCta.href}>
              Assinar agora
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86%] bg-white p-0 sm:max-w-sm">
              <SheetHeader className="border-b p-5">
                <SheetTitle asChild>
                  <div>
                    <TenantLogo tenant={tenant} />
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">Navegação do site</SheetDescription>
              </SheetHeader>
              <nav aria-label="Menu" className="flex flex-col gap-1 px-3 py-2">
                {[{ href: paths.home, label: 'Início' }, ...links].map(link => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={pathname === link.href ? 'page' : undefined}
                      className={cn(
                        'rounded-xl px-4 py-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        pathname === link.href ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-3 border-t p-5">
                <SheetClose asChild>
                  <Button size="lg" className="h-12 rounded-full text-base font-semibold" asChild>
                    <Link href={primaryCta.href}>
                      Assinar agora
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button size="lg" variant="outline" className="h-12 rounded-full text-base" asChild>
                    <Link href={areaLink.href}>
                      <LogIn className="size-4" aria-hidden="true" />
                      {areaLink.label}
                    </Link>
                  </Button>
                </SheetClose>
                {tel && phoneLabel && (
                  <a
                    href={tel}
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    {phoneLabel}
                  </a>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
