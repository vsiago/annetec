'use client'

import { KeyRound, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { maskCpf, maskPhone } from '@annetec/contracts'
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button'
import { Skeleton } from '@/components/ui/skeleton'
import { maskDateBR, type FieldErrors, type HolderForm } from '@/lib/adapters/checkout'
import { CheckoutField } from './form-field'

/** Sessão de associado deste clube aberta no navegador (o checkout usa a conta dela). */
export interface CheckoutMember {
  name: string
  email: string
  /** Já tem assinatura viva neste clube (o checkout recusaria uma segunda). */
  alreadySubscribed: boolean
}

interface HolderStepProps {
  slug: string
  value: HolderForm
  errors: FieldErrors
  /** Faixa de idade do plano escolhido: "Titular de 18 a 70 anos". */
  ageHint: string
  onChange: (field: keyof HolderForm, value: string) => void
  onBlur: (field: keyof HolderForm) => void
  /** Associado logado neste clube: nome/e-mail vêm da conta e o e-mail fica travado. */
  member: CheckoutMember | null
  /** Sessão ainda sendo lida (evita piscar o botão do Google para quem já está logado). */
  sessionLoading: boolean
  /** Login com Google disponível (client id no web + API configurada). */
  googleEnabled: boolean
  googleBusy: boolean
  googleError: string | null
  onGoogleCredential: (credential: string) => void
  onSwitchAccount: () => void
  switchingAccount: boolean
  /** Campos preenchidos e válidos (check discreto no campo). */
  validFields?: Partial<Record<keyof HolderForm, boolean>>
  /** Bloco opcional de dependentes — aparece junto com o formulário. */
  children?: ReactNode
}

export function HolderStep({
  slug,
  value,
  errors,
  ageHint,
  onChange,
  onBlur,
  member,
  sessionLoading,
  googleEnabled,
  googleBusy,
  googleError,
  onGoogleCredential,
  onSwitchAccount,
  switchingAccount,
  validFields = {},
  children,
}: HolderStepProps) {
  if (sessionLoading && !member) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    )
  }

  const showGoogle = !member && googleEnabled

  return (
    <div className="max-w-140 space-y-6">
      {member ? (
        <ConnectedAs slug={slug} member={member} onSwitchAccount={onSwitchAccount} switching={switchingAccount} />
      ) : null}

      {showGoogle ? (
        <div className="space-y-4">
          <div>
            <GoogleSignInButton onCredential={onGoogleCredential} disabled={googleBusy} />
            <p className="mt-2 text-center text-[13px] text-muted-foreground">Preenchemos nome e e-mail para você.</p>
            {googleBusy ? (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Entrando com Google…
              </p>
            ) : null}
            <div aria-live="polite">
              {googleError ? (
                <p className="mt-3 text-center text-sm text-destructive" role="alert">
                  {googleError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground" role="separator">
            <span className="h-px flex-1 bg-border" />
            ou preencha seus dados
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
          <CheckoutField
            label="Nome completo"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Como está no seu documento"
            value={value.name}
            error={errors.name}
            valid={validFields.name}
            onChange={event => onChange('name', event.target.value)}
            onBlur={() => onBlur('name')}
            containerClassName="sm:col-span-2"
          />
          <CheckoutField
            label="CPF"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={value.cpf}
            error={errors.cpf}
            valid={validFields.cpf}
            onChange={event => onChange('cpf', maskCpf(event.target.value))}
            onBlur={() => onBlur('cpf')}
          />
          <CheckoutField
            label="Data de nascimento"
            name="birthDate"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="DD/MM/AAAA"
            value={value.birthDate}
            error={errors.birthDate}
            valid={validFields.birthDate}
            hint={`${ageHint}.`}
            onChange={event => onChange('birthDate', maskDateBR(event.target.value))}
            onBlur={() => onBlur('birthDate')}
          />
          <CheckoutField
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@email.com"
            value={value.email}
            error={errors.email}
            valid={validFields.email}
            readOnly={Boolean(member)}
            aria-readonly={member ? true : undefined}
            hint={member ? 'E-mail da sua conta — é com ele que você acessa a área do associado.' : undefined}
            className={member ? 'cursor-not-allowed bg-muted/60 text-muted-foreground' : undefined}
            onChange={event => {
              if (!member) onChange('email', event.target.value)
            }}
            onBlur={() => onBlur('email')}
          />
          <CheckoutField
            label="Celular (WhatsApp)"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            value={value.phone}
            error={errors.phone}
            valid={validFields.phone}
            onChange={event => onChange('phone', maskPhone(event.target.value))}
            onBlur={() => onBlur('phone')}
          />
      </div>

      {children}

    </div>
  )
}

/** Linha discreta sobre acesso sem senha (vai logo abaixo do botão principal). */
export function PasswordlessNote({ googleEnabled, className }: { googleEnabled: boolean; className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground ${className ?? ''}`}>
      <KeyRound className="size-3.5 shrink-0" aria-hidden />
      {googleEnabled
        ? 'Sem senha: você entra na área do associado com Google ou CPF e e-mail.'
        : 'Sem senha: você entra na área do associado com CPF e e-mail.'}
    </p>
  )
}

function ConnectedAs({
  slug,
  member,
  onSwitchAccount,
  switching,
}: {
  slug: string
  member: CheckoutMember
  onSwitchAccount: () => void
  switching: boolean
}) {
  const initial = (member.name.trim()[0] ?? member.email[0] ?? '?').toUpperCase()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden
        >
          {initial}
        </span>
        <p className="min-w-0 flex-1 text-muted-foreground">
          Conectado como
          <strong className="block truncate font-semibold text-foreground">{member.email}</strong>
        </p>
        <button
          type="button"
          onClick={onSwitchAccount}
          disabled={switching}
          className="shrink-0 rounded-md px-1 py-2 text-sm font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {switching ? 'Saindo…' : 'Trocar conta'}
        </button>
      </div>
      {member.alreadySubscribed ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Você já tem uma assinatura neste clube.{' '}
          <Link href={`/${slug}/cliente`} className="font-semibold text-primary hover:underline">
            Acessar minha área
          </Link>
        </p>
      ) : null}
    </div>
  )
}
