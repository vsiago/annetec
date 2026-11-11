'use client'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { VendasLead } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { criarLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { PASSO_VAZIO, SeletorProximoPasso, dataDoPasso, erroDoPasso, type PassoForm } from './campos'
import { FormularioLead, LEAD_VAZIO, corpoDoLead, validarLead, type ErrosLead, type ValoresLead } from './formulario-lead'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'

/**
 * Assistente "Novo lead" em 3 passos curtos: quem é, detalhes do cadastro e
 * próximo passo. O lead nasce com você como dono, na etapa Novo.
 */
export function NovoLeadDialog({
  aberto,
  aoFechar,
  escopo,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  aoCriar: (lead: VendasLead) => void
}) {
  const id = useId()
  const [passoAtual, setPassoAtual] = useState(0)
  // A plataforma vende para empresa: é o tipo que já vem marcado.
  const vazio = { ...LEAD_VAZIO, tipo: escopo.kind === 'platform' ? ('empresa' as const) : ('pessoa' as const) }
  const [valores, setValores] = useState<ValoresLead>(vazio)
  const [proximo, setProximo] = useState<PassoForm>(PASSO_VAZIO)
  const [erros, setErros] = useState<ErrosLead>({})
  const [erroProximo, setErroProximo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setPassoAtual(0)
      setValores(vazio)
      setProximo(PASSO_VAZIO)
      setErros({})
      setErroProximo(null)
      setEnviando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const titulos = ['Contato', 'Detalhes', 'Próximo passo']

  function avancar() {
    if (passoAtual === 0) {
      const e = validarLead(valores, ['nome', 'telefone', 'email'])
      setErros(e)
      if (Object.keys(e).length > 0) return
    } else if (passoAtual === 1) {
      const e = validarLead(valores, ['documento', 'uf', 'vidasEstimadas'])
      setErros(e)
      if (Object.keys(e).length > 0) return
    }
    setPassoAtual(p => p + 1)
  }

  async function criar() {
    const e = erroDoPasso(proximo, false)
    setErroProximo(e)
    if (e) return
    setEnviando(true)
    const em = dataDoPasso(proximo)
    const corpo = corpoDoLead(valores, false) as { nome: string }
    const r = await criarLeadAction(escopo, {
      ...corpo,
      ...(em && proximo.texto.trim() ? { proximoPasso: proximo.texto.trim(), proximoPassoEm: em } : {}),
    })
    setEnviando(false)
    if (!r.success) {
      // Erros de campo da API voltam para o passo certo.
      const campos = r.fieldErrors ?? {}
      const mapa: ErrosLead = {}
      for (const [k, msg] of Object.entries(campos)) mapa[k as keyof ValoresLead] = msg
      if (Object.keys(mapa).length > 0) {
        setErros(mapa)
        setPassoAtual(mapa.nome || mapa.telefone || mapa.email ? 0 : 1)
      }
      toast.error(mensagemDoErro(r.code, r.error))
      return
    }
    toast.success(`${r.data.nome} entrou no seu funil.`, { description: 'Faça o primeiro contato e registre aqui.' })
    aoCriar(r.data)
    aoFechar()
  }

  const ultimo = passoAtual === titulos.length - 1

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !enviando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>
            Passo {passoAtual + 1} de {titulos.length}: {titulos[passoAtual]}
          </DialogDescription>
        </DialogHeader>
        <div aria-hidden="true" className="flex gap-1.5">
          {titulos.map((t, i) => (
            <span key={t} className={`h-1.5 flex-1 rounded-full ${i <= passoAtual ? 'bg-[#1E2A4A]' : 'bg-[#E4E7EC]'}`} />
          ))}
        </div>

        {passoAtual === 0 ? (
          <FormularioLead valores={valores} aoMudar={setValores} erros={erros} escopo={escopo} grupo="contato" idBase={id} />
        ) : null}
        {passoAtual === 1 ? (
          <FormularioLead valores={valores} aoMudar={setValores} erros={erros} escopo={escopo} grupo="detalhes" idBase={id} />
        ) : null}
        {passoAtual === 2 ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              Marque o que você vai fazer a seguir. Na data, {valores.nome.split(' ')[0] || 'o lead'} aparece em “Sua vez agora”. Se preferir, pule este passo.
            </p>
            <SeletorProximoPasso passo={proximo} aoMudar={setProximo} opcional erro={erroProximo} idBase={id} />
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {passoAtual > 0 ? (
            <AcaoPrincipal variante="secundaria" onClick={() => setPassoAtual(p => p - 1)} disabled={enviando}>
              Voltar
            </AcaoPrincipal>
          ) : (
            <AcaoPrincipal variante="secundaria" onClick={aoFechar}>
              Cancelar
            </AcaoPrincipal>
          )}
          {ultimo ? (
            <AcaoPrincipal onClick={() => void criar()} carregando={enviando}>
              Criar lead
            </AcaoPrincipal>
          ) : (
            <AcaoPrincipal onClick={avancar}>Continuar</AcaoPrincipal>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
