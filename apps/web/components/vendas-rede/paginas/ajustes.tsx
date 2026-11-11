'use client'

import { useId, useState } from 'react'
import { LogOut, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { PAPEL_COMERCIAL_LABELS, type UpdateAgenteInput, type VendasAgente } from '@annetec/contracts'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Input } from '@/components/ui/input'
import { atualizarAgenteAction } from '@/lib/actions/vendas-rede-api'
import { veEquipe } from '@/lib/vendas-rede/adaptadores'
import { useSairDaRede, useVendasRede } from '../provider'
import { Conteudo } from '../shell/base'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { formatarCelular, formatarCpf } from '../ui/mascaras'
import { Chips } from '../lead/campos'
import { Campo } from '../lead/formulario-lead'

/**
 * A API só deixa gestores (master, gerente, supervisor) alterarem cadastro de
 * agente (`PATCH /rede/agentes/:id`). Vendedor e balcão veem os próprios dados
 * em modo leitura, com o aviso de a quem pedir a mudança. Troque para `true`
 * quando a rota aceitar a edição do próprio perfil.
 */
const AGENTE_EDITA_PROPRIO_PERFIL = false

interface Form {
  nome: string
  telefone: string
  dataNascimento: string
  repasseTipo: 'pix' | 'conta'
  chavePix: string
  banco: string
  agencia: string
  conta: string
  titular: string
  repasseDocumento: string
}

function formDoAgente(a: VendasAgente): Form {
  const r = (a.repasse ?? {}) as Record<string, unknown>
  const t = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '')
  return {
    nome: a.nome,
    telefone: formatarCelular(a.telefone),
    dataNascimento: a.dataNascimento ?? '',
    repasseTipo: r.tipo === 'conta' ? 'conta' : 'pix',
    chavePix: t('chavePix'),
    banco: t('banco'),
    agencia: t('agencia'),
    conta: t('conta'),
    titular: t('titular'),
    repasseDocumento: t('documento'),
  }
}

function validar(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.nome.trim().length < 2) e.nome = 'Informe o nome.'
  const tel = f.telefone.replace(/\D/g, '').length
  if (tel < 10 || tel > 11) e.telefone = 'Informe o DDD e o número.'
  if (f.repasseTipo === 'pix') {
    if (!f.chavePix.trim()) e.chavePix = 'Informe a chave Pix para receber suas comissões.'
  } else {
    if (!f.banco.trim()) e.banco = 'Informe o banco.'
    if (!f.agencia.trim()) e.agencia = 'Informe a agência.'
    if (!f.conta.trim()) e.conta = 'Informe a conta.'
  }
  return e
}

/**
 * Ajustes: dados pessoais, repasse (Pix ou conta, para as comissões), aparência
 * e sair. Gestores editam; quem não pode vê tudo em leitura.
 */
export function AjustesPage() {
  const { escopo, eu, recarregar } = useVendasRede()
  const sair = useSairDaRede()
  const agente = eu.agente
  const podeEditar = Boolean(agente) && eu.podeEscrever && (veEquipe(eu.papel) || AGENTE_EDITA_PROPRIO_PERFIL)

  return (
    <Conteudo>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">Ajustes</h1>
        <p className="m-0 text-base text-[#475467]">Seus dados, onde você recebe as comissões e a sua sessão.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {agente ? (
          <FormularioAjustes
            key={agente.updatedAt}
            agente={agente}
            podeEditar={podeEditar}
            salvar={async input => {
              const r = await atualizarAgenteAction(escopo, agente.id, input)
              if (!r.success) {
                toast.error(r.error)
                return false
              }
              toast.success('Ajustes salvos')
              await recarregar()
              return true
            }}
          />
        ) : (
          <EstadoVazio
            moldura
            ilustracao="equipe"
            titulo={`Você entra como ${PAPEL_COMERCIAL_LABELS[eu.papel]} da equipe`}
            descricao="Seu acesso vem da conta de administração, então não há cadastro de agente nem repasse para editar aqui."
          />
        )}

        <div className="flex flex-col gap-6 lg:self-start">
          <SectionCard title="Aparência" icon={Sun}>
            <p className="m-0 text-sm text-[#475467]">A área comercial usa sempre o tema claro, para leitura fácil em qualquer luz e na rua.</p>
          </SectionCard>
          <SectionCard title="Sessão" icon={LogOut}>
            <div className="flex flex-col items-start gap-3">
              <p className="m-0 text-sm text-[#475467]">
                {agente ? `${agente.nome} · ${PAPEL_COMERCIAL_LABELS[eu.papel]}` : PAPEL_COMERCIAL_LABELS[eu.papel]}
              </p>
              <AcaoPrincipal variante="secundaria" icone={<LogOut />} onClick={sair}>
                Sair
              </AcaoPrincipal>
            </div>
          </SectionCard>
        </div>
      </div>
    </Conteudo>
  )
}

