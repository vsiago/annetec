'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { LogOut, Settings } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { basePath } from '@/lib/vendas-rede/escopo'
import { AvisoSomenteLeitura, useSairDaRede, useVendasRede } from './provider'
import { ComercialShell } from './shell/comercial-shell'
import { AvatarPresenca, type Branding } from './shell/base'
import { itensDoPapel } from './shell/itens'
import { FOCUS_RING, variaveisDeCor } from './ui/tokens'
import { PAPEL_COMERCIAL_LABELS } from '@annetec/contracts'
import { cn } from '@/lib/utils'

/**
 * Casca da Rede Comercial já ligada ao provider: menu do papel, selo de leads
 * no pool, sino, menu da conta e aviso de perfil inativo. Os layouts de
 * `/vendas` e `/<clube>/vendas` só montam isto dentro de `VendasRedeProvider`.
 *
 * As páginas de gestão (equipe, rede, resultados, comissões, regras) entram
 * como `children` e herdam tudo: escopo, perfil e casca.
 */
export function CascaVendas({
  branding,
  nomeUsuario,
  children,
}: {
  branding?: Branding
  /** Nome da pessoa logada (a conta do agente já traz o nome; serve de reserva para o master implícito). */
  nomeUsuario?: string
  children: ReactNode
}) {
  const { escopo, eu } = useVendasRede()
  const aoSair = useSairDaRede()
  const raiz = basePath(escopo)
  const nome = eu.agente?.nome ?? nomeUsuario ?? PAPEL_COMERCIAL_LABELS[eu.papel]
  const online = eu.agente?.online ?? true

  const itens = useMemo(
    () => itensDoPapel(eu.papel, raiz).map(item => (item.icon === 'funil' ? { ...item, badge: eu.contadores.pool } : item)),
    [eu.papel, eu.contadores.pool, raiz],
  )
  const usuario = { nome, online }

  // Folhas e diálogos nascem em portais (fora da casca): levam a cor de ação junto, no <html>.
  const cor = branding?.corPrimaria ?? null
  useEffect(() => {
    const vars = variaveisDeCor(cor)
    const raizHtml = document.documentElement
    Object.entries(vars).forEach(([k, v]) => raizHtml.style.setProperty(k, v))
    return () => Object.keys(vars).forEach(k => raizHtml.style.removeProperty(k))
  }, [cor])

  return (
    <ComercialShell
      papel={eu.papel}
      itens={itens}
      usuario={usuario}
      branding={branding}
      raiz={raiz}
      slotSino={<NotificationBell variant="topbar" />}
      slotConta={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Conta de ${nome}`}
              className={cn('flex size-11 items-center justify-center rounded-full', FOCUS_RING)}
            >
              <AvatarPresenca usuario={usuario} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{nome}</span>
              <span className="text-xs font-normal text-muted-foreground">{PAPEL_COMERCIAL_LABELS[eu.papel]}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
              <Link href={`${raiz}/ajustes`}>
                <Settings aria-hidden="true" /> Ajustes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={aoSair} className="min-h-10 cursor-pointer">
              <LogOut aria-hidden="true" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 empty:hidden sm:px-6 lg:px-8 lg:pt-6">
        <AvisoSomenteLeitura />
      </div>
      {children}
    </ComercialShell>
  )
}
