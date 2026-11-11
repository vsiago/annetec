'use client'

import type { ReactNode } from 'react'
import { CircleCheck, FileText, Link2, PhoneCall, UserCheck, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { EtapaLead, VendasLead } from '@annetec/contracts'
import { mudarEtapaAction, reatribuirLeadAction, reivindicarLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'

/**
 * Regras de "qual é a ação principal deste lead" e ações com feedback
 * (toast + Desfazer) compartilhadas pelo Funil, pelo Hoje e pelo detalhe.
 */

export type IdAcaoLead = 'atender' | 'contato' | 'proposta' | 'fechar' | 'abrir'

export interface AcaoDoLead {
  id: IdAcaoLead
  rotulo: string
  icone: ReactNode
}

export function leadNoPool(lead: Pick<VendasLead, 'agenteId' | 'etapa'>): boolean {
  return lead.agenteId === null && lead.etapa === 'novo'
}

/**
 * Uma ação por estado do lead:
 *  - no pool: Atender (reivindica);
 *  - novo, com dono: Registrar contato;
 *  - em contato: Enviar proposta (plataforma) ou Enviar link (clube);
 *  - proposta: Registrar contato (acompanhar);
 *  - negociação: Fechar;
 *  - ganho/perdido: Ver detalhes.
 */
export function acaoPrincipalDoLead(lead: VendasLead, escopo: EscopoVendas): AcaoDoLead {
  if (leadNoPool(lead)) return { id: 'atender', rotulo: 'Atender', icone: <UserCheck /> }
  switch (lead.etapa) {
    case 'novo':
    case 'proposta':
      return { id: 'contato', rotulo: 'Registrar contato', icone: <PhoneCall /> }
    case 'em_contato':
      return escopo.kind === 'platform'
        ? { id: 'proposta', rotulo: 'Enviar proposta', icone: <FileText /> }
        : { id: 'proposta', rotulo: 'Enviar link', icone: <Link2 /> }
    case 'negociacao':
      return { id: 'fechar', rotulo: 'Fechar', icone: <CircleCheck /> }
    default:
      return { id: 'abrir', rotulo: 'Ver detalhes', icone: <ExternalLink /> }
  }
}

/** Reivindica com feedback: sucesso, "já pegaram" (409) ou erro. Devolve o lead atualizado. */
export async function atenderLead(escopo: EscopoVendas, lead: Pick<VendasLead, 'id' | 'nome'>): Promise<VendasLead | null> {
  const r = await reivindicarLeadAction(escopo, lead.id)
  if (r.success) {
    toast.success(`${lead.nome} agora é seu lead`, { description: 'Faça o primeiro contato e registre aqui.' })
    return r.data
  }
  if (r.code === 'VENDAS_LEAD_JA_REIVINDICADO') {
    toast.error('Outra pessoa atendeu este lead antes de você.', { description: 'Ele saiu do pool. Veja os próximos.' })
    return null
  }
  toast.error(r.error)
  return null
}

/** Devolve ao pool com toast "Desfazer" (volta para quem estava). */
export async function devolverAoPool(
  escopo: EscopoVendas,
  lead: Pick<VendasLead, 'id' | 'nome' | 'agenteId'>,
  aoMudar: () => void,
): Promise<boolean> {
  const anterior = lead.agenteId
  const r = await reatribuirLeadAction(escopo, lead.id, null)
  if (!r.success) {
    toast.error(r.error)
    return false
  }
  aoMudar()
  toast.success(`${lead.nome} voltou ao pool`, {
    duration: 8000,
    action: anterior
      ? {
          label: 'Desfazer',
          onClick: () => {
            void reatribuirLeadAction(escopo, lead.id, anterior).then(res => {
              if (res.success) {
                toast.success('Lead de volta com quem estava')
                aoMudar()
              } else toast.error(res.error)
            })
          },
        }
      : undefined,
  })
  return true
}

/** Muda a etapa com toast "Desfazer" (volta à etapa anterior). */
export async function mudarEtapaComDesfazer(
  escopo: EscopoVendas,
  lead: Pick<VendasLead, 'id' | 'nome' | 'etapa'>,
  etapa: EtapaLead,
  extras: { motivoPerda?: string; confirmar?: boolean },
  rotuloNova: string,
  aoMudar: () => void,
): Promise<VendasLead | null> {
  const anterior = lead.etapa
  const r = await mudarEtapaAction(escopo, lead.id, { etapa, ...(extras.motivoPerda ? { motivoPerda: extras.motivoPerda } : {}), ...(extras.confirmar ? { confirmar: true } : {}) })
  if (!r.success) {
    toast.error(r.code === 'VENDAS_TRANSICAO_INVALIDA' ? 'Essa mudança de etapa não é permitida agora.' : r.error, {
      description: r.code === 'VENDAS_TRANSICAO_INVALIDA' ? r.error : undefined,
    })
    return null
  }
  aoMudar()
  toast.success(`${lead.nome} foi para ${rotuloNova}`, {
    duration: 8000,
    action: {
      label: 'Desfazer',
      onClick: () => {
        void mudarEtapaAction(escopo, lead.id, { etapa: anterior }).then(res => {
          if (res.success) {
            toast.success('Etapa restaurada')
            aoMudar()
          } else toast.error(res.error)
        })
      },
    },
  })
  return r.data
}
