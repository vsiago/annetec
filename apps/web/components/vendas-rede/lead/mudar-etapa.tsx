'use client'

import { useEffect, useId, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ETAPAS_LEAD, ETAPA_LEAD_LABELS, type EtapaLead, type VendasLead } from '@annetec/contracts'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { mudarEtapaComDesfazer } from './acoes'
import { Chips } from './campos'

const MOTIVOS = [
  { id: 'Sem interesse', rotulo: 'Sem interesse' },
  { id: 'Preço', rotulo: 'Preço' },
  { id: 'Sem resposta', rotulo: 'Sem resposta' },
  { id: 'Escolheu outra opção', rotulo: 'Escolheu outra opção' },
  { id: 'outro', rotulo: 'Outro' },
] as const

/**
 * Mudar etapa. Perdido pede o motivo (pílula ou texto livre); ganho manual pede
 * confirmação explícita (a venda normalmente fecha sozinha quando o pagamento
 * chega). Depois da mudança, toast com "Desfazer".
 */
export function MudarEtapaDialog({
  aberto,
  aoFechar,
  escopo,
  lead,
  etapaInicial,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  lead: Pick<VendasLead, 'id' | 'nome' | 'etapa'>
  etapaInicial?: EtapaLead
  aoConcluir: (atualizado: VendasLead) => void
}) {
  const id = useId()
  const [etapa, setEtapa] = useState<EtapaLead>('em_contato')
  const [motivo, setMotivo] = useState<string>('Sem interesse')
  const [detalhe, setDetalhe] = useState('')
  const [confirmou, setConfirmou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)

  const opcoes = ETAPAS_LEAD.filter(e => e !== lead.etapa).map(e => ({ id: e, rotulo: ETAPA_LEAD_LABELS[e] }))

  useEffect(() => {
    if (aberto) {
      setEtapa(etapaInicial ?? opcoes[0]?.id ?? 'em_contato')
      setMotivo('Sem interesse')
      setDetalhe('')
      setConfirmou(false)
      setEnviando(false)
      setTentou(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, etapaInicial, lead.etapa])

  const motivoFinal = motivo === 'outro' ? detalhe.trim() : [motivo, detalhe.trim()].filter(Boolean).join(': ')
  const erroMotivo = etapa === 'perdido' && motivoFinal.length < 3 ? 'Conte o motivo da perda.' : null
  const erroConfirmar = etapa === 'ganho' && !confirmou ? 'Confirme que a venda foi fechada.' : null

  async function salvar() {
    setTentou(true)
    if (erroMotivo || erroConfirmar) return
    setEnviando(true)
    const atualizado = await mudarEtapaComDesfazer(
      escopo,
      lead,
      etapa,
      { ...(etapa === 'perdido' ? { motivoPerda: motivoFinal } : {}), ...(etapa === 'ganho' ? { confirmar: true } : {}) },
      ETAPA_LEAD_LABELS[etapa],
      () => undefined,
    )
    setEnviando(false)
    if (atualizado) {
      aoConcluir(atualizado)
      aoFechar()
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mudar etapa</DialogTitle>
          <DialogDescription>
            {lead.nome} está em <strong>{ETAPA_LEAD_LABELS[lead.etapa]}</strong>. Para onde vai?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Chips rotulo="Nova etapa" valor={etapa} opcoes={opcoes} aoMudar={setEtapa} />
          {etapa === 'perdido' ? (
            <div className="flex flex-col gap-3">
              <Chips rotulo="Motivo da perda" valor={motivo as (typeof MOTIVOS)[number]['id']} opcoes={MOTIVOS} aoMudar={setMotivo} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-detalhe`}>{motivo === 'outro' ? 'Qual foi o motivo?' : 'Detalhe (opcional)'}</Label>
                <Textarea id={`${id}-detalhe`} value={detalhe} onChange={e => setDetalhe(e.target.value)} rows={2} maxLength={400} />
              </div>
              {tentou && erroMotivo ? (
                <p role="alert" className="m-0 text-sm text-[#B42318]">
                  {erroMotivo}
                </p>
              ) : null}
            </div>
          ) : null}
          {etapa === 'ganho' ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3">
              <p className="m-0 text-sm text-[#93370D]">
                O normal é a venda fechar sozinha quando o primeiro pagamento chega. Marque como ganho só se o cliente já fechou por fora.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox id={`${id}-confirma`} checked={confirmou} onCheckedChange={v => setConfirmou(v === true)} />
                <Label htmlFor={`${id}-confirma`} className="cursor-pointer">
                  Confirmo que a venda foi fechada
                </Label>
              </div>
              {tentou && erroConfirmar ? (
                <p role="alert" className="m-0 text-sm text-[#B42318]">
                  {erroConfirmar}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </AcaoPrincipal>
          <AcaoPrincipal onClick={() => void salvar()} carregando={enviando}>
            Mover para {ETAPA_LEAD_LABELS[etapa]}
          </AcaoPrincipal>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
