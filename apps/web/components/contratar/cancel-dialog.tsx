'use client'

import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { cancelOnboardingInput, type OnboardingApplicantView } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cancelOnboardingAction } from '@/lib/actions/contratacao-api'
import { forgetProposal, validate } from '@/lib/adapters/contratacao'
import { safeAction } from './hooks'
import { TextAreaField } from './ui'

/** "Desistir desta proposta": pede o motivo e cancela (`POST …/cancelar`). */
export function CancelProposalButton({
  view,
  proposalId,
  chave,
  onCanceled,
}: {
  view: OnboardingApplicantView
  proposalId: string
  chave: string
  onCanceled: (view: OnboardingApplicantView) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function cancel() {
    const parsed = validate(cancelOnboardingInput, { reason })
    if (!parsed.ok) {
      setError(parsed.errors.reason ?? 'Conte o motivo em poucas palavras')
      return
    }
    setBusy(true)
    const result = await safeAction(() => cancelOnboardingAction(proposalId, chave, parsed.data))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setOpen(false)
    forgetProposal()
    onCanceled(result.data)
  }

  return (
    <>
      <button
        type="button"
        className="text-[13px] font-medium text-destructive underline-offset-4 hover:underline"
        onClick={() => {
          setReason('')
          setError(null)
          setOpen(true)
        }}
      >
        Desistir desta proposta
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-destructive" aria-hidden />
              Cancelar a proposta {view.code}?
            </DialogTitle>
            <DialogDescription>
              A proposta sai da análise e deixa de poder ser editada
              {view.activationCharge ? '; a cobrança de ativação em aberto também é cancelada' : ''}. Para contratar depois,
              basta começar uma nova.
            </DialogDescription>
          </DialogHeader>
          <TextAreaField
            label="Motivo"
            value={reason}
            onChange={event => {
              setReason(event.target.value)
              setError(null)
            }}
            error={error ?? undefined}
            placeholder="Ex.: vamos contratar no próximo semestre"
            maxLength={500}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Manter proposta
            </Button>
            <Button type="button" variant="destructive" onClick={() => void cancel()} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Cancelar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
