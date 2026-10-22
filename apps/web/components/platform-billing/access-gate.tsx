'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, Lock, ShieldCheck, TriangleAlert } from 'lucide-react'
import { formatBRL, type TenantPlatformAccess } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { usePolling } from '@/components/contratar/hooks'
import { useTenant } from '@/contexts/tenant-context'
import { getTenantPlatformAccessAction } from '@/lib/actions/assinatura-annetec-api'
import { cn } from '@/lib/utils'

/**
 * Restrição do painel por inadimplência da assinatura ANNETEC (blueprint §0.8):
 * faixa amarela em atraso, laranja em somente leitura e tela de bloqueio
 * quando suspenso — exceto em "Minha assinatura", que é por onde se
 * regulariza. Inquilino não gerenciado (`managed:false`) ou falha na consulta
 * = nada muda no layout. Equipe da plataforma nunca é bloqueada (a API também
 * a deixa passar); só vê a faixa.
 */

const POLL_MS = 30_000
/** Disparado quando a fatura é paga dentro do painel: o banner recarrega na hora. */
export const PLATFORM_ACCESS_CHANGED_EVENT = 'annetec:platform-access-changed'

/** Página de pagamento da fatura dentro do painel (o "Regularizar agora" leva para cá). */
export function tenantInvoicePath(slug: string, chargeId: string): string {
  return `/${slug}/admin/assinatura/faturas/${encodeURIComponent(chargeId)}`
}

function isPlatformViewer(): boolean {
  try {
    const raw = document.cookie.split('; ').find(item => item.startsWith('annetec.user='))
    if (!raw) return false
    const user = JSON.parse(decodeURIComponent(raw.slice('annetec.user='.length))) as { scope?: string }
    return user.scope === 'platform'
  } catch {
    return false
  }
}

function useTenantPlatformAccess(slug: string) {
  const [access, setAccess] = useState<TenantPlatformAccess | null>(null)
  const load = useCallback(async () => {
    if (!slug) return
    try {
      const result = await getTenantPlatformAccessAction(slug)
      if (result.success) setAccess(result.data)
    } catch {
      // Falha na consulta nunca trava o painel.
    }
  }, [slug])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const reload = () => void load()
    window.addEventListener(PLATFORM_ACCESS_CHANGED_EVENT, reload)
    return () => window.removeEventListener(PLATFORM_ACCESS_CHANGED_EVENT, reload)
  }, [load])
  usePolling(load, POLL_MS, Boolean(slug))
  return access
}

function Banner({ access, slug, onSubscriptionPage }: { access: TenantPlatformAccess; slug: string; onSubscriptionPage: boolean }) {
  const blocked = access.level === 'blocked'
  const readOnly = access.level === 'read_only'
  const Icon = blocked ? Lock : readOnly ? TriangleAlert : AlertTriangle
  const title = blocked ? 'Painel suspenso' : readOnly ? 'Painel em modo somente leitura' : 'Fatura da plataforma em atraso'
  return (
    <div
      role="status"
      className={cn(
        'mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center',
        blocked && 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-50',
        readOnly && 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-50',
        !blocked && !readOnly && 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50',
      )}
    >
      <Icon className="hidden size-5 shrink-0 sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {/* A API monta a frase inteira (valor, atraso e próximo degrau): nada é acrescentado aqui. */}
        <p className="leading-relaxed">{access.message ?? 'Há pendências na assinatura da plataforma.'}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {access.payChargeId ? (
          <Button asChild size="sm" className="h-9 rounded-lg">
            <Link href={tenantInvoicePath(slug, access.payChargeId)}>Regularizar agora</Link>
          </Button>
        ) : null}
        {!onSubscriptionPage ? (
          <Button asChild size="sm" variant="outline" className="h-9 rounded-lg bg-background text-foreground">
            <Link href={`/${slug}/admin/assinatura`}>Minha assinatura</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function BlockedScreen({ access, slug }: { access: TenantPlatformAccess; slug: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-700" aria-hidden>
        <Lock className="size-8" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">Painel suspenso</h1>
      <p className="mt-2 text-muted-foreground">
        {access.message ?? 'A assinatura da plataforma do seu clube tem faturas vencidas.'}
      </p>
      {access.openAmount > 0 ? (
        <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-foreground">{formatBRL(access.openAmount)}</p>
      ) : null}
      <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {access.payChargeId ? (
          <Button asChild className="h-12 rounded-xl px-6 text-base font-semibold">
            <Link href={tenantInvoicePath(slug, access.payChargeId)}>Pagar e reativar</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-12 rounded-xl px-6">
          <Link href={`/${slug}/admin/assinatura`}>Assinatura da plataforma</Link>
        </Button>
      </div>
      <p className="mt-6 flex items-start gap-2 text-left text-[13px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Seus associados não são afetados: vitrine, carteirinhas, portal do associado e as cobranças deles seguem funcionando.
        O painel volta sozinho assim que o pagamento é confirmado.
      </p>
    </div>
  )
}

export function PlatformAccessGate({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const pathname = usePathname() ?? ''
  const slug = tenant?.slug ?? ''
  const access = useTenantPlatformAccess(slug)
  const [platformViewer, setPlatformViewer] = useState(false)

  useEffect(() => {
    setPlatformViewer(isPlatformViewer())
  }, [])

  if (!access || !access.managed) return <>{children}</>
  const flagged = access.level !== 'full' || access.status === 'past_due' || Boolean(access.message)
  if (!flagged) return <>{children}</>

  // "Minha assinatura" já mostra o aviso com o botão de pagar — sem faixa repetida.
  const onSubscriptionPage = pathname.startsWith(`/${slug}/admin/assinatura`)
  if (onSubscriptionPage) return <>{children}</>
  if (access.level === 'blocked' && !platformViewer) {
    return <BlockedScreen access={access} slug={slug} />
  }
  return (
    <>
      <Banner access={access} slug={slug} onSubscriptionPage={onSubscriptionPage} />
      {children}
    </>
  )
}
