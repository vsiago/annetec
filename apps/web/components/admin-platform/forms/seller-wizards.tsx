'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { CheckCircle2, FilePlus2, Info, KeyRound, Link2, Loader2, Plus, TriangleAlert, UserPlus, UserRound } from 'lucide-react'
import { createTenantUserInput, numeroDocumento, telefone, type TenantUser } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SelectField,
  TextField,
  WizardDialog,
  WizardSuccess,
  combineValidators,
  maskCnpj,
  maskCpf,
  maskPhone,
  onlyDigits,
  readableMessage,
  successButton,
  useWizard,
  zodFields,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { discoverTenantIntegrationAction, getTenantIntegrationAction } from '@/lib/actions/tenants-api'
import {
  createOperatorSellerAction,
  createOperatorSellerProdutorAction,
  linkOperatorSellerProdutorAction,
} from '@/lib/actions/operator-api'

/** Erros da API (`fieldErrors`) → campos desta tela, pelo último pedaço do caminho. */
function mapApiErrors<V extends object>(
  fieldErrors: Record<string, string> | undefined,
  allowed: readonly string[],
): FieldErrors<V> {
  const out: Record<string, string> = {}
  for (const [path, message] of Object.entries(fieldErrors ?? {})) {
    const key = path.split('.').pop() as string
    if (allowed.includes(key) && !out[key]) out[key] = readableMessage(message)
  }
  return out as FieldErrors<V>
}

// ---------------------------------------------------------------------------
// Novo vendedor
// ---------------------------------------------------------------------------

interface SellerValues {
  name: string
  email: string
  phone: string
}

const EMPTY_SELLER: SellerValues = { name: '', email: '', phone: '' }

const sellerSchema = createTenantUserInput.pick({ name: true, email: true })

const validateSeller = combineValidators<SellerValues>(
  zodFields<SellerValues>(sellerSchema, {
    input: v => ({ name: v.name.trim(), email: v.email }),
    messages: {
      name: { required: 'Informe o nome do vendedor.' },
      email: { required: 'Informe o e-mail do vendedor.' },
    },
  }),
  // Telefone é opcional; se preenchido, precisa de DDD + número (regra `telefone` do contrato).
  (v): FieldErrors<SellerValues> => {
    if (v.phone.trim() === '') return {}
    return telefone.safeParse(v.phone).success ? {} : { phone: 'Informe o telefone com DDD, como (21) 99999-9999.' }
  },
)

const SELLER_STEPS: readonly WizardStep<SellerValues>[] = [
  {
    id: 'vendedor',
    title: 'Vendedor',
    icon: UserRound,
    fields: ['name', 'email', 'phone'],
    validate: validateSeller,
  },
]

