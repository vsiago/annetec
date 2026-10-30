'use client'

import type { CSSProperties } from 'react'
import { ArrowRight, BadgeCheck, BadgePercent, BellRing, CircleDollarSign, CircleX, ClipboardCheck, UserPlus, X, type LucideIcon } from 'lucide-react'
import { NOTIFICATION_KIND_LABELS, NOTIFICATION_SIGNUP_VIA_LABELS, type AppNotification } from '@annetec/contracts'
import { amountLabel, initialsOf, isPayment, platformHeadline } from '@/lib/notifications/format'
import { cn } from '@/lib/utils'

/**
 * Toasts das notificações (renderizados pelo `<Toaster />` da raiz via
 * `toast.custom`). Dois conceitos:
 *
 *  - PAINEL DO CLUBE (`TenantNotificationToast`): cartão rico. Dinheiro
 *    entrando é VERDE (fundo suave, moeda, valor grande); pessoa chegando usa
 *    a COR DA MARCA do clube (`--primary`, aplicada no :root pelo tema do
 *    inquilino), com avatar de iniciais.
 *  - BACKOFFICE (`PlatformNotificationToast`): uma linha, sem cerimônia —
 *    marca do clube · o que aconteceu · "Ver detalhes".
 *
 * A pausa ao passar o mouse e o empilhamento são do próprio Sonner.
 */

interface ToastProps {
  notification: AppNotification
  onOpen: () => void
  onClose: () => void
}

function TestTag({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        dark ? 'bg-white/15 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
      )}
    >
      Teste
    </span>
  )
}

