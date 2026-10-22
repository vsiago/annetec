import Link from 'next/link'
import type { ReactNode } from 'react'
import { BadgeCheck, FileLock2, Lock, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Casca das páginas públicas B2B da ANNETEC (contratação e fatura): só a
 * marca, o selo de ambiente seguro e o rodapé de conformidade — sem a navbar
 * de marketing, para a pessoa não sair do fluxo. Some na impressão.
 */
/** `homeHref`: para onde o logo leva (padrão: o site); ex.: o painel do clube na fatura pública. */
export function B2BHeader({ action, homeHref, homeLabel }: { action?: ReactNode; homeHref?: string; homeLabel?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href={homeHref ?? '/'}
          className="flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={homeLabel ?? 'ANNETEC — voltar ao site'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/annetec.svg" alt="ANNETEC" className="h-7 w-auto sm:h-8" />
          <span className="hidden border-l pl-2 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:inline">
            Plataforma
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          {action}
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:flex dark:border-emerald-400/20 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Conexão criptografada e dados protegidos conforme a LGPD"
          >
            <Lock className="size-3.5" aria-hidden />
            Ambiente seguro
          </span>
        </div>
      </div>
    </header>
  )
}

export function B2BFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear()
  return (
    <footer className={cn('border-t bg-background/60 print:hidden', className)}>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-xs text-muted-foreground sm:grid-cols-3 sm:px-6">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden />
          Dados tratados conforme a LGPD (Lei 13.709/2018), só para análise cadastral, prevenção à lavagem de dinheiro e
          execução do contrato.
        </p>
        <p className="flex items-start gap-2">
          <FileLock2 className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden />
          Documentos guardados com acesso restrito à equipe de compliance e trilha de auditoria.
        </p>
        <p className="flex items-start gap-2">
          <BadgeCheck className="mt-px size-4 shrink-0 text-emerald-600" aria-hidden />© {year} ANNETEC · Plataforma de
          clubes de benefícios
        </p>
      </div>
    </footer>
  )
}

/** Lista curta de garantias exibida ao lado do resumo. */
export function TrustList({ className, items }: { className?: string; items?: string[] }) {
  const list = items ?? [
    'Nada é cobrado antes da aprovação cadastral',
    'Dados protegidos conforme a LGPD',
    'Contrato com aceite eletrônico registrado',
  ]
  return (
    <ul className={cn('space-y-2.5 px-1 text-[13px] text-muted-foreground', className)}>
      {list.map((item, index) => {
        const Icon = index === 0 ? Lock : index === 1 ? ShieldCheck : BadgeCheck
        return (
          <li key={item} className="flex items-center gap-2">
            <Icon className="size-4 shrink-0 text-emerald-600" aria-hidden />
            {item}
          </li>
        )
      })}
    </ul>
  )
}
