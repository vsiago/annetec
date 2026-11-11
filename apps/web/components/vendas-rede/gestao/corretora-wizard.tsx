'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, FileSearch, Landmark, Loader2, MapPin, Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { onlyDigits, type VendasAgente, type VendasCorretora } from '@annetec/contracts'
import { useCnpjLookup } from '@/components/contratar/hooks'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SwitchField,
  TextField,
  TextareaField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  maskCnpj,
  maskCpf,
  maskPhone,
  successButton,
  useWizard,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createCorretoraAction, createGerenteAction } from '@/lib/actions/vendas-rede-gestao-api'
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
  prefixar,
  preenchedor,
  validarCnpj,
  validarEndereco,
  validarPessoa,
  validarRepasse,
} from './campos'
import { fraseDoConvite, ResultadoConviteBloco } from './convite-resultado'
import type { ConviteResultado, EscopoRede } from './tipos'

/**
 * Cadastro de corretora parceira (master): CNPJ com consulta automática à
 * Receita → dados da empresa → endereço → gerente (cadastro completo) →
 * endereço e repasse do gerente → revisão. Cria a corretora e, em seguida, o
 * gerente. Se o gerente falhar, a corretora já criada é mantida e o "tentar de
 * novo" só repete o gerente (nada de corretora duplicada).
 */

