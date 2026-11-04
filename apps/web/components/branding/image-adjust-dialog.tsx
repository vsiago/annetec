'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Loader2, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { formatFileSize } from '@/lib/adapters/contratacao'
import { readableTextColor } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  ImagePrepError,
  SMALL_IMAGE_WARNING,
  canSendOriginal,
  encodeOutput,
  encodedToFile,
  isTooSmall,
  loadSource,
  releaseCanvas,
  renderOutput,
  silhouetteInfo,
  whiteSilhouette,
  type Box,
  type BrandKind,
  type PreparedSource,
} from './image-prep'

/**
 * Editor "Ajustar imagem": recorte (arrastar, alças, zoom, proporção), recorte
 * automático das bordas, tirar o fundo branco e prévias do resultado final,
 * calculadas no navegador. Nunca recusa a imagem por tamanho — reduz e adapta.
 */

type Aspect = 'free' | 'wide' | 'square'
const ASPECT_RATIO: Record<Aspect, number | null> = { free: null, wide: 3, square: 1 }
const ASPECT_LABEL: Record<Aspect, string> = { free: 'Livre', wide: 'Horizontal', square: 'Quadrado' }
const MIN_BOX = 16

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Array<{ id: Handle; className: string; cursor: string }> = [
  { id: 'nw', className: '-left-2 -top-2', cursor: 'nwse-resize' },
  { id: 'n', className: 'left-1/2 -top-2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: '-right-2 -top-2', cursor: 'nesw-resize' },
  { id: 'e', className: '-right-2 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: '-bottom-2 -right-2', cursor: 'nwse-resize' },
  { id: 's', className: 'left-1/2 -bottom-2 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: '-bottom-2 -left-2', cursor: 'nesw-resize' },
  { id: 'w', className: '-left-2 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Maior caixa com a proporção pedida que contém a atual (e cabe na imagem), centrada nela. */
function fitAspect(box: Box, ratio: number | null, W: number, H: number): Box {
  if (!ratio) return box
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let w = Math.max(box.w, box.h * ratio)
  let h = w / ratio
  if (h > H) {
    h = H
    w = h * ratio
  }
  if (w > W) {
    w = W
    h = w / ratio
  }
  return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), w, h }
}

function initialBox(source: PreparedSource, kind: BrandKind, ratio: number | null, autoTrim: boolean): Box {
  const W = source.width
  const H = source.height
  let box: Box = autoTrim && source.trimBox ? source.trimBox : { x: 0, y: 0, w: W, h: H }
  if (kind === 'icon') {
    // Símbolo centrado, com um respiro, num quadrado dentro do quadrado de trabalho.
    const side = Math.min(Math.max(W, H), Math.max(box.w, box.h) * (autoTrim && source.trimBox ? 1.12 : 1))
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    return { x: clamp(cx - side / 2, 0, W - side), y: clamp(cy - side / 2, 0, H - side), w: side, h: side }
  }
  box = fitAspect(box, ratio, W, H)
  return box
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export interface ImageAdjustDialogProps {
  /** Arquivo escolhido; `null` = fechado. */
  file: File | null
  kind: BrandKind
  primaryColor: string
  clubName: string
  /** Texto do botão principal ("Aplicar e enviar" ou "Aplicar"). */
  applyLabel: string
  onCancel: () => void
  /** Recebe o arquivo já processado (PNG/WebP) — ou o original, no último recurso. */
  onApply: (file: File) => void
}

export function ImageAdjustDialog(props: ImageAdjustDialogProps) {
  const { file } = props
  return (
    <DialogPrimitive.Root open={Boolean(file)} onOpenChange={open => !open && props.onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-[121] flex flex-col overflow-hidden bg-background shadow-2xl outline-none',
            'inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(92vh,820px)] md:w-[min(96vw,1100px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border',
          )}
        >
          {file ? <Editor key={`${file.name}-${file.size}-${file.lastModified}-${props.kind}`} {...props} file={file} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface PreviewState {
  url: string
  monoUrl: string
  /** Carteirinha usa a silhueta branca (logo de traço); senão, a logo colorida sobre plaquinha branca. */
  silhouette: boolean
}

function Editor({ file, kind, primaryColor, clubName, applyLabel, onCancel, onApply }: ImageAdjustDialogProps & { file: File }) {
  const isLogo = kind === 'logo'
  const [source, setSource] = useState<PreparedSource | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [aspect, setAspect] = useState<Aspect>(isLogo ? 'free' : 'square')
  const [autoTrim, setAutoTrim] = useState(true)
  const [removeWhite, setRemoveWhite] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [info, setInfo] = useState<{ width: number; height: number; bytes: number; type: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const sourceRef = useRef<PreparedSource | null>(null)
  const applyingRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Decodifica o arquivo (e libera tudo ao fechar).
  useEffect(() => {
    let cancelled = false
    loadSource(file, kind).then(
      loaded => {
        if (cancelled) {
          loaded.close()
          return
        }
        sourceRef.current = loaded
        setSource(loaded)
        setBox(initialBox(loaded, kind, ASPECT_RATIO[isLogo ? 'free' : 'square'], true))
      },
      error => {
        if (!cancelled) setLoadError(error instanceof ImagePrepError ? error.message : 'Não conseguimos abrir esta imagem.')
      },
    )
    return () => {
      cancelled = true
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [file, kind, isLogo])

  // Prévia (rápida) e tamanho final (codificação completa), com debounce.
  const run = useRef(0)
  useEffect(() => {
    if (!source || !box) return
    const token = ++run.current
    setInfo(null)
    const timer = window.setTimeout(async () => {
      let small: HTMLCanvasElement | null = null
      let mono: HTMLCanvasElement | null = null
      try {
        small = renderOutput(source, { box, kind, removeWhite, maxSide: 480 })
        const silhouette = isLogo && silhouetteInfo(small).useSilhouette
        mono = silhouette ? whiteSilhouette(small) : null
        if (token !== run.current) return
        setPreview({
          url: small.toDataURL('image/png'),
          monoUrl: mono ? mono.toDataURL('image/png') : '',
          silhouette,
        })
      } catch {
        return
      } finally {
        releaseCanvas(small)
        releaseCanvas(mono)
      }
      let full: HTMLCanvasElement | null = null
      try {
        full = renderOutput(source, { box, kind, removeWhite })
        const encoded = await encodeOutput(full, kind)
        if (token === run.current) {
          setInfo({ width: encoded.width, height: encoded.height, bytes: encoded.blob.size, type: encoded.type })
        }
      } catch {
        // o aviso aparece ao aplicar
      } finally {
        releaseCanvas(full)
      }
    }, 200)
    return () => {
      window.clearTimeout(timer)
      run.current++ // invalida o que ainda estiver em andamento (ex.: editor fechado)
    }
  }, [source, box, kind, removeWhite, isLogo])

  async function apply() {
    if (!source || !box || applyingRef.current) return
    applyingRef.current = true
    setApplying(true)
    setApplyError(null)
    let canvas: HTMLCanvasElement | null = null
    try {
      canvas = renderOutput(source, { box, kind, removeWhite })
      const encoded = await encodeOutput(canvas, kind)
      // Fechou o editor (Esc/Cancelar) enquanto preparava: não envia nada.
      if (mountedRef.current) onApply(encodedToFile(encoded, kind))
    } catch (error) {
      applyingRef.current = false
      if (mountedRef.current) {
        setApplyError(error instanceof Error ? error.message : 'Não foi possível preparar a imagem.')
        setApplying(false)
      }
    } finally {
      releaseCanvas(canvas)
    }
  }

  function changeAspect(next: Aspect) {
    setAspect(next)
    setBox(current => (current && source ? fitAspect(current, ASPECT_RATIO[next], source.width, source.height) : current))
  }

  function changeAutoTrim(next: boolean) {
    setAutoTrim(next)
    if (source) setBox(initialBox(source, kind, ASPECT_RATIO[aspect], next))
  }

  const small = box ? isTooSmall(box) : false

  return (
    <>
      <header className="flex items-start gap-3 border-b px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-base font-semibold text-foreground">Ajustar imagem</DialogPrimitive.Title>
          <p className="text-xs text-muted-foreground">
            {isLogo
              ? 'Arraste o quadro para escolher a área da logo. Veja à direita como ela vai ficar.'
              : 'Recorte só o símbolo, em quadrado. Veja à direita como o ícone vai ficar.'}
          </p>
        </div>
        <DialogPrimitive.Close
          aria-label="Cancelar e fechar"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-5" aria-hidden />
        </DialogPrimitive.Close>
      </header>

      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <TriangleAlert className="size-8 text-amber-600" aria-hidden />
          <p role="alert" className="max-w-md text-sm text-foreground">
            {loadError}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {canSendOriginal(file) ? (
              <Button type="button" variant="outline" onClick={() => onApply(file)}>
                Tentar enviar o arquivo original
              </Button>
            ) : null}
            <Button type="button" onClick={onCancel}>
              Fechar
            </Button>
          </div>
        </div>
      ) : !source || !box ? (
        <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Abrindo a imagem…
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto] overflow-y-auto md:grid-cols-[minmax(0,1fr)_360px] md:grid-rows-1 md:overflow-hidden">
          <div className="flex h-[46vh] min-h-[280px] flex-col gap-3 p-4 md:h-auto md:min-h-0 md:p-5">
            <CropStage
              source={source}
              box={box}
              onBox={setBox}
              ratio={ASPECT_RATIO[aspect]}
              zoom={zoom}
              kind={kind}
            />
            <div className="flex items-center gap-3">
              <label htmlFor="adjust-zoom" className="text-xs font-medium text-muted-foreground">
                Zoom
              </label>
              <Slider
                id="adjust-zoom"
                aria-label="Zoom da imagem"
                min={1}
                max={4}
                step={0.1}
                value={[zoom]}
                onValueChange={([value]) => setZoom(value ?? 1)}
                className="max-w-xs"
              />
              <span className="w-10 text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <aside className="space-y-5 overflow-y-auto border-t p-4 md:border-l md:border-t-0 md:p-5">
            <section className="space-y-3" aria-label="Opções de recorte">
              {isLogo ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Proporção do recorte</p>
                  <div className="flex gap-1.5" role="group" aria-label="Proporção do recorte">
                    {(['free', 'wide', 'square'] as const).map(option => (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={aspect === option ? 'default' : 'outline'}
                        aria-pressed={aspect === option}
                        onClick={() => changeAspect(option)}
                      >
                        {ASPECT_LABEL[option]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Recorte quadrado (1:1), 1024 × 1024 px. O símbolo fica centralizado.</p>
              )}
              <ToggleRow
                label="Recortar bordas automaticamente"
                hint={source.trimBox ? undefined : 'Não há bordas vazias para aparar.'}
                checked={autoTrim && Boolean(source.trimBox)}
                disabled={!source.trimBox}
                onChange={changeAutoTrim}
              />
              {source.whiteBackground ? (
                <ToggleRow
                  label="Tirar o fundo branco"
                  hint="O branco ligado às bordas fica transparente; o branco dentro da logo continua."
                  checked={removeWhite}
                  onChange={setRemoveWhite}
                />
              ) : null}
            </section>

            <Previews
              kind={kind}
              preview={preview}
              primaryColor={primaryColor}
              clubName={clubName}
            />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {info ? (
                  <>
                    <span className="font-medium text-foreground">
                      {info.width} × {info.height} px · {formatFileSize(info.bytes)}
                    </span>
                    {info.type === 'image/webp' ? ' (WebP, para caber no limite)' : null}
                  </>
                ) : (
                  'Calculando o tamanho final…'
                )}
              </p>
              {small ? (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {SMALL_IMAGE_WARNING}
                </p>
              ) : null}
              {applyError ? (
                <p role="alert" className="text-[13px] text-destructive">
                  {applyError}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 md:px-6">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={applying}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void apply()} disabled={!source || !box || applying}>
          {applying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {applyLabel}
        </Button>
      </footer>
    </>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quadro de recorte
// ---------------------------------------------------------------------------

type Drag =
  | { type: 'move'; startX: number; startY: number; box: Box }
  | { type: 'resize'; handle: Handle; box: Box }

function CropStage({
  source,
  box,
  onBox,
  ratio,
  zoom,
  kind,
}: {
  source: PreparedSource
  box: Box
  onBox: (box: Box) => void
  ratio: number | null
  zoom: number
  kind: BrandKind
}) {
  const W = source.width
  const H = source.height
  const container = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const [fit, setFit] = useState({ w: 0, h: 0 })

  // Tamanho base: a imagem inteira cabe na área; o zoom multiplica.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const measure = () => {
      const base = Math.min((el.clientWidth - 24) / W, (el.clientHeight - 24) / H)
      setFit({ w: Math.max(40, W * base), h: Math.max(40, H * base) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [W, H])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    el.width = source.display.width
    el.height = source.display.height
    el.getContext('2d')?.drawImage(source.display, 0, 0)
  }, [source])

  const toSource = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrap.current!.getBoundingClientRect()
      return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H }
    },
    [W, H],
  )

  function resize(handle: Handle, start: Box, px: number, py: number): Box {
    const right = start.x + start.w
    const bottom = start.y + start.h
    const min = Math.min(MIN_BOX, W, H)
    if (!ratio) {
      let x0 = start.x
      let y0 = start.y
      let x1 = right
      let y1 = bottom
      if (handle.includes('w')) x0 = clamp(px, 0, x1 - min)
      if (handle.includes('e')) x1 = clamp(px, x0 + min, W)
      if (handle.includes('n')) y0 = clamp(py, 0, y1 - min)
      if (handle.includes('s')) y1 = clamp(py, y0 + min, H)
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    }
    const cx = start.x + start.w / 2
    const cy = start.y + start.h / 2
    if (handle.length === 2) {
      // Canto: âncora no canto oposto.
      const ax = handle.includes('w') ? right : start.x
      const ay = handle.includes('n') ? bottom : start.y
      const sx = handle.includes('w') ? -1 : 1
      const sy = handle.includes('n') ? -1 : 1
      const maxW = Math.min(sx > 0 ? W - ax : ax, (sy > 0 ? H - ay : ay) * ratio)
      const w = clamp(Math.max(Math.abs(px - ax), Math.abs(py - ay) * ratio), Math.min(min * ratio, maxW), maxW)
      const h = w / ratio
      return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h }
    }
    if (handle === 'e' || handle === 'w') {
      const ax = handle === 'e' ? start.x : right
      const maxW = Math.min(handle === 'e' ? W - ax : ax, Math.min(cy, H - cy) * 2 * ratio)
      const w = clamp(Math.abs(px - ax), Math.min(min * ratio, maxW), maxW)
      const h = w / ratio
      return { x: handle === 'e' ? ax : ax - w, y: cy - h / 2, w, h }
    }
    const ay = handle === 's' ? start.y : bottom
    const maxH = Math.min(handle === 's' ? H - ay : ay, (Math.min(cx, W - cx) * 2) / ratio)
    const h = clamp(Math.abs(py - ay), Math.min(min, maxH), maxH)
    const w = h * ratio
    return { x: cx - w / 2, y: handle === 's' ? ay : ay - h, w, h }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>, next: { type: 'move' } | { type: 'resize'; handle: Handle }) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toSource(event.clientX, event.clientY)
    drag.current =
      next.type === 'move'
        ? { type: 'move', startX: point.x, startY: point.y, box }
        : { type: 'resize', handle: next.handle, box }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    if (!current) return
    const point = toSource(event.clientX, event.clientY)
    if (current.type === 'move') {
      const dx = point.x - current.startX
      const dy = point.y - current.startY
      onBox({
        ...current.box,
        x: clamp(current.box.x + dx, 0, W - current.box.w),
        y: clamp(current.box.y + dy, 0, H - current.box.h),
      })
    } else {
      onBox(resize(current.handle, current.box, point.x, point.y))
    }
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // Teclado: setas movem; Shift + setas redimensionam (a partir do centro).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = Math.max(1, Math.max(W, H) * (event.altKey ? 0.05 : 0.01))
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const move = delta[event.key]
    if (!move) return
    event.preventDefault()
    if (event.shiftKey) {
      const grow = (move[0] + move[1]) * step * 2
      const w = clamp(box.w + grow, Math.min(MIN_BOX, W), W)
      const h = ratio ? w / ratio : clamp(box.h + grow, Math.min(MIN_BOX, H), H)
      if (h > H) return
      onBox({ x: clamp(box.x - (w - box.w) / 2, 0, W - w), y: clamp(box.y - (h - box.h) / 2, 0, H - h), w, h })
    } else {
      onBox({ ...box, x: clamp(box.x + move[0] * step, 0, W - box.w), y: clamp(box.y + move[1] * step, 0, H - box.h) })
    }
  }

  const pct = (value: number, total: number) => `${(value / total) * 100}%`

  return (
    <div ref={container} className="flex min-h-0 flex-1 overflow-auto rounded-xl border bg-muted/40" data-testid="crop-stage">
      <div
        ref={wrap}
        className="relative m-auto shrink-0 select-none overflow-hidden bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]"
        style={{ width: fit.w * zoom, height: fit.h * zoom }}
      >
        <canvas ref={canvas} className="pointer-events-none block size-full" aria-hidden />
        <div
          role="group"
          tabIndex={0}
          aria-label={`Área de recorte da ${kind === 'logo' ? 'logo' : 'ícone'}. Setas movem; Shift com setas muda o tamanho.`}
          onKeyDown={onKeyDown}
          onPointerDown={event => onPointerDown(event, { type: 'move' })}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute cursor-move touch-none border-2 border-white outline outline-1 outline-black/40 focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            left: pct(box.x, W),
            top: pct(box.y, H),
            width: pct(box.w, W),
            height: pct(box.h, H),
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
          data-testid="crop-box"
        >
          {HANDLES.map(handle => (
            <span
              key={handle.id}
              data-handle={handle.id}
              onPointerDown={event => onPointerDown(event, { type: 'resize', handle: handle.id })}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={cn(
                'absolute size-4 touch-none rounded-sm border border-black/50 bg-white shadow',
                handle.className,
              )}
              style={{ cursor: handle.cursor }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prévias
// ---------------------------------------------------------------------------

function Thumb({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      {children}
      <figcaption className="text-center text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

function Previews({
  kind,
  preview,
  primaryColor,
  clubName,
}: {
  kind: BrandKind
  preview: PreviewState | null
  primaryColor: string
  clubName: string
}) {
  const name = clubName.trim() || 'Seu clube'
  const primary = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor) ? primaryColor : '#1e2a4a'
  const onPrimary = readableTextColor(primary)
  if (!preview) {
    return <p className="text-xs text-muted-foreground">Montando as prévias…</p>
  }
  const img = (className: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={preview.url} alt="" className={className} />
  )
  return (
    <section className="space-y-3" aria-label="Prévia do resultado" data-testid="previews">
      <p className="text-xs font-medium text-muted-foreground">Como vai ficar</p>
      <div className="flex flex-wrap items-end gap-4">
        {kind === 'logo' ? (
          <>
            <Thumb label="Cabeçalho do site">
              <span className="flex h-14 w-44 items-center rounded-lg border bg-white px-3">
                {img('max-h-9 max-w-36 object-contain')}
              </span>
            </Thumb>
            <Thumb label="Carteirinha">
              <span
                className="flex h-14 w-44 items-center rounded-lg px-3 shadow-sm"
                style={{ background: primary, color: onPrimary }}
              >
                {preview.silhouette ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.monoUrl} alt="" className="max-h-8 max-w-32 object-contain" />
                ) : (
                  <span className="flex h-9 items-center rounded-md bg-white px-2">{img('max-h-6 max-w-28 object-contain')}</span>
                )}
              </span>
            </Thumb>
          </>
        ) : null}
        <Thumb label="Aba do navegador">
          <span className="flex h-10 w-40 items-center gap-2 rounded-t-lg border border-b-0 bg-card px-2">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden bg-white">
              {img('size-full object-contain')}
            </span>
            <span className="truncate text-[11px] text-foreground">{name}</span>
          </span>
        </Thumb>
        <Thumb label="Ícone do app">
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-[22%] border bg-white p-1 shadow-sm">
            {img('size-full object-contain')}
          </span>
        </Thumb>
        <Thumb label="Menu recolhido">
          <span className="flex size-12 items-center justify-center rounded-lg border bg-card p-1.5">
            {img('size-full object-contain')}
          </span>
        </Thumb>
      </div>
    </section>
  )
}
