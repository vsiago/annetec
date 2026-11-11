'use client'

import { useRef, useState } from 'react'
import { BadgeCheck, Search } from 'lucide-react'
import { toast } from 'sonner'
import { CLUB_SUBSCRIPTION_STATUS_LABELS, type ClubSubscriptionStatus, type VendasPessoaBalcao } from '@annetec/contracts'
import { balcaoPessoaAction } from '@/lib/actions/vendas-balcao-api'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from '../ui/acao-principal'
import { formatarCelular, formatarCpf } from '../ui/mascaras'
import { FOCUS_RING } from '../ui/tokens'
import { BotaoTexto, Campo } from './campo'
import { useBalcao } from './contexto'
import { celularParaCampo, cpfParaCampo, soDigitos, type DadosPessoa, type Rascunho } from './rascunho'

export function PassoPessoa({
  busca,
  aoMudarBusca,
  aoContinuar,
  aoRegistrarAssociado,
  registrando,
}: {
  busca: Rascunho['busca']
  aoMudarBusca: (b: Rascunho['busca']) => void
  aoContinuar: (patch: Partial<DadosPessoa>, leadEncontrado: boolean) => void
  aoRegistrarAssociado: (pessoa: VendasPessoaBalcao, doc: { documento?: string; telefone?: string }) => void
  registrando: boolean
}) {
  const { slug } = useBalcao()
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | undefined>()
  const [associado, setAssociado] = useState<VendasPessoaBalcao | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  const ehCpf = busca.tipo === 'cpf'
  const digitos = soDigitos(busca.texto)

  function mudarTipo(tipo: 'cpf' | 'telefone') {
    if (tipo === busca.tipo) return
    aoMudarBusca({ tipo, texto: '' })
    setErro(undefined)
    setAssociado(null)
    campo.current?.focus()
  }

  async function procurar(e: React.FormEvent) {
    e.preventDefault()
    setErro(undefined)
    if (ehCpf ? digitos.length !== 11 : digitos.length < 10 || digitos.length > 11) {
      setErro(ehCpf ? 'O CPF tem 11 números.' : 'O celular tem DDD + 8 ou 9 números.')
      campo.current?.focus()
      return
    }
    setBuscando(true)
    const r = await balcaoPessoaAction(slug, ehCpf ? { documento: digitos } : { telefone: digitos })
    setBuscando(false)
    if (!r.success) {
      toast.error(r.error)
      setErro(r.error)
      return
    }
    if (r.data.jaAssociado) {
      setAssociado(r.data)
      return
    }
    const lead = r.data.lead
    const nome = lead?.nome ?? r.data.nome ?? ''
    const telefone = lead?.telefone ?? r.data.telefone ?? (ehCpf ? '' : digitos)
    const email = lead?.email ?? r.data.email ?? ''
    if (lead) toast.success('Esta pessoa já tem um contato em andamento. Dados preenchidos.')
    aoContinuar(
      {
        ...(ehCpf ? { documento: formatarCpf(digitos) } : lead?.documento ? { documento: cpfParaCampo(lead.documento) } : {}),
        nome,
        telefone: celularParaCampo(telefone),
        email,
      },
      Boolean(lead),
    )
  }

  if (associado) {
    const a = associado.assinatura
    return (
      <section aria-labelledby="titulo-associado" className="flex flex-col gap-4 rounded-3xl border border-[#ABEFC6] bg-[#ECFDF3] p-5">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-1 size-7 shrink-0 text-[#067647]" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="titulo-associado" className="m-0 text-xl font-bold text-[#054F31]">
              Já é associado{associado.nome ? ` · ${associado.nome}` : ''}
            </h2>
            <p className="m-0 mt-1 text-base text-[#054F31]">
              {a ? `${a.planoNome} · ${(CLUB_SUBSCRIPTION_STATUS_LABELS[a.status as ClubSubscriptionStatus] ?? a.status).toLowerCase()}` : 'Cadastro encontrado'}
            </p>
          </div>
        </div>
        <AcaoPrincipal
          tamanho="xl"
          bloco
          carregando={registrando}
          onClick={() =>
            aoRegistrarAssociado(associado, ehCpf ? { documento: digitos } : { telefone: digitos })
          }
        >
          Registrar atendimento
        </AcaoPrincipal>
        <BotaoTexto onClick={() => setAssociado(null)}>Buscar outra pessoa</BotaoTexto>
      </section>
    )
  }

  return (
    <form onSubmit={procurar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold text-foreground">Quem está sendo atendido?</h1>
        <p className="m-0 text-base text-muted-foreground">Busque pelo CPF ou pelo celular para ver se já é associado.</p>
      </div>

      <div role="group" aria-label="Buscar por" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#EAECF0] p-1">
        {(['cpf', 'telefone'] as const).map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={busca.tipo === t}
            onClick={() => mudarTipo(t)}
            className={cn(
              'min-h-12 rounded-xl text-base font-semibold',
              busca.tipo === t ? 'bg-white text-foreground shadow-sm' : 'text-[#475467]',
              FOCUS_RING,
            )}
          >
            {t === 'cpf' ? 'CPF' : 'Celular'}
          </button>
        ))}
      </div>

      <Campo
        grande
        rotulo={ehCpf ? 'CPF' : 'Celular com DDD'}
        inputRef={campo}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder={ehCpf ? '000.000.000-00' : '(00) 00000-0000'}
        value={busca.texto}
        onChange={e => {
          setErro(undefined)
          aoMudarBusca({ ...busca, texto: ehCpf ? formatarCpf(e.target.value) : formatarCelular(e.target.value) })
        }}
        erro={erro}
      />

      <AcaoPrincipal type="submit" tamanho="xl" bloco carregando={buscando} icone={<Search />}>
        Buscar
      </AcaoPrincipal>
      <BotaoTexto onClick={() => aoContinuar({}, false)}>Continuar sem buscar</BotaoTexto>
    </form>
  )
}
