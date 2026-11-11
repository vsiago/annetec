'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { definirProximoPassoAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { PASSO_VAZIO, SeletorProximoPasso, dataDoPasso, erroDoPasso, type PassoForm } from './campos'

/** Define (ou troca) o próximo passo do lead: o que fazer e quando. */
export function ProximoPassoDialog({
  aberto,
  aoFechar,
  escopo,
  leadId,
  leadNome,
  textoAtual,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  leadId: string
  leadNome: string
  textoAtual?: string | null
  aoConcluir: () => void
}) {
  const id = useId()
  const [passo, setPasso] = useState<PassoForm>(PASSO_VAZIO)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setPasso({ ...PASSO_VAZIO, texto: textoAtual ?? '', quando: 'amanha' })
      setTentou(false)
      setEnviando(false)
    }
  }, [aberto, textoAtual])

  const erro = erroDoPasso(passo, true)

  async function salvar() {
    setTentou(true)
    const em = dataDoPasso(passo)
    if (erro || !em) return
    setEnviando(true)
    const r = await definirProximoPassoAction(escopo, leadId, { texto: passo.texto.trim(), em })
    setEnviando(false)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    toast.success('Próximo passo marcado')
    aoConcluir()
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Próximo passo</DialogTitle>
          <DialogDescription>O que você vai fazer com {leadNome} e quando. Ele aparece em “Sua vez agora” na data.</DialogDescription>
        </DialogHeader>
        <SeletorProximoPasso passo={passo} aoMudar={setPasso} erro={tentou ? erro : null} idBase={id} />
        <DialogFooter className="gap-2 sm:gap-2">
          <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </AcaoPrincipal>
          <AcaoPrincipal onClick={() => void salvar()} carregando={enviando}>
            Marcar
          </AcaoPrincipal>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
