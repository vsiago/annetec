'use client'

import { useEffect, useMemo, useState } from 'react'
import { Landmark, MapPin, Network, Plus, UserPlus, UserRound } from 'lucide-react'
import { PAPEL_COMERCIAL_LABELS, type PapelComercial, type VendasAgente } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  FieldSection,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  SwitchField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  maskCpf,
  maskPhone,
  successButton,
  useWizard,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createAgenteAction } from '@/lib/actions/vendas-rede-gestao-api'
import { toast } from 'sonner'
import { formatarCelular, pluralizar } from '../ui/mascaras'
import {
  CHAVES_ENDERECO,
  CHAVES_PESSOA,
  CHAVES_REPASSE,
  CamposEndereco,
  CamposPessoa,
  CamposRepasse,
  ENDERECO_VAZIO,
  PESSOA_VAZIA,
  REPASSE_VAZIO,
  binder,
  enderecoPayload,
  pessoaPayload,
  preenchedor,
  validarEndereco,
  validarPessoa,
  validarRepasse,
} from './campos'
import { fraseDoConvite, ResultadoConviteBloco } from './convite-resultado'
import { papeisCriaveis } from './comum'
import { useLookupsRede } from './lookups-rede'
import type { ConviteResultado, EscopoRede } from './tipos'

/**
 * Cadastro de agente da Rede Comercial: papel e vínculo → dados da pessoa
 * (cadastro completo) → endereço → repasse → revisão. O papel oferecido
 * respeita quem cadastra (master: todos; gerente: supervisor, vendedor e
 * balcão; supervisor: só vendedor). O vínculo precisa fazer sentido para o
 * papel: gerente exige corretora, balcão exige unidade.
 */

export type VinculoInicial = {
  papel?: PapelComercial
  corretoraId?: string | null
  unidadeId?: string | null
  equipeId?: string | null
}

interface Values {
  papel: string
  corretoraId: string
  unidadeId: string
  equipeId: string
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
  enviarConvite: boolean
}

const CAMPOS = [
  'papel',
  'corretoraId',
  'unidadeId',
  'equipeId',
  ...CHAVES_PESSOA,
  ...CHAVES_ENDERECO,
  ...CHAVES_REPASSE,
  'enviarConvite',
] as const

const DESCRICAO_PAPEL: Record<PapelComercial, string> = {
  master: 'Administra toda a rede.',
  gerente: 'Responde por uma corretora inteira: unidades, equipes e agentes.',
  supervisor: 'Lidera uma equipe de vendedores e acompanha os leads deles.',
  vendedor: 'Atende leads, fecha vendas e recebe comissão.',
  balcao: 'Atende no balcão de uma unidade (clínica, loja…). Não recebe leads disponíveis.',
}

function vazio(papel: string, vinculo?: VinculoInicial): Values {
  return {
    papel,
    corretoraId: vinculo?.corretoraId ?? '',
    unidadeId: vinculo?.unidadeId ?? '',
    equipeId: vinculo?.equipeId ?? '',
    ...PESSOA_VAZIA,
    ...ENDERECO_VAZIO,
    ...REPASSE_VAZIO,
    enviarConvite: true,
  }
}