interface Values {
  cnpj: string
  nomeFantasia: string
  razaoSocial: string
  corrEmail: string
  corrTelefone: string
  corrObservacoes: string
  corrCep: string
  corrLogradouro: string
  corrNumero: string
  corrComplemento: string
  corrBairro: string
  corrCidade: string
  corrUf: string
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

const ENDERECO_CORRETORA = prefixar('corr', ENDERECO_VAZIO)

const VAZIO: Values = {
  cnpj: '',
  nomeFantasia: '',
  razaoSocial: '',
  corrEmail: '',
  corrTelefone: '',
  corrObservacoes: '',
  ...(ENDERECO_CORRETORA as Pick<Values, 'corrCep' | 'corrLogradouro' | 'corrNumero' | 'corrComplemento' | 'corrBairro' | 'corrCidade' | 'corrUf'>),
  ...PESSOA_VAZIA,
  ...ENDERECO_VAZIO,
  ...REPASSE_VAZIO,
  enviarConvite: true,
}

const CAMPOS = Object.keys(VAZIO) as Array<keyof Values>

export function CorretoraWizard({
  escopo,
  aberto,
  aoMudarAberto,
  aoCriar,
}: {
  escopo: EscopoRede
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoCriar?: (corretora: VendasCorretora, gerente: VendasAgente | null) => void | Promise<void>
}) {
  const [corretoraCriada, setCorretoraCriada] = useState<VendasCorretora | null>(null)
  const [criado, setCriado] = useState<{ corretora: VendasCorretora; gerente: VendasAgente; convite: ConviteResultado } | null>(null)
  const preenchidoPara = useRef('')

  const steps = useMemo<WizardStep<Values>[]>(
    () => [
      {
        id: 'cnpj',
        title: 'CNPJ',
        icon: FileSearch,
        description: 'Digite o CNPJ: os dados da empresa vêm da Receita Federal.',
        fields: ['cnpj'],
        validate: v => {
          const e: FieldErrors<Values> = {}
          const msg = validarCnpj(v.cnpj)
          if (msg) e.cnpj = msg
          return e
        },
      },
      {
        id: 'dados',
        title: 'Empresa',
        icon: Building2,
        description: 'Como a corretora aparece na rede e nos documentos.',
        fields: ['nomeFantasia', 'razaoSocial', 'corrEmail', 'corrTelefone', 'corrObservacoes'],
        validate: v => {
          const e: FieldErrors<Values> = {}
          if (v.nomeFantasia.trim().length < 2) e.nomeFantasia = 'Informe o nome fantasia.'
          if (v.razaoSocial.trim().length < 2) e.razaoSocial = 'Informe a razão social.'
          if (v.corrEmail.trim() && !/^\S+@\S+\.\S+$/.test(v.corrEmail.trim())) e.corrEmail = 'Informe um e-mail válido, como nome@exemplo.com.br.'
          const tel = onlyDigits(v.corrTelefone)
          if (tel && (tel.length < 10 || tel.length > 11)) e.corrTelefone = 'Informe o telefone com DDD.'
          return e
        },
      },
      {
        id: 'endereco',
        title: 'Endereço',
        icon: MapPin,
        description: 'Endereço da corretora (opcional).',
        fields: ['corrCep', 'corrLogradouro', 'corrNumero', 'corrComplemento', 'corrBairro', 'corrCidade', 'corrUf'],
        validate: validarEndereco<Values>('corr'),
      },
      {
        id: 'gerente',
        title: 'Gerente',
        icon: UserRound,
        description: 'Quem responde pela corretora na rede. Cadastro completo.',
        fields: [...CHAVES_PESSOA, 'enviarConvite'],
        validate: validarPessoa<Values>(),
      },
      {
        id: 'repasse',
        title: 'Endereço e repasse',
        icon: Landmark,
        description: 'Endereço do gerente e para onde vai a comissão.',
        fields: [...CHAVES_ENDERECO, ...CHAVES_REPASSE],
        validate: v => ({ ...validarEndereco<Values>()(v), ...validarRepasse<Values>()(v) }),
      },
    ],
    [],
  )

  const wizard = useWizard<Values>({
    steps,
    initialValues: VAZIO,
    onSubmit: async v => {
      const texto = v as unknown as Record<string, string>
      let corretora = corretoraCriada
      if (!corretora) {
        const r = await createCorretoraAction(escopo, {
          nomeFantasia: v.nomeFantasia.trim(),
          razaoSocial: v.razaoSocial.trim(),
          cnpj: onlyDigits(v.cnpj),
          email: v.corrEmail.trim().toLowerCase() || null,
          telefone: onlyDigits(v.corrTelefone) || null,
          endereco: enderecoPayload(texto, 'corr'),
          observacoes: v.corrObservacoes.trim() || null,
        })
        if (!r.success) {
          return {
            ok: false,
            message: r.error || 'Não foi possível cadastrar a corretora.',
            fieldErrors: apiFieldErrors<Values>(r.fieldErrors, CAMPOS, { email: 'corrEmail', telefone: 'corrTelefone', observacoes: 'corrObservacoes' }),
          }
        }
        corretora = r.data
        setCorretoraCriada(r.data)
        toast.success(`Corretora ${r.data.nomeFantasia} cadastrada.`)
      }
      const pessoa = pessoaPayload(texto)
      const g = await createGerenteAction(escopo, corretora.id, { ...pessoa, enviarConvite: v.enviarConvite })
      if (!g.success) {
        return {
          ok: false,
          message: `A corretora foi cadastrada, mas o gerente não: ${g.error || 'confira os dados e tente de novo.'} Ao tentar de novo, só o gerente é enviado.`,
          fieldErrors: apiFieldErrors<Values>(g.fieldErrors, CAMPOS),
        }
      }
      setCriado({ corretora, gerente: g.data.agente, convite: g.data.convite })
      toast.success(fraseDoConvite(g.data.convite, pessoa.email))
      await aoCriar?.(corretora, g.data.agente)
      return { ok: true }
    },
  })
  const { values, setMany } = wizard
  const campo = binder(wizard)
  const preencher = preenchedor(wizard)

  useEffect(() => {
    if (!aberto) return
    setCriado(null)
    setCorretoraCriada(null)
    preenchidoPara.current = ''
  }, [aberto])

  // Consulta à Receita assim que o CNPJ fica completo e válido.
  const { lookup, retry } = useCnpjLookup(values.cnpj)
  useEffect(() => {
    if (lookup.state !== 'done') return
    const { found, result } = lookup.response
    const digitos = onlyDigits(values.cnpj)
    if (!found || !result || preenchidoPara.current === digitos) return
    preenchidoPara.current = digitos
    const a = result.address
    setMany(
      {
        razaoSocial: result.legalName,
        nomeFantasia: result.tradeName || result.legalName,
        ...(result.email ? { corrEmail: result.email.toLowerCase() } : {}),
        ...(result.phone ? { corrTelefone: maskPhone(result.phone) } : {}),
        corrCep: a.cep ?? '',
        corrLogradouro: a.street ?? '',
        corrNumero: a.number ?? '',
        corrComplemento: a.complement ?? '',
        corrBairro: a.neighborhood ?? '',
        corrCidade: a.city ?? '',
        corrUf: a.state ?? '',
      },
      { reveal: true },
    )
  }, [lookup, values.cnpj, setMany])

  const renderCnpjAviso = () => {
    if (lookup.state === 'loading') {
      return (
        <Notice tone="info" icon={Loader2} role="status">
          Consultando a Receita Federal…
        </Notice>
      )
    }
    if (lookup.state === 'error') {
      return (
        <Notice
          tone="warning"
          role="status"
          action={
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível consultar a Receita agora. Você pode continuar e preencher os dados à mão.
        </Notice>
      )
    }
    if (lookup.state === 'done') {
      const { found, unavailable, result } = lookup.response
      if (found && result) {
        const ativa = result.registrationStatus.toUpperCase() === 'ATIVA'
        return (
          <Notice tone={ativa ? 'success' : 'warning'} role="status" title={result.legalName}>
            {ativa
              ? 'Dados encontrados e já preenchidos nas próximas etapas. Confira e ajuste se precisar.'
              : `Situação cadastral: ${result.registrationStatus}. Confirme com a corretora antes de seguir.`}
          </Notice>
        )
      }
      return (
        <Notice tone="neutral" role="status">
          {unavailable ? 'A Receita está indisponível agora.' : 'CNPJ não encontrado na Receita.'} Preencha os dados da empresa à mão na
          próxima etapa.
        </Notice>
      )
    }
    return null
  }

  const renderStep = (id: string) => {
    if (id === 'cnpj') {
      return (
        <FieldGrid>
          <TextField
            {...campo('cnpj')}
            label="CNPJ da corretora"
            required
            span={7}
            inputMode="numeric"
            mask={maskCnpj}
            maxLength={18}
            placeholder="00.000.000/0000-00"
            autoComplete="off"
            hint="A consulta começa sozinha quando o CNPJ estiver completo."
          />
          {renderCnpjAviso()}
        </FieldGrid>
      )
    }
    if (id === 'dados') {
      return (
        <FieldGrid>
          <TextField {...campo('nomeFantasia')} label="Nome fantasia" required span={12} maxLength={120} autoComplete="off" />
          <TextField {...campo('razaoSocial')} label="Razão social" required span={12} maxLength={160} autoComplete="off" />
          <TextField {...campo('corrEmail')} label="E-mail da empresa" optional span={7} type="email" inputMode="email" autoComplete="off" />
          <TextField {...campo('corrTelefone')} label="Telefone" optional span={5} type="tel" inputMode="tel" mask={maskPhone} maxLength={15} />
          <TextareaField {...campo('corrObservacoes')} label="Observações" optional span={12} maxLength={1000} rows={3} />
        </FieldGrid>
      )
    }
    if (id === 'endereco') {
      return (
        <FieldGrid>
          <CamposEndereco campo={campo} preencher={preencher} prefixo="corr" titulo="Endereço da corretora" />
        </FieldGrid>
      )
    }
    if (id === 'gerente') {
      return (
        <FieldGrid>
          <CamposPessoa campo={campo} />
          <SwitchField
            {...wizard.field('enviarConvite')}
            label="Enviar o convite agora"
            description="O gerente recebe o acesso por e-mail. Desligado, você libera depois pela ficha."
          />
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <CamposEndereco campo={campo} preencher={preencher} titulo="Endereço do gerente" />
        <CamposRepasse campo={campo} tipo={values.repasseTipo} />
      </FieldGrid>
    )
  }

  const t = values as unknown as Record<string, string>
  const enderecoCorr = enderecoPayload(t, 'corr')
  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Empresa" icon={Building2} onEdit={() => wizard.goToStep('dados')}>
        <ReviewItem label="CNPJ" value={maskCnpj(values.cnpj)} />
        <ReviewItem label="Nome fantasia" value={values.nomeFantasia.trim()} />
        <ReviewItem label="Razão social" value={values.razaoSocial.trim()} wide />
        <ReviewItem label="E-mail" value={values.corrEmail.trim().toLowerCase()} />
        <ReviewItem label="Telefone" value={values.corrTelefone} />
        <ReviewItem
          label="Endereço"
          wide
          value={enderecoCorr ? [enderecoCorr.logradouro, enderecoCorr.numero, enderecoCorr.bairro, enderecoCorr.cidade, enderecoCorr.uf].filter(Boolean).join(', ') : ''}
        />
      </ReviewSection>
      <ReviewSection title="Gerente" icon={UserRound} onEdit={() => wizard.goToStep('gerente')}>
        <ReviewItem label="Nome" value={values.nome.trim()} />
        <ReviewItem label="CPF" value={maskCpf(values.cpf)} />
        <ReviewItem label="E-mail (login)" value={values.email.trim().toLowerCase()} />
        <ReviewItem label="Celular" value={values.telefone} />
        <ReviewItem label="Convite" value={values.enviarConvite ? 'Enviado ao concluir' : 'Não enviar agora'} />
      </ReviewSection>
      <ReviewSection title="Repasse do gerente" icon={Landmark} onEdit={() => wizard.goToStep('repasse')}>
        <ReviewItem
          label="Forma"
          wide
          empty="Informar depois"
          value={values.repasseTipo === 'pix' ? `Pix · ${values.chavePix}` : values.repasseTipo === 'conta' ? `Conta · ${values.banco}, ag. ${values.agencia}, c/c ${values.conta}` : ''}
        />
      </ReviewSection>
    </ReviewList>
  )

  const renderSuccess = () =>
    criado ? (
      <WizardSuccess
        title="Corretora cadastrada"
        description={`${criado.corretora.nomeFantasia} entrou na rede com ${criado.gerente.nome} como gerente. Próximo passo: cadastrar as unidades e equipes.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className={successButton.secondary}
              onClick={() => {
                setCriado(null)
                setCorretoraCriada(null)
                preenchidoPara.current = ''
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
      >
        <ResultadoConviteBloco convite={criado.convite} email={criado.gerente.email ?? values.email} nome={criado.gerente.nome} />
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={aberto}
      onOpenChange={aoMudarAberto}
      wizard={wizard}
      lockSuccess
      icon={Building2}
      title="Nova corretora"
      description="Empresa parceira com um gerente responsável, unidades e equipes."
      submitLabel="Cadastrar corretora"
      submittingLabel="Cadastrando…"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}
