'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2, Clock3, ExternalLink, MessageCircle } from 'lucide-react'
import { formatBoletoLine, type CheckoutResult, type ResultadoBalcao, type VendasPlanoBalcao } from '@annetec/contracts'
import { AcaoPrincipal } from '../ui/acao-principal'
import { CopiarBotao } from '../ui/copiar-botao'
import { formatarMoeda, primeiroNome } from '../ui/mascaras'
import { QrCode } from '../ui/qr-code'
import { simularEconomia } from '../ui/simulador-economia'
import { montarWaLink } from '../ui/wa-link'

export type ConcluidoInfo = {
  resultado: ResultadoBalcao
  nome: string
  telefone: string
  servico: string
  valorTabela: number
  plano?: VendasPlanoBalcao
  checkout: CheckoutResult | null
  forma?: 'pix' | 'boleto'
  unidade: string
}

function linkWa(telefone: string, texto: string): string {
  return montarWaLink(telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`
}

function textoPagamento(info: ConcluidoInfo): string {
  const abertura = `Olá ${primeiroNome(info.nome)}! Aqui é da ${info.unidade}.`
  const plano = info.plano ? ` Plano ${info.plano.nome}: ${formatarMoeda(info.plano.precoMensal)}/mês.` : ''
  const c = info.checkout?.charge
  if (c?.pix?.payload) return `${abertura}${plano} Para ativar, pague o Pix copia e cola:\n\n${c.pix.payload}`
  if (c?.boleto) {
    const linha = formatBoletoLine(c.boleto.identificationField)
    return `${abertura}${plano} Para ativar, pague o boleto.\nLinha digitável: ${linha}${c.boleto.url ? `\nBoleto: ${c.boleto.url}` : ''}`
  }
  return `${abertura}${plano} Sua adesão foi registrada.`
}

function textoOferta(info: ConcluidoInfo): string {
  const abertura = `Olá ${primeiroNome(info.nome)}! Obrigado pela visita à ${info.unidade}.`
  if (!info.plano) {
    return `${abertura} Quando quiser conhecer nossos planos, é só responder esta mensagem.`
  }
  const r = simularEconomia(info.valorTabela, info.plano)
  const servico = info.servico ? `${info.servico.toLowerCase()}` : 'o atendimento'
  const adesao = info.plano.adesao ? ` + adesão de ${formatarMoeda(info.plano.adesao)}` : ''
  return (
    `${abertura} Hoje ${servico} sai por ${formatarMoeda(info.valorTabela)}. ` +
    `Com o plano ${info.plano.nome} ficaria ${formatarMoeda(r.valorComPlano)} (−${info.plano.descontoPercentual} %), ` +
    `uma economia de ${formatarMoeda(r.economiaNaConsulta)} já na primeira consulta. ` +
    `Mensalidade de ${formatarMoeda(info.plano.precoMensal)}${adesao}. Quando decidir, é só responder esta mensagem.`
  )
}

function validade(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return null
  return `Válido até ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Tela final: confirmação (aria-live), pagamento da assinatura ou resumo do "vai pensar" e "Novo atendimento". */
export function Concluido({ info, aoNovo }: { info: ConcluidoInfo; aoNovo: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titulo.current?.focus()
  }, [])

  const charge = info.checkout?.charge ?? null
  const pix = charge?.pix ?? null
  const boleto = charge?.boleto ?? null
  const ehAssinatura = info.resultado === 'assinou'

  const cabecalho: Record<ResultadoBalcao, { titulo: string; texto: string }> = {
    assinou: {
      titulo: 'Adesão registrada',
      texto: charge ? 'Falta só o pagamento. Mostre o código ou envie pelo WhatsApp.' : 'A cobrança será enviada à pessoa por e-mail.',
    },
    vai_pensar: { titulo: 'Lead criado · retomamos em 2 dias', texto: 'Envie o resumo da oferta para a pessoa não esquecer.' },
    recusou: { titulo: 'Atendimento registrado', texto: 'Anotamos que a pessoa não quis o plano.' },
    ja_associado: { titulo: 'Atendimento registrado', texto: 'Atendimento de associado salvo.' },
    so_informacao: { titulo: 'Atendimento registrado', texto: 'Salvo como só informação.' },
  }
  const c = cabecalho[info.resultado]
  const Icone = info.resultado === 'vai_pensar' ? Clock3 : CheckCircle2

  return (
    <div className="flex flex-col gap-5">
      <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-3xl border border-[#ABEFC6] bg-[#ECFDF3] p-5">
        <Icone className="mt-0.5 size-8 shrink-0 text-[#067647]" aria-hidden="true" />
        <div className="min-w-0">
          <h1 ref={titulo} tabIndex={-1} className="m-0 text-2xl font-bold text-[#054F31] outline-none">
            {c.titulo}
          </h1>
          <p className="m-0 mt-1 text-base text-[#054F31]">{c.texto}</p>
        </div>
      </div>

      {ehAssinatura && pix ? (
        <section aria-label="Pagamento por Pix" className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-white p-5">
          <p className="m-0 text-lg font-semibold text-foreground">
            Pix de <span className="tabular-nums">{formatarMoeda(charge?.amount)}</span>
          </p>
          {pix.qrCodeBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${pix.qrCodeBase64}`}
              alt="QR Code do Pix"
              className="size-60 rounded-xl border border-border bg-white p-2 [image-rendering:pixelated]"
            />
          ) : (
            <QrCode valor={pix.payload} tamanho={240} titulo="QR Code do Pix" />
          )}
          {validade(pix.expiresAt) ? <p className="m-0 text-sm text-muted-foreground">{validade(pix.expiresAt)}</p> : null}
          <div className="flex w-full flex-col gap-2">
            <label htmlFor="pix-copia" className="text-sm font-semibold text-foreground">Pix copia e cola</label>
            <textarea
              id="pix-copia"
              readOnly
              rows={3}
              value={pix.payload}
              onFocus={e => e.currentTarget.select()}
              className="w-full resize-none rounded-xl border border-border bg-[#F8F9FB] p-3 font-mono text-xs text-foreground"
            />
            <CopiarBotao texto={pix.payload} rotulo="Copiar código Pix" mensagem="Código Pix copiado" className="min-h-14 w-full text-base" />
          </div>
        </section>
      ) : null}

      {ehAssinatura && !pix && boleto ? (
        <section aria-label="Pagamento por boleto" className="flex flex-col gap-4 rounded-3xl border border-border bg-white p-5">
          <p className="m-0 text-lg font-semibold text-foreground">
            Boleto de <span className="tabular-nums">{formatarMoeda(charge?.amount)}</span>
            {charge?.dueDate ? ` · vence em ${new Date(`${charge.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
          </p>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm font-semibold text-foreground">Linha digitável</p>
            <p className="m-0 break-all rounded-xl bg-[#F8F9FB] p-3 font-mono text-base text-foreground">
              {formatBoletoLine(boleto.identificationField)}
            </p>
            <CopiarBotao texto={boleto.identificationField} rotulo="Copiar linha digitável" mensagem="Linha digitável copiada" className="min-h-14 w-full text-base" />
          </div>
          {boleto.url ? (
            <AcaoPrincipal href={boleto.url} target="_blank" rel="noopener noreferrer" tamanho="xl" bloco variante="secundaria" icone={<ExternalLink />}>
              Abrir o boleto
            </AcaoPrincipal>
          ) : null}
        </section>
      ) : null}

      {ehAssinatura && charge ? (
        <AcaoPrincipal
          href={linkWa(info.telefone, textoPagamento(info))}
          target="_blank"
          rel="noopener noreferrer"
          tamanho="xl"
          bloco
          icone={<MessageCircle />}
        >
          Enviar pelo WhatsApp
        </AcaoPrincipal>
      ) : null}

      {info.resultado === 'vai_pensar' ? (
        <section aria-label="Resumo para enviar" className="flex flex-col gap-3 rounded-3xl border border-border bg-white p-5">
          <p className="m-0 whitespace-pre-line rounded-xl bg-[#F8F9FB] p-3 text-sm leading-relaxed text-foreground">{textoOferta(info)}</p>
          <AcaoPrincipal
            href={linkWa(info.telefone, textoOferta(info))}
            target="_blank"
            rel="noopener noreferrer"
            tamanho="xl"
            bloco
            icone={<MessageCircle />}
          >
            Enviar resumo pelo WhatsApp
          </AcaoPrincipal>
        </section>
      ) : null}

      <AcaoPrincipal tamanho="xl" bloco variante={ehAssinatura && charge ? 'secundaria' : info.resultado === 'vai_pensar' ? 'secundaria' : 'principal'} onClick={aoNovo}>
        Novo atendimento
      </AcaoPrincipal>
    </div>
  )
}
