import { onlyDigits } from '@annetec/contracts'

/**
 * Código de barras do boleto (Intercalado 2 de 5, 44 dígitos) em SVG, para a
 * versão imprimível. Sem o código de barras, deriva-o da linha digitável.
 */

const PATTERNS = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn']

/** Linha digitável (47) → código de barras (44). */
export function barcodeFromLine(line: string | null | undefined): string | null {
  const d = onlyDigits(line)
  if (d.length !== 47) return null
  return `${d.slice(0, 4)}${d.slice(32, 33)}${d.slice(33, 47)}${d.slice(4, 9)}${d.slice(10, 20)}${d.slice(21, 31)}`
}

export function BoletoBarcode({ code, className }: { code: string; className?: string }) {
  const digits = onlyDigits(code)
  if (digits.length !== 44) return null
  const narrow = 1
  const wide = 3
  const elements: { bar: boolean; width: number }[] = [
    { bar: true, width: narrow },
    { bar: false, width: narrow },
    { bar: true, width: narrow },
    { bar: false, width: narrow },
  ]
  for (let i = 0; i < digits.length; i += 2) {
    const bars = PATTERNS[Number(digits[i])] ?? 'nnnnn'
    const spaces = PATTERNS[Number(digits[i + 1])] ?? 'nnnnn'
    for (let k = 0; k < 5; k++) {
      elements.push({ bar: true, width: bars[k] === 'w' ? wide : narrow })
      elements.push({ bar: false, width: spaces[k] === 'w' ? wide : narrow })
    }
  }
  elements.push({ bar: true, width: wide }, { bar: false, width: narrow }, { bar: true, width: narrow })

  let x = 0
  const rects: { x: number; width: number }[] = []
  for (const element of elements) {
    if (element.bar) rects.push({ x, width: element.width })
    x += element.width
  }

  return (
    <svg
      viewBox={`0 0 ${x} 50`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Código de barras do boleto"
    >
      <rect x={0} y={0} width={x} height={50} fill="#fff" />
      {rects.map(rect => (
        <rect key={rect.x} x={rect.x} y={0} width={rect.width} height={50} fill="#000" />
      ))}
    </svg>
  )
}
