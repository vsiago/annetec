'use client'

import { useMemo, useState } from 'react'
import { Plus, UserRound, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import type { PapelComercial, VendasAgente, VendasEquipe } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  SwitchField,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  maskCpf,
  successButton,
  useWizard,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createAgenteAction, createEquipeAction } from '@/lib/actions/vendas-rede-gestao-api'
import {
  CHAVES_PESSOA,
  CHAVES_REPASSE,
  CamposPessoa,
  CamposRepasse,
  PESSOA_VAZIA,
  REPASSE_VAZIO,
  binder,
  pessoaPayload,
  validarPessoa,
  validarRepasse,
} from './campos'
import { fraseDoConvite, ResultadoConviteBloco } from './convite-resultado'
import { useLookupsRede } from './lookups-rede'
import type { ConviteResultado, EscopoRede } from './tipos'

/**
 * Cadastro de equipe: nome e vínculo (corretora e/ou unidade; a API exige ao
 * menos um) → supervisor (um que já existe, criar um novo com cadastro
 * completo, ou deixar para depois) → revisão. Criando o supervisor junto, se a
 * equipe falhar o supervisor já criado é reaproveitado na nova tentativa.
 */

interface ValoresForm {
  nomeEquipe: string
  nome: string
  corretoraId: string
  unidadeId: string
  modoSupervisor: string
  supervisorId: string
  email: string
  cpf: string
  telefone: string
  dataNascimento: string
  metaMensal: string
  repasseTipo: string
  chavePix: string
  banco: string
  agencia: string
  conta: string
  titular: string
  repasseDocumento: string
  enviarConvite: boolean
}


