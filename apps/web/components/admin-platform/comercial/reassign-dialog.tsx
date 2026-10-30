'use client'

import { useEffect, useState } from 'react'
import { ArrowRightLeft, Loader2 } from 'lucide-react'
import type { PlatformSeller, Prospect, ProspectDetail } from '@annetec/contracts'
import { runCommand } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { reassignProspectAction } from '@/lib/actions/comercial-api'

/**
 * Reatribuir um prospect a outro vendedor (superadmin). A proposta vinculada
 * em andamento vai junto — a API registra na linha do tempo e na auditoria.
 */
export function ReassignDialog({
  prospect,
  sellers,
  onOpenChange,
  onDone,
}: {
  prospect: Prospect | null
  sellers: PlatformSeller[]
  onOpenChange: (open: boolean) => void
  onDone: (detail: ProspectDetail) => void
}) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const open = prospect !== null

  useEffect(() => {
    if (open) {
      setTarget('')
      setReason('')
      setBusy(false)
    }
  }, [open])

  const candidates = sellers.filter(seller => seller.active && seller.userId !== prospect?.sellerUserId)

  const submit = async () => {
    if (!prospect || !target || busy) return
    setBusy(true)
    const name = sellers.find(seller => seller.userId === target)?.name ?? 'outro vendedor'
    const detail = await runCommand(
      reassignProspectAction(prospect.id, { sellerUserId: target, reason: reason.trim() || undefined }),
      `${prospect.name} agora é de ${name}`,
    )
    setBusy(false)
    if (detail) {
      onDone(detail)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reatribuir {prospect?.name}</DialogTitle>
          <DialogDescription>
            Hoje com {prospect?.sellerName ?? 'outro vendedor'}. A proposta em andamento, se houver, vai junto para o novo vendedor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reatribuir-vendedor">Novo vendedor</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="reatribuir-vendedor" className="h-11 w-full rounded-[10px]">
                <SelectValue placeholder={candidates.length ? 'Escolha o vendedor' : 'Nenhum outro vendedor ativo'} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map(seller => (
                  <SelectItem key={seller.userId} value={seller.userId}>
                    {seller.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reatribuir-motivo">Motivo (opcional)</Label>
            <Textarea
              id="reatribuir-motivo"
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: o vendedor anterior saiu da região."
            />
            <p className="m-0 text-xs text-muted-foreground">Fica na linha do tempo do prospect e no histórico de alterações.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="h-11 rounded-[10px] px-4 font-semibold">
            Voltar
          </Button>
          <Button onClick={submit} disabled={!target || busy} className="h-11 rounded-[10px] px-4 font-semibold">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRightLeft aria-hidden="true" />}
            Reatribuir prospect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