function FormularioAjustes({
  agente,
  podeEditar,
  salvar,
}: {
  agente: VendasAgente
  podeEditar: boolean
  salvar: (input: UpdateAgenteInput) => Promise<boolean>
}) {
  const id = useId()
  const [f, setF] = useState<Form>(() => formDoAgente(agente))
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({})
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(atual => ({ ...atual, [k]: v }))
  const desabilitado = !podeEditar

  async function enviar() {
    const e = validar(f)
    setErros(e)
    if (Object.keys(e).length > 0) return
    setSalvando(true)
    const repasse =
      f.repasseTipo === 'pix'
        ? { tipo: 'pix' as const, chavePix: f.chavePix.trim(), ...(f.titular.trim() ? { titular: f.titular.trim() } : {}) }
        : {
            tipo: 'conta' as const,
            banco: f.banco.trim(),
            agencia: f.agencia.trim(),
            conta: f.conta.trim(),
            ...(f.titular.trim() ? { titular: f.titular.trim() } : {}),
            ...(f.repasseDocumento.trim() ? { documento: f.repasseDocumento.trim() } : {}),
          }
    await salvar({
      nome: f.nome.trim(),
      telefone: f.telefone.replace(/\D/g, ''),
      ...(f.dataNascimento ? { dataNascimento: f.dataNascimento } : {}),
      repasse,
    })
    setSalvando(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {!podeEditar ? (
        <p role="status" className="m-0 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-[#475467]">
          Para alterar seus dados ou o repasse, peça ao seu supervisor ou gerente. Aqui você consulta o que está cadastrado.
        </p>
      ) : null}

      <SectionCard title="Dados pessoais" description="Como você aparece para a equipe e para os clientes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo htmlFor={`${id}-nome`} rotulo="Nome" erro={erros.nome} className="sm:col-span-2">
            <Input id={`${id}-nome`} value={f.nome} onChange={e => set('nome', e.target.value)} disabled={desabilitado} className="min-h-11" />
          </Campo>
          <Campo htmlFor={`${id}-tel`} rotulo="Celular" erro={erros.telefone}>
            <Input
              id={`${id}-tel`}
              inputMode="tel"
              value={f.telefone}
              onChange={e => set('telefone', formatarCelular(e.target.value))}
              disabled={desabilitado}
              className="min-h-11"
            />
          </Campo>
          <Campo htmlFor={`${id}-nasc`} rotulo="Data de nascimento" opcional>
            <Input id={`${id}-nasc`} type="date" value={f.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} disabled={desabilitado} className="min-h-11" />
          </Campo>
          <Campo htmlFor={`${id}-email`} rotulo="E-mail de acesso" dica="Para trocar o e-mail, fale com quem cuida da rede.">
            <Input id={`${id}-email`} value={agente.email ?? ''} readOnly disabled className="min-h-11" />
          </Campo>
          <Campo htmlFor={`${id}-cpf`} rotulo="CPF">
            <Input id={`${id}-cpf`} value={formatarCpf(agente.cpf)} readOnly disabled className="min-h-11" />
          </Campo>
        </div>
      </SectionCard>

      <SectionCard title="Repasse das comissões" description="Onde a ANNETEC deposita o que você ganha.">
        <div className="flex flex-col gap-4">
          <Chips
            rotulo="Receber por"
            valor={f.repasseTipo}
            aoMudar={v => !desabilitado && set('repasseTipo', v)}
            opcoes={[
              { id: 'pix', rotulo: 'Pix' },
              { id: 'conta', rotulo: 'Conta bancária' },
            ]}
          />
          {f.repasseTipo === 'pix' ? (
            <Campo htmlFor={`${id}-pix`} rotulo="Chave Pix" erro={erros.chavePix} dica="CPF, e-mail, celular ou chave aleatória.">
              <Input id={`${id}-pix`} value={f.chavePix} onChange={e => set('chavePix', e.target.value)} disabled={desabilitado} maxLength={140} className="min-h-11" />
            </Campo>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo htmlFor={`${id}-banco`} rotulo="Banco" erro={erros.banco} className="sm:col-span-3">
                <Input id={`${id}-banco`} value={f.banco} onChange={e => set('banco', e.target.value)} disabled={desabilitado} maxLength={80} className="min-h-11" />
              </Campo>
              <Campo htmlFor={`${id}-ag`} rotulo="Agência" erro={erros.agencia}>
                <Input id={`${id}-ag`} inputMode="numeric" value={f.agencia} onChange={e => set('agencia', e.target.value)} disabled={desabilitado} maxLength={20} className="min-h-11" />
              </Campo>
              <Campo htmlFor={`${id}-conta`} rotulo="Conta" erro={erros.conta} className="sm:col-span-2">
                <Input id={`${id}-conta`} inputMode="numeric" value={f.conta} onChange={e => set('conta', e.target.value)} disabled={desabilitado} maxLength={30} className="min-h-11" />
              </Campo>
              <Campo htmlFor={`${id}-doc`} rotulo="CPF ou CNPJ do titular" opcional className="sm:col-span-3">
                <Input id={`${id}-doc`} inputMode="numeric" value={f.repasseDocumento} onChange={e => set('repasseDocumento', e.target.value)} disabled={desabilitado} maxLength={20} className="min-h-11" />
              </Campo>
            </div>
          )}
          <Campo htmlFor={`${id}-titular`} rotulo="Titular" opcional>
            <Input id={`${id}-titular`} value={f.titular} onChange={e => set('titular', e.target.value)} disabled={desabilitado} maxLength={120} className="min-h-11" />
          </Campo>
        </div>
      </SectionCard>

      {podeEditar ? (
        <div className="flex">
          <AcaoPrincipal tamanho="lg" carregando={salvando} onClick={() => void enviar()}>
            Salvar ajustes
          </AcaoPrincipal>
        </div>
      ) : null}
    </div>
  )
}
