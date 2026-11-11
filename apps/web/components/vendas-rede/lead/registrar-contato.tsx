'use client'

import { useEffect, useId, useState } from 'react'
import { Handshake, Mail, MapPinned, MessageCircle, NotebookPen, Phone } from 'lucide-react'
import { toast } from 'sonner'
import type { CreateEventoLeadInput } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { definirProximoPassoAction, registrarEventoAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { Chips, PASSO_VAZIO, SeletorProximoPasso, dataDoPasso, erroDoPasso, type PassoForm } from './campos'

type TipoContato = CreateEventoLeadInput['tipo']

const TIPOS: ReadonlyArray<{ id: TipoContato; rotulo: string; icone: React.ReactNode }> = [
  { id: 'ligacao', rotulo: 'Ligação', icone: <Phone /> },
  { id: 'whatsapp', rotulo: 'WhatsApp', icone: <MessageCircle /> },
  { id: 'email', rotulo: 'E-mail', icone: <Mail /> },
  { id: 'reuniao', rotulo: 'Reunião', icone: <Handshake /> },
  { id: 'visita', rotulo: 'Visita', icone: <MapPinned /> },
  { id: 'nota', rotulo: 'Anotação', icone: <NotebookPen /> },
]

/**
 * Registrar contato: o que aconteceu (tipo + resumo) e, se já souber, o próximo
 * passo com data. Dois toques para o caso comum: escolher o tipo e escrever uma linha.
 */
export function RegistrarContatoDialog({
  aberto,
  aoFechar,
  escopo,
  leadId,
  leadNome,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  leadId: string
  leadNome: string
  aoConcluir: () => void
}) {
  const id = useId()
  const [tipo, setTipo] = useState<TipoContato>('ligacao')
  const [texto, setTexto] = useState('')
  const [passo, setPasso] = useState<PassoForm>(PASSO_VAZIO)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setTipo('ligacao')
      setTexto('')
      setPasso(PASSO_VAZIO)
      setTentou(false)
      setEnviando(false)
    }
  }, [aberto])

  const erroTexto = texto.trim().length < 2 ? 'Escreva em uma frase o que foi combinado.' : null
  const erroPasso = erroDoPasso(passo, false)

  async function enviar() {
    setTentou(true)
    if (erroTexto || erroPasso) return
    setEnviando(true)
    const r = await registrarEventoAction(escopo, leadId, { tipo, texto: texto.trim() })
    if (!r.success) {
      setEnviando(false)
      toast.error(r.error)
      return
    }
    const em = dataDoPasso(passo)
    if (em && passo.texto.trim()) {
      const p = await definirProximoPassoAction(escopo, leadId, { texto: passo.texto.trim(), em })
      if (!p.success) toast.error('O contato foi registrado, mas o próximo passo não salvou.', { description: p.error })
    }
    setEnviando(false)
    toast.success('Contato registrado')
    aoConcluir()
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>O que aconteceu com {leadNome}? Fica na linha do tempo.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Chips rotulo="Tipo de contato" valor={tipo} opcoes={TIPOS} aoMudar={setTipo} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-texto`}>O que foi combinado</Label>
            <Textarea
              id={`${id}-texto`}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="Ex.: conversamos 10 min, quer receber a proposta ainda hoje."
              aria-invalid={(tentou && Boolean(erroTexto)) || undefined}
            />
            {tentou && erroTexto ? (
              <p role="alert" className="m-0 text-sm text-[#B42318]">
                {erroTexto}
              </p>
            ) : null}
          </div>
          <SeletorProximoPasso passo={passo} aoMudar={setPasso} opcional erro={tentou ? erroPasso : null} idBase={id} />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </AcaoPrincipal>
          <AcaoPrincipal onClick={() => void enviar()} carregando={enviando}>
            Salvar contato
          </AcaoPrincipal>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
