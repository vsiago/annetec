'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Invoice, InvoiceStatus } from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { cn, getInitials } from '@/lib/utils'
import { useAdminScope } from '@/contexts/admin-scope-context'
import {
  listOperatorOverdueInvoicesAction,
  searchOperatorContractByCpfAction,
  sendOperatorOverdueInvoicesAction,
} from '@/lib/actions/operator-api'
import {
  Search,
  Loader2,
  Receipt,
  Copy,
  ExternalLink,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Mail,
} from 'lucide-react'

/**
 * Tamanho de página da cobrança. Cada fatura vencida é uma chamada ao ERP
 * (a Digital Saúde só devolve os códigos em `/fatura/procurarPorVencida`), e
 * o token tem limite de chamadas — puxar a carteira inteira de uma vez fazia
 * a lista voltar furada.
 */
const PER_PAGE = 25

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  aberta: 'Aberta',
  paga: 'Paga',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  desconhecido: 'Desconhecido',
}

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aberta: 'outline',
  paga: 'secondary',
  vencida: 'destructive',
  cancelada: 'outline',
  desconhecido: 'outline',
}

type SortColumn = 'dueAt' | 'amount'
type SortDirection = 'asc' | 'desc'

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Paleta fixa — cada beneficiário sempre cai na mesma cor entre renders. */
const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-pink-500',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function toTimestamp(value: string | null) {
  if (!value) return 0
  const [day, month, year] = value.split('/')
  if (!day || !month || !year) return 0
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime()
}

