'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { AtendimentoBalcaoInput, ResultadoBalcao, VendasPessoaBalcao, VendasPlanoBalcao } from '@annetec/contracts'
import { balcaoPlanosAction, balcaoRegistrarAtendimentoAction } from '@/lib/actions/vendas-balcao-api'
import { BotaoTexto } from './campo'
import { Concluido, type ConcluidoInfo } from './concluido'
import { useBalcao } from './contexto'
import { PassoDados } from './passo-dados'
import { PassoOferta } from './passo-oferta'
import { PassoPessoa } from './passo-pessoa'
import { PassoResultado, type ExtraRegistro } from './passo-resultado'
import {
  RASCUNHO_INICIAL,
  dataOuUndefined,
  gravarRascunho,
  lerRascunho,
  limparRascunho,
  soDigitos,
  type DadosPessoa,
  type PassoAtendimento,
  type Rascunho,
} from './rascunho'

const ORDEM: PassoAtendimento[] = ['pessoa', 'dados', 'oferta', 'resultado']
const ANTERIOR: Record<PassoAtendimento, PassoAtendimento | null> = { pessoa: null, dados: 'pessoa', oferta: 'dados', resultado: 'oferta' }
const CAMPOS_DADOS = ['nome', 'telefone', 'documento', 'email', 'dataNascimento'] as const
const CAMPOS_OFERTA = ['servico', 'valorTabela', 'planoId'] as const

function montarInput(r: Rascunho, resultado: ResultadoBalcao, extra?: ExtraRegistro): AtendimentoBalcaoInput {
  const d = r.dados
  const documento = soDigitos(d.documento)
  const telefone = soDigitos(d.telefone)
  return {
    nome: d.nome.trim(),
    documento: documento || undefined,
    telefone: telefone || undefined,
    email: d.email.trim() || undefined,
    dataNascimento: dataOuUndefined(d.dataNascimento),
    servico: d.servico.trim(),
    valorTabela: r.valor,
    planoId: r.planoId ?? undefined,
    resultado,
    observacoes: extra?.observacoes,
    formaPagamento: resultado === 'assinou' ? (extra?.formaPagamento ?? 'pix') : undefined,
  }
}

/** Confere no aparelho o que a API exigiria, para apontar o campo antes de enviar. */
function conferir(r: Rascunho, resultado: ResultadoBalcao): { erros: Record<string, string>; passo: PassoAtendimento } | null {
  const d = r.dados
  const erros: Record<string, string> = {}
  let passo: PassoAtendimento = 'dados'
  if (d.nome.trim().length < 2) erros.nome = 'Informe o nome.'
  if (d.servico.trim().length < 2) {
    erros.servico = 'Informe o serviço.'
    if (!Object.keys(erros).some(k => k !== 'servico')) passo = 'oferta'
  }
  if (resultado === 'vai_pensar' || resultado === 'assinou') {
    const tel = soDigitos(d.telefone).length
    if (tel < 10 || tel > 11) erros.telefone = 'Informe o celular com DDD.'
  }
  if (resultado === 'assinou') {
    if (soDigitos(d.documento).length !== 11) erros.documento = 'Informe o CPF para assinar.'
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) erros.email = 'Informe um e-mail válido para assinar.'
    if (!dataOuUndefined(d.dataNascimento)) erros.dataNascimento = 'Informe a data de nascimento.'
    if (!r.planoId) {
      erros.planoId = 'Escolha um plano para assinar.'
      if (!CAMPOS_DADOS.some(c => erros[c])) passo = 'oferta'
    }
  }
  if (Object.keys(erros).length === 0) return null
  if (CAMPOS_DADOS.some(c => erros[c])) passo = 'dados'
  return { erros, passo }
}

