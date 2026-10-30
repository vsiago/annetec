'use client'

import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, HandCoins, Loader2, Undo2, Wallet } from 'lucide-react'
import type { SalesCommissionStatus } from '@annetec/contracts'
import {
  KpiSkeleton,
  RefreshButton,
  SuperadminOnly,
  TableSkeleton,
  runCommand,
  useConsoleData,
  usePlatformRole,
} from '@/components/admin-platform/billing/console-kit'
import { ComercialNav, SUPERADMIN_ONLY, useSellers } from '@/components/admin-platform/comercial/comercial-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CommissionTable } from '@/components/sales/commission-table'
import { COMMISSION_STATUS_OPTIONS, currentMonthSP, formatMoney, recentMonths, todaySP } from '@/components/sales/sales-ui'
import { listTeamCommissionsAction, markCommissionsPaidAction } from '@/lib/actions/comercial-api'

/**
 * Comercial › Comissões: os lançamentos de todos os vendedores, com filtro
 * por vendedor, mês e situação, os totais do filtro e o repasse em lote
 * ("Marcar como pagas", só superadmin, só os "a pagar").
 */

function PayDialog({
  open,
  onOpenChange,
  count,
  total,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  total: number
  onConfirm: (payoutDate: string, note: string) => Promise<boolean>
}) {
  const [date, setDate] = useState(todaySP())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setDate(todaySP())
      setNote('')
      setBusy(false)
    }
  }, [open])

  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(date)

  const submit = async () => {
    if (invalid || busy) return
    setBusy(true)
    const ok = await onConfirm(date, note.trim())
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Marcar {count} {count === 1 ? 'comissão' : 'comissões'} como {count === 1 ? 'paga' : 'pagas'}
          </DialogTitle>
          <DialogDescription>
            Total de {formatMoney(total)} repassado aos vendedores. Fica no histórico de alterações e o vendedor vê em Comissões.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="repasse-data">Data do repasse</Label>
            <Input id="repasse-data" type="date" value={date} max={todaySP()} onChange={event => setDate(event.target.value)} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="repasse-nota">Observação (opcional)</Label>
            <Textarea
              id="repasse-nota"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex.: PIX de 05/11, comprovante no drive do financeiro."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="h-11 rounded-[10px] px-4 font-semibold">
            Voltar
          </Button>
          <Button onClick={submit} disabled={invalid || busy} className="h-11 rounded-[10px] px-4 font-semibold">
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CircleDollarSign aria-hidden="true" />}
            Marcar como pagas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ComercialCommissionsPage() {
  const { isSuperadmin } = usePlatformRole()
  const sellers = useSellers()
  const [seller, setSeller] = useState('all')
  const [mes, setMes] = useState<string>(currentMonthSP())
  const [status, setStatus] = useState<'all' | SalesCommissionStatus>('a_pagar')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('50')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [payOpen, setPayOpen] = useState(false)

  const list = useConsoleData(
    () =>
      listTeamCommissionsAction({
        sellerUserId: seller === 'all' ? undefined : seller,
        mes: mes === 'all' ? undefined : mes,
        status: status === 'all' ? undefined : status,
        page,
        perPage: Number(perPage),
      }),
    [seller, mes, status, page, perPage],
  )
  useEffect(() => setPage(1), [seller, mes, status, perPage])
  useEffect(() => setSelected(new Set()), [seller, mes, status, page, perPage])

  const items = list.data?.items ?? []
  const payable = useMemo(() => items.filter(item => item.status === 'a_pagar'), [items])
  const allSelected = payable.length > 0 && payable.every(item => selected.has(item.id))
  const selectedTotal = items.filter(item => selected.has(item.id)).reduce((acc, item) => acc + item.amount, 0)
  const totals = list.data?.totals

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(payable.map(item => item.id)))

  const pay = async (payoutDate: string, note: string) => {
    const result = await runCommand(markCommissionsPaidAction({ ids: [...selected], payoutDate, note: note || undefined }), data =>
      data.skipped.length > 0
        ? `${data.paid.length} marcadas como pagas; ${data.skipped.length} já não estavam "a pagar"`
        : `${data.paid.length} ${data.paid.length === 1 ? 'comissão marcada como paga' : 'comissões marcadas como pagas'}`,
    )
    if (!result) return false
    setSelected(new Set())
    void list.reload({ silent: true })
    return true
  }

  return (
    <PageContainer>
      <PageHeader
        icon={HandCoins}
        title="Comissões"
        description="O que cada vendedor ganhou com as faturas pagas pelos clubes que trouxe, e o repasse."
        actions={<RefreshButton loading={list.loading} onClick={() => list.reload({ silent: true })} />}
      />
      <ComercialNav />

      {list.error && !totals ? null : !totals ? (
        <KpiSkeleton />
      ) : (
        <section aria-label="Totais do filtro" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={<HandCoins />} accent="amber" label="A pagar" value={formatMoney(totals.a_pagar)} hint="Faturas pagas, repasse pendente" />
          <KpiCard icon={<CircleDollarSign />} accent="green" label="Paga" value={formatMoney(totals.paga)} hint="Já repassada aos vendedores" />
          <KpiCard
            icon={<Undo2 />}
            accent="red"
            label="A descontar"
            value={formatMoney(totals.a_descontar)}
            tone={totals.a_descontar > 0 ? 'danger' : 'default'}
            hint="Estornos depois do repasse"
          />
          <KpiCard icon={<Wallet />} accent="coral" label="Líquido" value={formatMoney(totals.net)} hint="A pagar + paga − a descontar" />
        </section>
      )}

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:flex-wrap lg:items-center">
          <FilterSelect label="Vendedor" value={seller} onChange={setSeller} allLabel="Todos" options={sellers.options} />
          <FilterSelect label="Competência" value={mes} onChange={setMes} allLabel="Todos os meses" options={recentMonths(12)} />
          <FilterSelect
            label="Situação"
            value={status}
            onChange={value => setStatus(value as 'all' | SalesCommissionStatus)}
            allLabel="Todas"
            options={COMMISSION_STATUS_OPTIONS}
          />
          <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
            {selected.size > 0 ? (
              <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
                {selected.size} {selected.size === 1 ? 'selecionada' : 'selecionadas'} · <strong className="text-foreground">{formatMoney(selectedTotal)}</strong>
              </p>
            ) : null}
            <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
              <Button className="h-11 rounded-[10px] px-4 font-semibold" disabled={selected.size === 0} onClick={() => setPayOpen(true)}>
                <CircleDollarSign aria-hidden="true" />
                Marcar como pagas
              </Button>
            </SuperadminOnly>
          </div>
        </div>
        <div className="border-t border-border">
          {list.error && !list.data ? (
            <ErrorState framed={false} onRetry={() => list.reload()} />
          ) : !list.data ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhuma comissão neste filtro"
              description="As comissões nascem quando o clube atribuído a um vendedor paga a fatura da ANNETEC."
            />
          ) : (
            <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
              <CommissionTable
                items={items}
                showSeller
                selection={
                  isSuperadmin
                    ? { selected, toggle, toggleAll, allSelected, disabled: payable.length === 0 }
                    : undefined
                }
              />
            </div>
          )}
        </div>
        {list.data && list.data.total > 0 ? (
          <TableFooter
            page={page}
            perPage={perPage}
            total={list.data.total}
            noun="lançamentos"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        ) : null}
      </SectionCard>

      <PayDialog open={payOpen} onOpenChange={setPayOpen} count={selected.size} total={selectedTotal} onConfirm={pay} />
    </PageContainer>
  )
}
