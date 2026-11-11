'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import type { VendasEu } from '@annetec/contracts'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { NotificationsProvider } from '@/components/notifications/notifications-provider'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { balcaoEuAction, balcaoHojeAction } from '@/lib/actions/vendas-balcao-api'
import { BalcaoShell } from '../shell/balcao-shell'
import { itensDoBalcao } from '../shell/itens'
import { AcaoPrincipal } from '../ui/acao-principal'
import { BalcaoContexto } from './contexto'
import { limparRascunho } from './rascunho'

/**
 * Dentro do `ProtectedRoute`: lê o perfil comercial (`/eu`) e a unidade
 * (`/balcao/hoje`), manda o vendedor que não é de balcão para `/<clube>/vendas`
 * e monta a casca do balcão com a unidade e a marca do clube.
 */
export function BalcaoLayoutCliente({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const { user, endSession } = useAuth()
  const router = useRouter()
  const slug = tenant?.slug ?? ''
  const [eu, setEu] = useState<VendasEu | null>(null)
  const [unidadeNome, setUnidadeNome] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!slug) return
    const [r, hoje] = await Promise.all([balcaoEuAction(slug), balcaoHojeAction(slug)])
    if (r.success) {
      setEu(r.data)
      setErro(null)
      if (hoje.success) setUnidadeNome(hoje.data.agente?.unidade?.nome ?? null)
    } else if (r.unauthorized) {
      // Sessão caiu: o rascunho (dados pessoais do atendimento) não fica para a próxima pessoa do balcão.
      limparRascunho(slug)
      await endSession()
    } else {
      setErro(r.error)
    }
  }, [slug, endSession])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const naoEhBalcao = Boolean(eu && user?.role === 'seller' && eu.papel !== 'balcao')
  useEffect(() => {
    if (naoEhBalcao && slug) router.replace(`/${slug}/vendas`)
  }, [naoEhBalcao, slug, router])

  const itens = useMemo(() => itensDoBalcao(`/${slug}/balcao`), [slug])

  if (erro && !eu) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#F8F9FB] px-6 text-center">
        <p role="alert" className="m-0 max-w-sm text-base text-foreground">{erro}</p>
        <AcaoPrincipal tamanho="xl" onClick={() => void carregar()}>Tentar de novo</AcaoPrincipal>
      </div>
    )
  }
  if (!eu || naoEhBalcao) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F8F9FB]" role="status">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Carregando o balcão…</span>
      </div>
    )
  }

  const clube = tenant?.name ?? 'Balcão'
  const unidade = unidadeNome ?? clube
  const nome = eu.agente?.nome ?? user?.name ?? 'Balcão'
  return (
    <NotificationsProvider scope={{ kind: 'seller', slug }}>
    <BalcaoContexto.Provider value={{ slug, eu, unidade, recarregarEu: carregar }}>
      <BalcaoShell
        slotSino={<NotificationBell variant="topbar" />}
        unidade={unidade}
        itens={itens}
        usuario={{ nome, online: true }}
        branding={{
          nome: clube,
          logoUrl: tenant?.branding?.iconUrl ?? tenant?.branding?.logoUrl ?? null,
          corPrimaria: tenant?.branding?.primaryColor ?? null,
        }}
      >
        {children}
      </BalcaoShell>
    </BalcaoContexto.Provider>
    </NotificationsProvider>
  )
}
