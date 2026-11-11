'use client'

import { useCallback, useEffect, useState } from 'react'
import { BadgePercent, FileSignature, Loader2, Mail, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { SellerProposal, VendasLead } from '@annetec/contracts'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DiscountStatusPill, LINK_STATUS_META, SellerProposalStatusPill, canRequestDiscount, canSendLink, discountSummary } from '@/components/sales/sales-ui'
import { criarPropostaLeadAction, getPropostaLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { AcaoPrincipal } from '../ui/acao-principal'
import { formatarMoeda } from '../ui/mascaras'
import { PedirDescontoDialog } from './pedir-desconto'
import { SeletorPlano } from './seletor-plano'
import { usePlanos } from './use-planos'

/**
 * Conversão na plataforma: gerar a proposta (link de contratação) para o
 * cadastro do lead, enviar por e-mail e pedir desconto. A proposta vive aqui,
 * dentro do lead (não há mais a tela "Propostas").
 */
export function ConversaoPlataforma({
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
  const temProposta = lead.conversao?.tipo === 'proposta'
  const { planos, erro: erroPlanos, recarregar: recarregarPlanos } = usePlanos(escopo, !temProposta)
  const [proposta, setProposta] = useState<SellerProposal | null>(null)
  const [carregandoProposta, setCarregandoProposta] = useState(temProposta)
  const [planoId, setPlanoId] = useState<string | null>(lead.interessePlanoId)
  const [enviarEmail, setEnviarEmail] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [pendencias, setPendencias] = useState<string[]>([])
  // O vendedor completou o cadastro: os avisos da tentativa anterior ficam velhos.
  useEffect(() => {
    setPendencias([])
  }, [lead.documento, lead.vidasEstimadas, lead.email, lead.telefone])
  const [descontoAberto, setDescontoAberto] = useState(false)

  const carregarProposta = useCallback(async () => {
    setCarregandoProposta(true)
    const r = await getPropostaLeadAction(escopo, lead.id)
    if (r.success) setProposta(r.data)
    setCarregandoProposta(false)
  }, [escopo, lead.id])

  useEffect(() => {
    if (temProposta) void carregarProposta()
  }, [temProposta, carregarProposta])

  useEffect(() => {
    if (!planoId && planos && planos.length === 1) setPlanoId(planos[0]!.id)
  }, [planos, planoId])

  async function gerar(opcoes: { plano: string; email: boolean }) {
    setEnviando(true)
    setPendencias([])
    const r = await criarPropostaLeadAction(escopo, lead.id, { planoId: opcoes.plano, enviarEmail: opcoes.email })
    setEnviando(false)
    if (!r.success) {
      const itens = Object.values(r.fieldErrors ?? {}).filter(Boolean)
      if (itens.length > 0) setPendencias(itens)
      else toast.error(r.error)
      return
    }
    setProposta(r.data.proposal)
    toast.success(r.data.emailSent ? `Link enviado para ${r.data.proposal.applicant.email}` : 'Proposta gerada', {
      description: r.data.emailSent ? undefined : 'O e-mail ainda não saiu. Reenvie quando quiser.',
    })
    aoMudar()
  }

  if (temProposta && carregandoProposta && !proposta) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando a proposta…
      </div>
    )
  }

  if (proposta) {
    const meta = LINK_STATUS_META[proposta.linkStatus]
    const podeEnviar = canSendLink(proposta)
    const podeDesconto = canRequestDiscount(proposta)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileSignature className="size-4 text-[#1E2A4A]" aria-hidden="true" />
              Proposta {proposta.code}
            </h3>
            <SellerProposalStatusPill status={proposta.status} />
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Plano</dt>
              <dd className="m-0 font-medium">{proposta.planName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vidas estimadas</dt>
              <dd className="m-0 font-medium">{proposta.expectedLives.toLocaleString('pt-BR')}</dd>
            </div>
            {proposta.quote ? (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">Mensal estimado</dt>
                  <dd className="m-0 font-medium">{formatarMoeda(proposta.quote.monthlyTotal)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Ativação (1ª cobrança)</dt>
                  <dd className="m-0 font-medium">{formatarMoeda(proposta.quote.activationTotal)}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <div className="flex flex-col gap-1.5 rounded-xl bg-[#F8F9FB] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
              {proposta.lastDiscountRequest ? <DiscountStatusPill status={proposta.lastDiscountRequest.status} /> : null}
            </div>
            <p className="m-0 text-xs text-muted-foreground">{meta.hint}</p>
            {proposta.discount ? <p className="m-0 text-xs font-medium text-[#067647]">Desconto aprovado: {discountSummary(proposta.discount)}</p> : null}
            {proposta.lastDiscountRequest?.status === 'rejected' && proposta.lastDiscountRequest.rejectionReason ? (
              <p className="m-0 text-xs text-[#B42318]">Motivo da recusa: {proposta.lastDiscountRequest.rejectionReason}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {podeEnviar ? (
            <AcaoPrincipal
              carregando={enviando}
              icone={<Mail />}
              onClick={() => proposta.planId && void gerar({ plano: proposta.planId, email: true })}
              bloco
              variante={proposta.linkStatus === 'not_sent' ? 'principal' : 'secundaria'}
            >
              {proposta.linkStatus === 'sent' ? 'Reenviar link por e-mail' : 'Enviar link ao cliente'}
            </AcaoPrincipal>
          ) : null}
          {podeDesconto ? (
            <AcaoPrincipal variante="secundaria" icone={<BadgePercent />} onClick={() => setDescontoAberto(true)} bloco>
              Pedir desconto
            </AcaoPrincipal>
          ) : null}
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          O link de contratação vai só para o e-mail do cliente ({proposta.applicant.email}). Quando o primeiro pagamento cair, o lead vira ganho sozinho.
        </p>

        <PedirDescontoDialog
          aberto={descontoAberto}
          aoMudarAberto={setDescontoAberto}
          escopo={escopo}
          leadId={lead.id}
          leadNome={lead.nome}
          setupFee={proposta.quote?.setupFee ?? null}
          aoConcluir={r => {
            setProposta(r.proposal)
            aoMudar()
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-muted-foreground">
        Escolha o plano e a proposta sai com o cadastro deste lead. O cliente recebe o link de contratação por e-mail.
      </p>
      {erroPlanos ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-[#B42318]">
          {erroPlanos}
          <AcaoPrincipal variante="secundaria" onClick={() => void recarregarPlanos()}>
            Tentar de novo
          </AcaoPrincipal>
        </div>
      ) : !planos ? (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando planos…
        </div>
      ) : planos.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Nenhum plano disponível para oferta agora. Fale com a equipe ANNETEC.</p>
      ) : (
        <SeletorPlano planos={planos} valor={planoId} aoMudar={setPlanoId} />
      )}

      <div className="flex items-start gap-2">
        <Checkbox id="vr-enviar-email" checked={enviarEmail} onCheckedChange={v => setEnviarEmail(v === true)} className="mt-0.5" />
        <Label htmlFor="vr-enviar-email" className="cursor-pointer leading-snug">
          Enviar o link por e-mail agora
          <span className="block text-xs font-normal text-muted-foreground">
            {lead.email ? `Vai para ${lead.email}.` : 'Este lead ainda não tem e-mail: complete o cadastro antes.'}
          </span>
        </Label>
      </div>

      {pendencias.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-sm text-[#93370D]">
          <p className="m-0 flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden="true" /> Falta completar o cadastro do lead
          </p>
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

      <AcaoPrincipal
        carregando={enviando}
        icone={<FileSignature />}
        disabled={!planoId}
        onClick={() => planoId && void gerar({ plano: planoId, email: enviarEmail })}
        bloco
        tamanho="lg"
      >
        {enviarEmail ? 'Gerar proposta e enviar link' : 'Gerar proposta'}
      </AcaoPrincipal>
    </div>
  )
}
