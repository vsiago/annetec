'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Aparece suavemente ao entrar na tela. Com `prefers-reduced-motion` ligado,
 * renderiza direto, sem animação nenhuma.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

const TONES = {
  white: 'bg-white',
  soft: 'bg-accent/50',
  brand: 'bg-secondary text-secondary-foreground',
} as const

export function Section({
  id,
  tone = 'white',
  className,
  containerClassName,
  children,
  labelledBy,
}: {
  id?: string
  tone?: keyof typeof TONES
  className?: string
  containerClassName?: string
  children: ReactNode
  labelledBy?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('relative scroll-mt-20 py-16 sm:py-20 lg:py-24', TONES[tone], className)}
    >
      <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', containerClassName)}>{children}</div>
    </section>
  )
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  align = 'center',
  inverted = false,
  className,
}: {
  id?: string
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  align?: 'center' | 'left'
  inverted?: boolean
  className?: string
}) {
  return (
    <Reveal
      className={cn(
        'mb-10 max-w-3xl sm:mb-12',
        align === 'center' ? 'mx-auto text-center' : 'text-left',
        className,
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            'mb-3 text-xs font-semibold uppercase tracking-[0.18em]',
            inverted ? 'text-secondary-foreground/75' : 'text-primary',
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className={cn(
          'text-3xl font-bold leading-tight sm:text-4xl',
          inverted ? 'text-secondary-foreground' : 'text-foreground',
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            'mt-4 text-base leading-relaxed sm:text-lg',
            inverted ? 'text-secondary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {description}
        </p>
      )}
    </Reveal>
  )
}

/** Ícone em "pastilha" com a cor do inquilino — o mesmo desenho em todas as seções. */
export function IconBadge({
  icon: Icon,
  className,
}: {
  icon: React.ElementType
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary',
        className,
      )}
    >
      <Icon className="size-6" aria-hidden="true" />
    </span>
  )
}

/** Cabeçalho das páginas internas (planos, rede, sobre, empresas, cadastro). */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-accent to-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-secondary/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:px-8">
        <Reveal className="max-w-3xl">
          {eyebrow && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          )}
          <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl">{title}</h1>
          {description && (
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
          )}
        </Reveal>
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  )
}
