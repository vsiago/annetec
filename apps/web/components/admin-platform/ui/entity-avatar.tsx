import { cn } from '@/lib/utils'

/**
 * Avatar com iniciais do console (/admin): clubes na cor primária cadastrada
 * do próprio clube e pessoas da equipe. Sem cor válida, usa o marinho da marca.
 * É decorativo (`aria-hidden`): o nome sempre aparece ao lado.
 *
 * A cor do texto é escolhida pelo contraste com o fundo (branco ou marinho
 * escuro), para clubes com cor clara continuarem legíveis.
 */
const FALLBACK = '#1E2A4A'
const DARK_TEXT = '#101D36'

const SIZES = {
  sm: 'size-8 rounded-lg text-[11px]',
  md: 'size-10 rounded-xl text-[13px]',
  lg: 'size-11 rounded-xl text-sm',
} as const

export function EntityAvatar({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string
  /** Cor de fundo (`#RGB` ou `#RRGGBB`). Inválida ou vazia = marinho. */
  color?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const background = normalizeHex(color) ?? FALLBACK
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-bold uppercase tracking-wide ring-1 ring-inset ring-black/5',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: background, color: readableOn(background) }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Até duas iniciais, ignorando conectivos ("Clube de Benefícios" → "CB"). */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(word => word && !/^(de|da|do|das|dos|e)$/i.test(word))
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

function normalizeHex(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  if (/^#[0-9a-f]{3}$/i.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  return null
}

function luminance(hex: string): number {
  const channel = (index: number) => {
    const c = parseInt(hex.slice(index, index + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Branco ou marinho escuro — o que tiver mais contraste com o fundo. */
function readableOn(background: string): string {
  const bg = luminance(background)
  const withWhite = 1.05 / (bg + 0.05)
  const withDark = (bg + 0.05) / (luminance(DARK_TEXT) + 0.05)
  return withWhite >= withDark ? '#FFFFFF' : DARK_TEXT
}
