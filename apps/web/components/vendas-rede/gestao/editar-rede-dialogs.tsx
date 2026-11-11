'use client'

import { useMemo } from 'react'
import { Building2, Percent, Pencil, Store, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  TIPOS_UNIDADE,
  TIPO_UNIDADE_LABELS,
  UFS,
  onlyDigits,
  updateCorretoraInput,
  updateEquipeInput,
  updateUnidadeInput,
  type TipoUnidade,
  type VendasArvoreCorretora,
  type VendasArvoreEquipe,
  type VendasArvoreRede,
  type VendasArvoreUnidade,
} from '@annetec/contracts'
import {
  FieldGrid,
  FieldSection,
  SelectField,
  SwitchField,
  TextField,
  TextareaField,
  WizardDialog,
  apiFieldErrors,
  decimalInput,
  maskDecimal,
  maskPhone,
  parseDecimal,
  useWizard,
  zodFields,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { updateCorretoraAction, updateEquipeAction, updateUnidadeAction } from '@/lib/actions/vendas-rede-gestao-api'
import { CHAVES_ENDERECO, CamposEndereco, binder, enderecoPayload, preenchedor, validarEndereco } from './campos'
import { derivarLookups } from './lookups-rede'
import type { EscopoRede } from './tipos'

/**
 * Edição de corretora, unidade e equipe (diálogos de um passo, sem revisão).
 * Cada diálogo nasce com os valores atuais do item: o chamador monta o
 * componente só enquanto edita (e o desmonta ao fechar), então o estado do
 * formulário nunca fica velho. A validação é o próprio `update*Input` do contrato.
 */

type Texto = Record<string, string>

function enderecoInicial(e: VendasArvoreCorretora['endereco']) {
  return {
    cep: e?.cep ?? '',
    logradouro: e?.logradouro ?? '',
    numero: e?.numero ?? '',
    complemento: e?.complemento ?? '',
    bairro: e?.bairro ?? '',
    cidade: e?.cidade ?? '',
    uf: e?.uf && (UFS as readonly string[]).includes(e.uf) ? e.uf : '',
  }
}

const MSG_PERCENTUAL = { required: 'Informe o percentual.', invalid: 'Use um valor de 0 a 100.' }

// ---------------------------------------------------------------------------
// Corretora
// ---------------------------------------------------------------------------

interface ValoresCorretora {
  nomeFantasia: string
  razaoSocial: string
  email: string
  telefone: string
  observacoes: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  usarOverrides: boolean
  supervisor: string
  gerente: string
  corretora: string
}

const CAMPOS_CORRETORA = ['nomeFantasia', 'razaoSocial', 'email', 'telefone', 'observacoes', ...CHAVES_ENDERECO, 'supervisor', 'gerente', 'corretora'] as const

function payloadCorretora(v: ValoresCorretora) {
  return {
    nomeFantasia: v.nomeFantasia.trim(),
    razaoSocial: v.razaoSocial.trim(),
    email: v.email.trim().toLowerCase() || null,
    telefone: onlyDigits(v.telefone) || null,
    endereco: enderecoPayload(v as unknown as Texto),
    observacoes: v.observacoes.trim() || null,
    comissaoOverrides: v.usarOverrides
      ? { supervisor: parseDecimal(v.supervisor) ?? undefined, gerente: parseDecimal(v.gerente) ?? undefined, corretora: parseDecimal(v.corretora) ?? undefined }
      : null,
  }
}

export function EditarCorretoraDialog({
  escopo,
  corretora,
  aoMudarAberto,
  aoSalvar,
}: {
  escopo: EscopoRede
  corretora: VendasArvoreCorretora
  aoMudarAberto: (aberto: boolean) => void
  aoSalvar: () => void
}) {
  const ov = corretora.comissaoOverrides
  const steps = useMemo<WizardStep<ValoresCorretora>[]>(
    () => [
      {
        id: 'dados',
        title: 'Corretora',
        icon: Building2,
        fields: [...CAMPOS_CORRETORA],
        validate: v => {
          const base = zodFields<ValoresCorretora>(updateCorretoraInput, {
            input: x => {
              const { comissaoOverrides: _o, endereco: _e, ...resto } = payloadCorretora(x)
              return resto
            },
          })(v)
          const overrides = v.usarOverrides
            ? zodFields<ValoresCorretora>(updateCorretoraInput.shape.comissaoOverrides, {
                input: x => payloadCorretora(x).comissaoOverrides,
                fieldOf: path => (['supervisor', 'gerente', 'corretora'] as const).find(k => k === path[path.length - 1]) ?? null,
                messages: { supervisor: MSG_PERCENTUAL, gerente: MSG_PERCENTUAL, corretora: MSG_PERCENTUAL },
              })(v)
            : {}
          return { ...base, ...overrides, ...validarEndereco<ValoresCorretora>()(v) }
        },
      },
    ],
    [],
  )

  const wizard = useWizard<ValoresCorretora>({
    steps,
    review: false,
    initialValues: {
      nomeFantasia: corretora.nomeFantasia,
      razaoSocial: corretora.razaoSocial,
      email: corretora.email ?? '',
      telefone: corretora.telefone ? maskPhone(corretora.telefone) : '',
      observacoes: corretora.observacoes ?? '',
      ...enderecoInicial(corretora.endereco),
      usarOverrides: ov !== null,
      supervisor: ov ? decimalInput(ov.supervisor) : '',
      gerente: ov ? decimalInput(ov.gerente) : '',
      corretora: ov ? decimalInput(ov.corretora) : '',
    },
    onSubmit: async v => {
      const r = await updateCorretoraAction(escopo, corretora.id, payloadCorretora(v) as Parameters<typeof updateCorretoraAction>[2])
      if (!r.success) {
        return {
          ok: false,
          message: r.error || 'Não foi possível salvar a corretora.',
          fieldErrors: apiFieldErrors<ValoresCorretora>(r.fieldErrors, CAMPOS_CORRETORA),
        }
      }
      toast.success(`${r.data.nomeFantasia} atualizada.`)
      aoSalvar()
      return { ok: true }
    },
  })
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)

  return (
    <WizardDialog
      open
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      icon={Pencil}
      size="md"
      title={`Editar ${corretora.nomeFantasia}`}
      description="O CNPJ não muda por aqui."
      submitLabel="Salvar alterações"
      submittingLabel="Salvando…"
      discardTitle="Descartar as alterações?"
      discardDescription="O que você mudou não será salvo."
      renderStep={() => (
        <FieldGrid>
          <TextField {...campo('nomeFantasia')} label="Nome fantasia" required span={12} maxLength={120} autoComplete="off" />
          <TextField {...campo('razaoSocial')} label="Razão social" required span={12} maxLength={160} autoComplete="off" />
          <TextField {...campo('email')} label="E-mail da empresa" optional span={7} type="email" inputMode="email" autoComplete="off" />
          <TextField {...campo('telefone')} label="Telefone" optional span={5} type="tel" inputMode="tel" mask={maskPhone} maxLength={15} />
          <CamposEndereco campo={campo} preencher={preencher} />
          <FieldSection title="Comissão própria" description="Opcional. Em branco, vale o que está nas Regras." icon={Percent}>
            <SwitchField
              {...wizard.field('usarOverrides')}
              label="Usar percentuais próprios nesta corretora"
              description="Vale só para esta corretora: repasse a supervisor, gerente e corretora."
            />
            {wizard.values.usarOverrides ? (
              <>
                <TextField {...campo('supervisor')} label="Supervisor" required span={4} inputMode="decimal" mask={v => maskDecimal(v, 2)} suffix="%" />
                <TextField {...campo('gerente')} label="Gerente" required span={4} inputMode="decimal" mask={v => maskDecimal(v, 2)} suffix="%" />
                <TextField {...campo('corretora')} label="Corretora" required span={4} inputMode="decimal" mask={v => maskDecimal(v, 2)} suffix="%" />
              </>
            ) : null}
          </FieldSection>
          <TextareaField {...campo('observacoes')} label="Observações" optional span={12} maxLength={1000} rows={3} />
        </FieldGrid>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Unidade
// ---------------------------------------------------------------------------

interface ValoresUnidade {
  nome: string
  tipo: string
  telefone: string
  responsavelId: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

const CAMPOS_UNIDADE = ['nome', 'tipo', 'telefone', 'responsavelId', ...CHAVES_ENDERECO] as const

function payloadUnidade(v: ValoresUnidade) {
  return {
    nome: v.nome.trim(),
    tipo: v.tipo as TipoUnidade,
    telefone: onlyDigits(v.telefone) || null,
    responsavelAgenteId: v.responsavelId || null,
    endereco: enderecoPayload(v as unknown as Texto),
  }
}

export function EditarUnidadeDialog({
  escopo,
  unidade,
  aoMudarAberto,
  aoSalvar,
}: {
  escopo: EscopoRede
  unidade: VendasArvoreUnidade
  aoMudarAberto: (aberto: boolean) => void
  aoSalvar: () => void
}) {
  const steps = useMemo<WizardStep<ValoresUnidade>[]>(
    () => [
      {
        id: 'dados',
        title: 'Unidade',
        icon: Store,
        fields: [...CAMPOS_UNIDADE],
        validate: v => ({
          ...zodFields<ValoresUnidade>(updateUnidadeInput, {
            input: x => {
              const { endereco: _e, ...resto } = payloadUnidade(x)
              return resto
            },
            fieldOf: path => (path[0] === 'responsavelAgenteId' ? 'responsavelId' : typeof path[0] === 'string' && path[0] in v ? (path[0] as keyof ValoresUnidade) : null),
            messages: { nome: { required: 'Informe o nome da unidade.' }, telefone: 'Informe o telefone com DDD.' },
          })(v),
          ...validarEndereco<ValoresUnidade>()(v),
        }),
      },
    ],
    [],
  )

  const wizard = useWizard<ValoresUnidade>({
    steps,
    review: false,
    initialValues: {
      nome: unidade.nome,
      tipo: unidade.tipo,
      telefone: unidade.telefone ? maskPhone(unidade.telefone) : '',
      responsavelId: unidade.responsavelAgenteId ?? '',
      ...enderecoInicial(unidade.endereco),
    },
    onSubmit: async v => {
      const r = await updateUnidadeAction(escopo, unidade.id, payloadUnidade(v))
      if (!r.success) {
        return {
          ok: false,
          message: r.error || 'Não foi possível salvar a unidade.',
          fieldErrors: apiFieldErrors<ValoresUnidade>(r.fieldErrors, CAMPOS_UNIDADE, { responsavelAgenteId: 'responsavelId' }),
        }
      }
      toast.success(`${r.data.nome} atualizada.`)
      aoSalvar()
      return { ok: true }
    },
  })
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)
  const responsaveis = unidade.agentes.filter(a => a.ativo)

  return (
    <WizardDialog
      open
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      icon={Pencil}
      size="md"
      title={`Editar ${unidade.nome}`}
      description="Nome, tipo, contato, endereço e responsável da unidade."
      submitLabel="Salvar alterações"
      submittingLabel="Salvando…"
      discardTitle="Descartar as alterações?"
      discardDescription="O que você mudou não será salvo."
      renderStep={() => (
        <FieldGrid>
          <TextField {...campo('nome')} label="Nome da unidade" required span={12} maxLength={120} autoComplete="off" />
          <SelectField {...campo('tipo')} label="Tipo" required span={6} options={TIPOS_UNIDADE.map(t => ({ value: t, label: TIPO_UNIDADE_LABELS[t] }))} />
          <TextField {...campo('telefone')} label="Telefone" optional span={6} type="tel" inputMode="tel" mask={maskPhone} maxLength={15} />
          <SelectField
            {...campo('responsavelId')}
            label="Responsável"
            optional
            span={12}
            placeholder="Sem responsável"
            options={[{ value: '', label: 'Sem responsável' }, ...responsaveis.map(a => ({ value: a.id, label: a.nome }))]}
            hint={responsaveis.length === 0 ? 'Cadastre um agente nesta unidade para poder escolhê-lo aqui.' : undefined}
          />
          <CamposEndereco campo={campo} preencher={preencher} />
        </FieldGrid>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

interface ValoresEquipe {
  nome: string
  unidadeId: string
  supervisorId: string
}

export function EditarEquipeDialog({
  escopo,
  equipe,
  arvore,
  aoMudarAberto,
  aoSalvar,
}: {
  escopo: EscopoRede
  equipe: VendasArvoreEquipe
  arvore: VendasArvoreRede
  aoMudarAberto: (aberto: boolean) => void
  aoSalvar: () => void
}) {
  const lookups = useMemo(() => derivarLookups(arvore), [arvore])
  const unidades = lookups.unidades.filter(u => u.corretoraId === equipe.corretoraId)
  const supervisores = lookups.agentes.filter(
    a => a.papel === 'supervisor' && (a.ativo || a.id === equipe.supervisorAgenteId) && a.corretoraId === equipe.corretoraId,
  )

  const steps = useMemo<WizardStep<ValoresEquipe>[]>(
    () => [
      {
        id: 'dados',
        title: 'Equipe',
        icon: UsersRound,
        fields: ['nome', 'unidadeId', 'supervisorId'],
        validate: zodFields<ValoresEquipe>(updateEquipeInput, {
          input: v => ({ nome: v.nome.trim(), unidadeId: v.unidadeId || null, supervisorAgenteId: v.supervisorId || null }),
          fieldOf: path => (path[0] === 'nome' ? 'nome' : path[0] === 'unidadeId' ? 'unidadeId' : path[0] === 'supervisorAgenteId' ? 'supervisorId' : null),
          messages: { nome: { required: 'Informe o nome da equipe.' } },
        }),
      },
    ],
    [],
  )

  const wizard = useWizard<ValoresEquipe>({
    steps,
    review: false,
    initialValues: { nome: equipe.nome, unidadeId: equipe.unidadeId ?? '', supervisorId: equipe.supervisorAgenteId ?? '' },
    onSubmit: async v => {
      const r = await updateEquipeAction(escopo, equipe.id, {
        nome: v.nome.trim(),
        unidadeId: v.unidadeId || null,
        supervisorAgenteId: v.supervisorId || null,
      })
      if (!r.success) {
        return {
          ok: false,
          message: r.error || 'Não foi possível salvar a equipe.',
          fieldErrors: apiFieldErrors<ValoresEquipe>(r.fieldErrors, ['nome', 'unidadeId', 'supervisorId'], { supervisorAgenteId: 'supervisorId' }),
        }
      }
      toast.success(`${r.data.nome} atualizada.`)
      aoSalvar()
      return { ok: true }
    },
  })
  const campo = binder(wizard)

  return (
    <WizardDialog
      open
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      icon={Pencil}
      size="md"
      title={`Editar ${equipe.nome}`}
      description="Nome, unidade e supervisor da equipe."
      submitLabel="Salvar alterações"
      submittingLabel="Salvando…"
      discardTitle="Descartar as alterações?"
      discardDescription="O que você mudou não será salvo."
      renderStep={() => (
        <FieldGrid>
          <TextField {...campo('nome')} label="Nome da equipe" required span={12} maxLength={120} autoComplete="off" />
          <SelectField
            {...campo('unidadeId')}
            label="Unidade"
            optional
            span={12}
            placeholder="Sem unidade"
            options={[{ value: '', label: 'Sem unidade' }, ...unidades.map(u => ({ value: u.id, label: u.nome }))]}
            hint={!equipe.corretoraId && !wizard.values.unidadeId ? 'A equipe precisa de uma corretora ou de uma unidade.' : undefined}
          />
          <SelectField
            {...campo('supervisorId')}
            label="Supervisor"
            optional
            span={12}
            placeholder="Sem supervisor"
            options={[{ value: '', label: 'Sem supervisor' }, ...supervisores.map(s => ({ value: s.id, label: s.nome }))]}
            hint={supervisores.length === 0 ? 'Nenhum supervisor nesta corretora. Cadastre um agente com papel de supervisor.' : undefined}
          />
        </FieldGrid>
      )}
    />
  )
}
