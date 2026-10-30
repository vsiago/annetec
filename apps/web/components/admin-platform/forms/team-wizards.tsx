'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff, KeyRound, Mail, Plus, Shield, ShieldCheck, UserPlus, UserRoundPen } from 'lucide-react'
import { createPlatformUserInput, formatPhone, updatePlatformUserInput, type PlatformRole } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  ChoiceField,
  FieldGrid,
  Notice,
  SecretValue,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  combineValidators,
  maskPhone,
  successButton,
  useWizard,
  zodFields,
  type FieldErrors,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import { createPlatformUserAction, updatePlatformUserAction } from '@/lib/actions/platform-users-api'
import type { PlatformUser } from '@/lib/types'

/**
 * "Adicionar pessoa à equipe" e "Editar pessoa" (Equipe ANNETEC): uma etapa
 * só, no mesmo modal dos outros cadastros. Validação de `createPlatformUserInput`
 * / `updatePlatformUserInput`. Editar não mexe em e-mail nem senha: e-mail é a
 * identidade da conta no Better Auth e senha tem fluxo próprio de troca.
 */

interface TeamValues {
  name: string
  email: string
  phone: string
  role: PlatformRole
  password: string
}

const FIELDS = ['name', 'email', 'phone', 'role', 'password'] as const

const ROLE_OPTIONS = [
  {
    value: 'platform_admin',
    title: 'Padrão',
    description: 'Cuida da operação do dia a dia do console.',
    icon: Shield,
  },
  {
    value: 'superadmin',
    title: 'Superadmin',
    description: 'Acesso total, inclusive equipe, cobrança e ações sensíveis nos clubes.',
    icon: ShieldCheck,
  },
] as const

const MESSAGES = {
  name: { required: 'Informe o nome da pessoa.' },
  email: { required: 'Informe o e-mail — é o login no console.' },
  role: 'Escolha o nível de acesso.',
  password: {
    required: 'Defina uma senha inicial (ou use “Gerar senha”).',
    invalid: 'Use pelo menos 8 caracteres.',
  },
} as const

const validateCreate = zodFields<TeamValues>(createPlatformUserInput, {
  input: v => ({ name: v.name.trim(), email: v.email, phone: v.phone || undefined, role: v.role, password: v.password }),
  messages: MESSAGES,
})

const validateEdit = zodFields<TeamValues>(updatePlatformUserInput.pick({ name: true, phone: true, role: true }), {
  input: v => ({ name: v.name.trim(), phone: v.phone || null, role: v.role }),
  messages: MESSAGES,
})

/** Telefone é opcional na API; preenchido, precisa ter DDD + número para servir de contato. */
const validatePhone = (v: TeamValues): FieldErrors<TeamValues> => {
  const digits = v.phone.replace(/\D/g, '')
  return digits && (digits.length < 10 || digits.length > 11)
    ? { phone: 'Informe o telefone com DDD, como (21) 99999-9999.' }
    : {}
}

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join('')
}

