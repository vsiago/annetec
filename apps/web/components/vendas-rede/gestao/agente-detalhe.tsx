'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Mail, MoreHorizontal, Pencil, Power, PowerOff, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { PAPEL_COMERCIAL_LABELS, UFS, type PapelComercial, type VendasAgente } from '@annetec/contracts'
import { ConfirmDialog, LoadError, TableSkeleton, runCommand, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import {
  FieldGrid,
  SelectField,
  TextareaField,
  WizardDialog,
  apiFieldErrors,
  maskCpf,
  useWizard,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ativarAgenteAction,
  desativarAgenteAction,
  desempenhoAgenteAction,
  getAgenteAction,
  reenviarConviteAction,
  updateAgenteAction,
} from '@/lib/actions/vendas-rede-gestao-api'
import { cn } from '@/lib/utils'
import { CopiarBotao } from '../ui/copiar-botao'
import { CampoFicha, NaoInformado, TextoQuebravel, ValorLongo } from '../ui/campo-ficha'
import { CartaoDinheiro, FaixaContagens } from '../ui/desempenho-resumo'
import { PresencaDot } from '../ui/presenca-dot'
import { formatarCelular, pluralizar } from '../ui/mascaras'
import {
  CHAVES_ENDERECO,
  CHAVES_PESSOA,
  CHAVES_REPASSE,
  CamposEndereco,
  CamposPessoa,
  CamposRepasse,
  binder,
  enderecoPayload,
  pessoaPayload,
  preenchedor,
  validarEndereco,
  validarPessoa,
  validarRepasse,
} from './campos'
import { fraseDoConvite } from './convite-resultado'
import { PERIODOS, Segmentado, dataCurta } from './comum'
import { useLookupsRede } from './lookups-rede'
import type { EscopoRede } from './tipos'

/**
 * Ficha do agente: dados, desempenho no período e ações (editar, ativar ou
 * desativar com confirmação, reenviar convite). `AgenteDetalhe` é só o
 * conteúdo, sem moldura, para caber no painel lateral da Rede e no console;
 * `AgenteDetalheSheet` o coloca numa gaveta lateral.
 */

const GESTORES: readonly PapelComercial[] = ['master', 'gerente', 'supervisor']

type RepasseGuardado = { tipo?: string; chavePix?: string; banco?: string; agencia?: string; conta?: string; titular?: string; documento?: string }

function Linha({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <CampoFicha rotulo={rotulo} largo={largo}>
      {children || <NaoInformado />}
    </CampoFicha>
  )
}

function descreverRepasse(r: VendasAgente['repasse']): string {
  const rep = r as RepasseGuardado | null
  if (!rep?.tipo) return ''
  if (rep.tipo === 'pix') return `Pix · ${rep.chavePix ?? ''}`
  return `Conta · ${rep.banco ?? ''}, ag. ${rep.agencia ?? ''}, c/c ${rep.conta ?? ''}`
}

export function AgenteDetalhe({
  escopo,
  agenteId,
  papelDoUsuario,
  aoAlterar,
  className,
}: {
  escopo: EscopoRede
  agenteId: string
  /** Papel de quem olha a ficha: define se aparecem as ações de gestão. */
  papelDoUsuario: PapelComercial
  /** Chamado depois de editar, ativar, desativar ou reenviar (para a lista recarregar). */
  aoAlterar?: () => void
  className?: string
}) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const [versao, setVersao] = useState(0)
  const [periodo, setPeriodo] = useState<'30d' | 'mes' | 'trimestre'>('30d')
  const [editando, setEditando] = useState(false)
  const [confirmaDesativar, setConfirmaDesativar] = useState(false)

  const ficha = useConsoleData<VendasAgente>(() => getAgenteAction(escopo, agenteId), [chave, agenteId, versao])
  const desempenho = useConsoleData(() => desempenhoAgenteAction(escopo, agenteId, periodo), [chave, agenteId, periodo, versao])
  const podeGerir = GESTORES.includes(papelDoUsuario)

  const recarregar = () => {
    setVersao(v => v + 1)
    aoAlterar?.()
  }

  if (ficha.loading && !ficha.data) return <TableSkeleton rows={6} />
  if (!ficha.data) return <LoadError message={ficha.error ?? 'Não foi possível carregar o agente.'} onRetry={() => void ficha.reload()} />
  const a = ficha.data

  const reenviar = async () => {
    const r = await runCommand(reenviarConviteAction(escopo, a.id))
    if (!r) return
    if (r.enviado) toast.success(fraseDoConvite(r, a.email ?? 'o e-mail cadastrado'))
    else toast.error('O convite não pôde ser enviado agora. Tente de novo em alguns minutos.')
    recarregar()
  }

  const alternarAtivo = async () => {
    const r = await runCommand(a.ativo ? desativarAgenteAction(escopo, a.id) : ativarAgenteAction(escopo, a.id), a.ativo ? `${a.nome} foi desativado.` : `${a.nome} foi reativado.`)
    if (r) recarregar()
    return r !== null
  }

  const k = desempenho.data?.kpis
  const endereco = a.endereco
  const enderecoTexto = endereco
    ? [endereco.logradouro, endereco.numero, endereco.complemento, endereco.bairro, endereco.cidade, endereco.uf].filter(Boolean).join(', ')
    : ''

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[17rem] items-start gap-3">
          <span className="relative inline-flex shrink-0">
            <span aria-hidden="true" className="inline-flex size-14 items-center justify-center rounded-full bg-[#E5EDF5] text-base font-bold text-[#1E2A4A]">
              {initialsOf(a.nome)}
            </span>
            <PresencaDot online={a.online} className="absolute -bottom-0.5 -right-0.5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="m-0 truncate text-lg font-bold leading-tight" title={a.nome}>
              {a.nome}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="info" dot={false} icon={<UserRound />}>
                {PAPEL_COMERCIAL_LABELS[a.papel]}
              </StatusPill>
              <StatusPill tone={a.ativo ? 'success' : 'neutral'}>{a.ativo ? 'Ativo' : 'Desativado'}</StatusPill>
              <PresencaDot online={a.online} rotulo />
            </div>
          </div>
        </div>
        {podeGerir ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" onClick={() => setEditando(true)} className="gap-2">
              <Pencil aria-hidden="true" />
              Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Mais ações" className="size-10">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void reenviar()}>
                  <Mail aria-hidden="true" />
                  Reenviar convite
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {a.ativo ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmaDesativar(true)}>
                    <PowerOff aria-hidden="true" />
                    Desativar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => void alternarAtivo()}>
                    <Power aria-hidden="true" />
                    Reativar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <section aria-labelledby="desempenho-titulo" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="desempenho-titulo" className="m-0 text-sm font-semibold">
            Desempenho
          </h3>
          <Segmentado rotulo="Período do desempenho" valor={periodo} opcoes={PERIODOS} aoMudar={setPeriodo} />
        </div>
        {desempenho.loading && !k ? (
          <TableSkeleton rows={2} />
        ) : desempenho.error && !k ? (
          <LoadError message={desempenho.error} onRetry={() => void desempenho.reload()} framed={false} />
        ) : k ? (
          <>
            <FaixaContagens k={k} />
            <CartaoDinheiro k={k} />
            {k.leadsRecebidos === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Nenhum lead recebido neste período. Quando chegarem, os números aparecem aqui.</p>
            ) : null}
          </>
        ) : null}
      </section>

      <section aria-labelledby="ficha-titulo" className="@container flex min-w-0 flex-col">
        <h3 id="ficha-titulo" className="m-0 mb-3 text-sm font-semibold">
          Ficha
        </h3>
        <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-4 @sm:grid-cols-2">
          <Linha rotulo="E-mail (login)" largo>
            {a.email ? <ValorLongo texto={a.email} href={`mailto:${a.email}`} icone={Mail} rotuloCopiar="Copiar e-mail" mensagemCopiar="E-mail copiado" /> : null}
          </Linha>
          <Linha rotulo="CPF">{a.cpf ? maskCpf(a.cpf) : ''}</Linha>
          <Linha rotulo="Celular">{a.telefone ? formatarCelular(a.telefone) : ''}</Linha>
          <Linha rotulo="Nascimento">{a.dataNascimento ? a.dataNascimento.split('-').reverse().join('/') : ''}</Linha>
          <Linha rotulo="Endereço" largo>
            {enderecoTexto ? <TextoQuebravel>{enderecoTexto}</TextoQuebravel> : null}
          </Linha>
          <Linha rotulo="Dados para pagamento" largo>
            {descreverRepasse(a.repasse) ? <ValorLongo texto={descreverRepasse(a.repasse)} rotuloCopiar="Copiar dados de pagamento" mensagemCopiar="Dados copiados" /> : null}
          </Linha>
          <Linha rotulo="Meta mensal">{a.metaMensal ? `${pluralizar(a.metaMensal, 'venda')}/mês` : ''}</Linha>
          <Linha rotulo="Código de indicação">
            <span className="inline-flex items-center gap-2">
              <code className="rounded bg-[#F2F4F7] px-1.5 py-0.5 text-xs">{a.codigoIndicacao}</code>
              <CopiarBotao texto={a.codigoIndicacao} variante="icone" rotulo="Copiar código" mensagem="Código copiado" className="size-9 min-h-9" />
            </span>
          </Linha>
          <Linha rotulo="Cadastrado em">{dataCurta(a.createdAt)}</Linha>
          {a.observacoes ? (
            <Linha rotulo="Observações" largo>
              <span className="block whitespace-pre-line">{a.observacoes}</span>
            </Linha>
          ) : null}
        </dl>
      </section>

      {podeGerir ? (
        <>
          <EditarAgenteDialog
            escopo={escopo}
            agente={a}
            papelDoUsuario={papelDoUsuario}
            aberto={editando}
            aoMudarAberto={setEditando}
            aoSalvar={recarregar}
          />
          <ConfirmDialog
            open={confirmaDesativar}
            onOpenChange={setConfirmaDesativar}
            title={`Desativar ${a.nome}?`}
            description="A pessoa perde o acesso à área de vendas e deixa de receber leads. O histórico e as comissões continuam. Você pode reativar quando quiser."
            confirmLabel="Desativar"
            destructive
            onConfirm={alternarAtivo}
          />
        </>
      ) : null}
    </div>
  )
}

