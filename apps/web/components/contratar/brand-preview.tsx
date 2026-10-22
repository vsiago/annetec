'use client'

import { BadgeCheck, HeartPulse, Pill as PillIcon, Stethoscope } from 'lucide-react'
import { darken, lighten, readableTextColor, withAlpha } from '@/lib/theme'

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'C'
  const pick = words.length > 1 ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}` : (words[0] ?? 'C').slice(0, 2)
  return pick.toUpperCase()
}

/**
 * Prévia AO VIVO da vitrine do clube (`/{slug}`) com as cores, o logo e o
 * nome digitados — uma miniatura fiel ao espírito do site, não um print.
 */
export function BrandPreview({
  clubName,
  tagline,
  slug,
  primaryColor,
  secondaryColor,
  logoUrl,
  siteBase,
}: {
  clubName: string
  tagline: string
  slug: string
  primaryColor: string
  secondaryColor: string
  logoUrl: string | null
  siteBase: string
}) {
  const primary = HEX.test(primaryColor) ? primaryColor : '#e84364'
  const secondary = HEX.test(secondaryColor) ? secondaryColor : '#1e2a4a'
  const onPrimary = readableTextColor(primary)
  const onSecondary = readableTextColor(secondary)
  const name = clubName.trim() || 'Seu clube'
  const address = `${siteBase.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/${slug || 'seu-clube'}`

  return (
    <figure className="overflow-hidden rounded-2xl border bg-white shadow-lg" aria-label={`Prévia da vitrine de ${name}`}>
      <div className="flex items-center gap-2 border-b bg-slate-100 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-white px-2 py-0.5 text-center font-mono text-[11px] text-slate-600">
          {address}
        </span>
      </div>

      <div className="text-slate-900">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-7 w-auto max-w-[110px] object-contain" />
            ) : (
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, color: onPrimary }}
                aria-hidden
              >
                {initials(name)}
              </span>
            )}
            <span className="truncate text-sm font-bold" style={{ color: darken(secondary, 0.1) }}>
              {name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="hidden sm:inline">Planos</span>
            <span className="hidden sm:inline">Rede</span>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: primary, color: onPrimary }}>
              Assinar
            </span>
          </div>
        </div>

        <div
          className="relative overflow-hidden px-4 py-5"
          style={{ background: `linear-gradient(135deg, ${secondary} 0%, ${darken(secondary, 0.25)} 100%)`, color: onSecondary }}
        >
          <div className="absolute -right-10 -top-10 size-32 rounded-full blur-2xl" style={{ background: withAlpha(primary, 0.45) }} aria-hidden />
          <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 space-y-2">
              <p className="text-[15px] font-extrabold leading-tight">Saúde e bem-estar para você e sua família</p>
              <p className="line-clamp-2 text-[11px] opacity-80">{tagline.trim() || `O clube de benefícios de ${name}.`}</p>
              <span
                className="inline-flex rounded-lg px-3 py-1.5 text-[10px] font-bold shadow"
                style={{ background: primary, color: onPrimary }}
              >
                Conheça os planos
              </span>
            </div>
            <div
              className="w-28 rounded-xl p-2.5 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${primary}, ${lighten(primary, 0.25)})`, color: onPrimary }}
              aria-hidden
            >
              <p className="truncate text-[9px] font-bold uppercase tracking-wide opacity-90">{name}</p>
              <p className="mt-3 text-[8px] opacity-80">Carteirinha digital</p>
              <p className="text-[9px] font-semibold">Titular · 0001</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 bg-slate-50 px-4 py-4">
          {[
            { icon: Stethoscope, title: 'Consultas' },
            { icon: HeartPulse, title: 'Exames' },
            { icon: PillIcon, title: 'Farmácia' },
          ].map(({ icon: Icon, title }) => (
            <div key={title} className="rounded-lg border bg-white p-2 text-center">
              <span
                className="mx-auto flex size-6 items-center justify-center rounded-md"
                style={{ background: withAlpha(primary, 0.12), color: primary }}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>
              <p className="mt-1 text-[10px] font-semibold text-slate-700">{title}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1.5 border-t py-2 text-[10px] text-slate-500">
          <BadgeCheck className="size-3" style={{ color: primary }} aria-hidden />
          Clube operado na plataforma ANNETEC
        </div>
      </div>
    </figure>
  )
}
