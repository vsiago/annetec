'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LockKeyhole, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import type { AppNotification, VendasEu } from '@annetec/contracts'
import { NotificationsProvider } from '@/components/notifications/notifications-provider'
import { enviarPresencaAction, getEuAction, reivindicarLeadAction } from '@/lib/actions/vendas-rede-api'
import { basePath, chaveDoEscopo, type EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from './ui/acao-principal'
import { EstadoVazio } from './ui/estado-vazio'

/**
 * Contexto da Rede Comercial: escopo (plataforma ou clube), perfil do agente
 * (`GET /eu`) e `recarregar` (relê o perfil sem piscar a tela).
 *
 * Também cuida de duas coisas que valem para qualquer tela da casca:
 *  - presença: `POST /presenca` na entrada e a cada 60 s, só com a aba visível;
 *  - notificações em tempo real (SSE): toast "Novo lead no pool" com o botão
 *    **Atender**, que reivindica o lead e abre o detalhe.
 *
 * Quem consome: `const { escopo, eu, recarregar } = useVendasRede()`.
 */

export interface VendasRedeContexto {
  escopo: EscopoVendas
  eu: VendasEu
  /** Relê `/eu` (contadores, papel, config) sem voltar ao carregamento. */
  recarregar: () => Promise<void>
}

const Contexto = createContext<VendasRedeContexto | null>(null)
const ContextoSair = createContext<(() => void) | null>(null)

/** Encerra a sessão (definida pelo layout da área, que conhece o auth do escopo). */
export function useSairDaRede(): () => void {
  return useContext(ContextoSair) ?? (() => undefined)
}

export function useVendasRede(): VendasRedeContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useVendasRede precisa estar dentro de <VendasRedeProvider>')
  return ctx
}

const HEARTBEAT_MS = 60_000
const RELEITURA_MS = 120_000

export function VendasRedeProvider({
  escopo,
  children,
  aoSair,
}: {
  escopo: EscopoVendas
  children: ReactNode
  /** Encerra a sessão: botão "Sair" da tela de acesso não liberado, do menu da conta e de Ajustes. */
  aoSair?: () => void
}) {
  const chave = chaveDoEscopo(escopo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const escopoEstavel = useMemo(() => escopo, [chave])
  const [eu, setEu] = useState<VendasEu | null>(null)
  const [erro, setErro] = useState<{ mensagem: string; semPerfil: boolean } | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const euRef = useRef<VendasEu | null>(null)
  euRef.current = eu

  const carregar = useCallback(async () => {
    const resultado = await getEuAction(escopoEstavel)
    if (resultado.success) {
      setEu(resultado.data)
      setErro(null)
      return true
    }
    // Releitura que falha mantém o que já está na tela.
    if (!euRef.current) {
      setErro({
        mensagem: resultado.error,
        semPerfil: resultado.code === 'VENDAS_SEM_PERFIL' || resultado.code === 'VENDAS_PERFIL_INATIVO',
      })
    }
    return false
  }, [escopoEstavel])

  useEffect(() => {
    euRef.current = null
    setEu(null)
    setErro(null)
    void carregar()
  }, [carregar, tentativa])

  const recarregar = useCallback(async () => {
    await carregar()
  }, [carregar])

  // Releitura periódica dos contadores, só com a aba visível.
  useEffect(() => {
    if (!eu) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, RELEITURA_MS)
    return () => window.clearInterval(timer)
    // `eu` só precisa existir; a releitura usa `carregar`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(eu), carregar])

  // Heartbeat de presença: na entrada, a cada 60 s e ao voltar para a aba.
  const logado = Boolean(eu)
  useEffect(() => {
    if (!logado) return
    const bater = () => {
      if (document.visibilityState === 'visible') void enviarPresencaAction(escopoEstavel)
    }
    bater()
    const timer = window.setInterval(bater, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', bater)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', bater)
    }
  }, [logado, escopoEstavel])

  if (!eu) {
    if (erro) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB] p-6">
          <EstadoVazio
            moldura
            ilustracao="equipe"
            className="max-w-md bg-white"
            titulo={erro.semPerfil ? 'Seu acesso à Rede Comercial ainda não está liberado' : 'Não foi possível abrir a Rede Comercial'}
            descricao={
              erro.semPerfil
                ? 'Fale com quem cuida da rede de vendas para ativar o seu perfil de agente. Assim que ele estiver ativo, é só entrar de novo.'
                : erro.mensagem
            }
            acao={
              <>
                {!erro.semPerfil ? (
                  <AcaoPrincipal onClick={() => setTentativa(n => n + 1)}>Tentar de novo</AcaoPrincipal>
                ) : null}
                {aoSair ? (
                  <AcaoPrincipal variante="secundaria" onClick={aoSair} icone={<LogOut />}>
                    Sair
                  </AcaoPrincipal>
                ) : null}
              </>
            }
          />
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]" role="status">
        <Loader2 className="size-8 animate-spin text-[#1E2A4A]" aria-hidden="true" />
        <span className="sr-only">Carregando a Rede Comercial</span>
      </div>
    )
  }

  return (
    <Contexto.Provider value={{ escopo: escopoEstavel, eu, recarregar }}>
      <ContextoSair.Provider value={aoSair ?? null}>
        <NotificacoesDoAgente escopo={escopoEstavel} recarregar={recarregar}>
          {children}
        </NotificacoesDoAgente>
      </ContextoSair.Provider>
    </Contexto.Provider>
  )
}

