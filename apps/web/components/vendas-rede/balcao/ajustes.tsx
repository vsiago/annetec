'use client'

import { useState } from 'react'
import { LogOut, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/auth-context'
import { balcaoAtualizarPerfilAction } from '@/lib/actions/vendas-balcao-api'
import { AcaoPrincipal } from '../ui/acao-principal'
import { formatarCelular, formatarCpf } from '../ui/mascaras'
import { Campo } from './campo'
import { useBalcao } from './contexto'
import { limparRascunho, soDigitos } from './rascunho'

export function AjustesPagina() {
  const { slug, eu, unidade, recarregarEu } = useBalcao()
  const { logout } = useAuth()
  const agente = eu.agente
  const [nome, setNome] = useState(agente?.nome ?? '')
  const [telefone, setTelefone] = useState(formatarCelular(agente?.telefone))
  const [cpf, setCpf] = useState(formatarCpf(agente?.cpf))
  const [nascimento, setNascimento] = useState(agente?.dataNascimento?.slice(0, 10) ?? '')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!agente) return
    if (nome.trim().length < 2) {
      setErros({ nome: 'Informe o nome.' })
      return
    }
    setErros({})
    setSalvando(true)
    const cpfDigitos = soDigitos(cpf)
    const telDigitos = soDigitos(telefone)
    const r = await balcaoAtualizarPerfilAction(slug, agente.id, {
      nome: nome.trim(),
      ...(telDigitos ? { telefone: telDigitos } : {}),
      ...(cpfDigitos ? { cpf: cpfDigitos } : {}),
      ...(nascimento ? { dataNascimento: nascimento } : {}),
    })
    setSalvando(false)
    if (!r.success) {
      if (r.fieldErrors) setErros(r.fieldErrors)
      toast.error(r.error)
      return
    }
    toast.success('Dados salvos')
    await recarregarEu()
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-2xl font-bold text-foreground">Ajustes</h1>

      <section aria-label="Unidade" className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
        <Building2 className="size-7 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="m-0 text-sm text-muted-foreground">Unidade</p>
          <p className="m-0 truncate text-lg font-semibold text-foreground">{unidade}</p>
        </div>
      </section>

      {agente ? (
        <form onSubmit={salvar} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4">
          <h2 className="m-0 text-xl font-bold text-foreground">Seus dados</h2>
          <Campo rotulo="Nome" autoComplete="name" value={nome} onChange={e => setNome(e.target.value)} erro={erros.nome} />
          <Campo
            rotulo="E-mail de acesso"
            value={agente.email ?? ''}
            readOnly
            disabled
            ajuda="O e-mail não muda por aqui. Peça ao administrador."
          />
          <Campo
            rotulo="Celular"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={e => setTelefone(formatarCelular(e.target.value))}
            erro={erros.telefone}
          />
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={e => setCpf(formatarCpf(e.target.value))}
            erro={erros.cpf}
          />
          <Campo rotulo="Data de nascimento" type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} erro={erros.dataNascimento} />
          <AcaoPrincipal type="submit" tamanho="xl" bloco carregando={salvando}>
            Salvar
          </AcaoPrincipal>
        </form>
      ) : (
        <p className="m-0 rounded-2xl bg-[#F2F4F7] p-4 text-base text-muted-foreground">
          Esta conta não tem cadastro de atendente. Peça ao administrador para cadastrar você na rede comercial.
        </p>
      )}

      <AcaoPrincipal
        tamanho="xl"
        bloco
        variante="secundaria"
        icone={<LogOut />}
        onClick={() => {
          // O rascunho guarda CPF, celular, e-mail e nascimento: não pode sobrar num balcão compartilhado.
          limparRascunho(slug)
          logout()
        }}
      >
        Sair
      </AcaoPrincipal>
    </div>
  )
}