/** Gaveta lateral com a ficha. `agenteId = null` mantém fechada. */
export function AgenteDetalheSheet({
  escopo,
  agenteId,
  papelDoUsuario,
  aoFechar,
  aoAlterar,
}: {
  escopo: EscopoRede
  agenteId: string | null
  papelDoUsuario: PapelComercial
  aoFechar: () => void
  aoAlterar?: () => void
}) {
  return (
    <Sheet open={agenteId !== null} onOpenChange={aberto => !aberto && aoFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Ficha</SheetTitle>
          <SheetDescription>Dados, desempenho e ações.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {agenteId ? <AgenteDetalhe escopo={escopo} agenteId={agenteId} papelDoUsuario={papelDoUsuario} aoAlterar={aoAlterar} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Edição
// ---------------------------------------------------------------------------

interface ValoresEdicao {
  nome: string
  email: string
  cpf: string
  telefone: string
  dataNascimento: string
  metaMensal: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  repasseTipo: string
  chavePix: string
  banco: string
  agencia: string
  conta: string
  titular: string
  repasseDocumento: string
  equipeId: string
  observacoes: string
}

function valoresDoAgente(a: VendasAgente): ValoresEdicao {
  const rep = (a.repasse ?? {}) as RepasseGuardado
  const e = a.endereco
  return {
    nome: a.nome,
    email: a.email ?? '',
    cpf: a.cpf ? maskCpf(a.cpf) : '',
    telefone: a.telefone ? formatarCelular(a.telefone) : '',
    dataNascimento: a.dataNascimento ?? '',
    metaMensal: a.metaMensal ? String(a.metaMensal) : '',
    cep: e?.cep ?? '',
    logradouro: e?.logradouro ?? '',
    numero: e?.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? '',
    cidade: e?.cidade ?? '',
    uf: e?.uf && (UFS as readonly string[]).includes(e.uf) ? e.uf : '',
    repasseTipo: rep.tipo === 'pix' || rep.tipo === 'conta' ? rep.tipo : 'nenhum',
    chavePix: rep.chavePix ?? '',
    banco: rep.banco ?? '',
    agencia: rep.agencia ?? '',
    conta: rep.conta ?? '',
    titular: rep.titular ?? '',
    repasseDocumento: rep.documento ?? '',
    equipeId: a.equipeId ?? '',
    observacoes: a.observacoes ?? '',
  }
}

function EditarAgenteDialog({
  escopo,
  agente,
  papelDoUsuario,
  aberto,
  aoMudarAberto,
  aoSalvar,
}: {
  escopo: EscopoRede
  agente: VendasAgente
  papelDoUsuario: PapelComercial
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoSalvar: () => void
}) {
  const lookups = useLookupsRede(escopo, aberto && agente.papel === 'vendedor' && papelDoUsuario !== 'supervisor')
  const inicial = useMemo(() => valoresDoAgente(agente), [agente])

  const steps = useMemo<WizardStep<ValoresEdicao>[]>(
    () => [
      {
        id: 'ficha',
        title: 'Ficha',
        icon: UserRound,
        fields: [...CHAVES_PESSOA, ...CHAVES_ENDERECO, ...CHAVES_REPASSE, 'equipeId', 'observacoes'],
        validate: v => {
          // O e-mail da conta não muda por aqui: não entra na validação.
          const { email: _ignorado, ...resto } = validarPessoa<ValoresEdicao>()(v)
          return { ...resto, ...validarEndereco<ValoresEdicao>()(v), ...validarRepasse<ValoresEdicao>()(v) }
        },
      },
    ],
    [],
  )

  const wizard = useWizard<ValoresEdicao>({
    steps,
    initialValues: inicial,
    review: false,
    onSubmit: async v => {
      const t = v as unknown as Record<string, string>
      const { email: _email, ...pessoa } = pessoaPayload(t)
      const r = await updateAgenteAction(escopo, agente.id, {
        ...pessoa,
        endereco: enderecoPayload(t),
        observacoes: v.observacoes.trim() || null,
        ...(agente.papel === 'vendedor' && papelDoUsuario !== 'supervisor' && v.equipeId !== (agente.equipeId ?? '') ? { equipeId: v.equipeId || null } : {}),
      })
      if (!r.success) {
        return {
          ok: false,
          message: r.error || 'Não foi possível salvar as alterações.',
          fieldErrors: apiFieldErrors<ValoresEdicao>(r.fieldErrors, [...CHAVES_PESSOA, ...CHAVES_ENDERECO, ...CHAVES_REPASSE, 'equipeId', 'observacoes']),
        }
      }
      toast.success('Dados do agente atualizados.')
      aoSalvar()
      return { ok: true }
    },
  })
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)


  return (
    <WizardDialog
      open={aberto}
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      icon={Pencil}
      size="md"
      title={`Editar ${agente.nome}`}
      description="O e-mail é o login da conta e não muda por aqui."
      submitLabel="Salvar alterações"
      submittingLabel="Salvando…"
      discardTitle="Descartar as alterações?"
      discardDescription="O que você mudou não será salvo."
      renderStep={() => (
        <FieldGrid>
          <CamposPessoa campo={campo} emailBloqueado />
          {agente.papel === 'vendedor' && papelDoUsuario !== 'supervisor' ? (
            <SelectField
              {...campo('equipeId')}
              label="Equipe"
              optional
              span={12}
              placeholder={lookups.carregando ? 'Carregando…' : 'Sem equipe'}
              options={[{ value: '', label: 'Sem equipe' }, ...lookups.equipes.map(e => ({ value: e.id, label: e.rotulo }))]}
              hint="Mudar de equipe leva os próximos leads para o novo supervisor."
            />
          ) : null}
          <CamposEndereco campo={campo} preencher={preencher} />
          <CamposRepasse campo={campo} tipo={wizard.values.repasseTipo} />
          <TextareaField {...campo('observacoes')} label="Observações" optional span={12} maxLength={1000} rows={3} />
        </FieldGrid>
      )}
    />
  )
}

