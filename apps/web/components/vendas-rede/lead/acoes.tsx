'use client'

import type { ReactNode } from 'react'
import { CircleCheck, FileText, Link2, PhoneCall, UserCheck, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { ETAPA_LEAD_LABELS, type EtapaLead, type VendasLead } from '@annetec/contracts'
import { mudarEtapaAction, reatribuirLeadAction, reivindicarLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'

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
 *  - em Disponíveis: Atender (reivindica);
 *  - novo, com dono: Registrar contato;
 *  - em contato: Enviar proposta (plataforma) ou Enviar link (clube);
 *  - proposta: Registrar contato (acompanhar);
 *  - negociação: Fechar venda;
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
      return { id: 'fechar', rotulo: 'Fechar venda', icone: <CircleCheck /> }
    default:
      return { id: 'abrir', rotulo: 'Ver detalhes', icone: <ExternalLink /> }
  }
}

/** Reivindica com feedback: sucesso, "já pegaram" (409) ou erro. Devolve o lead atualizado. */
export async function atenderLead(escopo: EscopoVendas, lead: Pick<VendasLead, 'id' | 'nome'>): Promise<VendasLead | null> {
  const r = await reivindicarLeadAction(escopo, lead.id)
  if (r.success) {
    toast.success(`${lead.nome} agora é seu lead.`, { description: 'Faça o primeiro contato e registre aqui.' })
    return r.data
  }
  if (r.code === 'VENDAS_LEAD_JA_REIVINDICADO') {
    toast.error('Outra pessoa atendeu este lead antes de você.', { description: 'Ele saiu de Disponíveis. Veja os próximos.' })
    return null
  }
  toast.error(mensagemDoErro(r.code, r.error))
  return null
}

/** Libera o lead (volta para Disponíveis) com toast "Desfazer" (volta para quem estava). */
export async function devolverAoPool(
  escopo: EscopoVendas,
  lead: Pick<VendasLead, 'id' | 'nome' | 'agenteId'> & { agenteNome?: string | null },
  aoMudar: () => void,
): Promise<boolean> {
  const anterior = lead.agenteId
  const nomeAnterior = lead.agenteNome ?? null
  const r = await reatribuirLeadAction(escopo, lead.id, null)
  if (!r.success) {
    toast.error(mensagemDoErro(r.code, r.error))
    return false
  }
  aoMudar()
  toast.success(`${lead.nome} foi liberado`, {
    description: 'Voltou para Disponíveis.',
    duration: 8000,
    action: anterior
      ? {
          label: 'Desfazer',
          onClick: () => {
            void reatribuirLeadAction(escopo, lead.id, anterior).then(res => {
              if (res.success) {
                toast.success(`Lead de volta com ${nomeAnterior ?? 'quem estava'}`)
                aoMudar()
              } else toast.error(mensagemDoErro(res.code, res.error))
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
    if (r.code === 'VENDAS_TRANSICAO_INVALIDA') {
      // A mensagem do servidor já vem com os nomes das etapas ("Este lead não pode ir de Em contato para Venda fechada.").
      toast.error(`${lead.nome} não pode ir de ${ETAPA_LEAD_LABELS[anterior]} para ${ETAPA_LEAD_LABELS[etapa]}.`, {
        description: etapa === 'ganho' ? 'Gere a proposta ou o link de adesão: a venda fecha quando o primeiro pagamento chegar.' : r.error,
      })
    } else toast.error(mensagemDoErro(r.code, r.error))
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
          } else toast.error(mensagemDoErro(res.code, res.error))
        })
      },
    },
  })
  return r.data
}