export function AgenteWizard({
  escopo,
  papelCriador,
  corretoraDoCriador,
  aberto,
  aoMudarAberto,
  aoCriar,
  vinculoInicial,
  titulo,
}: {
  escopo: EscopoRede
  /** Papel de quem está cadastrando (define o que pode ser criado). */
  papelCriador: PapelComercial
  /** Corretora do gerente que cadastra (fixa o vínculo). */
  corretoraDoCriador?: string | null
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoCriar?: (agente: VendasAgente) => void | Promise<void>
  vinculoInicial?: VinculoInicial
  /** Ex.: "Convidar vendedor". */
  titulo?: string
}) {
  const papeis = useMemo(() => papeisCriaveis(papelCriador), [papelCriador])
  const lookups = useLookupsRede(escopo, aberto)
  const [criado, setCriado] = useState<{ agente: VendasAgente; convite: ConviteResultado } | null>(null)

  const papelInicial = vinculoInicial?.papel ?? papeis[papeis.length - 2] ?? papeis[0] ?? 'vendedor'
  const comVinculoFixo = papelCriador !== 'master'

  const steps = useMemo<WizardStep<Values>[]>(
    () => [
      {
        id: 'papel',
        title: 'Papel e vínculo',
        icon: Network,
        description: 'O que a pessoa faz na rede e onde ela atua.',
        fields: ['papel', 'corretoraId', 'unidadeId', 'equipeId'],
        validate: v => {
          const e: FieldErrors<Values> = {}
          if (!papeis.includes(v.papel as PapelComercial)) e.papel = 'Escolha um papel.'
          if (v.papel === 'gerente' && !v.corretoraId) e.corretoraId = 'O gerente precisa de uma corretora.'
          if (v.papel === 'balcao' && !v.unidadeId) e.unidadeId = 'O balcão precisa de uma unidade.'
          if (papelCriador === 'supervisor' && !v.equipeId) e.equipeId = 'Escolha a equipe do vendedor.'
          return e
        },
      },
      {
        id: 'pessoa',
        title: 'Dados',
        icon: UserRound,
        description: 'Cadastro completo da pessoa.',
        fields: ['nome', 'email', 'cpf', 'telefone', 'dataNascimento', 'metaMensal', 'enviarConvite'],
        validate: validarPessoa<Values>(),
      },
      {
        id: 'endereco',
        title: 'Endereço',
        icon: MapPin,
        description: 'Opcional, mas ajuda no contrato e no pagamento das comissões.',
        fields: [...CHAVES_ENDERECO],
        validate: validarEndereco<Values>(),
      },
      {
        id: 'repasse',
        title: 'Dados para pagamento',
        icon: Landmark,
        description: 'Para onde vai a comissão.',
        fields: [...CHAVES_REPASSE],
        validate: validarRepasse<Values>(),
      },
    ],
    [papeis, papelCriador],
  )

  const wizard = useWizard<Values>({
    steps,
    initialValues: vazio(papelInicial, {
      ...vinculoInicial,
      corretoraId: vinculoInicial?.corretoraId ?? (papelCriador === 'gerente' ? corretoraDoCriador : null),
    }),
    onSubmit: async v => {
      const texto = v as unknown as Record<string, string>
      const pessoa = pessoaPayload(texto)
      const equipe = v.equipeId || null
      const corretoraId = comVinculoFixo && papelCriador === 'gerente' ? (corretoraDoCriador ?? v.corretoraId ?? null) : v.corretoraId || null
      const resultado = await createAgenteAction(escopo, {
        ...pessoa,
        endereco: enderecoPayload(texto),
        papel: v.papel as PapelComercial,
        // A API deduz corretora e unidade da equipe/unidade escolhida; só manda o que o usuário definiu.
        corretoraId: equipe ? null : corretoraId,
        unidadeId: equipe ? null : v.unidadeId || null,
        equipeId: equipe,
        enviarConvite: v.enviarConvite,
      })
      if (!resultado.success) {
        return {
          ok: false,
          message: resultado.error || 'Não foi possível cadastrar o agente. Confira os dados e tente de novo.',
          fieldErrors: apiFieldErrors<Values>(resultado.fieldErrors, CAMPOS, { cpf: 'cpf', telefone: 'telefone' }),
        }
      }
      setCriado(resultado.data)
      toast.success(fraseDoConvite(resultado.data.convite, pessoa.email))
      await aoCriar?.(resultado.data.agente)
      return { ok: true }
    },
  })
  const { values, set, setMany } = wizard
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)

  useEffect(() => {
    if (!aberto) return
    setCriado(null)
  }, [aberto])

  const papel = values.papel as PapelComercial
  const equipesDisponiveis = lookups.equipes
  const opcoesEquipe = [
    ...(papelCriador === 'supervisor' ? [] : [{ value: '', label: papel === 'vendedor' ? 'Sem equipe (vendedor solo ou direto na unidade)' : 'Sem equipe' }]),
    ...equipesDisponiveis.map(e => ({ value: e.id, label: e.rotulo })),
  ]
  const opcoesUnidade = [
    { value: '', label: 'Nenhuma' },
    ...lookups.unidades.map(u => ({ value: u.id, label: u.corretoraNome ? `${u.nome} · ${u.corretoraNome}` : `${u.nome} · unidade própria` })),
  ]
  const opcoesCorretora = [{ value: '', label: 'Nenhuma' }, ...lookups.corretoras.filter(c => c.ativa).map(c => ({ value: c.id, label: c.nome }))]

  const nomeCorretora = lookups.corretoras.find(c => c.id === values.corretoraId)?.nome
  const nomeUnidade = lookups.unidades.find(u => u.id === values.unidadeId)?.nome
  const nomeEquipe = lookups.equipes.find(e => e.id === values.equipeId)?.rotulo

  const renderStep = (id: string) => {
    if (id === 'papel') {
      return (
        <FieldGrid>
          <ChoiceField
            {...campo('papel')}
            label="Papel"
            required
            columns={2}
            options={papeis.map(p => ({ value: p, title: PAPEL_COMERCIAL_LABELS[p], description: DESCRICAO_PAPEL[p] }))}
            onValueChange={valor => {
              set('papel', valor)
              // Trocar o papel limpa vínculos que deixam de fazer sentido.
              if (valor === 'gerente') setMany({ equipeId: '', unidadeId: '' })
              if (valor === 'balcao') setMany({ equipeId: '' })
            }}
          />
          {lookups.erro ? (
            <Notice tone="warning" role="alert" action={<Button type="button" size="sm" variant="outline" onClick={lookups.recarregar}>Tentar de novo</Button>}>
              Não foi possível carregar corretoras e equipes: {lookups.erro}
            </Notice>
          ) : null}
          {papelCriador === 'gerente' ? (
            <Notice tone="neutral" icon={Network}>
              {papel === 'balcao' ? 'Escolha a unidade da sua corretora onde a pessoa atende.' : 'A pessoa entra na sua corretora.'}
            </Notice>
          ) : null}
          {papel === 'gerente' && papelCriador === 'master' ? (
            <SelectField {...campo('corretoraId')} label="Corretora" required span={12} placeholder={lookups.carregando ? 'Carregando…' : 'Escolha a corretora'} options={opcoesCorretora.slice(1)} />
          ) : null}
          {papel === 'balcao' ? (
            <SelectField {...campo('unidadeId')} label="Unidade de atendimento" required span={12} placeholder={lookups.carregando ? 'Carregando…' : 'Escolha a unidade'} options={opcoesUnidade.slice(1)} />
          ) : null}
          {papel === 'vendedor' || papel === 'supervisor' ? (
            <FieldSection title="Onde atua" description={papel === 'vendedor' ? 'Em equipe, direto numa unidade, numa corretora ou solo (sem vínculo).' : 'O supervisor pode ficar numa corretora ou unidade; a equipe dele é definida ao criar a equipe.'} icon={Network}>
              {papel === 'vendedor' ? (
                <SelectField {...campo('equipeId')} label="Equipe" required={papelCriador === 'supervisor'} optional={papelCriador !== 'supervisor'} span={12} options={opcoesEquipe} />
              ) : null}
              {papelCriador === 'master' && !values.equipeId ? (
                <>
                  <SelectField {...campo('corretoraId')} label="Corretora" optional span={6} options={opcoesCorretora} />
                  <SelectField {...campo('unidadeId')} label="Unidade" optional span={6} options={opcoesUnidade} />
                </>
              ) : null}
              {papelCriador === 'gerente' && !values.equipeId ? (
                <SelectField {...campo('unidadeId')} label="Unidade" optional span={12} options={opcoesUnidade} />
              ) : null}
            </FieldSection>
          ) : null}
        </FieldGrid>
      )
    }
    if (id === 'pessoa') {
      return (
        <FieldGrid>
          <CamposPessoa campo={campo} />
          <SwitchField
            {...wizard.field('enviarConvite')}
            label="Enviar o convite agora"
            description="A pessoa recebe o acesso por e-mail. Desligado, você libera depois pela ficha."
          />
        </FieldGrid>
      )
    }
    if (id === 'endereco') {
      return (
        <FieldGrid>
          <CamposEndereco campo={campo} preencher={preencher} />
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <CamposRepasse campo={campo} tipo={values.repasseTipo} />
      </FieldGrid>
    )
  }

  const endereco = enderecoPayload(values as unknown as Record<string, string>)
  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Papel e vínculo" icon={Network} onEdit={() => wizard.goToStep('papel')}>
        <ReviewItem label="Papel" value={PAPEL_COMERCIAL_LABELS[papel] ?? values.papel} />
        <ReviewItem label="Corretora" value={nomeCorretora} empty="Sem corretora" />
        <ReviewItem label="Unidade" value={nomeUnidade} empty="Sem unidade" />
        <ReviewItem label="Equipe" value={nomeEquipe} empty="Sem equipe" />
      </ReviewSection>
      <ReviewSection title="Dados" icon={UserRound} onEdit={() => wizard.goToStep('pessoa')}>
        <ReviewItem label="Nome" value={values.nome.trim()} />
        <ReviewItem label="E-mail (login)" value={values.email.trim().toLowerCase()} />
        <ReviewItem label="CPF" value={maskCpf(values.cpf)} />
        <ReviewItem label="Celular" value={values.telefone ? maskPhone(values.telefone) : ''} />
        <ReviewItem label="Nascimento" value={values.dataNascimento ? values.dataNascimento.split('-').reverse().join('/') : ''} />
        <ReviewItem label="Meta mensal" value={values.metaMensal ? `${pluralizar(Number(values.metaMensal), 'venda')}/mês` : ''} empty="Meta padrão das Regras" />
        <ReviewItem label="Convite" value={values.enviarConvite ? 'Enviado ao concluir' : 'Não enviar agora'} />
      </ReviewSection>
      <ReviewSection title="Endereço" icon={MapPin} onEdit={() => wizard.goToStep('endereco')}>
        <ReviewItem
          label="Endereço"
          wide
          value={endereco ? [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.uf].filter(Boolean).join(', ') : ''}
        />
      </ReviewSection>
      <ReviewSection title="Dados para pagamento" icon={Landmark} onEdit={() => wizard.goToStep('repasse')}>
        <ReviewItem
          label="Forma"
          value={values.repasseTipo === 'pix' ? `Pix · ${values.chavePix}` : values.repasseTipo === 'conta' ? `Conta · ${values.banco}, ag. ${values.agencia}, c/c ${values.conta}` : ''}
          empty="Informar depois"
          wide
        />
      </ReviewSection>
    </ReviewList>
  )

  const renderSuccess = () =>
    criado ? (
      <WizardSuccess
        title={`${PAPEL_COMERCIAL_LABELS[criado.agente.papel]} cadastrado`}
        description={`${criado.agente.nome} já faz parte da rede${criado.agente.telefone ? ` · ${formatarCelular(criado.agente.telefone)}` : ''}.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className={successButton.secondary}
              onClick={() => {
                setCriado(null)
                wizard.reset()
              }}
            >
              <Plus aria-hidden="true" />
              Cadastrar outro
            </Button>
            <Button type="button" className={successButton.primary} onClick={() => aoMudarAberto(false)}>
              Fechar
            </Button>
          </>
        }
      >
        <ResultadoConviteBloco convite={criado.convite} email={criado.agente.email ?? values.email} nome={criado.agente.nome} />
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={aberto}
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      lockSuccess
      icon={UserPlus}
      title={titulo ?? 'Novo agente'}
      description="Papel, vínculo, dados da pessoa e dados para pagamento."
      submitLabel="Cadastrar agente"
      submittingLabel="Cadastrando…"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}
