'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { basePath } from '@/lib/vendas-rede/escopo'
import { AvisoSomenteLeitura, useSairDaRede, useVendasRede } from './provider'
import { ComercialShell } from './shell/comercial-shell'
import type { Branding } from './shell/base'
import { itensDoPapel } from './shell/itens'
import { variaveisDeCor } from './ui/tokens'
import { PAPEL_COMERCIAL_LABELS } from '@annetec/contracts'

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
      area={escopo.kind === 'platform' ? 'plataforma' : 'clube'}
      papel={eu.papel}
      itens={itens}
      usuario={usuario}
      branding={branding}
      raiz={raiz}
      hrefAjustes={`${raiz}/ajustes`}
      aoSair={aoSair}
    >
      <div className="mb-6 empty:hidden">
        <AvisoSomenteLeitura />
      </div>
      {children}
    </ComercialShell>
  )
}
