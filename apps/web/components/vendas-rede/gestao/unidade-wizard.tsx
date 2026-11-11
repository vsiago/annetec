'use client'

import { useMemo, useState } from 'react'
import { MapPin, Plus, Store } from 'lucide-react'
import { toast } from 'sonner'
import { TIPOS_UNIDADE, TIPO_UNIDADE_LABELS, onlyDigits, type PapelComercial, type TipoUnidade, type VendasUnidade } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  maskPhone,
  successButton,
  useWizard,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createUnidadeAction } from '@/lib/actions/vendas-rede-gestao-api'
import { CHAVES_ENDERECO, CamposEndereco, ENDERECO_VAZIO, binder, enderecoPayload, preenchedor, validarEndereco } from './campos'
import { useLookupsRede } from './lookups-rede'
import type { EscopoRede } from './tipos'

/**
 * Cadastro de unidade (local físico onde o balcão atende): dados → endereço →
 * revisão. O master escolhe a corretora ou cria uma unidade própria do escopo
 * (clínica, ambulatório, hospital, loja); o gerente cria sempre na sua corretora.
 */

interface Values {
  nome: string
  tipo: string
  corretoraId: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

const CAMPOS = ['nome', 'tipo', 'corretoraId', 'telefone', ...CHAVES_ENDERECO] as const
const PROPRIA = '__propria'

export function UnidadeWizard({
  escopo,
  papelCriador,
  corretoraDoCriador,
  corretoraInicial,
  aberto,
  aoMudarAberto,
  aoCriar,
}: {
  escopo: EscopoRede
  papelCriador: PapelComercial
  corretoraDoCriador?: string | null
  /** Pré-seleciona a corretora (botão "Nova unidade" dentro da corretora). */
  corretoraInicial?: string | null
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoCriar?: (unidade: VendasUnidade) => void | Promise<void>
}) {
  const lookups = useLookupsRede(escopo, aberto && papelCriador === 'master')
  const [criada, setCriada] = useState<VendasUnidade | null>(null)
  const master = papelCriador === 'master'

  const steps = useMemo<WizardStep<Values>[]>(
    () => [
      {
        id: 'dados',
        title: 'Unidade',
        icon: Store,
        description: 'Onde a unidade fica e a quem pertence.',
        fields: ['nome', 'tipo', 'corretoraId', 'telefone'],
        validate: v => {
          const e: FieldErrors<Values> = {}
          if (v.nome.trim().length < 2) e.nome = 'Informe o nome da unidade.'
          if (!(TIPOS_UNIDADE as readonly string[]).includes(v.tipo)) e.tipo = 'Escolha o tipo.'
          if (!v.corretoraId) e.corretoraId = 'Escolha a corretora ou “Unidade própria”.'
          const tel = onlyDigits(v.telefone)
          if (tel && (tel.length < 10 || tel.length > 11)) e.telefone = 'Informe o telefone com DDD.'
          return e
        },
      },
      {
        id: 'endereco',
        title: 'Endereço',
        icon: MapPin,
        description: 'Opcional. Digite o CEP e o resto é preenchido sozinho.',
        fields: [...CHAVES_ENDERECO],
        validate: validarEndereco<Values>(),
      },
    ],
    [],
  )

  const corretoraPadrao = master ? (corretoraInicial ?? '') : (corretoraDoCriador ?? '')
  const wizard = useWizard<Values>({
    steps,
    initialValues: { nome: '', tipo: master && !corretoraInicial ? 'clinica' : 'corretora', corretoraId: corretoraPadrao, telefone: '', ...ENDERECO_VAZIO },
    onSubmit: async v => {
      const r = await createUnidadeAction(escopo, {
        nome: v.nome.trim(),
        tipo: v.tipo as TipoUnidade,
        corretoraId: v.corretoraId === PROPRIA ? null : v.corretoraId,
        telefone: onlyDigits(v.telefone) || null,
        endereco: enderecoPayload(v as unknown as Record<string, string>),
      })
      if (!r.success) {
        return { ok: false, message: r.error || 'Não foi possível cadastrar a unidade.', fieldErrors: apiFieldErrors<Values>(r.fieldErrors, CAMPOS) }
      }
      setCriada(r.data)
      toast.success(`Unidade ${r.data.nome} cadastrada.`)
      await aoCriar?.(r.data)
      return { ok: true }
    },
  })
  const { values } = wizard
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)

