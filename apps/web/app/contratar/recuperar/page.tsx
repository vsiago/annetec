'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck, Send } from 'lucide-react'
import { recoverOnboardingAccessInput } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { safeAction } from '@/components/contratar/hooks'
import { B2BFooter, B2BHeader } from '@/components/contratar/shell'
import { ActionError, Panel, TextField } from '@/components/contratar/ui'
import { recoverOnboardingAccessAction } from '@/lib/actions/contratacao-api'
import { maskCnpj, validate, type FieldErrors } from '@/lib/adapters/contratacao'

/**
 * `/contratar/recuperar` — reenvia o link de acompanhamento para o e-mail de
 * quem iniciou a proposta. A resposta é sempre a mesma (não revela se o CNPJ
 * tem proposta), por privacidade.
 */
export default function RecuperarAcessoPage() {
  const [email, setEmail] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const parsed = validate(recoverOnboardingAccessInput, { email, cnpj })
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setBusy(true)
    const result = await safeAction(() => recoverOnboardingAccessAction(parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
      return
    }
    setSent(true)
  }

  return (
    <>
      <B2BHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:py-16">
        <Panel>
          {sent ? (
            <div className="space-y-4 text-center" aria-live="polite">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700" aria-hidden>
                <MailCheck className="size-7" />
              </span>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Confira o seu e-mail</h1>
              <p className="text-sm text-muted-foreground">
                Se existir uma proposta para este CNPJ iniciada com <strong>{email}</strong>, o link de acompanhamento chega em
                instantes. Veja também a caixa de spam.
              </p>
              <Button asChild variant="outline" className="h-11 rounded-xl">
                <Link href="/contratar">Voltar para a contratação</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submit} noValidate>
              <div className="space-y-1">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Retomar uma proposta</h1>
                <p className="text-sm text-muted-foreground">
                  Informe o CNPJ e o e-mail usado no início da contratação. Enviamos de novo o link seguro de acompanhamento.
                </p>
              </div>
              <TextField
                label="CNPJ"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={event => {
                  setCnpj(maskCnpj(event.target.value))
                  setErrors(current => ({ ...current, cnpj: '' }))
                }}
                error={errors.cnpj || undefined}
              />
              <TextField
                label="E-mail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value)
                  setErrors(current => ({ ...current, email: '' }))
                }}
                error={errors.email || undefined}
              />
              <ActionError message={error} />
              <Button type="submit" className="h-12 w-full gap-2 rounded-xl text-base font-semibold" disabled={busy}>
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
                {busy ? 'Enviando…' : 'Enviar o link'}
              </Button>
              <Link href="/contratar" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="size-4" aria-hidden />
                Começar uma nova contratação
              </Link>
            </form>
          )}
        </Panel>
      </main>
      <B2BFooter />
    </>
  )
}
