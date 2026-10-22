'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { brl } from './format'
import { SiteFooter } from './site-footer'
import { SiteNavbar } from './site-navbar'
import { useVitrine, VitrineProvider } from './vitrine-context'

/**
 * Moldura de marketing da vitrine: navbar, rodapé, WhatsApp flutuante e a
 * barra fixa de CTA no celular. Cada página da vitrine se embrulha nela —
 * de propósito não fica no `layout.tsx` do inquilino, para `/assinar`, o
 * painel e o portal do cliente nunca herdarem esse chrome.
 */
export function SiteShell({ children, mobileCta = true }: { children: ReactNode; mobileCta?: boolean }) {
  return (
    <VitrineProvider>
      <div className="flex min-h-screen flex-col bg-white text-foreground">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Pular para o conteúdo
        </a>
        <SiteNavbar />
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        {mobileCta && <div aria-hidden="true" className="h-20 md:hidden" />}
        <WhatsAppButton raised={mobileCta} />
        {mobileCta && <MobileCtaBar />}
      </div>
    </VitrineProvider>
  )
}

function WhatsAppButton({ raised }: { raised: boolean }) {
  const { whatsapp } = useVitrine()
  if (!whatsapp) return null
  return (
    <a
      href={whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className={cn(
        'group fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-lg shadow-black/15 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40 sm:right-6',
        raised ? 'bottom-24 md:bottom-6' : 'bottom-6',
      )}
    >
      <MessageCircle className="size-6" aria-hidden="true" />
      <span className="hidden pr-1 text-sm font-semibold lg:inline">Fale conosco</span>
    </a>
  )
}

/** Aparece depois que o herói sai da tela, para não competir com o CTA dele. */
function MobileCtaBar() {
  const { primaryCta, cheapestPlan, plans } = useVitrine()
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduce ? false : { y: 96 }}
          animate={{ y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: 96 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div className="min-w-0">
              {cheapestPlan && cheapestPlan.priceMonthly > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">{plans.length > 1 ? 'Planos a partir de' : 'Plano por'}</p>
                  <p className="truncate text-lg font-bold leading-tight text-foreground">
                    {brl(cheapestPlan.priceMonthly)}
                    <span className="text-sm font-medium text-muted-foreground">/mês</span>
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-foreground">Clube de benefícios</p>
              )}
            </div>
            <Button className="h-11 shrink-0 rounded-full px-6 font-semibold" asChild>
              <Link href={primaryCta.href}>
                Assinar
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
