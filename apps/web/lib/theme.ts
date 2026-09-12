// Derives a full set of CSS custom properties from a tenant's two brand
// colors, so every themed token (text, rings, charts, gradients) follows the
// tenant instead of only `--primary`/`--secondary`.

export interface BrandColors {
  primaryColor: string
  secondaryColor: string
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map(c => c + c).join('')
      : normalized
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

function mix(hex: string, target: { r: number; g: number; b: number }, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const r = Math.round(rgb.r + (target.r - rgb.r) * amount)
  const g = Math.round(rgb.g + (target.g - rgb.g) * amount)
  const b = Math.round(rgb.b + (target.b - rgb.b) * amount)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, { r: 255, g: 255, b: 255 }, amount)
}

export function darken(hex: string, amount: number): string {
  return mix(hex, { r: 0, g: 0, b: 0 }, amount)
}

/** Picks black or white text for a background, using WCAG relative luminance. */
export function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  return luminance > 0.5 ? '#0f172a' : '#ffffff'
}

/**
 * Full token map for a tenant. Applied to :root (not a wrapper div) so that
 * Radix portals — Dialog, Select, DropdownMenu, which render into
 * document.body — inherit the tenant's brand too.
 */
export function buildTenantThemeVars(branding: BrandColors): Record<string, string> {
  const { primaryColor: primary, secondaryColor: secondary } = branding

  return {
    '--primary': primary,
    '--primary-foreground': readableTextColor(primary),
    '--secondary': secondary,
    '--secondary-foreground': readableTextColor(secondary),

    // Text and surfaces lean on the darker brand color so headings read as
    // part of the tenant's identity rather than Annetec's navy.
    '--foreground': darken(secondary, 0.1),
    '--card-foreground': darken(secondary, 0.1),
    '--popover-foreground': darken(secondary, 0.1),
    '--accent': lighten(secondary, 0.94),
    '--accent-foreground': darken(secondary, 0.1),

    '--ring': primary,
    '--sidebar-accent': withAlpha(primary, 0.1),

    '--chart-1': primary,
    '--chart-2': secondary,
    '--chart-3': lighten(primary, 0.35),
    '--chart-4': lighten(secondary, 0.35),
    '--chart-5': darken(primary, 0.2),

    // Consumed by .gradient-primary / .gradient-accent in globals.css
    '--gradient-primary-from': primary,
    '--gradient-primary-to': lighten(primary, 0.25),
    '--gradient-accent-from': secondary,
    '--gradient-accent-to': lighten(secondary, 0.2),

    '--brand-primary-soft': withAlpha(primary, 0.1),
    '--brand-secondary-soft': withAlpha(secondary, 0.1),

    // Títulos do inquilino voltam para a fonte de texto. A Saira é a voz
    // da Annetec: num portal white-label ela anunciaria a marca errada.
    // Aplicado ao :root como o resto, então alcança também os títulos que
    // o Radix renderiza em portal (DialogTitle, por exemplo).
    '--display-font': 'var(--body-font)',
  }
}
