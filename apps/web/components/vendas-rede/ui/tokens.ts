import { CARD_SHADOW, CARD_SHADOW_HOVER, CARD_SURFACE, TONES, type ConsoleTone } from '@/components/admin-platform/ui/tone'

export { CARD_SHADOW, CARD_SHADOW_HOVER, CARD_SURFACE, TONES }
export type { ConsoleTone }

/**
 * Vocabulário visual da Rede Comercial (regra 60/30/10):
 *  - 60 % superfície clara neutra (fundo, cartões brancos);
 *  - 30 % marinho/cor do clube (texto de destaque, trilho, abas ativas);
 *  - 10 % cor de ação, SÓ na ação principal de cada tela/cartão.
 * A cor de ação vem da variável CSS `--vr-accent` (a casca a define com a cor do
 * clube ou o marinho padrão) e `--vr-accent-fg` (texto legível sobre ela).
 */
export const ACCENT_BG = 'bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#FFFFFF)]'
export const ACCENT_TEXT = 'text-[var(--vr-accent,#1E2A4A)]'
/** Botão flutuante no celular: acima da barra inferior (64 px) e da área segura do aparelho. */
export const FAB_MOBILE = 'fixed right-4 bottom-[calc(4rem+0.75rem+env(safe-area-inset-bottom))] z-30'
export const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--vr-accent,#1E2A4A)] focus-visible:ring-offset-2 focus-visible:ring-offset-white'

const MARINHO = '#1E2A4A'
const TEXTO_ESCURO = '#101D36'

export function normalizarHex(valor: string | null | undefined): string | null {
  const t = valor?.trim()
  if (!t) return null
  if (/^#[0-9a-f]{6}$/i.test(t)) return t
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
  return null
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** Branco ou marinho escuro: o que tiver mais contraste sobre o fundo. */
export function textoLegivelSobre(fundo: string): string {
  const l = luminancia(fundo)
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminancia(TEXTO_ESCURO) + 0.05) ? '#FFFFFF' : TEXTO_ESCURO
}

/** Variáveis CSS da cor de ação a partir da cor do clube (inválida = marinho). */
export function variaveisDeCor(cor?: string | null): Record<string, string> {
  const hex = normalizarHex(cor) ?? MARINHO
  return { '--vr-accent': hex, '--vr-accent-fg': textoLegivelSobre(hex) }
}
