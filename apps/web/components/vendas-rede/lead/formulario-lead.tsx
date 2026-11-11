'use client'

import { useId, type ReactNode } from 'react'
import { ORIGENS_LEAD, ORIGEM_LEAD_LABELS, type OrigemLead, type TipoLead, type VendasLead } from '@annetec/contracts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { formatarCelular, formatarDocumento } from '../ui/mascaras'
import { Chips } from './campos'

export interface ValoresLead {
  tipo: TipoLead
  nome: string
  telefone: string
  email: string
  documento: string
  cidade: string
  uf: string
  origem: OrigemLead
  vidasEstimadas: string
  /** `yyyy-MM-dd` (titular de assinatura presencial, só no clube). */
  dataNascimento: string
  observacoes: string
}

export type ErrosLead = Partial<Record<keyof ValoresLead, string>>

export const LEAD_VAZIO: ValoresLead = {
  tipo: 'pessoa',
  nome: '',
  telefone: '',
  email: '',
  documento: '',
  cidade: '',
  uf: '',
  origem: 'prospeccao',
  vidasEstimadas: '',
  dataNascimento: '',
  observacoes: '',
}

const digitos = (v: string) => v.replace(/\D/g, '')

export function valoresDoLead(lead: VendasLead): ValoresLead {
  const nasc = typeof lead.dados?.dataNascimento === 'string' ? lead.dados.dataNascimento : ''
  return {
    tipo: lead.tipo,
    nome: lead.nome,
    telefone: formatarCelular(lead.telefone),
    email: lead.email ?? '',
    documento: formatarDocumento(lead.documento),
    cidade: lead.cidade ?? '',
    uf: lead.uf ?? '',
    origem: lead.origem,
    vidasEstimadas: lead.vidasEstimadas ? String(lead.vidasEstimadas) : '',
    dataNascimento: nasc,
    observacoes: lead.observacoes ?? '',
  }
}

/** Validação de tela (a API valida de novo; aqui só poupa a ida e volta). */
export function validarLead(v: ValoresLead, campos: ReadonlyArray<keyof ValoresLead>): ErrosLead {
  const erros: ErrosLead = {}
  const quer = (c: keyof ValoresLead) => campos.includes(c)
  if (quer('nome') && v.nome.trim().length < 2) erros.nome = 'Informe o nome.'
  if (quer('telefone') && v.telefone.trim()) {
    const n = digitos(v.telefone).length
    if (n < 10 || n > 11) erros.telefone = 'Informe o DDD e o número.'
  }
  if (quer('email') && v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) erros.email = 'Informe um e-mail válido, como nome@exemplo.com.br.'
  if (quer('documento') && v.documento.trim()) {
    const n = digitos(v.documento).length
    if (n !== 11 && n !== 14) erros.documento = 'Use um CPF (11 dígitos) ou CNPJ (14 dígitos).'
  }
  // Sem celular nem e-mail ninguém consegue contatar a pessoa.
  if (quer('telefone') && quer('email') && !v.telefone.trim() && !v.email.trim()) {
    erros.telefone = 'Informe o celular ou o e-mail para contatar.'
  }
  if (quer('uf') && v.uf.trim() && !/^[A-Za-z]{2}$/.test(v.uf.trim())) erros.uf = 'Use a sigla do estado (SP).'
  if (quer('vidasEstimadas') && v.vidasEstimadas.trim() && !/^\d+$/.test(v.vidasEstimadas.trim())) erros.vidasEstimadas = 'Use só números.'
  return erros
}

/** Corpo para `POST /leads` e `PATCH /leads/:id`. Em edição, campo apagado vira `null`. */
export function corpoDoLead(v: ValoresLead, edicao: boolean, dadosAtuais?: Record<string, unknown>) {
  const texto = (s: string) => (s.trim() ? s.trim() : edicao ? null : undefined)
  const corpo: Record<string, unknown> = {
    tipo: v.tipo,
    nome: v.nome.trim(),
    telefone: v.telefone.trim() ? digitos(v.telefone) : edicao ? null : undefined,
    email: texto(v.email),
    documento: v.documento.trim() ? digitos(v.documento) : edicao ? null : undefined,
    cidade: texto(v.cidade),
    uf: v.uf.trim() ? v.uf.trim().toUpperCase() : edicao ? null : undefined,
    origem: v.origem,
    vidasEstimadas: v.vidasEstimadas.trim() ? Number(v.vidasEstimadas) : edicao ? null : undefined,
    observacoes: texto(v.observacoes),
  }
  if (v.dataNascimento || dadosAtuais?.dataNascimento) {
    corpo.dados = { ...(dadosAtuais ?? {}), dataNascimento: v.dataNascimento || undefined }
  }
  for (const k of Object.keys(corpo)) if (corpo[k] === undefined) delete corpo[k]
  return corpo
}

