'use client'

import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Eye, EyeOff, KeyRound, Link2, Plus, Target, UserPlus, UserRoundPen } from 'lucide-react'
import {
  createSellerInput,
  referralCodeFromName,
  sellerReferralCode,
  type PlatformSeller,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  Notice,
  ReviewItem,
  ReviewList,
  ReviewSection,
  SecretValue,
  SwitchField,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  combineValidators,
  maskDigits,
  maskPhone,
  parseInteger,
  successButton,
  useWizard,
  zodFields,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createSellerAction, updateSellerAction } from '@/lib/actions/comercial-api'

/**
 * Cadastro de vendedor ANNETEC (Comercial › Vendedores): dados da conta →
 * código de indicação → meta → revisão. Cria a conta `platform_seller` e o
 * perfil de uma vez (`POST /comercial/vendedores`). No fim, a senha inicial
 * aparece uma única vez, como na Equipe ANNETEC.
 *
 * Edição: código, meta e perfil ativo. Nome, senha e "desligar a conta"
 * continuam em Equipe ANNETEC.
 */

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join('')
}

/** Só letras minúsculas, números e hífen enquanto digita. */
function sanitizeCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
}

function referralPreview(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}/contratar?ref=${code || 'codigo'}`
}

const CODE_MESSAGE = { invalid: 'Use de 3 a 40 letras minúsculas, números e hífens, sem hífen no início ou no fim.' }

const validateCode = (key: 'referralCode') =>
  (v: { referralCode: string }): FieldErrors<{ referralCode: string }> => {
    const code = v.referralCode.trim()
    if (!code) return {}
    return sellerReferralCode.safeParse(code).success ? {} : { [key]: CODE_MESSAGE.invalid }
  }

const validateGoal = (v: { monthlyGoal: string }): FieldErrors<{ monthlyGoal: string }> => {
  const goal = parseInteger(v.monthlyGoal)
  if (v.monthlyGoal.trim() === '') return {}
  return goal !== null && goal >= 1 && goal <= 1000 ? {} : { monthlyGoal: 'Use de 1 a 1.000 clubes por mês, ou deixe em branco.' }
}

// ---------------------------------------------------------------------------
// Cadastrar
// ---------------------------------------------------------------------------

interface CreateValues {
  name: string
  email: string
  phone: string
  password: string
  referralCode: string
  monthlyGoal: string
}

const CREATE_FIELDS = ['name', 'email', 'phone', 'password', 'referralCode', 'monthlyGoal'] as const
const EMPTY: CreateValues = { name: '', email: '', phone: '', password: '', referralCode: '', monthlyGoal: '' }

const validateAccount = combineValidators<CreateValues>(
  zodFields<CreateValues>(createSellerInput.pick({ name: true, email: true, phone: true, password: true }), {
    input: v => ({ name: v.name.trim(), email: v.email, phone: v.phone, password: v.password }),
    messages: {
      name: { required: 'Informe o nome do vendedor.' },
      email: { required: 'Informe o e-mail — é o login do vendedor.' },
      password: { required: 'Defina uma senha inicial (ou use “Gerar senha”).', invalid: 'Use pelo menos 8 caracteres.' },
    },
  }),
)

export function CreateSellerWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (seller: PlatformSeller) => void | Promise<void>
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [created, setCreated] = useState<{ seller: PlatformSeller; password: string } | null>(null)
  const [codeEdited, setCodeEdited] = useState(false)

  const steps = useMemo<WizardStep<CreateValues>[]>(
    () => [
      {
        id: 'dados',
        title: 'Dados',
        icon: UserPlus,
        description: 'A conta que o vendedor usa para entrar na área de vendas.',
        fields: ['name', 'email', 'phone', 'password'],
        validate: validateAccount,
      },
      {
        id: 'codigo',
        title: 'Código de indicação',
        icon: Link2,
        description: 'Vai no link do vendedor: quem contratar por ele fica atribuído a este vendedor.',
        fields: ['referralCode'],
        validate: v => validateCode('referralCode')(v) as FieldErrors<CreateValues>,
      },
      {
        id: 'meta',
        title: 'Meta',
        icon: Target,
        description: 'Quantos clubes no ar por mês. Opcional — aparece no painel do vendedor.',
        fields: ['monthlyGoal'],
        validate: v => validateGoal(v) as FieldErrors<CreateValues>,
      },
    ],
    [],
  )

  const wizard = useWizard<CreateValues>({
    steps,
    initialValues: EMPTY,
    onSubmit: async values => {
      const name = values.name.trim()
      const result = await createSellerAction({
        name,
        email: values.email,
        phone: values.phone,
        password: values.password,
        ...(values.referralCode.trim() ? { referralCode: values.referralCode.trim() } : {}),
        monthlyGoal: parseInteger(values.monthlyGoal),
      })
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível cadastrar o vendedor. Confira os dados e tente de novo.',
          fieldErrors: apiFieldErrors<CreateValues>(result.fieldErrors, CREATE_FIELDS),
        }
      }
      setCreated({ seller: result.data, password: values.password })
      await onCreated(result.data)
      return { ok: true }
    },
  })
  const { values, set, setMany } = wizard

  useEffect(() => {
    if (!open) return
    setCreated(null)
    setCodeEdited(false)
    setShowPassword(false)
  }, [open])

  // O código acompanha o nome enquanto a pessoa não mexer nele.
  useEffect(() => {
    if (codeEdited) return
    const suggestion = values.name.trim().length >= 3 ? referralCodeFromName(values.name) : ''
    if (suggestion !== values.referralCode) setMany({ referralCode: suggestion })
  }, [values.name, values.referralCode, codeEdited, setMany])

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setCreated(null)
      setShowPassword(false)
      setMany({ password: '' })
    }
  }

  const renderStep = (id: string) => {
    if (id === 'dados') {
      return (
        <FieldGrid>
          <TextField {...wizard.field('name')} label="Nome" required span={12} maxLength={120} autoComplete="off" placeholder="Nome e sobrenome" />
          <TextField
            {...wizard.field('email')}
            label="E-mail"
            required
            span={7}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="vendedor@annetec.org.br"
            hint="É o login na área de vendas."
          />
          <TextField
            {...wizard.field('phone')}
            label="Telefone"
            optional
            span={5}
            type="tel"
            inputMode="tel"
            mask={maskPhone}
            maxLength={15}
            placeholder="(21) 99999-9999"
          />
          <TextField
            {...wizard.field('password')}
            label="Senha inicial"
            required
            span={12}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            mono={showPassword}
            hint="Mínimo de 8 caracteres. Você vê a senha de novo no fim, para copiar e enviar."
            labelAside={
              <button
                type="button"
                onClick={() => {
                  setMany({ password: generatePassword() }, { reveal: true })
                  setShowPassword(true)
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[13px] font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
              >
                <KeyRound className="size-3.5" aria-hidden="true" />
                Gerar senha
              </button>
            }
            status={
              <button
                type="button"
                onClick={() => setShowPassword(current => !current)}
                aria-label={showPassword ? 'Esconder a senha' : 'Mostrar a senha'}
                aria-pressed={showPassword}
                className="grid size-8 place-items-center rounded-md text-[#667085] outline-none hover:bg-[#F2F4F7] hover:text-foreground focus-visible:ring-2 focus-visible:ring-secondary/40"
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            }
          />
          <Notice tone="neutral" icon={BriefcaseBusiness}>
            O vendedor entra pelo mesmo login da ANNETEC e cai direto na área de vendas — ele não vê o console nem os dados dos
            clubes.
          </Notice>
        </FieldGrid>
      )
    }
    if (id === 'codigo') {
      return (
        <FieldGrid>
          <TextField
            {...wizard.field('referralCode')}
            onValueChange={value => {
              setCodeEdited(true)
              set('referralCode', sanitizeCode(value))
            }}
            label="Código de indicação"
            optional
            span={12}
            maxLength={40}
            showCounter
            mono
            placeholder="joao-silva"
            hint={
              <>
                Link do vendedor: <strong className="font-semibold text-[#344054]">{referralPreview(values.referralCode.trim())}</strong>.
                Em branco, a plataforma gera a partir do nome.
              </>
            }
            labelAside={
              codeEdited && values.name.trim().length >= 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCodeEdited(false)
                    set('referralCode', referralCodeFromName(values.name))
                  }}
                  className="min-h-8 rounded-md px-1.5 text-[13px] font-semibold text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
                >
                  Usar o nome
                </button>
              ) : null
            }
          />
        </FieldGrid>
      )
    }
    return (
      <FieldGrid>
        <TextField
          {...wizard.field('monthlyGoal')}
          label="Meta mensal"
          optional
          span={5}
          inputMode="numeric"
          mask={value => maskDigits(value, 4)}
          suffix="clubes/mês"
          placeholder="5"
          hint="Clubes que entram no ar no mês."
        />
      </FieldGrid>
    )
  }

  const renderReview = () => (
    <ReviewList>
      <ReviewSection title="Dados" icon={UserPlus} onEdit={() => wizard.goToStep('dados')}>
        <ReviewItem label="Nome" value={values.name.trim()} />
        <ReviewItem label="E-mail (login)" value={values.email.trim().toLowerCase()} />
        <ReviewItem label="Telefone" value={values.phone} />
        <ReviewItem label="Senha inicial" value={values.password ? '•'.repeat(Math.min(12, values.password.length)) : ''} />
      </ReviewSection>
      <ReviewSection title="Código de indicação" icon={Link2} onEdit={() => wizard.goToStep('codigo')}>
        <ReviewItem label="Código" value={values.referralCode.trim()} empty="Gerado a partir do nome" />
        <ReviewItem label="Link" value={referralPreview(values.referralCode.trim())} wide />
      </ReviewSection>
      <ReviewSection title="Meta" icon={Target} onEdit={() => wizard.goToStep('meta')}>
        <ReviewItem label="Meta mensal" value={values.monthlyGoal ? `${values.monthlyGoal} clubes/mês` : ''} empty="Sem meta" />
      </ReviewSection>
    </ReviewList>
  )

  const renderSuccess = () =>
    created ? (
      <WizardSuccess
        title="Vendedor cadastrado"
        description={`${created.seller.name} já pode entrar com o e-mail ${created.seller.email} e vai direto para a área de vendas.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className={successButton.secondary}
              onClick={() => {
                setCreated(null)
                setShowPassword(false)
                setCodeEdited(false)
                wizard.reset()
              }}
            >
              <Plus aria-hidden="true" />
              Cadastrar outro
            </Button>
            <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </>
        }
      >
        <SecretValue label="Senha inicial" value={created.password} caption={`Envie para ${created.seller.name.split(/\s+/)[0]} por um canal seguro.`} />
        <SecretValue label="Link de indicação" value={referralPreview(created.seller.referralCode)} caption={`Código: ${created.seller.referralCode}`} />
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      lockSuccess
      icon={BriefcaseBusiness}
      title="Cadastrar vendedor"
      description="Vendedor próprio da ANNETEC: prospecta operadoras e clubes e ganha comissão pelas faturas pagas."
      submitLabel="Cadastrar vendedor"
      submittingLabel="Cadastrando…"
      renderStep={renderStep}
      renderReview={renderReview}
      renderSuccess={renderSuccess}
    />
  )
}