  const opcoesCorretora = [
    { value: PROPRIA, label: 'Unidade própria (sem corretora)' },
    ...lookups.corretoras.filter(c => c.ativa).map(c => ({ value: c.id, label: c.nome })),
  ]
  const nomeCorretora = values.corretoraId === PROPRIA ? 'Unidade própria' : lookups.corretoras.find(c => c.id === values.corretoraId)?.nome

  const renderStep = (id: string) =>
    id === 'dados' ? (
      <FieldGrid>
        <TextField {...campo('nome')} label="Nome da unidade" required span={12} maxLength={120} autoComplete="off" placeholder="Ex.: Clínica Centro" />
        <SelectField
          {...campo('tipo')}
          label="Tipo"
          required
          span={6}
          options={TIPOS_UNIDADE.map(t => ({ value: t, label: TIPO_UNIDADE_LABELS[t] }))}
        />
        <TextField {...campo('telefone')} label="Telefone" optional span={6} type="tel" inputMode="tel" mask={maskPhone} maxLength={15} />
        {master ? (
          <SelectField
            {...campo('corretoraId')}
            label="Pertence a"
            required
            span={12}
            placeholder={lookups.carregando ? 'Carregando…' : 'Escolha a corretora'}
            options={opcoesCorretora}
            hint="Unidade própria é a do próprio escopo (clínica, ambulatório, hospital, loja), sem corretora."
          />
        ) : (
          <Notice tone="neutral" icon={Store}>
            A unidade é criada na sua corretora.
          </Notice>
        )}
      </FieldGrid>
    ) : (
      <FieldGrid>
        <CamposEndereco campo={campo} preencher={preencher} />
      </FieldGrid>
    )

  const endereco = enderecoPayload(values as unknown as Record<string, string>)
  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Unidade" icon={Store} onEdit={() => wizard.goToStep('dados')}>
        <ReviewItem label="Nome" value={values.nome.trim()} />
        <ReviewItem label="Tipo" value={TIPO_UNIDADE_LABELS[values.tipo as TipoUnidade]} />
        <ReviewItem label="Pertence a" value={master ? nomeCorretora : 'Sua corretora'} />
        <ReviewItem label="Telefone" value={values.telefone} />
      </ReviewSection>
      <ReviewSection title="Endereço" icon={MapPin} onEdit={() => wizard.goToStep('endereco')}>
        <ReviewItem
          label="Endereço"
          wide
          value={endereco ? [endereco.logradouro, endereco.numero, endereco.bairro, endereco.cidade, endereco.uf].filter(Boolean).join(', ') : ''}
        />
      </ReviewSection>
    </ReviewList>
  )

  return (
    <WizardDialog
      open={aberto}
      onOpenChange={next => {
        aoMudarAberto(next)
        if (!next) setCriada(null)
      }}
      wizard={wizard}
      lockSuccess
      icon={Store}
      title="Nova unidade"
      description="Local físico onde o balcão atende ou a equipe trabalha."
      submitLabel="Cadastrar unidade"
      submittingLabel="Cadastrando…"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={() =>
        criada ? (
          <WizardSuccess
            title="Unidade cadastrada"
            description={`${criada.nome} já pode receber equipes e atendentes de balcão.`}
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    setCriada(null)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Cadastrar outra
                </Button>
                <Button type="button" className={successButton.primary} onClick={() => aoMudarAberto(false)}>
                  Fechar
                </Button>
              </>
            }
          />
        ) : null
      }
    />
  )
}
