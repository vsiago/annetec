'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { NOTIFICATION_STREAM_EVENT, type AppNotification, type NotificationList } from '@annetec/contracts'
import {
  listNotificationsAction,
  markNotificationsReadAction,
  sendTestNotificationAction,
} from '@/lib/actions/notificacoes-api'
import { isDemoMode } from '@/lib/demo-mode'
import { isPayment } from '@/lib/notifications/format'
import {
  playNotificationSound,
  readSoundPreference,
  unlockAudioOnFirstGesture,
  writeSoundPreference,
  type NotificationSound,
} from '@/lib/notifications/sounds'
import { notificationStreamPath, type NotificationsScope } from '@/lib/notifications/types'
import { PlatformNotificationToast, SummaryToast, TenantNotificationToast } from './notification-toast'

/**
 * Notificações em tempo real de uma área (painel do clube ou backoffice).
 *
 * Fluxo: busca as últimas 20 (com o contador de não lidas e o CURSOR do
 * servidor) → abre um EventSource no route handler do Next (same-origin: o
 * cookie httpOnly vai junto e vira Bearer lá) a partir desse cursor. A API
 * fecha a resposta a cada ~25 s e o navegador reconecta sozinho com
 * `Last-Event-ID`; nada se perde e nada se repete — ids já vistos não geram
 * toast nem som de novo.
 *
 * Toast + som só para o que é NOVO de verdade (criado há menos de 2 min no
 * relógio do servidor): reconectar depois de horas não dispara uma cascata.
 * Mais de 3 em poucos segundos viram um aviso-resumo.
 */

export type StreamStatus = 'connecting' | 'live' | 'offline'