export function NewSellerWizard({
  open,
  onOpenChange,
  tenantSlug,
  onCreated,
  onLinkRequested,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  /** Chamado assim que o vendedor é criado (a página atualiza a lista). */
  onCreated: () => void
  /** "Vincular produtor agora": a página fecha este assistente e abre o de vínculo. */
  onLinkRequested: (seller: TenantUser) => void
}) {
  const [created, setCreated] = useState<TenantUser | null>(null)

  const wizard = useWizard<SellerValues>({
    steps: SELLER_STEPS,
    initialValues: EMPTY_SELLER,
    onSubmit: async values => {
      const result = await createOperatorSellerAction(tenantSlug, {
        name: values.name.trim(),
        email: values.email,
        phone: values.phone || null,
        role: 'seller',
        active: true,
      })
      if (!result.success) {
        return {
          ok: false,
          message: result.error,
          fieldErrors: mapApiErrors<SellerValues>(result.fieldErrors, ['name', 'email', 'phone']),
        }
      }
      setCreated(result.data)
      onCreated()
      return { ok: true }
    },
  })

  return (
    <WizardDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) setCreated(null)
      }}
      wizard={wizard}
      size="md"
      icon={UserPlus}
      title="Novo vendedor"
      description="Cria a conta do vendedor no clube."
      submitLabel="Cadastrar vendedor"
      submittingLabel="Cadastrando…"
      renderStep={() => (
        <FieldGrid>
          <TextField {...wizard.field('name')} label="Nome" required autoComplete="off" placeholder="Nome completo" />
          <TextField
            {...wizard.field('email')}
            label="E-mail"
            required
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="nome@exemplo.com.br"
            hint="É o login do vendedor e o endereço que recebe a senha provisória."
          />
          <TextField
            {...wizard.field('phone')}
            label="Telefone"
            optional
            type="tel"
            inputMode="tel"
            autoComplete="off"
            mask={maskPhone}
            placeholder="(21) 99999-9999"
            span={6}
          />
          <Notice tone="info" icon={Info}>
            <p>
              A senha provisória é gerada pelo sistema e enviada por e-mail ao vendedor, com a marca do clube. O vínculo com
              a Digital Saúde é o próximo passo.
            </p>
          </Notice>
        </FieldGrid>
      )}
      renderSuccess={() =>
        created ? (
          <WizardSuccess
            title="Vendedor cadastrado"
            description={`A senha provisória foi enviada para ${created.email}.`}
            actions={
              <>
                <Button type="button" variant="outline" className={successButton.secondary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    setCreated(null)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Cadastrar outro
                </Button>
                <Button type="button" className={successButton.primary} onClick={() => onLinkRequested(created)}>
                  <Link2 aria-hidden="true" />
                  Vincular produtor agora
                </Button>
              </>
            }
          />
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Vincular produtor
// ---------------------------------------------------------------------------

type LinkMode = 'existing' | 'new'

interface LinkValues {
  mode: LinkMode
  // Já tenho o código
  codigo: string
  login: string
  password: string
  // Criar produtor novo
  nome: string
  email: string
  numeroDocumento: string
  grupoProdutorCodigo: string
}

const maskCpfOrCnpj = (value: string) => (onlyDigits(value).length > 11 ? maskCnpj(value) : maskCpf(value))

// Espelho exato dos schemas inline de apps/api/src/modules/users/controller.ts
// (PUT /:id/produtor e POST /:id/produtor) — não estão em @annetec/contracts.
const linkExistingSchema = z.object({
  codigo: z.string().min(1),
  login: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
})
const createProdutorSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  numeroDocumento: z.string().optional(),
  grupoProdutorCodigo: z.string().min(1),
})

const LINK_API_FIELDS = ['codigo', 'login', 'password', 'nome', 'email', 'numeroDocumento', 'grupoProdutorCodigo'] as const

function validateExisting(v: LinkValues): FieldErrors<LinkValues> {
  if (v.mode !== 'existing') return {}
  return zodFields<LinkValues>(linkExistingSchema, {
    input: x => ({ codigo: x.codigo.trim(), login: x.login || undefined, password: x.password || undefined }),
    messages: { codigo: { required: 'Informe o código do produtor.' } },
  })(v)
}

function validateNew(grupoMessage: string) {
  return (v: LinkValues): FieldErrors<LinkValues> => {
    if (v.mode !== 'new') return {}
    const errors = zodFields<LinkValues>(createProdutorSchema, {
      input: x => ({
        nome: x.nome.trim(),
        email: x.email,
        numeroDocumento: x.numeroDocumento || undefined,
        grupoProdutorCodigo: x.grupoProdutorCodigo.trim(),
      }),
      messages: {
        nome: { required: 'Informe o nome do produtor.' },
        email: { required: 'Informe o e-mail do produtor.' },
        grupoProdutorCodigo: { required: grupoMessage },
      },
    })(v)
    // CPF/CNPJ é opcional; se preenchido, precisa ser válido (`numeroDocumento` do contrato).
    if (v.numeroDocumento.trim() !== '') {
      const parsed = numeroDocumento.safeParse(v.numeroDocumento)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        errors.numeroDocumento = readableMessage(issue?.message ?? '', issue)
      }
    }
    return errors
  }
}

