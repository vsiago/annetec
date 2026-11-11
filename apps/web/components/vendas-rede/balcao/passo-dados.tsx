'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from '../ui/acao-principal'
import { formatarCelular, formatarCpf } from '../ui/mascaras'
import { FOCUS_RING } from '../ui/tokens'
import { Campo } from './campo'
import type { DadosPessoa } from './rascunho'

const CAMPOS_ASSINAR = ['documento', 'email', 'dataNascimento'] as const

export function PassoDados({
  dados,
  aoMudar,
  erros,
  leadEncontrado,
  rotuloContinuar,
  aoContinuar,
}: {
  dados: DadosPessoa
  aoMudar: (patch: Partial<DadosPessoa>) => void
  erros: Record<string, string>
  leadEncontrado: boolean
  rotuloContinuar: string
  aoContinuar: () => void
}) {
  const temErroAssinar = CAMPOS_ASSINAR.some(c => erros[c])
  const [aberto, setAberto] = useState(temErroAssinar || Boolean(dados.email || dados.dataNascimento))
  const expandido = aberto || temErroAssinar

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        aoContinuar()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold text-foreground">Dados da pessoa</h1>
        <p className="m-0 text-base text-muted-foreground">Só o necessário para registrar o atendimento.</p>
      </div>

      {leadEncontrado ? (
        <p role="status" className="m-0 rounded-xl bg-[#E5EDF5] px-4 py-3 text-sm font-medium text-[#1E2A4A]">
          Já existe um cadastro desta pessoa. Confira os dados abaixo.
        </p>
      ) : null}

      <Campo
        rotulo="Nome completo"
        autoComplete="off"
        autoFocus={!dados.nome}
        value={dados.nome}
        onChange={e => aoMudar({ nome: e.target.value })}
        erro={erros.nome}
      />
      <Campo
        rotulo="Celular com DDD"
        inputMode="tel"
        autoComplete="off"
        placeholder="(00) 00000-0000"
        value={dados.telefone}
        onChange={e => aoMudar({ telefone: formatarCelular(e.target.value) })}
        erro={erros.telefone}
        ajuda="Usado para enviar o pagamento ou o resumo pelo WhatsApp."
      />

      <div className="rounded-2xl border border-border bg-white">
        <button
          type="button"
          aria-expanded={expandido}
          aria-controls="secao-assinar"
          onClick={() => setAberto(a => !a)}
          className={cn('flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left', FOCUS_RING)}
        >
          <span className="flex flex-col">
            <span className="text-base font-semibold text-foreground">Para assinar agora</span>
            <span className="text-sm text-muted-foreground">CPF, e-mail e nascimento. Só se a pessoa for assinar.</span>
          </span>
          <ChevronDown className={cn('size-6 shrink-0 text-muted-foreground transition-transform', expandido && 'rotate-180')} aria-hidden="true" />
        </button>
        {expandido ? (
          <div id="secao-assinar" className="flex flex-col gap-4 border-t border-border p-4">
            <Campo
              rotulo="CPF"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={dados.documento}
              onChange={e => aoMudar({ documento: formatarCpf(e.target.value) })}
              erro={erros.documento}
            />
            <Campo
              rotulo="E-mail"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              placeholder="nome@email.com"
              value={dados.email}
              onChange={e => aoMudar({ email: e.target.value })}
              erro={erros.email}
            />
            <Campo
              rotulo="Data de nascimento"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={dados.dataNascimento}
              onChange={e => aoMudar({ dataNascimento: e.target.value })}
              erro={erros.dataNascimento}
            />
          </div>
        ) : null}
      </div>

      <AcaoPrincipal type="submit" tamanho="xl" bloco>
        {rotuloContinuar}
      </AcaoPrincipal>
    </form>
  )
}
