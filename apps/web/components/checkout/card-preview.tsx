'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { CARD_BRAND_LABELS, onlyDigits, type CardBrand } from '@annetec/contracts'
import { cn } from '@/lib/utils'

const BRAND_GRADIENTS: Record<CardBrand | 'none', string> = {
  visa: 'from-[#1a1f71] via-[#243a9e] to-[#3b5bdb]',
  mastercard: 'from-[#1b1b1f] via-[#2d2d33] to-[#4a3b2f]',
  elo: 'from-[#111111] via-[#1f1f1f] to-[#3a3a3a]',
  amex: 'from-[#0b6e79] via-[#138a96] to-[#2fb3be]',
  hipercard: 'from-[#8c1515] via-[#b01e1e] to-[#d63a3a]',
  diners: 'from-[#1d3557] via-[#274c77] to-[#457b9d]',
  discover: 'from-[#3a1d0b] via-[#6b3410] to-[#e36c0a]',
  jcb: 'from-[#0f3b6b] via-[#155e3d] to-[#9b1b30]',
  outra: 'from-slate-800 via-slate-700 to-slate-600',
  none: 'from-slate-800 via-slate-700 to-slate-600',
}

export function BrandMark({ brand, className }: { brand: CardBrand | null; className?: string }) {
  if (!brand) return null
  if (brand === 'mastercard') {
    return (
      <span className={cn('relative inline-flex h-6 w-10 items-center', className)} aria-label="Mastercard" role="img">
        <span className="absolute left-0 size-6 rounded-full bg-[#eb001b]" />
        <span className="absolute left-4 size-6 rounded-full bg-[#f79e1b] mix-blend-screen opacity-90" />
      </span>
    )
  }
  if (brand === 'visa') {
    return (
      <span className={cn('font-sans text-xl font-black italic tracking-tight', className)} aria-label="Visa" role="img">
        VISA
      </span>
    )
  }
  const short: Partial<Record<CardBrand, string>> = { elo: 'elo', amex: 'AMEX', hipercard: 'Hiper', jcb: 'JCB', diners: 'Diners' }
  return (
    <span className={cn('text-sm font-extrabold tracking-wide', className)} aria-label={CARD_BRAND_LABELS[brand]} role="img">
      {short[brand] ?? CARD_BRAND_LABELS[brand]}
    </span>
  )
}

interface CardPreviewProps {
  number: string
  holderName: string
  expiry: string
  ccvLength: number
  brand: CardBrand | null
  flipped: boolean
}

/** Cartão ilustrado que acompanha a digitação (vira para mostrar o CVV). */
export function CardPreview({ number, holderName, expiry, ccvLength, brand, flipped }: CardPreviewProps) {
  const reduceMotion = useReducedMotion()
  const digits = onlyDigits(number)
  const isAmex = brand === 'amex'
  const template = isAmex ? '#### ###### #####' : '#### #### #### ####'
  let cursor = 0
  const shown = template.replace(/#/g, () => {
    const char = digits[cursor]
    cursor += 1
    return char ?? '•'
  })
  const gradient = BRAND_GRADIENTS[brand ?? 'none']

  return (
    <div className="mx-auto w-full max-w-[340px] [perspective:1200px]" aria-hidden>
      <motion.div
        className="relative aspect-[1.586/1] w-full [transform-style:preserve-3d]"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: 'easeOut' }}
      >
        {/* Frente */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-xl [backface-visibility:hidden]',
            gradient,
          )}
        >
          <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <span className="relative h-8 w-11 overflow-hidden rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-inner">
              <span className="absolute inset-x-0 top-1/2 h-px bg-amber-700/40" />
              <span className="absolute inset-y-0 left-1/3 w-px bg-amber-700/40" />
              <span className="absolute inset-y-0 right-1/3 w-px bg-amber-700/40" />
            </span>
            <BrandMark brand={brand} className="text-white" />
          </div>
          <p className="relative font-mono text-[19px] tracking-[0.12em] text-white/95 sm:text-xl">{shown}</p>
          <div className="relative flex items-end justify-between gap-3 text-[10px] uppercase tracking-wider">
            <div className="min-w-0">
              <p className="text-white/60">Nome impresso</p>
              <p className="truncate text-[13px] font-semibold tracking-wide">{holderName.trim() || 'SEU NOME AQUI'}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-white/60">Validade</p>
              <p className="font-mono text-[13px] font-semibold">{expiry || 'MM/AA'}</p>
            </div>
          </div>
        </div>

        {/* Verso */}
        <div
          className={cn(
            'absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]',
            gradient,
          )}
        >
          <div className="mt-6 h-10 w-full bg-black/80" />
          <div className="mx-5 mt-5 flex items-center gap-3">
            <div className="h-9 flex-1 rounded bg-white/85" />
            <div className="flex h-9 min-w-14 items-center justify-center rounded bg-white px-2 font-mono text-sm font-bold text-slate-900">
              {'•'.repeat(Math.max(ccvLength, 3)).slice(0, 4)}
            </div>
          </div>
          <p className="mx-5 mt-3 text-[10px] uppercase tracking-wider text-white/70">Código de segurança (CVV)</p>
        </div>
      </motion.div>
    </div>
  )
}
