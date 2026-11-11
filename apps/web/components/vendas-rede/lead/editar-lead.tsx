'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { UpdateVendasLeadInput, VendasLead } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { atualizarLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { FormularioLead, corpoDoLead, validarLead, valoresDoLead, type ErrosLead, type ValoresLead } from './formulario-lead'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'

/** Edita o cadastro do lead (a conversão exige documento, e-mail, telefone e vidas/nascimento). */
export function EditarLeadDialog({
  aberto,
  aoFechar,
  escopo,
  lead,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  lead: VendasLead
  aoSalvar: (lead: VendasLead) => void
}) {
  const id = useId()
  const [valores, setValores] = useState<ValoresLead>(() => valoresDoLead(lead))
  const [erros, setErros] = useState<ErrosLead>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setValores(valoresDoLead(lead))
      setErros({})
      setEnviando(false)
    }
    // Reabrir recarrega os dados atuais do lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  async function salvar() {
    const e = validarLead(valores, ['nome', 'telefone', 'email', 'documento', 'uf', 'vidasEstimadas'])
    setErros(e)
    if (Object.keys(e).length > 0) return
    setEnviando(true)
    const r = await atualizarLeadAction(escopo, lead.id, corpoDoLead(valores, true, lead.dados) as UpdateVendasLeadInput)
    setEnviando(false)
    if (!r.success) {
      const mapa: ErrosLead = {}
      for (const [k, msg] of Object.entries(r.fieldErrors ?? {})) mapa[k as keyof ValoresLead] = msg
      setErros(mapa)
      toast.error(mensagemDoErro(r.code, r.error))
      return
    }
    toast.success('Dados atualizados')
    aoSalvar(r.data)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados de {lead.nome}</DialogTitle>
          <DialogDescription>Quanto mais completo, mais rápido sai a proposta ou a assinatura.</DialogDescription>
        </DialogHeader>
        <FormularioLead valores={valores} aoMudar={setValores} erros={erros} escopo={escopo} grupo="todos" idBase={id} />
        <DialogFooter className="gap-2 sm:gap-2">
          <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </AcaoPrincipal>
          <AcaoPrincipal onClick={() => void salvar()} carregando={enviando}>
            Salvar dados
          </AcaoPrincipal>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
