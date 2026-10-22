'use client'

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { ActiveStatus, ClubPlan } from '@annetec/contracts'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTenantData } from '@/contexts/tenant-data-context'
import { deleteClubPlanAction, setClubPlanStatusAction } from '@/lib/actions/planos-api'
import { formatInt } from '@/lib/adapters/planos'

interface Target {
  plan: ClubPlan
  /** Assinaturas em qualquer status; `null` = estatística indisponível. */
  subscriptions: number | null
}

function assinaturas(n: number): string {
  return `${formatInt(n)} ${n === 1 ? 'assinatura' : 'assinaturas'}`
}

/**
 * Ativar, inativar e excluir plano — a mesma regra na lista e no detalhe.
 *
 * Inativar pede confirmação (o plano sai da vitrine e do checkout); ativar é
 * direto. Excluir só é oferecido de verdade para plano sem assinatura: a API
 * responde 409 nos demais (a FK apagaria o vínculo do histórico), e o
 * diálogo mostra essa mensagem com o atalho "Inativar em vez disso".
 */
export function usePlanStatusActions({
  slug,
  onChanged,
  onDeleted,
}: {
  slug: string
  onChanged: (plan: ClubPlan) => void
  onDeleted?: (plan: ClubPlan) => void
}) {
  const { reloadClientPlans } = useTenantData()
  const [inactivating, setInactivating] = useState<Target | null>(null)
  const [deleting, setDeleting] = useState<Target | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  async function applyStatus(plan: ClubPlan, status: ActiveStatus): Promise<boolean> {
    setWorking(plan.id)
    const result = await setClubPlanStatusAction(slug, plan.id, status)
    setWorking(null)
    if (!result.success) {
      const detail = result.fieldErrors ? Object.values(result.fieldErrors)[0] : undefined
      toast.error(status === 'active' ? 'Não foi possível ativar o plano' : 'Não foi possível inativar o plano', {
        description: detail ? `${result.error} ${detail}` : result.error,
      })
      return false
    }
    toast.success(status === 'active' ? 'Plano ativado' : 'Plano inativado', {
      description:
        status === 'active'
          ? `${plan.name} voltou para a vitrine e o checkout.`
          : `${plan.name} saiu da vitrine e do checkout. Quem já assinou continua normalmente.`,
    })
    onChanged(result.data)
    void reloadClientPlans()
    return true
  }

  function requestToggle(plan: ClubPlan, subscriptions: number | null) {
    if (plan.status === 'active') setInactivating({ plan, subscriptions })
    else void applyStatus(plan, 'active')
  }

  function requestDelete(plan: ClubPlan, subscriptions: number | null) {
    setDeleteError(null)
    setDeleting({ plan, subscriptions })
  }

  async function confirmInactivate() {
    if (!inactivating) return
    const ok = await applyStatus(inactivating.plan, 'inactive')
    if (ok) setInactivating(null)
  }

  async function confirmDelete() {
    if (!deleting) return
    setWorking(deleting.plan.id)
    setDeleteError(null)
    const result = await deleteClubPlanAction(slug, deleting.plan.id)
    setWorking(null)
    if (!result.success) {
      setDeleteError(result.error)
      return
    }
    toast.success('Plano excluído', { description: deleting.plan.name })
    const removed = deleting.plan
    setDeleting(null)
    void reloadClientPlans()
    onDeleted?.(removed)
  }

  async function inactivateInstead() {
    if (!deleting) return
    const ok = await applyStatus(deleting.plan, 'inactive')
    if (ok) setDeleting(null)
  }

  const blocked = deleting !== null && (deleting.subscriptions ?? 0) > 0
  const busy = working !== null

  const dialogs = (
    <>
      <AlertDialog open={inactivating !== null} onOpenChange={open => !open && !busy && setInactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar {inactivating?.plan.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano sai da vitrine e do checkout: ninguém novo consegue contratar.
              {inactivating && (inactivating.subscriptions ?? 0) > 0
                ? ` As ${assinaturas(inactivating.subscriptions ?? 0)} atuais continuam valendo e sendo cobradas pelo valor contratado.`
                : ''}{' '}
              Dá para reativar quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button onClick={confirmInactivate} disabled={busy}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              Inativar plano
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={open => !open && !busy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blocked ? 'Este plano não pode ser excluído' : `Excluir ${deleting?.plan.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? `${deleting?.plan.name} tem ${assinaturas(deleting?.subscriptions ?? 0)} (contando as canceladas). Excluir apagaria esse vínculo do histórico de cobrança. Inative o plano para tirá-lo da vitrine e do checkout.`
                : 'O plano é apagado de vez. Se já houver assinatura nele, a exclusão é recusada e você pode inativá-lo.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{blocked ? 'Fechar' : 'Cancelar'}</AlertDialogCancel>
            {(blocked || deleteError) && deleting?.plan.status === 'active' && (
              <Button variant={blocked ? 'default' : 'outline'} onClick={inactivateInstead} disabled={busy}>
                {busy && blocked && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {blocked ? 'Inativar plano' : 'Inativar em vez disso'}
              </Button>
            )}
            {!blocked && (
              <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                Excluir plano
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { requestToggle, requestDelete, dialogs, workingId: working }
}
