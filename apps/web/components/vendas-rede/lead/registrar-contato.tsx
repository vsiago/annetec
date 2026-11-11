'use client'

import { useEffect, useId, useState } from 'react'
import { Frown, Handshake, Mail, Meh, MapPinned, MessageCircle, NotebookPen, Phone, Smile } from 'lucide-react'
import { toast } from 'sonner'
import { SENTIMENTO_CONTATO_LABELS, type CreateEventoLeadInput, type SentimentoContato } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { definirProximoPassoAction, registrarEventoAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'
import { AcaoPrincipal } from '../ui/acao-principal'
import { FOCUS_RING } from '../ui/tokens'
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

/** Frases que já resolvem a maioria das ligações e conversas. */
const ATALHOS_DE_TEXTO = ['Pediu retorno', 'Quer proposta', 'Vai pensar'] as const

/** "Como a pessoa reagiu?": três botões grandes (ícone + texto; a cor nunca é o único sinal). */
const REACOES: ReadonlyArray<{ id: SentimentoContato; icone: React.ReactNode; ativo: string }> = [
  { id: 'positivo', icone: <Smile />, ativo: 'border-[#079455] bg-[#E3F6EA] text-[#067647]' },
  { id: 'neutro', icone: <Meh />, ativo: 'border-[#B54708] bg-[#FEF3DC] text-[#93370D]' },
  { id: 'negativo', icone: <Frown />, ativo: 'border-[#1570EF] bg-[#E8F1FD] text-[#175CD3]' },
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
  const [reacao, setReacao] = useState<SentimentoContato | null>(null)
  const [semResposta, setSemResposta] = useState(false)
  const [texto, setTexto] = useState('')
  const [passo, setPasso] = useState<PassoForm>(PASSO_VAZIO)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setTipo('ligacao')
      setReacao(null)
      setSemResposta(false)
      setTexto('')
      setPasso(PASSO_VAZIO)
      setTentou(false)
      setEnviando(false)
    }
  }, [aberto])

  // Ligação ou WhatsApp sem resposta: salva em um toque, sem texto e sem reação.
  const rotuloSemResposta = tipo === 'ligacao' ? 'Não atendeu' : tipo === 'whatsapp' ? 'Não respondeu' : null
  const semRespostaAtivo = semResposta && rotuloSemResposta !== null
  const erroTexto = !semRespostaAtivo && texto.trim().length < 2 ? 'Escreva em uma frase o que aconteceu.' : null
  const erroPasso = erroDoPasso(passo, false)

  async function enviar() {
    setTentou(true)
    if (erroTexto || erroPasso) return
    setEnviando(true)
    const textoFinal = texto.trim() || (semRespostaAtivo ? rotuloSemResposta : '')
    const r = await registrarEventoAction(escopo, leadId, {
      tipo,
      texto: textoFinal,
      ...(reacao && tipo !== 'nota' && !semRespostaAtivo ? { sentimento: reacao } : {}),
    })
    if (!r.success) {
      setEnviando(false)
      toast.error(mensagemDoErro(r.code, r.error))
      return
    }
    const em = dataDoPasso(passo)
    if (em && passo.texto.trim()) {
      const p = await definirProximoPassoAction(escopo, leadId, { texto: passo.texto.trim(), em })
      if (!p.success) toast.error('O contato foi registrado, mas o próximo passo não foi salvo.', { description: mensagemDoErro(p.code, p.error) })
    }
    setEnviando(false)
    toast.success('Contato registrado', {
      description: reacao === 'positivo' && !semRespostaAtivo && !(em && passo.texto.trim()) ? 'Lead quente. Que tal marcar o próximo passo agora?' : undefined,
    })
    aoConcluir()
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>O que aconteceu com {leadNome}? Fica no histórico do lead.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Chips rotulo="Tipo de contato" valor={tipo} opcoes={TIPOS} aoMudar={setTipo} />
          {rotuloSemResposta ? (
            <button
              type="button"
              role="switch"
              aria-checked={semRespostaAtivo}
              onClick={() => setSemResposta(v => !v)}
              className={cn(
                'flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 px-4 text-sm font-semibold transition-colors',
                semRespostaAtivo ? 'border-[#1E2A4A] bg-[#E5EDF5] text-[#1E2A4A]' : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
                FOCUS_RING,
              )}
            >
              <span>{rotuloSemResposta}</span>
              <span className="text-xs font-normal text-muted-foreground">{semRespostaAtivo ? 'Salvar sem escrever nada' : 'Toque se ninguém respondeu'}</span>
            </button>
          ) : null}
          {tipo !== 'nota' && !semRespostaAtivo ? (
            <div className="flex flex-col gap-2">
              <span id={`${id}-reacao`} className="text-sm font-medium text-foreground">
                Como a pessoa reagiu? <span className="font-normal text-muted-foreground">(opcional)</span>
              </span>
              <div role="radiogroup" aria-labelledby={`${id}-reacao`} className="grid grid-cols-3 gap-2">
                {REACOES.map(r => {
                  const ativo = reacao === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setReacao(ativo ? null : r.id)}
                      className={cn(
                        'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-sm font-semibold transition-all duration-150',
                        'motion-safe:active:scale-95',
                        ativo ? r.ativo : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
                        FOCUS_RING,
                      )}
                    >
                      <span aria-hidden="true" className="inline-flex [&>svg]:size-7">
                        {r.icone}
                      </span>
                      {SENTIMENTO_CONTATO_LABELS[r.id]}
                    </button>
                  )
                })}
              </div>
              <p className="m-0 text-xs text-muted-foreground">Ajuda a mostrar quais leads estão quentes e quais pedem atenção.</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-texto`}>{semRespostaAtivo ? 'Observação (opcional)' : 'O que aconteceu'}</Label>
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
            {!semRespostaAtivo && (tipo === 'ligacao' || tipo === 'whatsapp') ? (
              <div className="flex flex-wrap gap-2" aria-label="Atalhos de texto">
                {ATALHOS_DE_TEXTO.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setTexto(a)}
                    className={cn('min-h-11 rounded-full border border-border bg-white px-3.5 text-sm text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <SeletorProximoPasso passo={passo} aoMudar={setPasso} opcional erro={tentou ? erroPasso : null} idBase={id} />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <AcaoPrincipal variante="secundaria" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </AcaoPrincipal>
          <AcaoPrincipal onClick={() => void enviar()} carregando={enviando}>
            Registrar contato
          </AcaoPrincipal>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