export function TeamMemberWizard({
  open,
  onOpenChange,
  member,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Conta em edição; `null` = adicionar pessoa nova. */
  member: PlatformUser | null
  /** Depois de gravar — a tela recarrega a lista. */
  onSaved: () => void | Promise<void>
}) {
  const editing = member !== null
  const [showPassword, setShowPassword] = useState(false)
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialValues = useMemo<TeamValues>(
    () => ({
      name: member?.name ?? '',
      email: member?.email ?? '',
      // `formatPhone`: só formata o que já tem DDD + número; telefone antigo em outro formato volta como está.
      phone: member?.phone ? formatPhone(member.phone) : '',
      role: member?.role ?? 'platform_admin',
      password: '',
    }),
    [member?.id, open],
  )

  const steps = useMemo<WizardStep<TeamValues>[]>(
    () => [
      {
        id: 'pessoa',
        title: 'Pessoa',
        icon: UserPlus,
        fields: editing ? ['name', 'phone', 'role'] : FIELDS,
        validate: combineValidators(editing ? validateEdit : validateCreate, validatePhone),
      },
    ],
    [editing],
  )

  const wizard = useWizard<TeamValues>({
    steps,
    initialValues,
    onSubmit: async values => {
      const name = values.name.trim()
      if (member) {
        const result = await updatePlatformUserAction(member.id, { name, phone: values.phone || null, role: values.role })
        if (!result.success) {
          return {
            ok: false,
            message: result.error || 'Não foi possível salvar as alterações. Confira os dados e tente de novo.',
            fieldErrors: apiFieldErrors<TeamValues>(result.fieldErrors, FIELDS),
          }
        }
        await onSaved()
        setCreated(null)
        return { ok: true }
      }
      const result = await createPlatformUserAction({
        name,
        email: values.email,
        phone: values.phone,
        role: values.role,
        password: values.password,
      })
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Não foi possível adicionar a pessoa. Confira os dados e tente de novo.',
          fieldErrors: apiFieldErrors<TeamValues>(result.fieldErrors, FIELDS),
        }
      }
      await onSaved()
      setCreated({ name, email: values.email.trim().toLowerCase(), password: values.password })
      return { ok: true }
    },
  })

  const renderStep = () => (
    <FieldGrid>
      <TextField
        {...wizard.field('name')}
        label="Nome"
        required
        span={12}
        autoComplete="off"
        maxLength={120}
        placeholder="Nome e sobrenome"
      />
      {editing ? (
        <div className="flex flex-col gap-1.5 sm:col-span-7">
          <p className="m-0 text-sm font-medium text-[#344054]">E-mail</p>
          <p className="m-0 flex min-h-11 items-center gap-2 rounded-[10px] border border-dashed border-[#D0D5DD] bg-[#F9FAFB] px-3.5 text-sm text-muted-foreground">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{member?.email}</span>
          </p>
          <p className="m-0 text-[13px] text-muted-foreground">O e-mail é o login da conta e não muda por aqui.</p>
        </div>
      ) : (
        <TextField
          {...wizard.field('email')}
          label="E-mail"
          required
          span={7}
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="nome@annetec.org.br"
          hint="É o login no console."
        />
      )}
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
      <ChoiceField {...wizard.field('role')} onValueChange={value => wizard.set('role', value as PlatformRole)} label="Nível de acesso" required span={12} options={ROLE_OPTIONS} />
      {editing ? null : (
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
                wizard.setMany({ password: generatePassword() }, { reveal: true })
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
      )}
      {editing ? (
        <Notice tone="neutral" icon={KeyRound}>
          A senha não muda por aqui — ela tem fluxo próprio de troca.
        </Notice>
      ) : null}
    </FieldGrid>
  )

  /** Fechar por qualquer caminho (X, Esc, "Fechar") apaga a senha inicial da memória da tela. */
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setCreated(null)
      setShowPassword(false)
      wizard.setMany({ password: '' })
    }
  }

  const renderSuccess = () =>
    editing ? (
      <WizardSuccess
        title="Alterações salvas"
        description={`Os dados de ${wizard.values.name.trim()} foram atualizados.`}
        actions={
          <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
        }
      />
    ) : created ? (
      <WizardSuccess
        title="Pessoa adicionada à equipe"
        description={`${created.name} já pode entrar no console com o e-mail ${created.email}.`}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className={successButton.secondary}
              onClick={() => {
                setCreated(null)
                setShowPassword(false)
                wizard.reset()
              }}
            >
              <Plus aria-hidden="true" />
              Adicionar outra pessoa
            </Button>
            <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </>
        }
      >
        <SecretValue
          label="Senha inicial"
          value={created.password}
          caption={`Envie para ${created.name.split(/\s+/)[0]} por um canal seguro.`}
        />
      </WizardSuccess>
    ) : null

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      size="md"
      // A senha inicial só aparece nesta tela: Esc/clique fora não a fecham por engano.
      lockSuccess={!editing}
      icon={editing ? UserRoundPen : UserPlus}
      title={editing ? `Editar ${member.name}` : 'Adicionar pessoa à equipe'}
      description={
        editing
          ? 'Nome, telefone e nível de acesso. O e-mail e a senha não mudam por aqui.'
          : 'Quem da ANNETEC vai ter acesso ao console.'
      }
      submitLabel={editing ? 'Salvar alterações' : 'Adicionar pessoa'}
      submittingLabel={editing ? 'Salvando…' : 'Adicionando…'}
      discardTitle={editing ? 'Descartar as alterações?' : undefined}
      discardDescription={editing ? 'O que você mudou será perdido.' : undefined}
      renderStep={renderStep}
      renderSuccess={renderSuccess}
    />
  )
}
