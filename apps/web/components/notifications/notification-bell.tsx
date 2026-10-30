'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BadgeCheck,
  Bell,
  BellOff,
  CheckCheck,
  CircleDollarSign,
  FlaskConical,
  LoaderCircle,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { AppNotification } from '@annetec/contracts'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { amountLabel, initialsOf, isPayment, platformHeadline, relativeTime } from '@/lib/notifications/format'
import { cn } from '@/lib/utils'
import { TenantMark } from './notification-toast'
import { useNotifications, type StreamStatus } from './notifications-provider'

/**
 * Sino com o contador de não lidas e o painel das últimas notificações.
 * Três aparências para o mesmo componente: na topbar do painel do clube,
 * no header compacto do mobile e no rodapé da sidebar escura do backoffice.
 */

type Variant = 'topbar' | 'mobile' | 'sidebar' | 'sidebar-collapsed'

function badgeText(unread: number): string {
  return unread > 99 ? '99+' : String(unread)
}

function StatusDot({ status }: { status: StreamStatus }) {
  return (
    <span className="relative flex h-2 w-2">
      {status === 'live' && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          status === 'live' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-400' : 'bg-slate-400',
        )}
      />
    </span>
  )
}

function ItemIcon({ notification, platform }: { notification: AppNotification; platform: boolean }) {
  if (platform) {
    return (
      <span className="relative mt-0.5 h-8 w-8 shrink-0 self-start">
        <TenantMark notification={notification} size="sm" />
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-popover',
            isPayment(notification) ? 'bg-emerald-500' : 'bg-sky-500',
          )}
        />
      </span>
    )
  }
  if (isPayment(notification)) {
    const Icon = notification.kind === 'subscription_activated' ? BadgeCheck : CircleDollarSign
    return (
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
        <Icon className="h-[18px] w-[18px]" />
      </span>
    )
  }
  return (
    <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary">
      {initialsOf(notification.payload.personName)}
      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-popover bg-popover">
        <UserPlus className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    </span>
  )
}

function NotificationItem({
  notification,
  platform,
  now,
  onOpen,
}: {
  notification: AppNotification
  platform: boolean
  now: number
  onOpen: () => void
}) {
  const amount = amountLabel(notification)
  const title = platform ? (notification.tenant?.name ?? 'Annetec') : notification.title
  const subtitle = platform ? platformHeadline(notification) : notification.body
  const detail = platform && notification.kind !== 'platform_invoice_paid' ? notification.body : null

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group relative flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none',
          !notification.read && 'bg-primary/[0.035]',
        )}
      >
        <ItemIcon notification={notification} platform={platform} />
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn('truncate text-sm text-foreground', notification.read ? 'font-medium' : 'font-semibold')}>{title}</p>
            {amount && !platform && (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{amount}</span>
            )}
          </div>
          {subtitle && (
            <p
              className={cn(
                'truncate text-xs',
                platform && isPayment(notification) ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
              )}
            >
              {subtitle}
            </p>
          )}
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
            {relativeTime(notification.createdAt, now)}
            {notification.payload.test && (
              <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                Teste
              </span>
            )}
          </p>
        </div>
        {!notification.read && (
          <span aria-label="Não lida" className="absolute right-3 top-4 h-2 w-2 rounded-full bg-primary" />
        )}
      </button>
    </li>
  )
}

