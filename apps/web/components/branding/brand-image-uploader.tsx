'use client'

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ImagePlus, Loader2, Replace, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { type LogoUploadResult, type TenantBranding } from '@annetec/contracts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatFileSize } from '@/lib/adapters/contratacao'
import { readableTextColor } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { ImageAdjustDialog } from './image-adjust-dialog'
import { BRAND_ACCEPT, ICON_GUIDANCE, LOGO_GUIDANCE, checkPickedImage, type BrandKind, type UploadOutcome } from './brand-upload'

/**
 * Envio de logo ou ícone do clube com adaptação automática.
 *
 * Dois modos, a mesma tela:
 *  - imediato (`upload` + `remove`): o arquivo vai para a API na hora e a marca
 *    devolvida é entregue a quem usa o componente (`onBranding`); serve ao
 *    admin do clube e ao console;
 *  - adiado (`file` + `onFileChange`): só guarda o arquivo escolhido e mostra
 *    uma prévia local; quem usa envia depois (cadastro de clube, que ainda
 *    não tem id para receber o arquivo).
 */

export type BrandingUrls = Pick<
  TenantBranding,
  'logoUrl' | 'logoLightUrl' | 'iconUrl' | 'iconSmallUrl' | 'appleTouchIconUrl' | 'faviconUrl' | 'iconSource'
>

export interface BrandImageUploaderProps {
  kind: BrandKind
  /** Marca atual (modo imediato) — de onde vêm as imagens já adaptadas. */
  branding?: BrandingUrls
  /** Modo imediato. */
  upload?: (file: File, onProgress: (percent: number) => void) => Promise<UploadOutcome<LogoUploadResult>>
  remove?: () => Promise<UploadOutcome<{ branding: TenantBranding }>>
  /** Marca nova depois de enviar ou remover. */
  onBranding?: (branding: TenantBranding) => void
  /** Cores sugeridas pela logo enviada; sem isto o botão "Usar estas cores" não aparece. */
  onUseColors?: (colors: string[]) => void
  /** Modo adiado. */
  file?: File | null
  onFileChange?: (file: File | null) => void
  /** Cor principal e nome do clube, para as prévias da carteirinha e da aba. */
  primaryColor: string
  clubName: string
  /** Modo adiado do ícone: há uma logo escolhida (o ícone seria gerado dela). */
  hasPendingLogo?: boolean
  disabled?: boolean
}

function useObjectUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])
  return url
}