// ---------------------------------------------------------------------------
// Editar perfil
// ---------------------------------------------------------------------------

interface EditValues {
  referralCode: string
  monthlyGoal: string
  active: boolean
}

export function EditSellerWizard({
  open,
  onOpenChange,
  seller,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seller: PlatformSeller | null
  onSaved: (seller: PlatformSeller) => void
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo<EditValues>(
    () => ({
      referralCode: seller?.referralCode ?? '',
      monthlyGoal: seller?.monthlyGoal ? String(seller.monthlyGoal) : '',
      active: seller?.active ?? true,
    }),
    [seller?.userId, open],
  )
  const steps = useMemo<WizardStep<EditValues>[]>(
    () => [
      {
        id: 'perfil',
        title: 'Perfil',
        icon: UserRoundPen,
        fields: ['referralCode', 'monthlyGoal', 'active'],
        validate: v => {
          const errors: FieldErrors<EditValues> = {}
          if (!v.referralCode.trim()) errors.referralCode = 'O vendedor precisa de um código de indicação.'
          else if (!sellerReferralCode.safeParse(v.referralCode.trim()).success) errors.referralCode = CODE_MESSAGE.invalid
          return { ...errors, ...(validateGoal(v) as FieldErrors<EditValues>) }
        },
      },
    ],
    [],
  )
  const wizard = useWizard<EditValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      if (!seller) return { ok: false }
      const code = values.referralCode.trim()
      const goal = parseInteger(values.monthlyGoal)
      const patch = {
        ...(code !== seller.referralCode ? { referralCode: code } : {}),
        ...(goal !== seller.monthlyGoal ? { monthlyGoal: goal } : {}),
        ...(values.active !== seller.active ? { active: values.active } : {}),
      }
      if (Object.keys(patch).length === 0) return { ok: true }
      const result = await updateSellerAction(seller.userId, patch)
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível salvar. Tente de novo.',
          fieldErrors: apiFieldErrors<EditValues>(result.fieldErrors, ['referralCode', 'monthlyGoal', 'active']),
        }
      }
      onSaved(result.data)
      return { ok: true }
    },
  })
  const { values, set } = wizard
  const changedCode = seller && values.referralCode.trim() !== seller.referralCode

  return (
    <WizardDialog
      open={open}
      onOpenChange={onOpenChange}
      wizard={wizard}
      size="md"
      icon={UserRoundPen}
      title={seller ? `Editar ${seller.name}` : 'Editar vendedor'}
      description="Código de indicação, meta e perfil ativo. Nome, senha e acesso da conta ficam em Equipe ANNETEC."
      submitLabel="Salvar alterações"
      submittingLabel="Salvando…"
      discardTitle="Descartar as alterações?"
      discardDescription="O que você mudou será perdido."
      renderStep={() => (
        <FieldGrid>
          <TextField
            {...wizard.field('referralCode')}
            onValueChange={value => set('referralCode', sanitizeCode(value))}
            label="Código de indicação"
            required
            span={7}
            maxLength={40}
            mono
            hint={`Link: ${referralPreview(values.referralCode.trim())}`}
          />
          <TextField
            {...wizard.field('monthlyGoal')}
            label="Meta mensal"
            optional
            span={5}
            inputMode="numeric"
            mask={value => maskDigits(value, 4)}
            suffix="clubes/mês"
            placeholder="Sem meta"
          />
          {changedCode ? (
            <Notice tone="warning" icon={Link2}>
              O link antigo (<span className="font-mono">?ref={seller?.referralCode}</span>) deixa de atribuir vendas a este vendedor.
              Avise quem já recebeu.
            </Notice>
          ) : null}
          <SwitchField
            {...wizard.field('active')}
            label="Perfil ativo"
            description={
              values.active
                ? 'Recebe indicações pelo link, cadastra prospects e gera links de contratação.'
                : 'Inativo: só consulta o próprio histórico. O link de indicação para de atribuir vendas.'
            }
          />
        </FieldGrid>
      )}
    />
  )
}