export function EquipeWizard({
  escopo,
  papelCriador,
  corretoraDoCriador,
  corretoraInicial,
  unidadeInicial,
  aberto,
  aoMudarAberto,
  aoCriar,
}: {
  escopo: EscopoRede
  papelCriador: PapelComercial
  corretoraDoCriador?: string | null
  corretoraInicial?: string | null
  unidadeInicial?: string | null
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoCriar?: (equipe: VendasEquipe) => void | Promise<void>
}) {
  const lookups = useLookupsRede(escopo, aberto)
  const master = papelCriador === 'master'
  const [criada, setCriada] = useState<{ equipe: VendasEquipe; supervisor: VendasAgente | null; convite: ConviteResultado | null } | null>(null)
  const [supervisorCriado, setSupervisorCriado] = useState<VendasAgente | null>(null)

  const steps = useMemo<WizardStep<ValoresForm>[]>(
    () => [
      {
        id: 'equipe',
        title: 'Equipe',
        icon: UsersRound,
        description: 'Nome e onde a equipe atua.',
        fields: ['nomeEquipe', 'corretoraId', 'unidadeId'],
        validate: v => {
          const e: FieldErrors<ValoresForm> = {}
          if (v.nomeEquipe.trim().length < 2) e.nomeEquipe = 'Informe o nome da equipe.'
          if (!v.corretoraId && !v.unidadeId) e.corretoraId = 'Escolha uma corretora ou uma unidade para a equipe.'
          return e
        },
      },
      {
        id: 'supervisor',
        title: 'Supervisor',
        icon: UserRound,
        description: 'Quem lidera a equipe.',
        fields: ['modoSupervisor', 'supervisorId', ...CHAVES_PESSOA, ...CHAVES_REPASSE, 'enviarConvite'],
        validate: v => {
          if (v.modoSupervisor === 'existente') {
            return v.supervisorId ? {} : { supervisorId: 'Escolha o supervisor.' }
          }
          if (v.modoSupervisor === 'novo') {
            return { ...validarPessoa<ValoresForm>()(v), ...validarRepasse<ValoresForm>()(v) }
          }
          return {}
        },
      },
    ],
    [],
  )

  const wizard = useWizard<ValoresForm>({
    steps,
    initialValues: {
      nomeEquipe: '',
      corretoraId: master ? (corretoraInicial ?? '') : (corretoraDoCriador ?? ''),
      unidadeId: unidadeInicial ?? '',
      modoSupervisor: 'existente',
      supervisorId: '',
      ...PESSOA_VAZIA,
      ...REPASSE_VAZIO,
      enviarConvite: true,
    },
    onSubmit: async v => {
      const unidade = lookups.unidades.find(u => u.id === v.unidadeId)
      const corretoraId = v.corretoraId || unidade?.corretoraId || null
      let supervisorId: string | null = v.modoSupervisor === 'existente' ? v.supervisorId || null : null
      let supervisor = supervisorCriado
      let convite: ConviteResultado | null = null

      if (v.modoSupervisor === 'novo') {
        if (supervisor) {
          supervisorId = supervisor.id
        } else {
          const pessoa = pessoaPayload(v as unknown as Record<string, string>)
          const s = await createAgenteAction(escopo, {
            ...pessoa,
            papel: 'supervisor',
            corretoraId,
            unidadeId: v.unidadeId || null,
            equipeId: null,
            enviarConvite: v.enviarConvite,
          })
          if (!s.success) {
            return {
              ok: false,
              message: s.error || 'Não foi possível cadastrar o supervisor.',
              fieldErrors: apiFieldErrors<ValoresForm>(s.fieldErrors, ['nome', 'email', 'cpf', 'telefone', 'dataNascimento', 'metaMensal']),
            }
          }
          supervisor = s.data.agente
          convite = s.data.convite
          supervisorId = s.data.agente.id
          setSupervisorCriado(s.data.agente)
          toast.success(fraseDoConvite(s.data.convite, pessoa.email))
        }
      }

      const r = await createEquipeAction(escopo, {
        nome: v.nomeEquipe.trim(),
        corretoraId,
        unidadeId: v.unidadeId || null,
        supervisorAgenteId: supervisorId,
      })
      if (!r.success) {
        return {
          ok: false,
          message: supervisor
            ? `O supervisor foi cadastrado, mas a equipe não: ${r.error || 'confira os dados.'} Ao tentar de novo, só a equipe é criada.`
            : r.error || 'Não foi possível cadastrar a equipe.',
          fieldErrors: apiFieldErrors<ValoresForm>(r.fieldErrors, ['nomeEquipe', 'corretoraId', 'unidadeId'], { nome: 'nomeEquipe' }),
        }
      }
      toast.success(`Equipe ${r.data.nome} criada.`)
      setCriada({ equipe: r.data, supervisor, convite })
      await aoCriar?.(r.data)
      return { ok: true }
    },
  })
  const { values, set, setMany } = wizard
  const campo = binder(wizard)

  const unidadesDaCorretora = lookups.unidades.filter(u => !values.corretoraId || u.corretoraId === values.corretoraId)
  const supervisores = lookups.agentes.filter(
    a => a.papel === 'supervisor' && a.ativo && (!values.corretoraId || a.corretoraId === values.corretoraId),
  )
  const nomeCorretora = lookups.corretoras.find(c => c.id === values.corretoraId)?.nome
  const nomeUnidade = lookups.unidades.find(u => u.id === values.unidadeId)?.nome
  const nomeSupervisor =
    values.modoSupervisor === 'existente'
      ? lookups.agentes.find(a => a.id === values.supervisorId)?.nome
      : values.modoSupervisor === 'novo'
        ? values.nome.trim()
        : undefined

  const renderStep = (id: string) => {
    if (id === 'equipe') {
      return (
        <FieldGrid>
          <TextField {...campo('nomeEquipe')} label="Nome da equipe" required span={12} maxLength={120} autoComplete="off" placeholder="Ex.: Equipe Zona Sul" />
          {master ? (
            <SelectField
              {...campo('corretoraId')}
              label="Corretora"
              optional
              span={6}
              placeholder={lookups.carregando ? 'Carregando…' : 'Sem corretora'}
              options={[{ value: '', label: 'Sem corretora' }, ...lookups.corretoras.filter(c => c.ativa).map(c => ({ value: c.id, label: c.nome }))]}
              onValueChange={valor => setMany({ corretoraId: valor, unidadeId: '' })}
            />
          ) : null}
          <SelectField
            {...campo('unidadeId')}
            label="Unidade"
            optional
            span={master ? 6 : 12}
            placeholder={lookups.carregando ? 'Carregando…' : 'Sem unidade'}
            options={[{ value: '', label: 'Sem unidade' }, ...unidadesDaCorretora.map(u => ({ value: u.id, label: u.nome }))]}
            onValueChange={valor => {
              const un = lookups.unidades.find(u => u.id === valor)
              setMany({ unidadeId: valor, ...(un?.corretoraId ? { corretoraId: un.corretoraId } : {}) })
            }}
          />
          <Notice tone="neutral" icon={UsersRound}>
            A equipe precisa estar numa corretora, numa unidade ou nas duas.
          </Notice>
          {lookups.erro ? (
            <Notice tone="warning" role="alert" action={<Button type="button" size="sm" variant="outline" onClick={lookups.recarregar}>Tentar de novo</Button>}>
              Não foi possível carregar corretoras e unidades: {lookups.erro}
            </Notice>
          ) : null}
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <ChoiceField
          {...campo('modoSupervisor')}
          label="Supervisor"
          required
          columns={3}
          options={[
            { value: 'existente', title: 'Já cadastrado', description: 'Escolha na lista de supervisores.' },
            { value: 'novo', title: 'Cadastrar agora', description: 'Cadastro completo e convite.' },
            { value: 'depois', title: 'Definir depois', description: 'A equipe nasce sem supervisor.' },
          ]}
        />
        {values.modoSupervisor === 'existente' ? (
          supervisores.length > 0 ? (
            <SelectField
              {...campo('supervisorId')}
              label="Supervisor"
              required
              span={12}
              placeholder="Escolha o supervisor"
              options={supervisores.map(s => ({ value: s.id, label: s.nome }))}
            />
          ) : (
            <Notice tone="warning" role="status" action={<Button type="button" size="sm" variant="outline" onClick={() => set('modoSupervisor', 'novo')}>Cadastrar agora</Button>}>
              Nenhum supervisor disponível{values.corretoraId ? ' nesta corretora' : ''}. Cadastre um novo.
            </Notice>
          )
        ) : null}
        {values.modoSupervisor === 'novo' ? (
          <>
            <CamposPessoa campo={campo} />
            <SwitchField {...wizard.field('enviarConvite')} label="Enviar o convite agora" description="O supervisor recebe o acesso por e-mail." />
            <CamposRepasse campo={campo} tipo={values.repasseTipo} />
          </>
        ) : null}
      </FieldGrid>
    )
  }

  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Equipe" icon={UsersRound} onEdit={() => wizard.goToStep('equipe')}>
        <ReviewItem label="Nome" value={values.nomeEquipe.trim()} />
        <ReviewItem label="Corretora" value={nomeCorretora} empty="Sem corretora" />
        <ReviewItem label="Unidade" value={nomeUnidade} empty="Sem unidade" />
      </ReviewSection>
      <ReviewSection title="Supervisor" icon={UserRound} onEdit={() => wizard.goToStep('supervisor')}>
        <ReviewItem label="Supervisor" value={nomeSupervisor} empty="A definir depois" />
        {values.modoSupervisor === 'novo' ? (
          <>
            <ReviewItem label="E-mail (login)" value={values.email.trim().toLowerCase()} />
            <ReviewItem label="CPF" value={maskCpf(values.cpf)} />
            <ReviewItem label="Convite" value={values.enviarConvite ? 'Enviado ao concluir' : 'Não enviar agora'} />
            <ReviewItem
              label="Dados para pagamento"
              value={values.repasseTipo === 'pix' ? `Pix · ${values.chavePix}` : values.repasseTipo === 'conta' ? `Conta · ${values.banco}` : ''}
              empty="Informar depois"
            />
          </>
        ) : null}
      </ReviewSection>
    </ReviewList>
  )

  return (
    <WizardDialog
      open={aberto}
      onOpenChange={next => {
        aoMudarAberto(next)
        if (!next) {
          setCriada(null)
          setSupervisorCriado(null)
        }
      }}
      wizard={wizard}
      lockSuccess
      icon={UsersRound}
      title="Nova equipe"
      description="Grupo de vendedores sob um supervisor."
      submitLabel="Criar equipe"
      submittingLabel="Criando…"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={() =>
        criada ? (
          <WizardSuccess
            title="Equipe criada"
            description={`${criada.equipe.nome}${criada.supervisor ? ` · supervisor ${criada.supervisor.nome}` : ' · sem supervisor por enquanto'}. Agora convide os vendedores.`}
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    setCriada(null)
                    setSupervisorCriado(null)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Criar outra
                </Button>
                <Button type="button" className={successButton.primary} onClick={() => aoMudarAberto(false)}>
                  Fechar
                </Button>
              </>
            }
          >
            {criada.supervisor && criada.convite ? (
              <ResultadoConviteBloco convite={criada.convite} email={criada.supervisor.email ?? values.email} nome={criada.supervisor.nome} />
            ) : null}
          </WizardSuccess>
        ) : null
      }
    />
  )
}