export function LinkProdutorWizard({
  open,
  onOpenChange,
  seller,
  tenantSlug,
  tenantId,
  onLinked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seller: TenantUser
  tenantSlug: string
  tenantId: string | null
  /** "Fechar" depois do sucesso: a página atualiza a lista e fecha. */
  onLinked: () => void
}) {
  // O grupo de produtor é obrigatório no POST /produtor/ e a Digital Saúde
  // não tem endpoint que o liste — vem da descoberta, que o encontra dentro do
  // cadastro de um produtor existente. Enquanto não vier, o campo aceita
  // digitação, porque um clube novo pode não ter produtor nenhum ainda.
  const [grupos, setGrupos] = useState<{ codigo: string; nome: string }[]>([])
  const [carregandoGrupos, setCarregandoGrupos] = useState(false)
  const [linked, setLinked] = useState<{ codigo: string; nome: string | null } | null>(null)

  const initialValues = useMemo<LinkValues>(
    () => ({
      mode: 'existing',
      codigo: '',
      login: '',
      password: '',
      nome: seller.name,
      email: seller.email,
      numeroDocumento: '',
      grupoProdutorCodigo: '',
    }),
    [seller.name, seller.email],
  )

  const grupoMessage = grupos.length > 0 ? 'Escolha o grupo de produtor.' : 'Informe o código do grupo de produtor.'

  const steps = useMemo<readonly WizardStep<LinkValues>[]>(
    () => [
      {
        id: 'forma',
        title: 'Forma de vínculo',
        icon: Link2,
        description: 'Escolha se o produtor já existe na Digital Saúde ou se precisa ser criado agora.',
        fields: ['mode'],
      },
      {
        id: 'dados',
        title: 'Dados do produtor',
        icon: UserRound,
        description: 'Informe o que a Digital Saúde pede para este vínculo.',
        fields: ['codigo', 'login', 'password', 'nome', 'email', 'numeroDocumento', 'grupoProdutorCodigo'],
        validate: combineValidators<LinkValues>(validateExisting, validateNew(grupoMessage)),
      },
    ],
    [grupoMessage],
  )

  const wizard = useWizard<LinkValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      const result =
        values.mode === 'existing'
          ? await linkOperatorSellerProdutorAction(tenantSlug, seller.id, {
              codigo: values.codigo.trim(),
              login: values.login || undefined,
              password: values.password || undefined,
            })
          : await createOperatorSellerProdutorAction(tenantSlug, seller.id, {
              nome: values.nome.trim(),
              email: values.email,
              numeroDocumento: values.numeroDocumento ? onlyDigits(values.numeroDocumento) : undefined,
              grupoProdutorCodigo: values.grupoProdutorCodigo.trim(),
            })
      if (!result.success) {
        return {
          ok: false,
          message: result.error,
          fieldErrors: mapApiErrors<LinkValues>(result.fieldErrors, LINK_API_FIELDS),
        }
      }
      setLinked({ codigo: result.data.codigo, nome: result.data.nome })
      return { ok: true }
    },
  })

  // Descoberta dos grupos (mesma lógica de antes): o grupo salvo na integração e
  // a sugestão da descoberta só entram se o campo ainda estiver vazio.
  const valuesRef = useRef(wizard.values)
  valuesRef.current = wizard.values
  const setField = wizard.set
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setCarregandoGrupos(true)
    getTenantIntegrationAction(tenantId).then(async result => {
      const salvo = result.success ? result.data?.defaultGrupoProdutorCodigo : undefined
      if (salvo && !cancelled && !valuesRef.current.grupoProdutorCodigo) setField('grupoProdutorCodigo', salvo)

      const descoberta = await discoverTenantIntegrationAction(tenantId)
      if (cancelled) return
      setCarregandoGrupos(false)
      if (!descoberta.success) return
      setGrupos(descoberta.data.gruposProdutor)
      const sugerido = descoberta.data.sugestao.defaultGrupoProdutorCodigo
      if (sugerido && !valuesRef.current.grupoProdutorCodigo) setField('grupoProdutorCodigo', sugerido)
    })
    return () => {
      cancelled = true
    }
  }, [tenantId, setField])

  const { values } = wizard
  const isNew = values.mode === 'new'

  const grupoLabel = (codigo: string) => {
    const grupo = grupos.find(g => g.codigo === codigo)
    return grupo ? `${grupo.nome || grupo.codigo} · ${grupo.codigo}` : codigo
  }

  const renderStep = (id: string) => {
    if (id === 'forma') {
      return (
        <FieldGrid>
          <ChoiceField
            {...wizard.field('mode')}
            onValueChange={value => wizard.set('mode', value as LinkMode)}
            label="Como vincular o produtor"
            columns={1}
            options={[
              {
                value: 'existing',
                icon: KeyRound,
                title: 'Já tenho o código do produtor',
                description: 'O produtor já existe na Digital Saúde. Você só informa o código dele.',
              },
              {
                value: 'new',
                icon: FilePlus2,
                title: 'Criar produtor novo na Digital Saúde',
                description: 'Cadastra um produtor novo no ERP e já vincula a este vendedor.',
              },
            ]}
          />
        </FieldGrid>
      )
    }
    return isNew ? (
      <FieldGrid>
        <TextField {...wizard.field('nome')} label="Nome do produtor" required autoComplete="off" />
        <TextField
          {...wizard.field('email')}
          label="E-mail"
          required
          type="email"
          inputMode="email"
          autoComplete="off"
          span={6}
        />
        <TextField
          {...wizard.field('numeroDocumento')}
          label="CPF ou CNPJ"
          optional
          inputMode="numeric"
          autoComplete="off"
          mask={maskCpfOrCnpj}
          placeholder="Somente números"
          span={6}
        />
        {grupos.length > 0 ? (
          <SelectField
            {...wizard.field('grupoProdutorCodigo')}
            label="Grupo de produtor"
            required
            placeholder="Selecione o grupo"
            options={grupos.map(g => ({ value: g.codigo, label: `${g.nome || g.codigo} · ${g.codigo}` }))}
          />
        ) : (
          <TextField
            {...wizard.field('grupoProdutorCodigo')}
            label="Grupo de produtor"
            required
            autoComplete="off"
            mono
            placeholder={carregandoGrupos ? 'Procurando no ERP…' : 'Ex.: HE83KX6KA2'}
            status={
              carregandoGrupos ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Procurando" />
              ) : undefined
            }
            hint={
              carregandoGrupos
                ? 'Procurando os grupos disponíveis na Digital Saúde…'
                : 'Nenhum grupo encontrado no ERP ainda: a descoberta precisa de pelo menos um produtor já cadastrado. Informe o código do painel da Digital Saúde.'
            }
          />
        )}
      </FieldGrid>
    ) : (
      <FieldGrid>
        <TextField
          {...wizard.field('codigo')}
          label="Código do produtor"
          required
          autoComplete="off"
          mono
          placeholder="Ex.: C16KMF9F1R"
        />
        <TextField {...wizard.field('login')} label="Login do produtor" optional autoComplete="off" span={6} />
        <TextField
          {...wizard.field('password')}
          label="Senha do produtor"
          optional
          type="password"
          autoComplete="new-password"
          span={6}
        />
        <Notice tone="info" icon={Info}>
          <p>
            Login e senha só são necessários para consultar recibos de comissão. Sem eles, o vendedor pode vender
            normalmente, mas a tela de Comissões não funciona para ele.
          </p>
        </Notice>
      </FieldGrid>
    )
  }

  // Fechar depois do sucesso (botão, X ou Esc) atualiza a lista da página.
  const handleOpenChange = (next: boolean) => {
    if (!next && linked) {
      setLinked(null)
      onLinked()
    } else {
      onOpenChange(next)
    }
  }

  const renderReview = () => (
    <ReviewList>
      {isNew ? (
        <Notice tone="warning" icon={TriangleAlert} title="Isto cria um cadastro permanente no ERP">
          <p>
            O produtor será criado na Digital Saúde e não dá para apagá-lo depois pela Annetec. Confira os dados antes de
            concluir.
          </p>
        </Notice>
      ) : null}
      <ReviewSection title="Forma de vínculo" icon={Link2} onEdit={() => wizard.goToStep('forma')}>
        <ReviewItem label="Vendedor" value={seller.name} />
        <ReviewItem label="Forma" value={isNew ? 'Criar produtor novo na Digital Saúde' : 'Usar um código de produtor existente'} />
      </ReviewSection>
      <ReviewSection title="Dados do produtor" icon={UserRound} onEdit={() => wizard.goToStep('dados')}>
        {isNew ? (
          <>
            <ReviewItem label="Nome" value={values.nome} />
            <ReviewItem label="E-mail" value={values.email} />
            <ReviewItem label="CPF ou CNPJ" value={values.numeroDocumento} />
            <ReviewItem label="Grupo de produtor" value={grupoLabel(values.grupoProdutorCodigo)} />
          </>
        ) : (
          <>
            <ReviewItem label="Código do produtor" value={values.codigo} />
            <ReviewItem label="Login" value={values.login} />
            <ReviewItem label="Senha" value={values.password ? 'Informada' : ''} />
          </>
        )}
      </ReviewSection>
    </ReviewList>
  )

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      icon={Link2}
      title={`Vincular produtor — ${seller.name}`}
      description="O contrato só é registrado na Digital Saúde se o vendedor tiver um código de produtor válido."
      submitLabel={isNew ? 'Criar e vincular produtor' : 'Vincular produtor'}
      submittingLabel={isNew ? 'Criando…' : 'Vinculando…'}
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={() =>
        linked ? (
          <WizardSuccess
            title="Produtor vinculado"
            description={
              <>
                {seller.name} agora vende com o código de produtor{' '}
                <strong className="font-mono font-semibold text-foreground">{linked.codigo}</strong>
                {linked.nome ? ` (${linked.nome})` : ''}.
              </>
            }
            actions={
              <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
                <CheckCircle2 aria-hidden="true" />
                Fechar
              </Button>
            }
          />
        ) : null
      }
    />
  )
}