export function Campo({
  rotulo,
  erro,
  opcional,
  dica,
  children,
  className,
  htmlFor,
}: {
  rotulo: string
  erro?: string
  opcional?: boolean
  dica?: string
  children: ReactNode
  className?: string
  htmlFor: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {rotulo} {opcional ? <span className="font-normal text-muted-foreground">(opcional)</span> : null}
      </Label>
      {children}
      {dica && !erro ? <p className="m-0 text-xs text-muted-foreground">{dica}</p> : null}
      {erro ? (
        <p role="alert" className="m-0 text-sm text-[#B42318]">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Campos do cadastro do lead. `grupo` escolhe o bloco: `contato` (quem é) ou
 * `detalhes` (documento, local, origem…). Edição mostra os dois.
 */
export function FormularioLead({
  valores,
  aoMudar,
  erros,
  escopo,
  grupo,
  idBase,
}: {
  valores: ValoresLead
  aoMudar: (v: ValoresLead) => void
  erros: ErrosLead
  escopo: EscopoVendas
  grupo: 'contato' | 'detalhes' | 'todos'
  idBase?: string
}) {
  const auto = useId()
  const id = idBase ?? auto
  const set = <K extends keyof ValoresLead>(k: K, v: ValoresLead[K]) => aoMudar({ ...valores, [k]: v })
  const empresa = valores.tipo === 'empresa'
  const mostraContato = grupo !== 'detalhes'
  const mostraDetalhes = grupo !== 'contato'
  return (
    <div className="flex flex-col gap-4">
      {mostraContato ? (
        <>
          <Chips
            rotulo="Tipo de lead"
            valor={valores.tipo}
            opcoes={[
              { id: 'pessoa', rotulo: 'Pessoa' },
              { id: 'empresa', rotulo: 'Empresa' },
            ]}
            aoMudar={t => set('tipo', t)}
          />
          <Campo htmlFor={`${id}-nome`} rotulo={empresa ? 'Nome da empresa' : 'Nome completo'} erro={erros.nome}>
            <Input
              id={`${id}-nome`}
              value={valores.nome}
              onChange={e => set('nome', e.target.value)}
              maxLength={160}
              autoComplete="off"
              aria-invalid={Boolean(erros.nome) || undefined}
              className="min-h-11"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo htmlFor={`${id}-tel`} rotulo="Celular (com DDD)" erro={erros.telefone} opcional>
              <Input
                id={`${id}-tel`}
                inputMode="tel"
                value={valores.telefone}
                onChange={e => set('telefone', formatarCelular(e.target.value))}
                placeholder="(11) 91234-5678"
                aria-invalid={Boolean(erros.telefone) || undefined}
                className="min-h-11"
              />
            </Campo>
            <Campo htmlFor={`${id}-email`} rotulo="E-mail" erro={erros.email} opcional>
              <Input
                id={`${id}-email`}
                type="email"
                inputMode="email"
                value={valores.email}
                onChange={e => set('email', e.target.value)}
                aria-invalid={Boolean(erros.email) || undefined}
                className="min-h-11"
              />
            </Campo>
          </div>
        </>
      ) : null}
      {mostraDetalhes ? (
        <>
          <Campo
            htmlFor={`${id}-doc`}
            rotulo={empresa ? 'CNPJ' : 'CPF'}
            erro={erros.documento}
            opcional
            dica={escopo.kind === 'platform' ? 'Necessário para gerar a proposta.' : 'Necessário para assinar presencialmente.'}
          >
            <Input
              id={`${id}-doc`}
              inputMode="numeric"
              value={valores.documento}
              onChange={e => set('documento', formatarDocumento(e.target.value))}
              aria-invalid={Boolean(erros.documento) || undefined}
              className="min-h-11"
            />
          </Campo>
          <div className="grid grid-cols-[1fr_5rem] gap-4">
            <Campo htmlFor={`${id}-cidade`} rotulo="Cidade" opcional>
              <Input id={`${id}-cidade`} value={valores.cidade} onChange={e => set('cidade', e.target.value)} maxLength={80} className="min-h-11" />
            </Campo>
            <Campo htmlFor={`${id}-uf`} rotulo="UF" erro={erros.uf} opcional>
              <Input
                id={`${id}-uf`}
                value={valores.uf}
                onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                aria-invalid={Boolean(erros.uf) || undefined}
                className="min-h-11"
              />
            </Campo>
          </div>
          {escopo.kind === 'platform' ? (
            <Campo
              htmlFor={`${id}-vidas`}
              rotulo="Vidas estimadas"
              erro={erros.vidasEstimadas}
              opcional
              dica="Quantas pessoas devem entrar no clube. Entra na cotação da proposta."
            >
              <Input
                id={`${id}-vidas`}
                inputMode="numeric"
                value={valores.vidasEstimadas}
                onChange={e => set('vidasEstimadas', e.target.value.replace(/\D/g, '').slice(0, 8))}
                aria-invalid={Boolean(erros.vidasEstimadas) || undefined}
                className="min-h-11"
              />
            </Campo>
          ) : (
            <Campo htmlFor={`${id}-nasc`} rotulo="Data de nascimento" opcional dica="Necessária para assinar presencialmente.">
              <Input
                id={`${id}-nasc`}
                type="date"
                value={valores.dataNascimento}
                onChange={e => set('dataNascimento', e.target.value)}
                className="min-h-11"
              />
            </Campo>
          )}
          <Campo htmlFor={`${id}-origem`} rotulo="Como chegou até você">
            <select
              id={`${id}-origem`}
              value={valores.origem}
              onChange={e => set('origem', e.target.value as OrigemLead)}
              className="border-input min-h-11 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {ORIGENS_LEAD.map(o => (
                <option key={o} value={o}>
                  {ORIGEM_LEAD_LABELS[o]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo htmlFor={`${id}-obs`} rotulo="Observações" opcional>
            <Textarea id={`${id}-obs`} value={valores.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3} maxLength={2000} />
          </Campo>
        </>
      ) : null}
    </div>
  )
}