/**
 * SSE de notificações do agente. Lead novo no pool vira toast com **Atender**
 * (reivindica e abre o lead); lead atribuído vira toast com **Abrir**.
 */
function NotificacoesDoAgente({
  escopo,
  recarregar,
  children,
}: {
  escopo: EscopoVendas
  recarregar: () => Promise<void>
  children: ReactNode
}) {
  const router = useRouter()
  const raiz = basePath(escopo)
  const escopoNotif = useMemo(() => (escopo.kind === 'tenant' ? ({ kind: 'seller', slug: escopo.slug } as const) : ({ kind: 'seller' } as const)), [escopo])

  const rotaDoLead = useCallback((leadId: string) => `${raiz}/funil/${encodeURIComponent(leadId)}`, [raiz])
  const rotaRef = useRef(rotaDoLead)
  rotaRef.current = rotaDoLead

  const atender = useCallback(
    async (leadId: string) => {
      const resultado = await reivindicarLeadAction(escopo, leadId)
      void recarregar()
      if (resultado.success) {
        toast.success('Lead é seu. Bom atendimento!')
        router.push(rotaRef.current(leadId))
        return
      }
      if (resultado.code === 'VENDAS_LEAD_JA_REIVINDICADO') {
        toast.error('Outra pessoa atendeu este lead antes de você.', { description: 'Ele já saiu do pool.' })
        return
      }
      toast.error(resultado.error)
    },
    [escopo, recarregar, router],
  )

  const aoReceber = useCallback(
    (n: AppNotification): boolean => {
      if (n.kind === 'vendas_lead_novo') {
        void recarregar()
        const leadId = n.payload.leadId
        if (!leadId) return false
        toast('Novo lead no pool', {
          id: n.id,
          description: n.body ?? n.title,
          duration: 12_000,
          action: { label: 'Atender', onClick: () => void atender(leadId) },
        })
        return true
      }
      if (n.kind === 'vendas_lead_atribuido') {
        void recarregar()
        const leadId = n.payload.leadId
        if (!leadId) return false
        toast('Lead atribuído a você', {
          id: n.id,
          description: n.body ?? n.title,
          duration: 10_000,
          action: { label: 'Abrir', onClick: () => router.push(rotaRef.current(leadId)) },
        })
        return true
      }
      return false
    },
    [atender, recarregar, router],
  )

  const destino = useCallback(
    (n: AppNotification): string | null => {
      if (n.payload.leadId && (n.kind === 'vendas_lead_novo' || n.kind === 'vendas_lead_atribuido')) return rotaRef.current(n.payload.leadId)
      return null
    },
    [],
  )

  return (
    <NotificationsProvider scope={escopoNotif} onNotification={aoReceber} resolveHref={destino}>
      {children}
    </NotificationsProvider>
  )
}

/** Aviso reutilizável para telas que exigem escrita (agente inativo lê, mas não altera). */
export function AvisoSomenteLeitura() {
  const { eu } = useVendasRede()
  if (eu.podeEscrever) return null
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#93370D]">
      <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="m-0">
        <strong className="font-semibold">Seu perfil está inativo.</strong> Você consulta o histórico, mas não atende leads nem altera
        cadastros. Fale com quem cuida da rede para reativar.
      </p>
    </div>
  )
}
