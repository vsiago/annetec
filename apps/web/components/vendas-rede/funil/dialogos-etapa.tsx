'use client'

import { useEffect, useId, useState } from 'react'
import { PartyPopper, Info } from 'lucide-react'
import type { VendasLead } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MOTIVOS_DE_PERDA } from '@/lib/vendas-rede/funil'
import { AcaoPrincipal } from '../ui/acao-principal'
import { Chips } from '../lead/campos'

export type PedidoEtapa =
  | { tipo: 'perdido'; lead: VendasLead }
  | { tipo: 'ganho'; lead: VendasLead }
  | { tipo: 'ganho-bloqueado'; lead: VendasLead; motivo: string }

/**
 * Diálogos que o Funil abre ao soltar (ou escolher no menu) um card em Perdido ou Venda fechada:
 *  - Perdido: pede o motivo (pílulas + detalhe);
 *  - Venda fechada (master e gerente): pede confirmação, porque a venda normalmente fecha sozinha;
 *  - Venda fechada (vendedor e supervisor): explica como a venda fecha (pelo pagamento).
 */
export function DialogosDeEtapa({
  pedido,
  aoFechar,
  aoConfirmarPerda,
  aoConfirmarGanho,
}: {
  pedido: PedidoEtapa | null
  aoFechar: () => void
  aoConfirmarPerda: (lead: VendasLead, motivo: string) => Promise<void>
  aoConfirmarGanho: (lead: VendasLead) => Promise<void>
}) {
  const id = useId()
  const [motivo, setMotivo] = useState<(typeof MOTIVOS_DE_PERDA)[number]>('Sem interesse')
  const [detalhe, setDetalhe] = useState('')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (pedido) {
      setMotivo('Sem interesse')
      setDetalhe('')
      setTentou(false)
      setEnviando(false)
    }
  }, [pedido])

  const motivoFinal = motivo === 'Outro' ? detalhe.trim() : [motivo, detalhe.trim()].filter(Boolean).join(': ')
  const erroMotivo = motivoFinal.length < 3 ? 'Conte o motivo da perda.' : null

  async function confirmarPerda() {
    if (pedido?.tipo !== 'perdido') return
    setTentou(true)
    if (erroMotivo) return
    setEnviando(true)
    await aoConfirmarPerda(pedido.lead, motivoFinal)
    setEnviando(false)
  }

  async function confirmarGanho() {
    if (pedido?.tipo !== 'ganho') return
    setEnviando(true)
    await aoConfirmarGanho(pedido.lead)
    setEnviando(false)
  }

  return (
    <Dialog open={pedido !== null} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {pedido?.tipo === 'perdido' ? (
          <>
            <DialogHeader>
              <DialogTitle>Marcar {pedido.lead.nome} como perdido</DialogTitle>
              <DialogDescription>O motivo fica no histórico e ajuda a entender o que mais aparece nas perdas.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Chips
                rotulo="Motivo da perda"
                valor={motivo}
                opcoes={MOTIVOS_DE_PERDA.map(m => ({ id: m, rotulo: m }))}
                aoMudar={setMotivo}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-detalhe`}>{motivo === 'Outro' ? 'Qual foi o motivo?' : 'Detalhe (opcional)'}</Label>
                <Textarea id={`${id}-detalhe`} value={detalhe} onChange={e => setDetalhe(e.target.value)} rows={2} maxLength={400} />
              </div>
              {tentou && erroMotivo ? (
                <p role="alert" className="m-0 text-sm text-[#B42318]">
                  {erroMotivo}
                </p>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
                Cancelar
              </AcaoPrincipal>
              <AcaoPrincipal onClick={() => void confirmarPerda()} carregando={enviando}>
                Marcar como perdido
              </AcaoPrincipal>
            </DialogFooter>
          </>
        ) : pedido?.tipo === 'ganho' ? (
          <>
            <DialogHeader>
              <DialogTitle>Fechar a venda de {pedido.lead.nome}?</DialogTitle>
              <DialogDescription>
                O normal é a venda fechar sozinha quando o primeiro pagamento chega. Confirme só se o cliente já fechou por fora.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
                Ainda não
              </AcaoPrincipal>
              <AcaoPrincipal icone={<PartyPopper />} onClick={() => void confirmarGanho()} carregando={enviando}>
                Sim, venda fechada
              </AcaoPrincipal>
            </DialogFooter>
          </>
        ) : pedido?.tipo === 'ganho-bloqueado' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="size-5 text-[#175CD3]" aria-hidden="true" />
                Como a venda fecha
              </DialogTitle>
              <DialogDescription>{pedido.motivo}</DialogDescription>
            </DialogHeader>
            <p className="m-0 text-sm text-muted-foreground">
              Abra o lead e use a aba Venda. Quando o pagamento chegar, {pedido.lead.nome} vira venda fechada sozinho.
            </p>
            <DialogFooter>
              <AcaoPrincipal onClick={aoFechar}>Entendi</AcaoPrincipal>
            </DialogFooter>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>Etapa</DialogTitle>
            <DialogDescription>Escolha a etapa.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}