function CloseButton({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Fechar notificação"
      className={cn(
        'rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10',
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

export function TenantNotificationToast({ notification, onOpen, onClose }: ToastProps) {
  const payment = isPayment(notification)
  const amount = amountLabel(notification)
  const { payload } = notification
  const kicker = NOTIFICATION_KIND_LABELS[notification.kind]

  if (payment) {
    const Icon = notification.kind === 'subscription_activated' ? BadgeCheck : CircleDollarSign
    return (
      <div
        role="status"
        className="relative flex w-full overflow-hidden rounded-2xl border sm:w-[var(--width)] border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-white shadow-[0_12px_32px_-12px_rgba(5,150,105,0.35)] dark:border-emerald-800/70 dark:from-emerald-950/70 dark:via-card dark:to-card"
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
        <div className="flex w-full gap-3.5 py-4 pl-5 pr-3">
          <div className="relative mt-0.5 h-11 w-11 shrink-0">
            <span aria-hidden className="notif-ring absolute inset-0 rounded-full bg-emerald-400/50" />
            <span className="notif-pop relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_0_4px_rgba(16,185,129,0.14)]">
              <Icon className="h-6 w-6" strokeWidth={2.2} />
            </span>
          </div>

          <div className="notif-rise min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
                {kicker}
              </p>
              <CloseButton onClose={onClose} className="-mr-1 -mt-1" />
            </div>
            {amount && (
              <p className="text-[28px] font-bold leading-tight tracking-tight text-emerald-950 tabular-nums dark:text-emerald-50">
                {amount}
              </p>
            )}
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{payload.personName ?? notification.body}</p>
            {(payload.planName || payload.methodLabel) && (
              <p className="truncate text-xs text-muted-foreground">
                {[payload.planName, payload.methodLabel].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                Ver detalhes
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              {payload.test && <TestTag />}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Cadastro: cor da marca do clube.
  const brandSurface: CSSProperties = {
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 9%, var(--card)) 0%, var(--card) 70%)',
    borderColor: 'color-mix(in srgb, var(--primary) 28%, transparent)',
    boxShadow: '0 12px 32px -12px color-mix(in srgb, var(--primary) 45%, transparent)',
  }
  const via = payload.via ? NOTIFICATION_SIGNUP_VIA_LABELS[payload.via] : null
  return (
    <div role="status" className="relative flex w-full overflow-hidden rounded-2xl border sm:w-[var(--width)]" style={brandSurface}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex w-full gap-3.5 py-4 pl-5 pr-3">
        <div className="relative mt-0.5 h-11 w-11 shrink-0">
          <span aria-hidden className="notif-ring absolute inset-0 rounded-full bg-primary/40" />
          <span className="notif-pop relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_16%,transparent)]">
            {initialsOf(payload.personName)}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-card text-primary">
            <UserPlus className="h-3 w-3" strokeWidth={2.5} />
          </span>
        </div>

        <div className="notif-rise min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{notification.title}</p>
            <CloseButton onClose={onClose} className="-mr-1 -mt-1" />
          </div>
          <p className="truncate text-lg font-bold leading-snug text-foreground">{payload.personName ?? notification.body}</p>
          {(payload.planName || via) && (
            <p className="truncate text-xs text-muted-foreground">{[payload.planName, via].filter(Boolean).join(' · ')}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Ver detalhes
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            {payload.test && <TestTag />}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Marca do clube: logo, ou iniciais na cor primária do clube. */
export function TenantMark({ notification, size = 'md' }: { notification: AppNotification; size?: 'sm' | 'md' }) {
  const tenant = notification.tenant
  const box = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-9 w-9 text-xs'
  if (tenant?.logoUrl) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white', box)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tenant.logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
      </span>
    )
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg font-bold text-white', box)}
      style={{ background: tenant?.primaryColor ?? '#1e2a4a' }}
    >
      {initialsOf(tenant?.name ?? 'Annetec')}
    </span>
  )
}

export function PlatformNotificationToast({ notification, onOpen, onClose }: ToastProps) {
  const payment = isPayment(notification)
  return (
    <div
      role="status"
      className="flex w-full items-center gap-2.5 rounded-xl border sm:w-[var(--width)] border-border bg-card py-2 pl-2 pr-1.5 shadow-[0_10px_28px_-12px_rgba(15,23,42,0.35)]"
    >
      <span className="notif-pop relative h-8 w-8 shrink-0">
        <TenantMark notification={notification} size="sm" />
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-card',
            payment ? 'bg-emerald-500' : 'bg-sky-500',
          )}
        />
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-semibold text-foreground">{notification.tenant?.name ?? 'Annetec'}</span>
        <span className="text-muted-foreground"> · </span>
        <span className={cn('font-medium tabular-nums', payment ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>
          {platformHeadline(notification)}
        </span>
      </p>
      {notification.payload.test && (
        <span className="shrink-0">
          <TestTag />
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver detalhes
      </button>
      <CloseButton onClose={onClose} className="shrink-0" />
    </div>
  )
}

/** Muitas de uma vez (reconexão, lote): um aviso só, em vez de uma cascata de toasts. */
export function SummaryToast({ count, onOpen, onClose }: { count: number; onOpen: () => void; onClose: () => void }) {
  return (
    <div role="status" className="flex w-full items-center gap-3 rounded-xl border sm:w-[var(--width)] border-border bg-card py-2.5 pl-3 pr-2 shadow-lg">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BellRing className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
        +{count} {count === 1 ? 'notificação nova' : 'notificações novas'}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
      >
        Ver todas
      </button>
      <CloseButton onClose={onClose} />
    </div>
  )
}

/** Ícone e cor de uma notificação de vendas (pedido de desconto e decisão). */
export function salesNotificationLook(notification: Pick<AppNotification, 'kind'>): { icon: LucideIcon; className: string } {
  if (notification.kind === 'sales_discount_approved') return { icon: BadgeCheck, className: 'bg-[#ECFDF3] text-[#067647]' }
  if (notification.kind === 'sales_discount_rejected') return { icon: CircleX, className: 'bg-[#FEF3F2] text-[#B42318]' }
  if (notification.kind === 'onboarding_submitted') return { icon: ClipboardCheck, className: 'bg-[#EEF4FF] text-[#1E2A4A]' }
  return { icon: BadgePercent, className: 'bg-[#FFFAEB] text-[#B54708]' }
}

/** Vendas da plataforma: uma linha com o ícone da decisão, o título e "Ver detalhes". */
export function SalesNotificationToast({ notification, onOpen, onClose }: ToastProps) {
  const look = salesNotificationLook(notification)
  const Icon = look.icon
  return (
    <div
      role="status"
      className="flex w-full items-center gap-2.5 rounded-xl border sm:w-[var(--width)] border-border bg-card py-2 pl-2 pr-1.5 shadow-[0_10px_28px_-12px_rgba(15,23,42,0.35)]"
    >
      <span className={cn('notif-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', look.className)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-[13px]">
        <span className="block truncate font-semibold text-foreground">{notification.title}</span>
        {notification.body ? <span className="block truncate text-xs text-muted-foreground">{notification.body}</span> : null}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-secondary transition-colors hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver detalhes
      </button>
      <CloseButton onClose={onClose} className="shrink-0" />
    </div>
  )
}
