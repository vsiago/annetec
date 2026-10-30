'use client'

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type { PlatformRole } from '@annetec/contracts'
import { PlatformAuthProvider } from '@/contexts/platform-auth-context'
import { SellerProfileProvider, useSellerProfile } from '@/contexts/seller-profile-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { NotificationsProvider } from '@/components/notifications/notifications-provider'
import { SellerSidebar } from '@/components/vendas/seller-sidebar'

/**
 * Área do VENDEDOR ANNETEC (`/vendas/**`, conta `platform_seller`).
 *
 * Isolada do console de propósito: nenhum provider da equipe (clubes, escopo,
 * fila de aprovações) monta aqui, então nada chama rota da equipe e o
 * vendedor não vê 403 em cascata. Quem não é vendedor é mandado para o
 * console (`/admin`) pelo guard; o vendedor que tenta abrir `/admin/**` volta
 * para cá pelo guard do console.
 */

const SELLER_ROLES: PlatformRole[] = ['platform_seller']

function InactiveBanner() {
  const { profile } = useSellerProfile()
  if (!profile || profile.active) return null
  return (
    <div role="status" className="relative mb-6 flex items-start gap-3 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#93370D]">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="m-0">
        <strong className="font-semibold">Seu perfil de vendedor está inativo.</strong> Você consulta o seu histórico, mas não
        cadastra prospects, não gera links nem pede descontos. Fale com a equipe ANNETEC para reativar.
      </p>
    </div>
  )
}

function SellerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SellerSidebar />
      <main className="relative min-h-screen pb-24 pt-16 lg:pb-0 lg:pl-64 lg:pt-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,#E1E9F4_0%,rgba(239,243,248,0)_100%)]"
        />
        <div className="relative p-4 lg:p-6 lg:pt-7">
          <InactiveBanner />
          {children}
        </div>
      </main>
    </div>
  )
}

export default function VendasLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformAuthProvider>
      <ProtectedPlatformRoute allowedRoles={SELLER_ROLES}>
        <SellerProfileProvider>
          {/* Sino do vendedor: só as notificações dele (decisão dos pedidos de desconto). */}
          <NotificationsProvider scope={{ kind: 'seller' }}>
            <SellerShell>{children}</SellerShell>
          </NotificationsProvider>
        </SellerProfileProvider>
      </ProtectedPlatformRoute>
    </PlatformAuthProvider>
  )
}
