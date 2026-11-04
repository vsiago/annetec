'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BadgeCheck } from 'lucide-react'
import type { Tenant } from '@/lib/types'

interface MembershipCardProps {
  tenant: Tenant
  name: string
  cardNumber: string | null
  planName: string
  /** "Titular" ou o parentesco do dependente. */
  role: string
  index?: number
}

/** Carteirinha digital emitida na ativação (titular e cada dependente). */
export function MembershipCard({ tenant, name, cardNumber, planName, role, index = 0 }: MembershipCardProps) {
  const reduceMotion = useReducedMotion()
  // Logo branca (só existe para logo transparente) cai direto no cartão; sem ela, a logo comum vai numa plaquinha clara.
  const lightLogo = tenant.branding?.logoLightUrl
  const logo = lightLogo ?? tenant.branding?.logoUrl

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: 0.25 + index * 0.12, type: 'spring', stiffness: 160, damping: 20 }}
      className="relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-secondary p-5 text-primary-foreground shadow-xl"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0" />
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }}
      />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={tenant.name}
              className={
                lightLogo
                  ? 'h-7 w-auto max-w-[140px] object-contain'
                  : 'h-8 w-auto max-w-[140px] rounded-md bg-white/95 object-contain px-1.5 py-0.5'
              }
            />
          ) : (
            <span className="font-display text-lg font-extrabold tracking-tight">{tenant.name}</span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
            Ativa
          </span>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold tracking-[0.14em] sm:text-xl">{cardNumber ?? 'Emitindo…'}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{role}</p>
            <p className="truncate text-sm font-semibold uppercase tracking-wide">{name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">Plano</p>
            <p className="flex items-center gap-1 text-sm font-semibold">
              <BadgeCheck className="size-3.5" aria-hidden />
              {planName}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