function TestTools() {
  const ctx = useNotifications()
  const [sending, setSending] = useState<'payment' | 'signup' | null>(null)
  if (!ctx?.demoTools) return null

  async function send(kind: 'payment' | 'signup') {
    setSending(kind)
    try {
      await ctx!.sendTest(kind)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="border-t border-dashed border-border bg-muted/30 px-4 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" />
        Ambiente de testes — enviar notificação de teste
      </p>
      <div className="flex gap-2">
        {(
          [
            ['payment', 'Pagamento'],
            ['signup', 'Cadastro'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            disabled={sending !== null}
            onClick={() => void send(kind)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {sending === kind ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className={cn('h-2 w-2 rounded-full', kind === 'payment' ? 'bg-emerald-500' : 'bg-primary')} />
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Panel() {
  const ctx = useNotifications()!
  const [now, setNow] = useState(() => ctx.serverNow())
  const platform = ctx.scope.kind === 'platform'

  useEffect(() => {
    setNow(ctx.serverNow())
    const timer = window.setInterval(() => setNow(ctx.serverNow()), 30_000)
    return () => window.clearInterval(timer)
  }, [ctx, ctx.items])

  const items = ctx.items.slice(0, 20)
  const statusLabel = ctx.status === 'live' ? 'Ao vivo' : ctx.status === 'connecting' ? 'Conectando…' : 'Reconectando…'

  return (
    <div className="flex max-h-[min(560px,calc(100vh-6rem))] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Notificações</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot status={ctx.status} />
            {statusLabel}
            <span aria-hidden>·</span>
            {ctx.unread === 0 ? 'tudo lido' : `${ctx.unread} não ${ctx.unread === 1 ? 'lida' : 'lidas'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => ctx.setSoundOn(!ctx.soundOn)}
          aria-pressed={ctx.soundOn}
          title={ctx.soundOn ? 'Som ligado — clique para silenciar' : 'Som desligado — clique para ligar'}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
            ctx.soundOn
              ? 'border-border bg-card text-foreground hover:bg-muted'
              : 'border-dashed border-border bg-muted/40 text-muted-foreground hover:bg-muted',
          )}
        >
          {ctx.soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {ctx.soundOn ? 'Som' : 'Mudo'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {ctx.loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-foreground">Nada por aqui ainda</p>
            <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
              {platform
                ? 'Pagamentos e cadastros de todos os clubes aparecem aqui na hora.'
                : 'Pagamentos e cadastros novos do clube aparecem aqui na hora, com aviso sonoro.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                platform={platform}
                now={now}
                onOpen={() => ctx.open(notification)}
              />
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Últimas {items.length}</span>
          <button
            type="button"
            disabled={ctx.unread === 0}
            onClick={() => void ctx.markAllRead()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas como lidas
          </button>
        </div>
      )}

      <TestTools />
    </div>
  )
}

export function NotificationBell({ variant = 'topbar' }: { variant?: Variant }) {
  const ctx = useNotifications()
  const [panelOpen, setPanelOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const request = ctx?.panelRequest

  // Pedido do provider: fechar vale para todos; abrir só para o sino visível.
  useEffect(() => {
    if (!request || request.seq === 0) return
    if (!request.open) setPanelOpen(false)
    else if (anchorRef.current?.offsetParent) setPanelOpen(true)
  }, [request])

  if (!ctx) return null
  const { unread, pulse } = ctx
  const label = unread > 0 ? `Notificações: ${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Notificações'

  const bellIcon = (
    <span key={pulse} className={cn('inline-flex', pulse > 0 && 'notif-bell-shake')}>
      <Bell className="h-5 w-5" />
    </span>
  )
  const badge =
    unread > 0 ? (
      <span
        className={cn(
          'absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white tabular-nums',
          // No menu escuro do console: vermelho mais fechado (texto branco com contraste ≥ 4,5:1).
          variant === 'sidebar' || variant === 'sidebar-collapsed' ? 'bg-[#D92D20] ring-2 ring-secondary' : 'bg-red-500 ring-2 ring-card',
          variant === 'sidebar' ? 'static ml-auto' : '-right-1 -top-1',
        )}
      >
        {badgeText(unread)}
      </span>
    ) : null

  /** Selo do sino no menu do console (mesmo desenho dos itens do menu). */
  const bellSeal = (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150 [&_svg]:size-[18px]',
        panelOpen
          ? 'bg-white text-primary'
          : 'bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10 group-hover/bell:bg-white/[0.13] group-hover/bell:text-white',
      )}
    >
      {bellIcon}
    </span>
  )

  let trigger: ReactNode
  if (variant === 'sidebar') {
    trigger = (
      <button
        type="button"
        aria-label={label}
        className={cn(
          'group/bell flex min-h-11 w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60',
          panelOpen ? 'bg-white/[0.09] text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white',
        )}
      >
        {bellSeal}
        <span className="truncate">Notificações</span>
        {badge}
      </button>
    )
  } else if (variant === 'sidebar-collapsed') {
    trigger = (
      <button
        type="button"
        aria-label={label}
        className={cn(
          'group/bell relative mx-auto flex size-11 items-center justify-center rounded-xl outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60',
          panelOpen ? 'bg-white/[0.09] text-white' : 'text-white/75 hover:bg-white/[0.06] hover:text-white',
        )}
      >
        {bellSeal}
        {badge && <span className="absolute -right-0.5 -top-0.5">{badge}</span>}
      </button>
    )
  } else if (variant === 'mobile') {
    trigger = (
      <button type="button" aria-label={label} className="relative p-2 text-muted-foreground hover:text-foreground">
        {bellIcon}
        {badge}
      </button>
    )
  } else {
    trigger = (
      <button
        type="button"
        aria-label={label}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          panelOpen && 'bg-card text-foreground ring-2 ring-primary/15',
        )}
      >
        {bellIcon}
        {badge}
      </button>
    )
  }

  const sidebar = variant === 'sidebar' || variant === 'sidebar-collapsed'
  return (
    <Popover open={panelOpen} onOpenChange={setPanelOpen}>
      <span ref={anchorRef} className={cn('relative', variant === 'sidebar' || variant === 'sidebar-collapsed' ? 'block' : 'inline-flex')}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </span>
      <PopoverContent
        align="end"
        side={sidebar ? 'right' : 'bottom'}
        sideOffset={sidebar ? 12 : 8}
        collisionPadding={8}
        className="w-[400px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl p-0 shadow-xl"
      >
        <Panel />
      </PopoverContent>
    </Popover>
  )
}