export function BrandImageUploader({
  kind,
  branding,
  upload,
  remove,
  onBranding,
  onUseColors,
  file,
  onFileChange,
  primaryColor,
  clubName,
  hasPendingLogo,
  disabled,
}: BrandImageUploaderProps) {
  const deferred = !upload
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [suggested, setSuggested] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState<File | null>(null)

  const localUrl = useObjectUrl(deferred ? file : null)
  const busy = progress !== null || removing
  const locked = Boolean(disabled) || busy

  const isLogo = kind === 'logo'
  const guidance = isLogo ? LOGO_GUIDANCE : ICON_GUIDANCE
  const noun = isLogo ? 'logo' : 'ícone'
  const article = isLogo ? 'a' : 'o'

  // O que o quadro principal mostra: a prévia local, ou a imagem já adaptada.
  const currentUrl = deferred ? localUrl : isLogo ? branding?.logoUrl : branding?.iconUrl
  const hasImage = Boolean(currentUrl)
  // Ícone gerado da logo não se remove: remover só faz sentido para o enviado à parte.
  const canRemove = deferred ? Boolean(file) : isLogo ? hasImage : branding?.iconSource === 'upload'

  /** Escolheu ou soltou um arquivo: limpa o erro anterior e abre o editor "Ajustar imagem". */
  function handleFile(picked: File | undefined) {
    if (!picked || locked) return
    setError(null)
    const problem = checkPickedImage(picked)
    if (problem) {
      setError(problem)
      return
    }
    setPending(picked)
  }

  /** O editor devolveu o arquivo pronto (PNG/WebP do navegador): guarda (adiado) ou envia (imediato). */
  async function handleReady(ready: File) {
    setPending(null)
    setError(null)
    setWarnings([])
    if (deferred) {
      onFileChange?.(ready)
      return
    }
    setProgress(0)
    setSuggested([])
    const result = await upload(ready, setProgress)
    setProgress(null)
    if (!result.ok) {
      // O erro aparece uma vez só, aqui embaixo (sem toast repetindo).
      setError(result.error)
      return
    }
    setWarnings(result.data.warnings)
    setSuggested(isLogo ? result.data.suggestedColors : [])
    onBranding?.(result.data.branding)
    toast.success(isLogo ? 'Logo atualizada em todo o site' : 'Ícone atualizado')
  }

  async function handleRemove() {
    setConfirmOpen(false)
    setError(null)
    if (deferred) {
      onFileChange?.(null)
      return
    }
    if (!remove) return
    setRemoving(true)
    const result = await remove()
    setRemoving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setWarnings([])
    setSuggested([])
    onBranding?.(result.data.branding)
    toast.success(isLogo ? 'Logo removida' : 'Ícone enviado removido — voltamos a usar o gerado da logo')
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!locked) input.current?.click()
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    handleFile(event.dataTransfer.files?.[0])
  }

  const actionLabel = hasImage ? `Trocar ${noun}` : `Enviar ${noun}`
  const sourceBadge =
    !isLogo && !deferred && branding?.iconUrl
      ? branding.iconSource === 'upload'
        ? { label: 'Enviado', upload: true }
        : { label: 'Gerado da logo', upload: false }
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-foreground">{isLogo ? 'Logo' : 'Ícone'}</p>
        {!isLogo ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Opcional</span>
        ) : null}
        {sourceBadge ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-medium',
              sourceBadge.upload ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {sourceBadge.label}
          </span>
        ) : null}
      </div>

      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked || undefined}
        aria-label={`${actionLabel}: arraste um arquivo para cá ou pressione Enter para escolher`}
        aria-describedby={`${inputId}-help`}
        onClick={() => {
          if (!locked) input.current?.click()
        }}
        onKeyDown={onKeyDown}
        onDragOver={event => {
          event.preventDefault()
          if (!locked) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex min-h-28 items-center gap-4 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          !locked && 'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
          dragging && 'border-primary bg-primary/5',
          locked && 'cursor-not-allowed opacity-80',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:14px_14px]',
            isLogo ? 'h-20 w-32' : 'size-20',
          )}
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt={`${isLogo ? 'Logo' : 'Ícone'} atual de ${clubName.trim() || 'seu clube'}`}
              className="max-h-full max-w-full object-contain p-1.5"
            />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : hasImage ? (
              <Replace className="size-4" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {progress !== null
              ? `Enviando… ${progress}%`
              : removing
                ? `Removendo ${article} ${noun}…`
                : dragging
                  ? 'Solte para enviar'
                  : hasImage
                    ? 'Arraste outro arquivo ou clique para trocar'
                    : 'Arraste o arquivo ou clique para escolher'}
          </p>
          {progress !== null ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={`Enviando ${article} ${noun}`}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{guidance.detail}</p>
          )}
          {deferred && file ? (
            <p className="truncate text-xs text-muted-foreground">
              {file.name} · {formatFileSize(file.size)}
            </p>
          ) : null}
        </div>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={BRAND_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={locked}
          onChange={event => {
            const picked = event.target.files?.[0]
            event.target.value = ''
            handleFile(picked)
          }}
        />
      </div>

      <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
        {guidance.lead}
      </p>

      {canRemove ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() => (deferred ? void handleRemove() : setConfirmOpen(true))}
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
            {isLogo || deferred ? `Remover ${noun}` : 'Voltar ao ícone gerado da logo'}
          </Button>
        </div>
      ) : null}

      <div aria-live="polite" className="space-y-2 empty:hidden">
        {error ? (
          <p className="flex items-start gap-2 text-[13px] text-destructive" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {warnings.map(warning => (
          <p
            key={warning}
            className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {warning}
          </p>
        ))}
        {suggested.length > 0 && onUseColors ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
            <span className="flex items-center gap-1.5" aria-hidden>
              {suggested.map(color => (
                <span key={color} className="size-6 rounded-md border border-black/10" style={{ background: color }} />
              ))}
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-foreground">
              Cores encontradas na logo: <span className="font-mono">{suggested.map(c => c.toUpperCase()).join(' e ')}</span>
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onUseColors(suggested)
                setSuggested([])
              }}
            >
              Usar estas cores
            </Button>
          </div>
        ) : null}
      </div>

      <BrandAdaptationPreview
        kind={kind}
        branding={deferred ? undefined : branding}
        localUrl={deferred ? localUrl : null}
        hasPendingLogo={hasPendingLogo}
        primaryColor={primaryColor}
        clubName={clubName}
      />

      <ImageAdjustDialog
        file={pending}
        kind={kind}
        primaryColor={primaryColor}
        clubName={clubName}
        applyLabel={deferred ? 'Aplicar' : 'Aplicar e enviar'}
        onCancel={() => setPending(null)}
        onApply={ready => void handleReady(ready)}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isLogo ? 'Remover a logo do clube?' : 'Voltar ao ícone gerado da logo?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isLogo
                ? 'O site e os portais passam a mostrar o nome do clube no lugar da logo, e os ícones gerados dela também saem do ar.'
                : 'O símbolo enviado deixa de ser usado. O ícone do app, da aba e do menu recolhido volta a ser gerado a partir da logo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>
              {isLogo ? 'Remover logo' : 'Voltar ao gerado'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prévias da adaptação
// ---------------------------------------------------------------------------

function Thumb({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      {children}
      <figcaption className="text-center text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

function BrandAdaptationPreview({
  kind,
  branding,
  localUrl,
  hasPendingLogo,
  primaryColor,
  clubName,
}: {
  kind: BrandKind
  branding?: BrandingUrls
  localUrl: string | null
  hasPendingLogo?: boolean
  primaryColor: string
  clubName: string
}) {
  const name = clubName.trim() || 'Seu clube'
  const primary = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor) ? primaryColor : '#1e2a4a'
  const onPrimary = readableTextColor(primary)

  if (kind === 'logo') {
    const logo = localUrl ?? branding?.logoUrl
    if (!logo) return null
    const light = branding?.logoLightUrl
    return (
      <div className="space-y-2" role="group" aria-label="Como a logo fica">
        <p className="text-xs font-medium text-muted-foreground">Como fica</p>
        <div className="flex flex-wrap items-end gap-4">
          <Thumb label="Fundo claro (site, e-mails)">
            <span className="flex h-16 w-36 items-center justify-center rounded-lg border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="max-h-10 max-w-28 object-contain" />
            </span>
          </Thumb>
          <Thumb label="Carteirinha digital">
            <span
              className="flex h-16 w-36 items-center rounded-lg px-3 shadow-sm"
              style={{ background: primary, color: onPrimary }}
            >
              {light ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={light} alt="" className="max-h-9 max-w-24 object-contain" />
              ) : (
                <span className="flex h-10 items-center rounded-md bg-white px-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="" className="max-h-7 max-w-20 object-contain" />
                </span>
              )}
            </span>
          </Thumb>
        </div>
      </div>
    )
  }

  const icon = localUrl ?? branding?.iconUrl
  if (!icon) {
    return hasPendingLogo ? (
      <p className="text-xs text-muted-foreground">Sem ícone, o do app e o da aba serão gerados da logo escolhida.</p>
    ) : null
  }
  const favicon = localUrl ?? branding?.faviconUrl ?? icon
  const tile = localUrl ?? branding?.appleTouchIconUrl ?? icon
  return (
    <div className="space-y-2" role="group" aria-label="Como o ícone fica">
      <p className="text-xs font-medium text-muted-foreground">Como fica</p>
      <div className="flex flex-wrap items-end gap-5">
        <Thumb label="Aba do navegador">
          <span className="flex h-9 w-36 items-center gap-2 rounded-t-lg border border-b-0 bg-card px-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={favicon} alt="" className="size-4 object-contain" />
            <span className="truncate text-[11px] text-foreground">{name}</span>
          </span>
        </Thumb>
        <Thumb label="Ícone do app">
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-[22%] border bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile} alt="" className="size-full object-contain" />
          </span>
        </Thumb>
        <Thumb label="Menu recolhido">
          <span className="flex size-14 items-center justify-center rounded-lg border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="" className="size-8 object-contain" />
          </span>
        </Thumb>
      </div>
    </div>
  )
}
