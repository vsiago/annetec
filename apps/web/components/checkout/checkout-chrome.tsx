'use client'

import Link from 'next/link'
import { Lock, ShieldCheck } from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'

/**
 * Casca do checkout: só a marca do clube e o selo de compra segura — sem
 * navbar de marketing, para a pessoa não sair do fluxo. Some na impressão
 * (boleto imprimível).
 */
export function CheckoutHeader() {
  const { tenant } = useTenant()
  if (!tenant) return null
  const logo = tenant.branding?.logoUrl || tenant.branding?.logoLightUrl

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={`/${tenant.slug}`}
          className="flex min-w-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${tenant.name} — voltar ao site`}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={tenant.name} className="h-8 w-auto max-w-[170px] object-contain" />
          ) : (
            <>
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary font-display text-base font-extrabold text-primary-foreground shadow-sm"
                aria-hidden
              >
                {tenant.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-display text-lg font-bold tracking-tight text-foreground">{tenant.name}</span>
            </>
          )}
        </Link>
        <div
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300"
          title="Conexão criptografada e dados protegidos"
        >
          <Lock className="size-3.5" aria-hidden />
          <span>Compra segura</span>
        </div>
      </div>
    </header>
  )
}

export function CheckoutFooter() {
  const { tenant } = useTenant()
  const year = new Date().getFullYear()

  return (
    // Com a barra fixa do mobile (wizard) na tela, o rodapé ganha folga para não ficar coberto.
    <footer className="border-t bg-background/60 print:hidden [body:has([data-checkout-bar])_&]:pb-24 lg:[body:has([data-checkout-bar])_&]:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden />
          Seus dados trafegam criptografados e são usados só para a sua assinatura, conforme a LGPD.
        </p>
        <p>
          © {year} {tenant?.name ?? ''}
        </p>
      </div>
    </footer>
  )
}