export default function OperatorFinanceiroPage() {
  // De qual inquilino são os dados desta tela — ver AdminScopeProvider.
  const { slug: tenantSlug, isLoading: loadingOperator, error: operatorError } = useAdminScope()

  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [invoicesError, setInvoicesError] = useState('')
  // A listagem é paginada porque cada fatura custa uma chamada ao ERP, que
  // limita por token — ver `billingService.listOverdueInvoices`.
  const [invoicesPage, setInvoicesPage] = useState(1)
  const [invoicesTotal, setInvoicesTotal] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'todas'>('todas')
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'dueAt',
    direction: 'desc', // vencimentos mais recentes primeiro, por padrão
  })
  const [copiedCodigo, setCopiedCodigo] = useState<string | null>(null)
  /** Envio de cobrança: código da fatura em andamento e o resultado da última. */
  const [sendingCodigo, setSendingCodigo] = useState<string | null>(null)
  const [sendFeedback, setSendFeedback] = useState<{ codigo: string; texto: string; erro: boolean } | null>(null)


  const loadInvoices = async (slug: string, page = 1) => {
    setLoadingInvoices(true)
    setInvoicesError('')
    const result = await listOperatorOverdueInvoicesAction(slug, { page, perPage: PER_PAGE })
    setLoadingInvoices(false)
    if (!result.success) {
      setInvoicesError(result.error)
      return
    }
    setInvoices(result.data.items)
    setInvoicesTotal(result.data.total)
    setInvoicesPage(page)
  }

  useEffect(() => {
    if (tenantSlug) loadInvoices(tenantSlug, 1)
  }, [tenantSlug])

  /** Uma linha por status realmente presente nos dados — o mini-BI acima da tabela. */
  const byStatus = useMemo(() => {
    const counts = new Map<InvoiceStatus, { count: number; amount: number }>()
    for (const invoice of invoices ?? []) {
      const entry = counts.get(invoice.status) ?? { count: 0, amount: 0 }
      entry.count += 1
      entry.amount += invoice.amount ?? 0
      counts.set(invoice.status, entry)
    }
    return counts
  }, [invoices])

  const toggleSort = (column: SortColumn) => {
    setSort(current =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'desc' },
    )
  }

  const filtered = useMemo(() => {
    if (!invoices) return []
    const term = search.trim().toLowerCase()

    let rows = invoices
    if (statusFilter !== 'todas') rows = rows.filter(invoice => invoice.status === statusFilter)
    if (term) rows = rows.filter(invoice => (invoice.beneficiaryName ?? '').toLowerCase().includes(term))

    const sign = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort.column === 'amount') return ((a.amount ?? 0) - (b.amount ?? 0)) * sign
      return (toTimestamp(a.dueAt) - toTimestamp(b.dueAt)) * sign
    })
  }, [invoices, search, statusFilter, sort])

  const totalAmount = useMemo(
    () => filtered.reduce((sum, invoice) => sum + (invoice.amount ?? 0), 0),
    [filtered],
  )

  const handleCopy = async (barcodeLine: string, codigo: string) => {
    try {
      await navigator.clipboard.writeText(barcodeLine)
      setCopiedCodigo(codigo)
      setTimeout(() => setCopiedCodigo(current => (current === codigo ? null : current)), 2000)
    } catch {
      // clipboard indisponível (ex: contexto sem permissão) — ignora silenciosamente
    }
  }

  /**
   * Reenvia a cobrança do contrato desta fatura.
   *
   * `/fatura/procurarPorVencida` não devolve o código do contrato — só o da
   * fatura e os dados do titular. O caminho até o contrato é o CPF, que é
   * justamente por isso que `Invoice.beneficiaryCpf` passou a ser exposto.
   * Manda e-mail de verdade para o titular, então confirma antes.
   */
  const handleSendOverdue = async (invoice: Invoice) => {
    if (!tenantSlug || !invoice.beneficiaryCpf) return
    const nome = invoice.beneficiaryName ?? 'o titular'
    if (!window.confirm(`Reenviar por e-mail as faturas vencidas de ${nome}? O e-mail sai pela Digital Saúde e não tem desfazer.`)) {
      return
    }

    setSendingCodigo(invoice.upstreamCodigo)
    setSendFeedback(null)

    const contratos = await searchOperatorContractByCpfAction(tenantSlug, invoice.beneficiaryCpf)
    if (!contratos.success || contratos.data.length === 0) {
      setSendingCodigo(null)
      setSendFeedback({
        codigo: invoice.upstreamCodigo,
        texto: contratos.success ? 'Nenhum contrato encontrado para este CPF.' : contratos.error,
        erro: true,
      })
      return
    }

    const result = await sendOperatorOverdueInvoicesAction(tenantSlug, contratos.data[0]!.upstreamCodigo)
    setSendingCodigo(null)
    setSendFeedback({
      codigo: invoice.upstreamCodigo,
      texto: result.success ? 'Cobrança reenviada.' : result.error,
      erro: !result.success,
    })
  }

  const SortHeader = ({ column, label }: { column: SortColumn; label: string }) => {
    const active = sort.column === column
    return (
      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
        <button
          onClick={() => toggleSort(column)}
          className={cn(
            'flex items-center gap-1.5 hover:text-foreground transition-colors',
            active && 'text-foreground',
          )}
        >
          {label}
          {active ? (
            sort.direction === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
        <p className="text-muted-foreground">
          Faturas vencidas da carteira do inquilino selecionado acima, direto da Digital Saúde.
        </p>
      </div>

      {operatorError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{operatorError}</CardContent>
        </Card>
      )}

      {!operatorError && (
        <>
          {/*
            Mini-BI: total + uma pastilha por status realmente presente nos
            dados. `flex-1` em vez de grid de colunas fixas — com só 1 ou 2
            pastilhas (hoje só existe "Vencida", ver nota abaixo) elas
            dividem a largura toda em vez de ficar pequenas e coladas à
            esquerda.
          */}
          <div className="flex flex-wrap gap-3">
            <Card className="border border-border/80 shadow-xs bg-card flex-1 min-w-40">
              <CardContent className="py-4">
                <p className="text-xs text-muted-foreground">Total filtrado</p>
                <p className="text-xl font-bold text-foreground">
                  {loadingInvoices || loadingOperator ? '—' : filtered.length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loadingInvoices || loadingOperator ? '—' : money(totalAmount)}
                </p>
              </CardContent>
            </Card>
            {[...byStatus.entries()].map(([status, stats]) => (
              <Card key={status} className="border border-border/80 shadow-xs bg-card flex-1 min-w-40">
                <CardContent className="py-4">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[status]} className="text-[10px] px-1.5 py-0">
                      {STATUS_LABEL[status]}
                    </Badge>
                  </div>
                  <p className="text-xl font-bold text-foreground mt-1.5">{stats.count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{money(stats.amount)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border border-border/80 shadow-xs bg-card">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar por beneficiário"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      disabled={!invoices}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={value => setStatusFilter(value as InvoiceStatus | 'todas')}
                    disabled={!invoices}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todos os status</SelectItem>
                      {[...byStatus.keys()].map(status => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {tenantSlug && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadInvoices(tenantSlug)}
                    disabled={loadingInvoices}
                  >
                    {loadingInvoices ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Receipt className="h-4 w-4 mr-2" />
                    )}
                    Atualizar
                  </Button>
                )}
              </div>

              {invoicesError && (
                <p className="p-4 text-sm text-destructive">{invoicesError}</p>
              )}

              {(loadingInvoices || loadingOperator) && !invoicesError ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-sm">
                    Buscando faturas vencidas na Digital Saúde — a API não tem listagem em lote,
                    isso pode levar alguns segundos.
                  </p>
                </div>
              ) : !invoicesError && filtered.length === 0 ? (
                <EmptyStateCard
                  icon={Receipt}
                  title={invoices && invoices.length > 0 ? 'Nenhum resultado para esse filtro' : 'Nenhuma fatura vencida'}
                  description={
                    invoices && invoices.length > 0
                      ? 'Tente outro nome ou status.'
                      : 'A carteira da operadora está em dia.'
                  }
                />
              ) : !invoicesError ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Beneficiário</th>
                        <SortHeader column="dueAt" label="Vencimento" />
                        <SortHeader column="amount" label="Valor" />
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Linha digitável</th>
                        <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Boleto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(invoice => (
                        <tr key={invoice.upstreamCodigo} className="border-b border-border last:border-0">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <Avatar className={cn(avatarColor(invoice.beneficiaryName ?? invoice.upstreamCodigo))}>
                                <AvatarFallback className="bg-transparent text-white text-xs font-medium">
                                  {getInitials(invoice.beneficiaryName ?? '?')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {invoice.beneficiaryName ?? '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">{invoice.upstreamCodigo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-sm text-foreground">{invoice.dueAt ?? '—'}</td>
                          <td className="py-4 px-6 text-sm font-medium text-foreground">{money(invoice.amount)}</td>
                          <td className="py-4 px-6">
                            <Badge variant={STATUS_VARIANT[invoice.status]}>
                              {STATUS_LABEL[invoice.status]}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            {invoice.barcodeLine ? (
                              <button
                                onClick={() => handleCopy(invoice.barcodeLine!, invoice.upstreamCodigo)}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
                                title="Copiar linha digitável"
                              >
                                {copiedCodigo === invoice.upstreamCodigo ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 shrink-0" />
                                )}
                                {invoice.barcodeLine}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {invoice.beneficiaryCpf && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={sendingCodigo === invoice.upstreamCodigo}
                                  onClick={() => handleSendOverdue(invoice)}
                                  title="Reenviar as faturas vencidas deste titular por e-mail"
                                >
                                  {sendingCodigo === invoice.upstreamCodigo ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Mail className="h-3.5 w-3.5" />
                                  )}
                                  <span className="sr-only">Reenviar cobrança</span>
                                </Button>
                              )}
                              {invoice.invoiceUrl && (
                                <a
                                  href={invoice.invoiceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                >
                                  Ver <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                            {sendFeedback?.codigo === invoice.upstreamCodigo && (
                              <p
                                className={cn(
                                  'mt-1 text-xs',
                                  sendFeedback.erro ? 'text-destructive' : 'text-emerald-700',
                                )}
                              >
                                {sendFeedback.texto}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {invoicesTotal > PER_PAGE && (
                <div className="flex items-center justify-between border-t pt-4 mt-4 text-sm">
                  <span className="text-muted-foreground">
                    {(invoicesPage - 1) * PER_PAGE + 1}–{Math.min(invoicesPage * PER_PAGE, invoicesTotal)} de{' '}
                    {invoicesTotal} vencida(s)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={invoicesPage <= 1 || loadingInvoices}
                      onClick={() => tenantSlug && loadInvoices(tenantSlug, invoicesPage - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={invoicesPage * PER_PAGE >= invoicesTotal || loadingInvoices}
                      onClick={() => tenantSlug && loadInvoices(tenantSlug, invoicesPage + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
