'use client'

import { useEffect, useState } from 'react'
import { Banknote, FileText, Info, Pencil, QrCode as QrIcone } from 'lucide-react'
import type { ResultadoBalcao, VendasPlanoBalcao } from '@annetec/contracts'
import { balcaoSimularAction } from '@/lib/actions/vendas-balcao-api'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from '../ui/acao-principal'
import { formatarMoeda } from '../ui/mascaras'
import { ResultadoAtendimento, type ResultadoEscolhido } from '../ui/resultado-atendimento'
import { simularEconomia } from '../ui/simulador-economia'
import { FOCUS_RING } from '../ui/tokens'
import { BotaoTexto, Campo } from './campo'
import { useBalcao } from './contexto'
import type { DadosPessoa, PassoAtendimento } from './rascunho'

export type ExtraRegistro = { formaPagamento?: 'pix' | 'boleto'; observacoes?: string }

const FORMAS = [
  { id: 'pix', nome: 'Pix', dica: 'Pagamento na hora', Icone: QrIcone },
  { id: 'boleto', nome: 'Boleto', dica: 'Vence em poucos dias', Icone: FileText },
] as const

export function PassoResultado({
  dados,
  valor,
  plano,
  enviando,
  erroGeral,
  aoRegistrar,
  aoEditar,
}: {
  dados: DadosPessoa
  valor: number
  plano: VendasPlanoBalcao | undefined
  enviando: ResultadoBalcao | null
  erroGeral: string | null
  aoRegistrar: (resultado: ResultadoBalcao, extra?: ExtraRegistro) => void
  aoEditar: (passo: PassoAtendimento) => void
}) {
  const { slug } = useBalcao()
  const [acao, setAcao] = useState<null | 'assinar' | 'recusar'>(null)
  const [forma, setForma] = useState<'pix' | 'boleto'>('pix')
  const [motivo, setMotivo] = useState('')
  const [anual, setAnual] = useState<number | null>(null)

  const calc = plano ? simularEconomia(valor, plano) : null

  useEffect(() => {
    let vivo = true
    setAnual(null)
    if (!plano || valor <= 0) return
    void balcaoSimularAction(slug, { valorTabela: valor, planoId: plano.id }).then(r => {
      if (vivo && r.success) setAnual(r.data.find(s => s.planoId === plano.id)?.economiaAnual12 ?? null)
    })
    return () => {
      vivo = false
    }
  }, [slug, plano, valor])

  function escolher(r: ResultadoEscolhido) {
    if (r === 'vai_pensar') aoRegistrar('vai_pensar')
    else setAcao(r === 'assinou' ? 'assinar' : 'recusar')
  }

  const ocupado = Boolean(enviando)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold text-foreground">Como terminou o atendimento?</h1>
        <p className="m-0 text-base text-muted-foreground">Confira o resumo e escolha uma opção.</p>
      </div>

      <section aria-label="Resumo" className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-lg font-semibold text-foreground">{dados.nome || 'Sem nome'}</p>
            <p className="m-0 text-sm text-muted-foreground">{dados.telefone || 'Sem celular'}</p>
          </div>
          <BotaoTexto onClick={() => aoEditar('dados')} aria-label="Editar dados da pessoa" className="shrink-0">
            <Pencil className="size-4" aria-hidden="true" /> Editar
          </BotaoTexto>
        </div>
        <p className="m-0 text-base text-foreground">
          {dados.servico || 'Serviço não informado'} ·{' '}
          <span className="font-semibold tabular-nums">{formatarMoeda(valor)}</span>
        </p>
        {plano && calc ? (
          <div
            className="flex flex-col gap-1 rounded-xl border-2 border-[var(--vr-accent,#1E2A4A)] bg-[#F5F8FC] p-3"
            aria-label={`Plano escolhido: ${plano.nome}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base font-bold text-foreground">Plano {plano.nome}</span>
              <span className="rounded-full bg-[#E3F6EA] px-2.5 py-0.5 text-xs font-semibold text-[#067647]">
                −{plano.descontoPercentual} %
              </span>
            </div>
            <p className="m-0 text-base text-foreground">
              Consulta por <span className="font-bold tabular-nums">{formatarMoeda(calc.valorComPlano)}</span> · economia de{' '}
              {formatarMoeda(calc.economiaNaConsulta)}
            </p>
            <p className="m-0 text-sm text-muted-foreground">
              Mensalidade {formatarMoeda(plano.precoMensal)}
              {plano.adesao ? ` · adesão ${formatarMoeda(plano.adesao)}` : ''}
              {calc.consultasParaCompensar !== null
                ? ` · compensa em ${calc.consultasParaCompensar} ${calc.consultasParaCompensar === 1 ? 'consulta' : 'consultas'}`
                : ''}
              {anual !== null && anual > 0 ? ` · economia estimada em 12 meses: ${formatarMoeda(anual)}` : ''}
            </p>
            <BotaoTexto onClick={() => aoEditar('oferta')} className="self-start px-0">
              Trocar plano
            </BotaoTexto>
          </div>
        ) : (
          <p className="m-0 rounded-xl bg-[#F2F4F7] px-3 py-2 text-sm text-muted-foreground">
            Nenhum plano escolhido.{' '}
            <button type="button" onClick={() => aoEditar('oferta')} className={cn('font-semibold text-foreground underline', FOCUS_RING)}>
              Escolher plano
            </button>
          </p>
        )}
      </section>

      {erroGeral ? (
        <p role="alert" className="m-0 rounded-xl bg-[#FEF3F2] px-4 py-3 text-sm font-medium text-[#B42318]">
          {erroGeral}
        </p>
      ) : null}

      {acao === 'assinar' ? (
        <section aria-labelledby="forma-pgto" className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4">
          <h2 id="forma-pgto" className="m-0 text-xl font-bold text-foreground">
            Como a pessoa vai pagar?
          </h2>
          <div role="radiogroup" aria-labelledby="forma-pgto" className="grid grid-cols-2 gap-3">
            {FORMAS.map(({ id, nome, dica, Icone }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={forma === id}
                onClick={() => setForma(id)}
                className={cn(
                  'flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-3 text-center',
                  forma === id ? 'border-[var(--vr-accent,#1E2A4A)] bg-[#F5F8FC]' : 'border-border bg-white',
                  FOCUS_RING,
                )}
              >
                <Icone className="size-7" aria-hidden="true" />
                <span className="text-lg font-semibold">{nome}</span>
                <span className="text-xs text-muted-foreground">{dica}</span>
              </button>
            ))}
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {plano ? `Plano ${plano.nome} · ${formatarMoeda(plano.precoMensal)}/mês` : 'Escolha um plano antes de assinar'}
            {plano?.adesao ? ` + adesão ${formatarMoeda(plano.adesao)}` : ''}
          </p>
          <AcaoPrincipal
            tamanho="xl"
            bloco
            icone={<Banknote />}
            carregando={enviando === 'assinou'}
            disabled={ocupado}
            onClick={() => aoRegistrar('assinou', { formaPagamento: forma })}
          >
            Confirmar e gerar pagamento
          </AcaoPrincipal>
          <BotaoTexto disabled={ocupado} onClick={() => setAcao(null)}>
            Voltar
          </BotaoTexto>
        </section>
      ) : acao === 'recusar' ? (
        <section aria-label="Motivo" className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4">
          <Campo
            rotulo="Motivo (opcional)"
            autoFocus
            autoComplete="off"
            maxLength={300}
            placeholder="Ex.: achou caro, já tem outro plano"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
          />
          <AcaoPrincipal
            tamanho="xl"
            bloco
            carregando={enviando === 'recusou'}
            disabled={ocupado}
            onClick={() => aoRegistrar('recusou', { observacoes: motivo.trim() || undefined })}
          >
            Registrar que não quis
          </AcaoPrincipal>
          <BotaoTexto disabled={ocupado} onClick={() => setAcao(null)}>
            Voltar
          </BotaoTexto>
        </section>
      ) : (
        <>
          <ResultadoAtendimento
            aoEscolher={escolher}
            carregando={enviando === 'vai_pensar' ? 'vai_pensar' : null}
            desabilitado={ocupado}
          />
          <BotaoTexto disabled={ocupado} onClick={() => aoRegistrar('so_informacao')} className="self-center">
            <Info className="size-4" aria-hidden="true" /> Só informação
          </BotaoTexto>
        </>
      )}
    </div>
  )
}
