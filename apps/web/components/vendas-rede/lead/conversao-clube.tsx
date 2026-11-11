'use client'

import { useEffect, useState } from 'react'
import { Banknote, Link2, Loader2, MessageCircle, QrCode as QrIcon, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { formatBoletoLine, type CheckoutResult, type VendasLead } from '@annetec/contracts'
import { ConfirmDialog } from '@/components/admin-platform/billing/console-kit'
import { assinarLeadAction, gerarLinkAdesaoAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'
import type { LinkAdesao } from '@/lib/vendas-rede/tipos'
import { useVendasRede } from '../provider'
import { AcaoPrincipal } from '../ui/acao-principal'
import { CopiarBotao } from '../ui/copiar-botao'
import { formatarMoeda, primeiroNome } from '../ui/mascaras'
import { QrCode } from '../ui/qr-code'
import { mensagemDoModelo, montarWaLink } from '../ui/wa-link'
import { Chips } from './campos'
import { SeletorPlano } from './seletor-plano'
import { usePlanos } from './use-planos'

type Metodo = 'pix' | 'boleto'

/**
 * Conversão no clube:
 *  - Link de adesão por plano (QR, copiar, WhatsApp): o cliente assina sozinho;
 *  - Assinar agora (presencial): gera a assinatura e mostra Pix (QR + copia e
 *    cola) ou boleto (linha digitável) para o cliente pagar na hora.
 */
export function ConversaoClube({
  escopo,
  lead,
  aoMudar,
  aoEditarDados,
}: {
  escopo: EscopoVendas
  lead: VendasLead
  aoMudar: () => void
  aoEditarDados: () => void
}) {
  const { planos, erro, recarregar } = usePlanos(escopo)
  const { eu } = useVendasRede()
  const [planoId, setPlanoId] = useState<string | null>(lead.interessePlanoId)
  const [link, setLink] = useState<LinkAdesao | null>(null)
  const [gerandoLink, setGerandoLink] = useState(false)
  const [metodo, setMetodo] = useState<Metodo>('pix')
  const [assinando, setAssinando] = useState(false)
  const [confirmandoAssinatura, setConfirmandoAssinatura] = useState(false)
  const [resultado, setResultado] = useState<CheckoutResult | null>(null)
  const [pendencias, setPendencias] = useState<string[]>([])
  // O vendedor completou o cadastro: os avisos da tentativa anterior ficam velhos.
  useEffect(() => {
    setPendencias([])
  }, [lead.documento, lead.vidasEstimadas, lead.email, lead.telefone])

  useEffect(() => {
    if (!planoId && planos && planos.length === 1) setPlanoId(planos[0]!.id)
  }, [planos, planoId])

  // Trocar de plano invalida o link já gerado.
  useEffect(() => {
    setLink(prev => (prev && prev.planoId !== planoId ? null : prev))
  }, [planoId])

  const plano = planos?.find(p => p.id === planoId) ?? null

  async function gerarLink() {
    if (!planoId) return
    setGerandoLink(true)
    const r = await gerarLinkAdesaoAction(escopo, lead.id, planoId)
    setGerandoLink(false)
    if (!r.success) {
      toast.error(mensagemDoErro(r.code, r.error))
      return
    }
    setLink(r.data)
    toast.success('Link de adesão gerado', { description: 'Copie, mostre o QR ou envie pelo WhatsApp.' })
    aoMudar()
  }

  // Devolve se a assinatura foi criada (a confirmação fecha só nesse caso).
  async function assinar(): Promise<boolean> {
    if (!planoId) return false
    setAssinando(true)
    setPendencias([])
    const r = await assinarLeadAction(escopo, lead.id, { planoId, metodoPagamento: metodo })
    setAssinando(false)
    if (!r.success) {
      const itens = Object.values(r.fieldErrors ?? {}).filter(Boolean)
      if (itens.length > 0) setPendencias(itens)
      else toast.error(mensagemDoErro(r.code, r.error))
      return true
    }
    setResultado(r.data)
    toast.success('Assinatura criada', { description: 'Agora é só o cliente pagar. A venda é fechada quando o pagamento for confirmado.' })
    aoMudar()
    return true
  }

  // Mesmo modelo "Envio do link" das Regras: o administrador edita e o vendedor vê o efeito aqui.
  const textoWa = link
    ? mensagemDoModelo(eu.config.modelosMensagem, 'envio-link', {
        nome: primeiroNome(lead.nome),
        plano: link.planoNome,
        vendedor: eu.agente?.nome ?? '',
        link: link.url,
      })
    : ''
  const waLink = link ? montarWaLink(lead.telefone, textoWa) : null

  if (resultado) {
    const cobranca = resultado.charge
    const urlBoleto = cobranca.boleto?.url ?? cobranca.invoiceUrl
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-[#ABEFC6] bg-[#ECFDF3] p-4 text-sm text-[#067647]">
          <p className="m-0 font-semibold">Assinatura do plano {resultado.planName} criada</p>
          <p className="m-0 mt-0.5">
            {formatarMoeda(cobranca.amount)} · vence em {cobranca.dueDate.split('-').reverse().join('/')}. Mostre o pagamento para o cliente.
          </p>
        </div>
        {cobranca.pix ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-4">
            <QrCode valor={cobranca.pix.payload} tamanho={208} titulo="QR code do Pix da assinatura" />
            <p className="m-0 text-center text-xs text-muted-foreground">Aponte a câmera do banco para o QR, ou use o Pix copia e cola.</p>
            <CopiarBotao texto={cobranca.pix.payload} rotulo="Copiar Pix copia e cola" mensagem="Pix copiado" />
          </div>
        ) : null}
        {cobranca.boleto ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
            <p className="m-0 text-xs text-muted-foreground">Linha digitável do boleto</p>
            <p className="m-0 break-all font-mono text-sm font-semibold text-foreground">{formatBoletoLine(cobranca.boleto.identificationField)}</p>
            <div className="flex flex-wrap gap-2">
              <CopiarBotao texto={cobranca.boleto.identificationField} rotulo="Copiar linha digitável" mensagem="Linha digitável copiada" />
              {urlBoleto ? (
                <a
                  href={urlBoleto}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold hover:bg-[#F2F4F7]"
                >
                  <ReceiptText className="size-4" aria-hidden="true" /> Abrir o boleto
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        {!cobranca.pix && !cobranca.boleto ? (
          <p className="m-0 text-sm text-muted-foreground">O pagamento ainda está sendo gerado. Reabra este lead em instantes.</p>
        ) : null}
        <AcaoPrincipal variante="secundaria" onClick={() => setResultado(null)}>
          Voltar
        </AcaoPrincipal>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-sm text-muted-foreground">
        Escolha o plano. Depois, mande o link para o cliente assinar sozinho ou assine agora, com ele ao seu lado.
      </p>

      {erro ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-[#B42318]">
          {erro}
          <AcaoPrincipal variante="secundaria" onClick={() => void recarregar()}>
            Tentar de novo
          </AcaoPrincipal>
        </div>
      ) : !planos ? (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando planos…
        </div>
      ) : planos.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">O clube ainda não tem plano ativo. Peça ao administrador para ativar um plano.</p>
      ) : (
        <SeletorPlano planos={planos} valor={planoId} aoMudar={setPlanoId} />
      )}

      <section aria-label="Link de adesão" className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-[#1E2A4A]" aria-hidden="true" /> Link de adesão
        </h3>
        {!link ? (
          <AcaoPrincipal onClick={() => void gerarLink()} carregando={gerandoLink} disabled={!planoId} icone={<QrIcon />} bloco>
            Gerar link do plano {plano?.nome ?? ''}
          </AcaoPrincipal>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2">
              <QrCode valor={link.url} tamanho={176} titulo={`QR code do link de adesão do plano ${link.planoNome}`} />
              <p className="m-0 text-center text-xs text-muted-foreground">O cliente aponta a câmera e assina com o seu código.</p>
            </div>
            <p className="m-0 break-all rounded-xl bg-[#F8F9FB] px-3 py-2 text-xs text-[#344054]">{link.url}</p>
            <div className="flex flex-wrap gap-2">
              <CopiarBotao texto={link.url} rotulo="Copiar link" mensagem="Link copiado" />
              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--vr-accent,#1E2A4A)] px-4 text-sm font-semibold text-[var(--vr-accent-fg,#FFFFFF)] hover:brightness-110"
                >
                  <MessageCircle className="size-4" aria-hidden="true" /> Enviar no WhatsApp
                </a>
              ) : (
                <span className="inline-flex min-h-11 items-center text-xs text-muted-foreground">Sem telefone válido para o WhatsApp.</span>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Assinar agora" className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
          <Banknote className="size-4 text-[#1E2A4A]" aria-hidden="true" /> Assinar agora, presencial
        </h3>
        <Chips
          rotulo="Forma de pagamento"
          valor={metodo}
          opcoes={[
            { id: 'pix', rotulo: 'Pix' },
            { id: 'boleto', rotulo: 'Boleto' },
          ]}
          aoMudar={setMetodo}
        />
        <p className="m-0 text-xs text-muted-foreground">Cartão só pelo link de adesão, porque o cliente digita os dados do cartão.</p>
        {pendencias.length > 0 ? (
          <div role="alert" className="flex flex-col gap-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">
            <p className="m-0 font-semibold">Complete o cadastro do titular</p>
            <ul className="m-0 list-disc pl-5">
              {pendencias.map(p => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <AcaoPrincipal variante="secundaria" onClick={aoEditarDados} className="self-start">
              Completar cadastro
            </AcaoPrincipal>
          </div>
        ) : null}
        <AcaoPrincipal variante="secundaria" onClick={() => setConfirmandoAssinatura(true)} carregando={assinando} disabled={!planoId} bloco aria-describedby={planoId ? undefined : 'motivo-assinar-agora'}>
          Assinar agora com o cliente
        </AcaoPrincipal>
        {!planoId ? (
          <p id="motivo-assinar-agora" className="m-0 text-xs text-muted-foreground">
            Escolha um plano para assinar.
          </p>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmandoAssinatura}
        onOpenChange={setConfirmandoAssinatura}
        title="Assinar agora?"
        confirmLabel="Criar assinatura"
        onConfirm={assinar}
        description={
          <div className="flex flex-col gap-3 text-sm text-foreground">
          <dl className="m-0 flex flex-col gap-1.5">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Plano</dt>
              <dd className="m-0 text-right font-semibold">{plano?.nome ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">1ª cobrança</dt>
              <dd className="m-0 text-right font-semibold">
                {plano ? formatarMoeda(plano.precoMensal + plano.adesao) : '—'}
                {plano && plano.adesao > 0 ? <span className="block text-xs font-normal text-muted-foreground">mensalidade + adesão de {formatarMoeda(plano.adesao)}</span> : null}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Forma de pagamento</dt>
              <dd className="m-0 text-right font-semibold">{metodo === 'pix' ? 'Pix' : 'Boleto'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Titular</dt>
              <dd className="m-0 text-right font-semibold">{lead.nome}</dd>
            </div>
          </dl>
          <p className="m-0 text-xs text-muted-foreground">Isto cria a assinatura e a cobrança agora. Confirme com o cliente antes de continuar.</p>
          </div>
        }
      />
    </div>
  )
}
