'use client'

import type { ReactNode } from 'react'
import type { PlatformRole } from '@annetec/contracts'
import { PlatformAuthProvider, usePlatformAuth } from '@/contexts/platform-auth-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { CascaVendas } from '@/components/vendas-rede/casca-vendas'
import { VendasRedeProvider } from '@/components/vendas-rede/provider'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'

/**
 * Rede Comercial da PLATAFORMA (`/vendas/**`, conta `platform_seller`, qualquer
 * papel comercial). Isolada do console: nenhum provider da equipe monta aqui.
 * O menu muda com o papel (`itensDoPapel`); as páginas de gestão (equipe, rede,
 * resultados, comissões, regras) entram como `children` da mesma casca.
 */

const SELLER_ROLES: PlatformRole[] = ['platform_seller']
const ESCOPO: EscopoVendas = { kind: 'platform' }

function Area({ children }: { children: ReactNode }) {
  const { user, logout } = usePlatformAuth()
  return (
    <VendasRedeProvider escopo={ESCOPO} aoSair={logout}>
      <CascaVendas nomeUsuario={user?.name}>{children}</CascaVendas>
    </VendasRedeProvider>
  )
}

export default function VendasLayout({ children }: { children: ReactNode }) {
  return (
    <PlatformAuthProvider>
      <ProtectedPlatformRoute allowedRoles={SELLER_ROLES}>
        <Area>{children}</Area>
      </ProtectedPlatformRoute>
    </PlatformAuthProvider>
  )
}
