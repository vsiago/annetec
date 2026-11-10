'use client'

import { useMemo } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'

/**
 * QR code em SVG, gerado no próprio navegador/servidor com a lib `qrcode`
 * (nenhum serviço externo). Fundo branco com zona de silêncio de 4 módulos,
 * sempre escuro sobre claro, para a câmera ler em qualquer tema.
 *
 * - `valor`: o texto/URL codificado. Vazio = não desenha nada.
 * - `tamanho`: lado em px (padrão 176).
 * - `titulo`: texto alternativo ("QR code do seu link de indicação").
 */
export function QrCode({
  valor,
  tamanho = 176,
  titulo = 'QR code',
  className,
}: {
  valor: string
  tamanho?: number
  titulo?: string
  className?: string
}) {
  const caminho = useMemo(() => {
    if (!valor) return null
    try {
      const { modules } = QRCode.create(valor, { errorCorrectionLevel: 'M' })
      const n = modules.size
      let d = ''
      for (let y = 0; y < n; y++) {
        let x = 0
        while (x < n) {
          if (!modules.get(y, x)) {
            x++
            continue
          }
          const inicio = x
          while (x < n && modules.get(y, x)) x++
          d += `M${inicio + 4} ${y + 4}h${x - inicio}v1h-${x - inicio}z`
        }
      }
      return { d, lado: n + 8 }
    } catch {
      return null
    }
  }, [valor])

  if (!caminho) return null
  return (
    <svg
      role="img"
      aria-label={titulo}
      viewBox={`0 0 ${caminho.lado} ${caminho.lado}`}
      width={tamanho}
      height={tamanho}
      shapeRendering="crispEdges"
      className={cn('rounded-xl border border-border bg-white', className)}
    >
      <title>{titulo}</title>
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <path d={caminho.d} fill="#101D36" />
    </svg>
  )
}
