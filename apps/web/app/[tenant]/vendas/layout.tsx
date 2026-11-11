'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/protected-route'
import { CascaVendas } from '@/components/vendas-rede/casca-vendas'
import { VendasRedeProvider, useVendasRede } from '@/components/vendas-rede/provider'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'

/**
 * Rede Comercial do CLUBE (`/[tenant]/vendas/**`, `member.role = 'seller'`).
 * Mesma casca e mesmas telas da plataforma, com a marca do clube na casca
 * (logo e cor de ação vêm de `tenant.branding`). Quem tem papel comercial
 * `balcao` é levado ao balcão.
 */

function DesviaBalcao({ slug, children }: { slug: string; children: ReactNode }) {
  const { eu } = useVendasRede()
  const router = useRouter()
  const balcao = eu.papel === 'balcao'
  useEffect(() => {
    if (balcao) router.replace(`/${slug}/balcao`)
  }, [balcao, router, slug])
  return balcao ? null : <>{children}</>
}

function Area({ children }: { children: ReactNode }) {
  const params = useParams<{ tenant: string }>()
  const slug = params.tenant
  const { tenant } = useTenant()
  const { user, logout } = useAuth()
  const escopo = useMemo(() => ({ kind: 'tenant' as const, slug }), [slug])
  const branding = useMemo(
    () => ({
      nome: tenant?.name ?? 'Clube',
      logoUrl: tenant?.branding.logoUrl ?? tenant?.branding.iconUrl ?? null,
      iconeUrl: tenant?.branding.iconUrl ?? tenant?.branding.logoUrl ?? null,
      corPrimaria: tenant?.branding.primaryColor ?? null,
    }),
    [tenant],
  )

  // Papel de balcão na sessão: nem monta a casca comercial.
  const router = useRouter()
  const balcaoNaSessao = user?.salesRole === 'balcao'
  useEffect(() => {
    if (balcaoNaSessao) router.replace(`/${slug}/balcao`)
  }, [balcaoNaSessao, router, slug])
  if (balcaoNaSessao) return null

  return (
    <VendasRedeProvider escopo={escopo} aoSair={logout}>
      <DesviaBalcao slug={slug}>
        <CascaVendas branding={branding} nomeUsuario={user?.name}>
          {children}
        </CascaVendas>
      </DesviaBalcao>
    </VendasRedeProvider>
  )
}

export default function VendasClubeLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['seller']}>
      <Area>{children}</Area>
    </ProtectedRoute>
  )
}
