'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  TONE_BADGE_CLASS,
  TONE_ICON_CLASS,
  TONE_PANEL_CLASS,
  type StatusTone,
} from '@/lib/adapters/cliente-assinatura'

/** Selo de status com o tom do adapter (assinatura, carteirinha ou fatura). */
export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('rounded-full px-2.5 font-semibold', TONE_BADGE_CLASS[tone], className)}>
      {children}
    </Badge>
  )
}

/** Aviso com ícone, título, texto e (opcional) um botão que leva a outra tela. */
export function StatusNotice({
  tone,
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  className,
  children,
}: {
  tone: StatusTone
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  actionHref?: string | null
  actionLabel?: string | null
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center', TONE_PANEL_CLASS[tone], className)}
    >
      <div className="flex flex-1 items-start gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE_ICON_CLASS[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold leading-snug">{title}</p>
          {description && <div className="text-sm opacity-90 leading-relaxed">{description}</div>}
          {children}
        </div>
      </div>
      {actionHref && actionLabel && (
        <Button
          asChild
          className={cn(
            'w-full shrink-0 sm:w-auto',
            tone === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
            tone === 'warning' && 'bg-amber-600 text-white hover:bg-amber-700',
          )}
          variant={tone === 'neutral' || tone === 'success' ? 'outline' : 'default'}
        >
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  )
}

/** Falha ao ler dados do portal: mostra a mensagem específica da server action e um "tentar de novo". */
export function LoadErrorNotice({
  title = 'Não conseguimos carregar seus dados agora',
  message,
  onRetry,
  retrying,
  className,
}: {
  title?: string
  message: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 sm:flex-row sm:items-center dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        className,
      )}
    >
      <div className="flex flex-1 items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="w-full sm:w-auto">
          <RefreshCw className={cn(retrying && 'animate-spin')} />
          Tentar novamente
        </Button>
      )}
    </div>
  )
}