interface NotificationsContextValue {
  scope: NotificationsScope
  items: AppNotification[]
  unread: number
  loading: boolean
  status: StreamStatus
  soundOn: boolean
  setSoundOn: (on: boolean) => void
  demoTools: boolean
  /**
   * Pedido para abrir/fechar o painel do sino (aviso-resumo, clique num item).
   * Cada sino guarda o próprio estado — há dois na tela (topbar e header do
   * mobile, um deles escondido) — e só o VISÍVEL atende a um pedido de abrir.
   */
  panelRequest: { open: boolean; seq: number }
  requestPanel: (open: boolean) => void
  /** Bate no sino a cada chegada (a animação usa como `key`). */
  pulse: number
  /** Agora, no relógio do servidor (o tempo relativo "há 2 min" não depende do relógio da máquina). */
  serverNow: () => number
  open: (notification: AppNotification) => void
  markAllRead: () => Promise<void>
  sendTest: (kind: 'payment' | 'signup') => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function useNotifications(): NotificationsContextValue | null {
  return useContext(NotificationsContext)
}

const MAX_ITEMS = 30
const FRESH_MS = 2 * 60 * 1000
const TOAST_DURATION_MS = 8000
const TOAST_BURST = { max: 3, windowMs: 4000 }
const SUMMARY_TOAST_ID = 'notificacoes-resumo'
const LAST_SOUND_KEY = 'annetec.notificacoes.ultimo-som'

function soundFor(scope: NotificationsScope, notification: AppNotification): NotificationSound {
  const payment = isPayment(notification)
  if (scope.kind === 'platform') return payment ? 'platform-payment' : 'platform-signup'
  return payment ? 'tenant-payment' : 'tenant-signup'
}

/** Duas abas abertas recebem o mesmo evento: só a primeira toca o som. */
function claimSound(id: string): boolean {
  try {
    if (window.localStorage.getItem(LAST_SOUND_KEY) === id) return false
    window.localStorage.setItem(LAST_SOUND_KEY, id)
  } catch {
    /* sem armazenamento: toca mesmo assim */
  }
  return true
}

const TITLE_PREFIX = /^\(\d+\+?\)\s/

export function NotificationsProvider({
  scope,
  children,
  onNotification,
}: {
  scope: NotificationsScope
  children: ReactNode
  /** Efeito colateral por chegada (ex.: rebuscar a lista de usuários num cadastro novo). */
  onNotification?: (notification: AppNotification) => void
}) {
  const router = useRouter()
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [soundOn, setSoundOnState] = useState(true)
  const [demoTools, setDemoTools] = useState(false)
  const [panelRequest, setPanelRequest] = useState({ open: false, seq: 0 })
  const requestPanel = useCallback((open: boolean) => setPanelRequest(prev => ({ open, seq: prev.seq + 1 })), [])
  const [pulse, setPulse] = useState(0)

  const seen = useRef(new Set<string>())
  const offsetRef = useRef(0)
  const soundOnRef = useRef(true)
  const lastSoundAt = useRef(0)
  const recentToasts = useRef<number[]>([])
  const summaryCount = useRef(0)
  const onNotificationRef = useRef(onNotification)
  onNotificationRef.current = onNotification

  const scopeKey = scope.kind === 'tenant' ? `tenant:${scope.slug}` : 'platform'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableScope = useMemo(() => scope, [scopeKey])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  useEffect(() => {
    const initial = readSoundPreference()
    soundOnRef.current = initial
    setSoundOnState(initial)
    return unlockAudioOnFirstGesture()
  }, [])

  const setSoundOn = useCallback((on: boolean) => {
    soundOnRef.current = on
    setSoundOnState(on)
    writeSoundPreference(on)
    // Ligar o som é um gesto: aproveita para tocar uma amostra curta.
    if (on) playNotificationSound(stableScope.kind === 'platform' ? 'platform-payment' : 'tenant-payment')
  }, [stableScope])

  const markRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      setItems(prev => prev.map(item => (ids.includes(item.id) ? { ...item, read: true } : item)))
      void markNotificationsReadAction(stableScope, ids).then(result => {
        if (result.success) setUnread(result.data.unread)
      })
    },
    [stableScope],
  )

  const open = useCallback(
    (notification: AppNotification) => {
      toast.dismiss(notification.id)
      requestPanel(false)
      if (!notification.read) {
        setUnread(count => Math.max(0, count - 1))
        markRead([notification.id])
      }
      if (notification.link) router.push(notification.link)
    },
    [markRead, router, requestPanel],
  )

  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(item => ({ ...item, read: true })))
    setUnread(0)
    const result = await markNotificationsReadAction(stableScope)
    if (result.success) setUnread(result.data.unread)
    else toast.error(result.error)
  }, [stableScope])

  const sendTest = useCallback(
    async (kind: 'payment' | 'signup') => {
      const result = await sendTestNotificationAction(stableScope, kind)
      if (!result.success) toast.error(result.error)
    },
    [stableScope],
  )

  const showToast = useCallback(
    (notification: AppNotification) => {
      const now = Date.now()
      recentToasts.current = recentToasts.current.filter(at => now - at < TOAST_BURST.windowMs)
      if (recentToasts.current.length >= TOAST_BURST.max) {
        summaryCount.current += 1
        const count = summaryCount.current
        toast.custom(
          id => (
            <SummaryToast
              count={count}
              onOpen={() => {
                toast.dismiss(id)
                requestPanel(true)
              }}
              onClose={() => toast.dismiss(id)}
            />
          ),
          {
            id: SUMMARY_TOAST_ID,
            duration: TOAST_DURATION_MS,
            onDismiss: () => (summaryCount.current = 0),
            onAutoClose: () => (summaryCount.current = 0),
          },
        )
        return
      }
      recentToasts.current.push(now)

      const Toast = stableScope.kind === 'platform' ? PlatformNotificationToast : TenantNotificationToast
      toast.custom(
        id => <Toast notification={notification} onOpen={() => open(notification)} onClose={() => toast.dismiss(id)} />,
        { id: notification.id, duration: stableScope.kind === 'platform' ? 6000 : TOAST_DURATION_MS },
      )

      if (soundOnRef.current && now - lastSoundAt.current > 700 && claimSound(notification.id)) {
        if (playNotificationSound(soundFor(stableScope, notification))) lastSoundAt.current = now
      }
    },
    [open, stableScope, requestPanel],
  )

  const receive = useCallback(
    (notification: AppNotification) => {
      if (seen.current.has(notification.id)) return
      seen.current.add(notification.id)
      setItems(prev => [notification, ...prev.filter(item => item.id !== notification.id)].slice(0, MAX_ITEMS))
      if (!notification.read) setUnread(count => count + 1)
      setPulse(value => value + 1)
      onNotificationRef.current?.(notification)

      const age = serverNow() - Date.parse(notification.createdAt)
      if (age < FRESH_MS) showToast(notification)
    },
    [serverNow, showToast],
  )
  // O EventSource vive enquanto o escopo não muda; o handler mais recente entra por ref.
  const receiveRef = useRef(receive)
  receiveRef.current = receive

  // Carga inicial + EventSource (com reabertura manual se o servidor recusar).
  useEffect(() => {
    let cancelled = false
    let source: EventSource | null = null
    let retryTimer: number | undefined
    let backoff = 15_000

    const applyList = (list: NotificationList) => {
      offsetRef.current = Date.parse(list.cursor) - Date.now()
      for (const item of list.items) seen.current.add(item.id)
      setItems(prev => {
        const merged = new Map<string, AppNotification>()
        for (const item of [...list.items, ...prev]) if (!merged.has(item.id)) merged.set(item.id, item)
        return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ITEMS)
      })
      setUnread(list.unread)
      setDemoTools(isDemoMode({ demoToolsEnabled: list.demoToolsEnabled }))
    }

    const connect = async () => {
      setStatus('connecting')
      const result = await listNotificationsAction(stableScope, 20)
      if (cancelled) return
      setLoading(false)
      if (!result.success) {
        setStatus('offline')
        // Sessão caiu: quem cuida é o guard da área; aqui só para de tentar.
        if (result.unauthorized) return
        retryTimer = window.setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 120_000)
        return
      }
      applyList(result.data)

      const url = `${notificationStreamPath(stableScope)}?after=${encodeURIComponent(result.data.cursor)}`
      source = new EventSource(url)
      source.addEventListener('open', () => {
        backoff = 15_000
        setStatus('live')
      })
      source.addEventListener(NOTIFICATION_STREAM_EVENT, event => {
        try {
          receiveRef.current(JSON.parse((event as MessageEvent<string>).data) as AppNotification)
        } catch {
          /* evento malformado: ignora */
        }
      })
      source.addEventListener('error', () => {
        if (!source) return
        // CONNECTING = o navegador já está reconectando (fim normal dos ~25 s).
        if (source.readyState === EventSource.CONNECTING) return
        // CLOSED = o servidor recusou (401/403/5xx): recomeça do zero mais tarde.
        source.close()
        source = null
        setStatus('offline')
        retryTimer = window.setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 120_000)
      })
    }

    void connect()
    return () => {
      cancelled = true
      source?.close()
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [stableScope])

  // Título da aba: "(2) MapCard2" enquanto houver não lidas e a aba estiver em segundo plano.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, '')
      const next = document.visibilityState === 'hidden' && unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
      if (next !== document.title) document.title = next
    }
    apply()
    document.addEventListener('visibilitychange', apply)
    return () => {
      document.removeEventListener('visibilitychange', apply)
      document.title = document.title.replace(TITLE_PREFIX, '')
    }
  }, [unread])

  const value = useMemo<NotificationsContextValue>(
    () => ({
      scope: stableScope,
      items,
      unread,
      loading,
      status,
      soundOn,
      setSoundOn,
      demoTools,
      panelRequest,
      requestPanel,
      pulse,
      serverNow,
      open,
      markAllRead,
      sendTest,
    }),
    [stableScope, items, unread, loading, status, soundOn, setSoundOn, demoTools, panelRequest, requestPanel, pulse, serverNow, open, markAllRead, sendTest],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
