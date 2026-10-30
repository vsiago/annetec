'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/admin-platform/ui/button'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { CARD_SURFACE } from '@/components/admin-platform/ui/tone'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ConsoleActionResult, StatusMeta } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Kit comum das telas do console da plataforma (compliance, faturamento e
 * caixa de saída): carregar uma server action, estados de carregamento e
 * erro, selo de status, confirmação com motivo e o portão de superadmin.
 * Fica em `billing/` por ser o maior consumidor; compliance e e-mails
 * importam daqui para as três telas falarem a mesma língua visual.
 */

const FALHA_INESPERADA = 'Não foi possível carregar os dados. Verifique a conexão e tente novamente.'

/**
 * Carrega o resultado de uma server action e guarda dado, erro e estado de
 * carregamento. Resposta atrasada de uma busca antiga (filtro trocado no
 * meio) é descartada — só a última chamada escreve no estado.
 * `reload({ silent: true })` atualiza sem voltar ao esqueleto.
 */
export function useConsoleData<T>(load: (() => Promise<ConsoleActionResult<T>>) | null, deps: readonly unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(load !== null)
  const sequence = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    const current = loadRef.current
    const id = ++sequence.current
    if (!current) {
      setLoading(false)
      return
    }
    if (!options?.silent) setLoading(true)
    try {
      const result = await current()
      if (id !== sequence.current) return
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      if (id !== sequence.current) return
      setError(FALHA_INESPERADA)
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // As dependências são as do chamador (filtros, página, versão).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

/**
 * Executa um comando e avisa por toast com a frase da própria API em caso de
 * erro. Devolve o dado (ou `null` se falhou) para a tela atualizar o estado.
 */
export async function runCommand<T>(
  promise: Promise<ConsoleActionResult<T>>,
  success?: string | ((data: T) => string),
): Promise<T | null> {
  try {
    const result = await promise
    if (!result.success) {
      const campos = result.fieldErrors ? Object.values(result.fieldErrors).filter(Boolean) : []
      toast.error(result.error, campos.length > 0 ? { description: campos.slice(0, 3).join(' · ') } : undefined)
      return null
    }
    if (success) toast.success(typeof success === 'function' ? success(result.data) : success)
    return result.data
  } catch {
    toast.error('Não foi possível concluir a operação. Verifique a conexão e tente novamente.')
    return null
  }
}

/** Papel da equipe logada. A API é quem autoriza; aqui só se decide o que mostrar. */
export function usePlatformRole() {
  const { user } = usePlatformAuth()
  return { isSuperadmin: user?.platformRole === 'superadmin', user }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Peças visuais
// ---------------------------------------------------------------------------

export function Pill({ meta, className, title }: { meta: StatusMeta; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  )
}

/**
 * Erro ao carregar. É um invólucro fino sobre o `ErrorState` do console: a
 * frase vinda da API é o título e o botão "Tentar de novo" aparece quando a
 * tela sabe recarregar. Passe `framed={false}` quando já estiver dentro de um
 * cartão (o padrão desenha o próprio cartão).
 */
export function LoadError({
  message,
  onRetry,
  className,
  framed = true,
}: {
  message: string
  onRetry?: () => void
  className?: string
  framed?: boolean
}) {
  return <ErrorState title={message} description={null} onRetry={onRetry} size="sm" framed={framed} className={className} />
}

/** Esqueleto de lista/tabela (carregando) para dentro de um cartão: linhas separadas por filete, sem moldura própria. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('flex flex-col', className)}>
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-[#EEF0F3] px-5 py-4 last:border-b-0">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Esqueleto de uma linha de KpiCard (carregando), no mesmo formato do cartão. */
export function KpiSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn('flex flex-col gap-3 px-6 py-5', CARD_SURFACE)}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-3.5 w-28" />
          </div>
          <Skeleton className="h-8 w-36 max-w-full" />
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
      ))}
    </div>
  )
}

/** Rótulo pequeno + valor, para fichas de detalhe. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="break-words text-sm text-foreground">{children ?? '—'}</div>
    </div>
  )
}

/**
 * Botão de ação exclusiva do superadmin. Para `platform_admin` fica visível e
 * desabilitado, com a explicação no tooltip — esconder confundiria quem
 * procura a ação que viu na demonstração.
 */
export function SuperadminOnly({
  isSuperadmin,
  children,
  reason = 'Somente o superadmin pode fazer isso.',
}: {
  isSuperadmin: boolean
  children: ReactNode
  reason?: string
}) {
  if (isSuperadmin) return <>{children}</>
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            {/* `inert`: sem foco por Tab nem Enter — o botão bloqueado não abre nada. */}
            <span inert className="pointer-events-none inline-flex opacity-50">{children}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Confirmação de ação (destrutiva ou não) com motivo opcional/obrigatório.
 * `onConfirm` devolve `true` quando deu certo — o diálogo só fecha nesse caso,
 * para o texto digitado não se perder num erro da API.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel: string
  destructive?: boolean
  /** Campo de motivo: `minLength` > 0 torna obrigatório. */
  reason?: { label: string; placeholder?: string; minLength?: number; defaultValue?: string }
  onConfirm: (reason: string) => Promise<boolean>
  children?: ReactNode
}) {
  const [text, setText] = useState(reason?.defaultValue ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setText(reason?.defaultValue ?? '')
      setBusy(false)
    }
    // Reinicia o texto a cada abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const min = reason?.minLength ?? 0
  const trimmed = text.trim()
  const invalid = !!reason && min > 0 && trimmed.length < min

  const confirm = async () => {
    if (invalid || busy) return
    setBusy(true)
    const ok = await onConfirm(trimmed)
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {reason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reason.label}</Label>
            <Textarea
              id="confirm-reason"
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder={reason.placeholder}
              rows={3}
              maxLength={2000}
            />
            {min > 0 && (
              <p className={cn('text-xs', invalid && trimmed.length > 0 ? 'text-[#B42318]' : 'text-muted-foreground')}>
                {invalid ? `Escreva pelo menos ${min} caracteres (${trimmed.length}/${min}).` : 'Fica registrado no histórico de alterações.'}
              </p>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={invalid || busy}
            className="gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Botão de recarregar, no cabeçalho das telas e no canto das seções (alvo de toque de 40px). */
export function RefreshButton({ loading, onClick, label = 'Atualizar' }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={loading} className="min-h-10 gap-2 rounded-[10px] px-4 font-semibold">
      <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
      {label}
    </Button>
  )
}
