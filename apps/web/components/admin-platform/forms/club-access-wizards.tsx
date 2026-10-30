'use client'

import { useMemo, useState } from 'react'
import { KeyRound, MailCheck, MailWarning, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import { addTenantResponsibleInput, resetTenantUserPasswordInput } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import {
  FieldGrid,
  Notice,
  SecretValue,
  TextField,
  WizardDialog,
  WizardSuccess,
  apiFieldErrors,
  successButton,
  useWizard,
  zodFields,
  type WizardStep,
} from '@/components/admin-platform/ui/wizard'
import {
  addTenantResponsibleAction,
  resetTenantMemberPasswordAction,
  type TenantMember,
} from '@/lib/actions/tenants-api'

/**
 * Cadastros curtos da aba "Pessoas com acesso" do clube, no mesmo modal dos
 * outros cadastros (uma etapa + tela de sucesso):
 *  - Adicionar responsável (`addTenantResponsibleInput`): a senha provisória é
 *    gerada pela plataforma e vai só por e-mail;
 *  - Redefinir senha (`resetTenantUserPasswordInput`): em branco, a plataforma
 *    gera uma; a senha nova aparece uma única vez.
 * Mesmas actions de antes; a API exige superadmin e registra na auditoria.
 */

// ---------------------------------------------------------------------------
// Adicionar responsável
// ---------------------------------------------------------------------------

interface ResponsibleValues {
  name: string
  email: string
}

const RESPONSIBLE_FIELDS = ['name', 'email'] as const

const validateResponsible = zodFields<ResponsibleValues>(addTenantResponsibleInput, {
  messages: {
    name: { required: 'Informe o nome da pessoa.', invalid: 'Informe o nome completo (pelo menos 2 letras).' },
    email: { required: 'Informe o e-mail — é o login no painel do clube.' },
  },
})

type ResponsibleOutcome = { name: string; email: string; accountCreated: boolean; emailFailed: boolean }

export function AddResponsibleWizard({
  open,
  onOpenChange,
  tenantId,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  onAdded: () => void
}) {
  const [outcome, setOutcome] = useState<ResponsibleOutcome | null>(null)
  const steps = useMemo<WizardStep<ResponsibleValues>[]>(
    () => [{ id: 'responsavel', title: 'Responsável', icon: UserPlus, fields: RESPONSIBLE_FIELDS, validate: validateResponsible }],
    [],
  )
  const wizard = useWizard<ResponsibleValues>({
    steps,
    initialValues: { name: '', email: '' },
    onSubmit: async values => {
      const result = await addTenantResponsibleAction(tenantId, { name: values.name.trim(), email: values.email.trim() })
      if (!result.success) {
        return {
          ok: false,
          message: result.error,
          fieldErrors: apiFieldErrors<ResponsibleValues>(result.fieldErrors, RESPONSIBLE_FIELDS),
        }
      }
      setOutcome({
        name: result.data.member.name,
        email: result.data.member.email,
        accountCreated: result.data.accountCreated,
        emailFailed: result.data.emailStatus === 'failed',
      })
      onAdded()
      return { ok: true }
    },
  })

  return (
    <WizardDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) setOutcome(null)
      }}
      wizard={wizard}
      size="md"
      icon={UserPlus}
      title="Adicionar responsável"
      description="A pessoa passa a administrar o painel deste clube."
      submitLabel="Adicionar responsável"
      submittingLabel="Adicionando…"
      renderStep={() => (
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
          <TextField
            {...wizard.field('email')}
            label="E-mail"
            required
            span={12}
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="responsavel@clube.com.br"
            hint="Se a pessoa ainda não tem conta, a senha provisória é gerada pela plataforma e enviada só por e-mail, no convite com a marca do clube."
          />
        </FieldGrid>
      )}
      renderSuccess={() =>
        outcome ? (
          <WizardSuccess
            title="Responsável adicionado"
            description={`${outcome.name} agora é responsável pelo clube.`}
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={successButton.secondary}
                  onClick={() => {
                    setOutcome(null)
                    wizard.reset()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Adicionar outro
                </Button>
                <Button type="button" className={successButton.primary} onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </>
            }
          >
            {outcome.emailFailed ? (
              <Notice tone="warning" icon={MailWarning} title="O convite por e-mail não foi enviado">
                Use “Redefinir senha” na lista para gerar uma senha e envie para {outcome.email} por um canal seguro.
              </Notice>
            ) : (
              <Notice tone="success" icon={MailCheck}>
                {outcome.accountCreated
                  ? `O convite com a senha provisória foi enviado para ${outcome.email}.`
                  : `${outcome.email} já tinha conta, então o convite foi enviado sem senha.`}
              </Notice>
            )}
          </WizardSuccess>
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Redefinir senha
// ---------------------------------------------------------------------------

interface PasswordValues {
  password: string
}

const validatePassword = zodFields<PasswordValues>(resetTenantUserPasswordInput, {
  input: v => ({ password: v.password || undefined }),
  messages: { password: { invalid: 'Use pelo menos 8 caracteres — ou deixe em branco para gerar automaticamente.' } },
})

export function ResetPasswordWizard({
  member,
  tenantId,
  onOpenChange,
}: {
  /** Conta escolhida na lista; `null` = fechado. */
  member: TenantMember | null
  tenantId: string
  onOpenChange: (open: boolean) => void
}) {
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null)
  const steps = useMemo<WizardStep<PasswordValues>[]>(
    () => [{ id: 'senha', title: 'Senha', icon: KeyRound, fields: ['password'], validate: validatePassword }],
    [],
  )
  const wizard = useWizard<PasswordValues>({
    steps,
    initialValues: { password: '' },
    onSubmit: async values => {
      if (!member) return { ok: false, message: 'Escolha a conta de novo na lista.' }
      const result = await resetTenantMemberPasswordAction(tenantId, member.id, values.password ? { password: values.password } : {})
      if (!result.success) {
        return { ok: false, message: result.error, fieldErrors: apiFieldErrors<PasswordValues>(result.fieldErrors, ['password']) }
      }
      setGenerated(result.data)
      return { ok: true }
    },
  })

  // Qualquer saída (X, "Descartar", "Já copiei, fechar") tira da memória a senha gerada e a digitada.
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setGenerated(null)
      wizard.reset()
    }
  }

  return (
    <WizardDialog
      open={member !== null}
      onOpenChange={handleOpenChange}
      wizard={wizard}
      size="md"
      icon={KeyRound}
      title={`Redefinir a senha de ${member?.name ?? ''}`}
      description="Define uma senha nova sem precisar da senha atual. A pessoa já pode entrar com ela."
      submitLabel="Redefinir senha"
      submittingLabel="Redefinindo…"
      lockSuccess
      discardTitle="Descartar a senha digitada?"
      discardDescription="A senha da pessoa continua a mesma."
      renderStep={() => (
        <FieldGrid>
          <TextField
            {...wizard.field('password')}
            label="Senha nova"
            optional
            span={12}
            autoComplete="off"
            mono
            placeholder="Em branco, a plataforma gera uma"
            hint="Mínimo de 8 caracteres. Em branco, a ANNETEC gera uma senha provisória."
          />
          <Notice tone="neutral" icon={ShieldCheck}>
            Fica no histórico de alterações quem redefiniu, quando e em qual conta. A senha em si nunca é registrada.
          </Notice>
        </FieldGrid>
      )}
      renderSuccess={() =>
        generated ? (
          <WizardSuccess
            title="Senha redefinida"
            description={`${member?.name ?? 'A pessoa'} já pode entrar com a senha nova.`}
            actions={
              <Button type="button" className={successButton.primary} onClick={() => handleOpenChange(false)}>
                Já copiei, fechar
              </Button>
            }
          >
            <SecretValue
              label={`Senha nova de ${generated.email}`}
              value={generated.password}
              caption={
                <>
                  <strong className="font-semibold text-[#93370D]">Esta senha aparece uma única vez.</strong> Copie antes de fechar
                  e envie por um canal seguro.
                </>
              }
            />
          </WizardSuccess>
        ) : null
      }
    />
  )
}