export function AtenderPagina() {
  const { slug, unidade } = useBalcao()
  const [r, setR] = useState<Rascunho>(RASCUNHO_INICIAL)
  const [pronto, setPronto] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<ResultadoBalcao | null>(null)
  const [registrandoAssoc, setRegistrandoAssoc] = useState(false)
  const [concluido, setConcluido] = useState<ConcluidoInfo | null>(null)
  const [planos, setPlanos] = useState<VendasPlanoBalcao[] | null>(null)
  const [erroPlanos, setErroPlanos] = useState<string | null>(null)
  const topo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const salvo = lerRascunho(slug)
    if (salvo) setR(salvo)
    setPronto(true)
  }, [slug])

  useEffect(() => {
    if (pronto && !concluido) gravarRascunho(slug, r)
  }, [pronto, concluido, slug, r])

  const carregarPlanos = useCallback(async () => {
    setErroPlanos(null)
    const res = await balcaoPlanosAction(slug)
    if (res.success) setPlanos(res.data)
    else setErroPlanos(res.error)
  }, [slug])

  useEffect(() => {
    void carregarPlanos()
  }, [carregarPlanos])

  useEffect(() => {
    topo.current?.scrollIntoView({ block: 'start' })
    window.scrollTo({ top: 0 })
  }, [r.passo, concluido])

  const ir = (passo: PassoAtendimento, retorno: PassoAtendimento | null = null) => setR(a => ({ ...a, passo, retorno }))

  const mudarDados = (patch: Partial<DadosPessoa>) => {
    setR(a => ({ ...a, dados: { ...a.dados, ...patch } }))
    setErros(e => {
      const resto = { ...e }
      for (const k of Object.keys(patch)) delete resto[k]
      return resto
    })
  }

  const novo = () => {
    limparRascunho(slug)
    setR(RASCUNHO_INICIAL)
    setErros({})
    setErroGeral(null)
    setConcluido(null)
    setEnviando(null)
  }

  const plano = planos?.find(p => p.id === r.planoId)

  function aposFalha(res: { error: string; fieldErrors?: Record<string, string> }) {
    const campos = res.fieldErrors ?? {}
    if (Object.keys(campos).length > 0) {
      setErros(campos)
      const passo: PassoAtendimento = CAMPOS_DADOS.some(c => campos[c]) ? 'dados' : CAMPOS_OFERTA.some(c => campos[c]) ? 'oferta' : 'resultado'
      setErroGeral(res.error)
      toast.error('Faltam dados para continuar. Confira os campos marcados.')
      ir(passo, passo === 'resultado' ? null : 'resultado')
    } else {
      setErroGeral(res.error)
      toast.error(res.error)
    }
  }

  async function registrar(resultado: ResultadoBalcao, extra?: ExtraRegistro) {
    setErroGeral(null)
    const falta = conferir(r, resultado)
    if (falta) {
      setErros(falta.erros)
      toast.error('Faltam dados para continuar. Confira os campos marcados.')
      ir(falta.passo, 'resultado')
      return
    }
    setEnviando(resultado)
    const res = await balcaoRegistrarAtendimentoAction(slug, montarInput(r, resultado, extra))
    setEnviando(null)
    if (!res.success) {
      aposFalha(res)
      return
    }
    limparRascunho(slug)
    setErros({})
    toast.success(resultado === 'assinou' ? 'Adesão registrada' : 'Atendimento registrado')
    setConcluido({
      resultado,
      nome: r.dados.nome.trim(),
      telefone: r.dados.telefone,
      servico: r.dados.servico.trim(),
      valorTabela: r.valor,
      plano,
      checkout: res.data.checkout,
      forma: extra?.formaPagamento,
      unidade,
    })
  }

  async function registrarAssociado(pessoa: VendasPessoaBalcao, doc: { documento?: string; telefone?: string }) {
    setRegistrandoAssoc(true)
    const res = await balcaoRegistrarAtendimentoAction(slug, {
      nome: pessoa.nome?.trim() || 'Associado',
      documento: doc.documento,
      telefone: doc.telefone ?? (soDigitos(pessoa.telefone) || undefined),
      servico: 'Atendimento de associado',
      valorTabela: 0,
      resultado: 'ja_associado',
    })
    setRegistrandoAssoc(false)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    limparRascunho(slug)
    toast.success('Atendimento registrado')
    setConcluido({
      resultado: 'ja_associado',
      nome: pessoa.nome ?? 'Associado',
      telefone: pessoa.telefone ?? '',
      servico: 'Atendimento de associado',
      valorTabela: 0,
      checkout: null,
      unidade,
    })
  }

  if (!pronto) return null

  if (concluido) {
    return (
      <div ref={topo} className="scroll-mt-24">
        <Concluido info={concluido} aoNovo={novo} />
      </div>
    )
  }

  const idx = ORDEM.indexOf(r.passo)
  const anterior = ANTERIOR[r.passo]

  return (
    <div ref={topo} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-sm font-semibold text-muted-foreground" aria-live="polite">
          Passo {idx + 1} de {ORDEM.length}
        </p>
        {r.passo !== 'pessoa' ? (
          <BotaoTexto onClick={() => (r.retorno ? ir(r.retorno) : anterior && ir(anterior))} className="-mr-3">
            <ArrowLeft className="size-4" aria-hidden="true" /> {r.retorno ? 'Voltar ao atendimento' : 'Voltar'}
          </BotaoTexto>
        ) : (
          (r.dados.nome || r.dados.servico || r.busca.texto) && (
            <BotaoTexto onClick={novo} className="-mr-3">Recomeçar</BotaoTexto>
          )
        )}
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {ORDEM.map((p, i) => (
          <span key={p} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-[var(--vr-accent,#1E2A4A)]' : 'bg-[#EAECF0]'}`} />
        ))}
      </div>

      {erroGeral && r.passo !== 'resultado' ? (
        <p role="alert" className="m-0 rounded-xl bg-[#FEF3F2] px-4 py-3 text-sm font-medium text-[#B42318]">
          {erroGeral}
        </p>
      ) : null}

      {r.passo === 'pessoa' ? (
        <PassoPessoa
          busca={r.busca}
          aoMudarBusca={busca => setR(a => ({ ...a, busca }))}
          registrando={registrandoAssoc}
          aoRegistrarAssociado={registrarAssociado}
          aoContinuar={(patch, leadEncontrado) => {
            setR(a => ({ ...a, dados: { ...a.dados, ...patch }, leadEncontrado, passo: 'dados', retorno: null }))
          }}
        />
      ) : null}

      {r.passo === 'dados' ? (
        <PassoDados
          dados={r.dados}
          aoMudar={mudarDados}
          erros={erros}
          leadEncontrado={r.leadEncontrado}
          rotuloContinuar={r.retorno ? 'Salvar e voltar' : 'Continuar'}
          aoContinuar={() => {
            if (r.dados.nome.trim().length < 2) {
              setErros(e => ({ ...e, nome: 'Informe o nome.' }))
              return
            }
            setErroGeral(null)
            ir(r.retorno ?? 'oferta')
          }}
        />
      ) : null}

      {r.passo === 'oferta' ? (
        <PassoOferta
          planos={planos}
          erroPlanos={erroPlanos}
          recarregarPlanos={() => void carregarPlanos()}
          servico={r.dados.servico}
          aoMudarServico={servico => mudarDados({ servico })}
          valor={r.valor}
          aoMudarValor={valor => setR(a => ({ ...a, valor }))}
          planoId={r.planoId}
          erros={erros}
          aoEscolher={(p, valor) => {
            setErros({})
            setErroGeral(null)
            setR(a => ({ ...a, planoId: p.id, valor, passo: 'resultado', retorno: null }))
          }}
          aoSeguirSemPlano={() => {
            if (r.dados.servico.trim().length < 2) {
              setErros(e => ({ ...e, servico: 'Informe o serviço.' }))
              return
            }
            setR(a => ({ ...a, planoId: null, passo: 'resultado', retorno: null }))
          }}
        />
      ) : null}

      {r.passo === 'resultado' ? (
        <PassoResultado
          dados={r.dados}
          valor={r.valor}
          plano={plano}
          enviando={enviando}
          erroGeral={erroGeral}
          aoRegistrar={(res, extra) => void registrar(res, extra)}
          aoEditar={p => ir(p, 'resultado')}
        />
      ) : null}
    </div>
  )
}
