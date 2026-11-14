'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import { recuperarAcessoCandidaturaInput } from '@annetec/contracts'
import { Notice, TextField } from '@/components/contratar/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { recuperarAcessoCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import type { Escopo } from './escopo'

/** "Já começou? Recuperar acesso": reenvia o link da candidatura para o e-mail. */
export function RecuperarAcessoDialog({
  escopo,
  label = 'Já começou? Recuperar acesso',
}: {
  escopo: Escopo
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSent(false)
      setError(null)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const parsed = recuperarAcessoCandidaturaInput.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'E-mail inválido')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await recuperarAcessoCandidaturaAction(escopo, parsed.data.email)
      if (result.success) setSent(true)
      else setError(result.fieldErrors?.email ?? result.error)
    } catch {
      setError('Não foi possível falar com o servidor. Verifique a conexão e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="h-auto justify-start p-0 text-sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recuperar acesso</DialogTitle>
          <DialogDescription>
            Informe o e-mail da candidatura. Se houver uma em andamento ou em análise, enviamos o link de acompanhamento.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div role="status">
            <Notice tone="success" title="Pedido recebido">
              <span className="flex items-start gap-2">
                <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                Se houver uma candidatura com este e-mail, o link chega em instantes. Confira também o spam.
              </span>
            </Notice>
            <DialogFooter className="mt-4">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={event => {
                setEmail(event.target.value)
                setError(null)
              }}
              error={error ?? undefined}
              autoFocus
            />
            <DialogFooter>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Enviar link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
