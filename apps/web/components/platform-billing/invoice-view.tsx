'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Barcode,
  CircleCheck,
  CreditCard,
  FlaskConical,
  Loader2,
  LogIn,
  Printer,
  QrCode,
  RefreshCw,
  SearchX,
} from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  PLATFORM_CHARGE_KIND_LABELS,
  formatBRL,
  formatBoletoLine,
  formatDateBR,
  type CheckoutCardInput,
  type ClubPaymentMethod,
  type PayPlatformChargeInput,
  type PlatformPublicInvoice,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { safeAction, usePolling } from '@/components/contratar/hooks'
import { B2BFooter, B2BHeader } from '@/components/contratar/shell'
import { ActionError, Notice, PageLoading, Panel } from '@/components/contratar/ui'
import {
  getPlatformInvoiceAction,
  payPlatformInvoiceAction,
  simulatePlatformInvoiceAction,
} from '@/lib/actions/fatura-annetec-api'
import type { ActionResult } from '@/lib/actions/_api-result'
import { formatDateTime, todayInSaoPaulo, type FieldErrors } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { isDemoMode } from '@/lib/demo-mode'
import { BoletoBarcode, barcodeFromLine } from './boleto-barcode'
import { CardPaymentForm } from './card-payment-form'
import { BoletoPanel, ChargeItems, ChargeStatusPill, PixPanel } from './charge-ui'

const METHOD_ICON: Record<ClubPaymentMethod, typeof QrCode> = { pix: QrCode, boleto: Barcode, credit_card: CreditCard }

function isOpen(status: PlatformPublicInvoice['charge']['status']) {
  return status === 'pending' || status === 'overdue' || status === 'failed'
}

export interface PlatformInvoiceSource {
  get(): Promise<ActionResult<PlatformPublicInvoice>>
  pay(input: PayPlatformChargeInput): Promise<ActionResult<PlatformPublicInvoice>>
  simulate(): Promise<ActionResult<PlatformPublicInvoice>>
}

/**
 * Estado da fatura em pagamento (pública ou dentro do painel): carga,
 * polling de 5 s enquanto aberta, troca de método, pagar e simular.
 */
export function usePlatformInvoice(source: PlatformInvoiceSource | null, opts: { missingMessage?: string; polling?: boolean } = {}) {
  const [invoice, setInvoice] = useState<PlatformPublicInvoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<ClubPaymentMethod | null>(null)
  const [busy, setBusy] = useState<'pay' | 'simulate' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<FieldErrors>({})
  const wasOpen = useRef<boolean | null>(null)
  const missingMessage = opts.missingMessage ?? 'O link da fatura está incompleto.'

  const load = useCallback(
    async (silent = false) => {
      if (!source) {
        setError(missingMessage)
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      const result = await safeAction(() => source.get())
      if (result.success) {
        setInvoice(result.data)
        setError(null)
      } else if (!silent) {
        setError(result.error)
      }
      if (!silent) setLoading(false)
    },
    [source, missingMessage],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (invoice && method === null) setMethod(invoice.charge.method)
  }, [invoice, method])

  // Aviso quando o pagamento cai durante o polling.
  useEffect(() => {
    if (!invoice) return
    const open = isOpen(invoice.charge.status)
    if (wasOpen.current === true && invoice.charge.status === 'paid') {
      toast.success('Pagamento confirmado!', { description: 'Obrigado. O comprovante já está nesta página.' })
    }
    wasOpen.current = open
  }, [invoice])

  const open = invoice ? isOpen(invoice.charge.status) : false
  usePolling(() => load(true), 5_000, open && opts.polling !== false)

  async function pay(next: ClubPaymentMethod, card?: CheckoutCardInput) {
    if (!source) return
    setBusy('pay')
    setActionError(null)
    setCardErrors({})
    const result = await safeAction(() => source.pay({ method: next, ...(card ? { card } : {}) }))
    setBusy(null)
    if (!result.success) {
      setActionError(result.error)
      setCardErrors(result.fieldErrors ?? {})
      return
    }
    setInvoice(result.data)
    if (result.data.charge.status === 'paid') toast.success('Pagamento aprovado!')
    else if (result.data.charge.status === 'failed') setActionError(result.data.charge.failureReason ?? 'O cartão foi recusado. Tente outro cartão ou pague com Pix.')
  }

  async function simulate() {
    if (!source) return
    setBusy('simulate')
    setActionError(null)
    const result = await safeAction(() => source.simulate())
    setBusy(null)
    if (!result.success) {
      setActionError(result.error)
      return
    }
    setInvoice(result.data)
  }

  return { invoice, error, loading, load, open, method, setMethod, busy, actionError, setActionError, cardErrors, pay, simulate }
}

export type PlatformInvoiceController = ReturnType<typeof usePlatformInvoice>

/** Fatura indisponível (link incompleto, chave errada, sem permissão). */
export function InvoiceUnavailable({ ctrl }: { ctrl: PlatformInvoiceController }) {
  if (ctrl.loading) return <PageLoading label="Carregando a fatura…" />
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <SearchX className="size-8" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Fatura indisponível</h1>
      <p className="mt-2 text-muted-foreground">{ctrl.error}</p>
      <Button type="button" onClick={() => void ctrl.load()} className="mt-6 h-12 w-full gap-2 rounded-xl">
        <RefreshCw className="size-4" aria-hidden />
        Tentar novamente
      </Button>
    </div>
  )
}

/**
 * Corpo da fatura: resumo à esquerda; à direita, pagamento (Pix, boleto,
 * cartão) ou o comprovante. `paidExtra` aparece no comprovante (ex.: "Voltar
 * ao painel"). Usado pela página pública e pela página dentro do painel.
 */
export function InvoicePaymentGrid({
  ctrl,
  invoice,
  printHref,
  paidExtra,
}: {
  ctrl: PlatformInvoiceController
  invoice: PlatformPublicInvoice
  printHref: string
  paidExtra?: ReactNode
}) {
  const { open, method, setMethod, busy, actionError, setActionError, cardErrors, pay, simulate } = ctrl
  const { charge } = invoice
  const overdue = charge.status === 'overdue' || (open && charge.dueDate < todayInSaoPaulo())
  const selected = method ?? charge.method
  // Pix guardado já expirado numa fatura aberta: nunca exibe o código velho — gera outro (mesma fatura e vencimento).
  const pixExpired = selected === 'pix' && charge.method === 'pix' && invoice.pixExpired
  const needsGeneration =
    selected !== 'credit_card' &&
    (selected !== charge.method || (selected === 'pix' ? !charge.pix || pixExpired : !charge.boleto))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Panel className="h-fit">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fatura ANNETEC · {PLATFORM_CHARGE_KIND_LABELS[charge.kind]}
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground">{charge.description}</h1>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-4xl font-extrabold tracking-tight text-foreground">{formatBRL(charge.amount)}</p>
            <p className={cn('text-sm', overdue ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
              Vencimento {formatDateBR(charge.dueDate)}
              {overdue ? ' · vencida' : ''}
            </p>
          </div>
          <ChargeStatusPill status={charge.status} />
        </div>
        <dl className="mt-5 grid gap-2 border-t pt-4 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Pagador</dt>
            <dd className="text-right font-medium text-foreground">{invoice.payerName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">CNPJ</dt>
            <dd className="text-right tabular-nums text-foreground">{invoice.payerDocument}</dd>
          </div>
          {invoice.tenantName ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Clube</dt>
              <dd className="text-right text-foreground">{invoice.tenantName}</dd>
            </div>
          ) : null}
          {invoice.proposalCode ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Proposta</dt>
              <dd className="text-right font-mono text-foreground">{invoice.proposalCode}</dd>
            </div>
          ) : null}
          {charge.periodStart && charge.periodEnd ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Período</dt>
              <dd className="text-right text-foreground">
                {formatDateBR(charge.periodStart)} a {formatDateBR(charge.periodEnd)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Beneficiário</dt>
            <dd className="text-right text-foreground">{invoice.beneficiaryName}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-xl border bg-muted/20 p-4">
          <ChargeItems items={charge.items} total={charge.amount} />
        </div>
        <Button asChild variant="ghost" className="mt-3 h-10 gap-2">
          <a href={printHref} target="_blank" rel="noopener noreferrer">
            <Printer className="size-4" aria-hidden />
            Versão para imprimir
          </a>
        </Button>
      </Panel>

      <div className="space-y-5">
        {charge.status === 'paid' ? (
          <Panel className="border-emerald-300">
            <div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
              <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden>
                <CircleCheck className="size-9" />
              </span>
              <h2 className="font-display text-2xl font-bold text-foreground">Pagamento confirmado</h2>
              <p className="text-sm text-muted-foreground">
                {formatBRL(charge.paidAmount ?? charge.amount)} pagos em {formatDateTime(charge.paidAt)}
                {charge.card ? ` · cartão final ${charge.card.last4}` : ''}.
              </p>
              {charge.kind === 'activation' ? (
                <p className="max-w-sm text-sm text-foreground/80">
                  Estamos criando o seu clube agora. O acesso ao painel chega por e-mail em instantes, e o link de
                  acompanhamento da proposta mostra quando tudo estiver no ar.
                </p>
              ) : (
                <p className="max-w-sm text-sm text-foreground/80">Obrigado! Se o painel estava restrito, o acesso volta ao normal em instantes.</p>
              )}
              {paidExtra}
            </div>
          </Panel>
        ) : open ? (
          <Panel>
            <h2 className="font-sans text-base font-semibold text-foreground">Como você quer pagar?</h2>
            <div role="tablist" aria-label="Forma de pagamento" className="mt-3 grid grid-cols-3 gap-2">
              {invoice.enabledMethods.map(option => {
                const Icon = METHOD_ICON[option]
                const active = selected === option
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setMethod(option)
                      setActionError(null)
                    }}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground/80 hover:border-primary/40',
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                    {CLUB_PAYMENT_METHOD_LABELS[option]}
                  </button>
                )
              })}
            </div>

            <div className="mt-5" role="tabpanel">
              {charge.status === 'failed' && charge.failureReason ? (
                <Notice tone="error" className="mb-4" title="O último pagamento não foi aprovado.">
                  {charge.failureReason}
                </Notice>
              ) : null}

              {selected === 'credit_card' ? (
                <CardPaymentForm
                  amount={charge.amount}
                  busy={busy === 'pay'}
                  serverErrors={cardErrors}
                  gateway={{ gateway: charge.gatewayProvider, canSimulatePayment: invoice.canSimulatePayment }}
                  onSubmit={card => void pay('credit_card', card)}
                />
              ) : needsGeneration ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    {pixExpired
                      ? 'O código Pix anterior expirou. Gere um novo: o valor e o vencimento da fatura continuam os mesmos.'
                      : selected === 'pix'
                        ? 'Gere o Pix desta fatura: o QR Code e o código copia-e-cola aparecem na hora.'
                        : 'Gere o boleto desta fatura com a linha digitável para pagar no banco.'}
                  </p>
                  <Button type="button" className="h-12 w-full gap-2 rounded-xl text-base font-semibold" onClick={() => void pay(selected)} disabled={busy !== null}>
                    {busy === 'pay' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                    {pixExpired ? 'Gerar novo Pix' : selected === 'pix' ? 'Gerar Pix' : 'Gerar boleto'}
                  </Button>
                </div>
              ) : selected === 'pix' && charge.pix ? (
                <PixPanel pix={charge.pix} />
              ) : selected === 'boleto' && charge.boleto ? (
                <BoletoPanel boleto={charge.boleto} printHref={printHref} />
              ) : null}
            </div>

            <ActionError message={actionError} />

            <p className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Aguardando o pagamento — esta página atualiza sozinha.
            </p>

            {invoice.canSimulatePayment ? (
              <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3 dark:bg-amber-500/10">
                <Button type="button" variant="outline" className="h-10 w-full gap-2 rounded-lg bg-background" onClick={() => void simulate()} disabled={busy !== null}>
                  {busy === 'simulate' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
                  Simular pagamento
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-amber-900 dark:text-amber-100">
                  Ambiente de testes: confirma esta fatura na hora, sem dinheiro real.
                </p>
              </div>
            ) : null}
          </Panel>
        ) : (
          <Notice tone="info" title={`Fatura ${charge.status === 'canceled' ? 'cancelada' : 'estornada'}`}>
            Esta fatura não aceita pagamento. Se você recebeu uma nova via, use o link mais recente.
          </Notice>
        )}
      </div>
    </div>
  )
}

/**
 * `/fatura-annetec/<id>?chave=` — fatura ANNETEC pública: Pix (QR +
 * copia-e-cola), boleto (linha digitável) e cartão; polling de 5 s enquanto
 * está aberta; `?imprimir=1` mostra a versão para impressão (com tarja "sem
 * valor" no modo simulado). Não depende de sessão: funciona com o painel do
 * inquilino bloqueado. É o link dos e-mails; quem é admin do clube dono da
 * fatura vê "Voltar ao painel" (lido do cookie de UI — nunca de outro clube).
 */
export function InvoiceView() {
  const params = useParams<{ chargeId: string }>()
  const search = useSearchParams()
  const chargeId = params.chargeId ?? ''
  const chave = search.get('chave') ?? ''
  const printMode = search.get('imprimir') === '1'

  const source = useMemo<PlatformInvoiceSource | null>(
    () =>
      chargeId && chave
        ? {
            get: () => getPlatformInvoiceAction(chargeId, chave),
            pay: input => payPlatformInvoiceAction(chargeId, chave, input),
            simulate: () => simulatePlatformInvoiceAction(chargeId, chave),
          }
        : null,
    [chargeId, chave],
  )
  const ctrl = usePlatformInvoice(source, {
    missingMessage: 'O link da fatura está incompleto. Use o link completo recebido por e-mail.',
    polling: !printMode,
  })
  const { invoice } = ctrl
  const panel = usePanelLink(invoice)

  useEffect(() => {
    if (printMode && invoice) {
      const timer = window.setTimeout(() => window.print(), 600)
      return () => window.clearTimeout(timer)
    }
  }, [printMode, invoice])

  const header = (
    <B2BHeader
      homeHref={panel?.kind === 'back' ? panel.href : undefined}
      homeLabel={panel?.kind === 'back' ? `Voltar ao painel do ${panel.tenantName}` : undefined}
      action={
        panel ? (
          <Button asChild size="sm" variant={panel.kind === 'back' ? 'outline' : 'ghost'} className="h-9 gap-1.5 rounded-lg">
            <Link href={panel.href}>
              {panel.kind === 'back' ? <ArrowLeft className="size-4" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
              <span className="max-w-[46vw] truncate">
                {panel.kind === 'back' ? `Voltar ao painel do ${panel.tenantName}` : 'Entrar no painel'}
              </span>
            </Link>
          </Button>
        ) : null
      }
    />
  )

  if (!invoice) {
    return (
      <>
        {header}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4">
          <InvoiceUnavailable ctrl={ctrl} />
        </main>
        <B2BFooter />
      </>
    )
  }

  if (printMode) return <PrintableInvoice invoice={invoice} />
  const printHref = `/fatura-annetec/${encodeURIComponent(chargeId)}?chave=${encodeURIComponent(chave)}&imprimir=1`

  return (
    <>
      {header}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        {isDemoMode({ gateway: invoice.charge.gatewayProvider, canSimulatePayment: invoice.canSimulatePayment }) ? (
          <Notice tone="warning" className="mb-5" title="Ambiente de testes">
            Esta fatura é de teste: nenhum valor é cobrado.
          </Notice>
        ) : null}
        <InvoicePaymentGrid
          ctrl={ctrl}
          invoice={invoice}
          printHref={printHref}
          paidExtra={
            panel?.kind === 'back' ? (
              <Button asChild className="mt-2 h-11 gap-2 rounded-xl">
                <Link href={panel.href}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar ao painel
                </Link>
              </Button>
            ) : null
          }
        />
      </main>
      <B2BFooter />
    </>
  )
}

/**
 * Atalho para o painel na página pública: admin do PRÓPRIO clube da fatura →
 * "Voltar ao painel"; sem sessão (ou sessão de outro lugar) → "Entrar no
 * painel" do clube da fatura. O cookie `annetec.user` é só de UI (a API
 * decide permissão) e nada dele é exibido.
 */
function usePanelLink(invoice: PlatformPublicInvoice | null) {
  const [user, setUser] = useState<{ scope?: string; tenantSlug?: string | null; tenantRole?: string | null } | null>(null)
  useEffect(() => {
    try {
      const raw = document.cookie.split('; ').find(item => item.startsWith('annetec.user='))
      setUser(raw ? (JSON.parse(decodeURIComponent(raw.slice('annetec.user='.length))) as typeof user) : null)
    } catch {
      setUser(null)
    }
  }, [])
  const slug = invoice?.charge.tenantSlug
  if (!invoice || !slug) return null
  const tenantName = invoice.charge.tenantName ?? invoice.tenantName ?? 'clube'
  if (user?.scope === 'tenant' && user.tenantSlug === slug && user.tenantRole === 'admin') {
    return { kind: 'back' as const, href: `/${slug}/admin`, tenantName }
  }
  return { kind: 'login' as const, href: `/${slug}/login`, tenantName }
}

function PrintableInvoice({ invoice }: { invoice: PlatformPublicInvoice }) {
  const { charge } = invoice
  const barcode = charge.boleto ? (charge.boleto.barCode ?? barcodeFromLine(charge.boleto.identificationField)) : null
  return (
    <main className="relative mx-auto w-full max-w-3xl bg-white px-6 py-8 text-slate-900 print:max-w-none print:p-0">
      {invoice.simulated ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
          aria-hidden
        >
          <span className="-rotate-[24deg] whitespace-nowrap rounded-lg border-4 border-rose-500/40 px-6 py-2 text-3xl font-black uppercase tracking-widest text-rose-500/35">
            Documento sem valor · demonstração
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/annetec.svg" alt="ANNETEC" className="h-8 w-auto" />
        <div className="text-right text-xs">
          <p className="font-bold uppercase">Fatura {PLATFORM_CHARGE_KIND_LABELS[charge.kind]}</p>
          <p>Emitida em {formatDateBR(charge.createdAt)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <p className="font-semibold uppercase text-slate-500">Beneficiário</p>
          <p className="font-medium">{invoice.beneficiaryName}</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-slate-500">Pagador</p>
          <p className="font-medium">{invoice.payerName}</p>
          <p>CNPJ {invoice.payerDocument}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-y py-3 text-xs">
        <div>
          <p className="font-semibold uppercase text-slate-500">Vencimento</p>
          <p className="text-base font-bold">{formatDateBR(charge.dueDate)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-slate-500">Valor</p>
          <p className="text-base font-bold">{formatBRL(charge.amount)}</p>
        </div>
        <div>
          <p className="font-semibold uppercase text-slate-500">Forma</p>
          <p className="text-base font-bold">{CLUB_PAYMENT_METHOD_LABELS[charge.method]}</p>
        </div>
      </div>
      <div className="mt-4 text-sm">
        <ChargeItems items={charge.items} total={charge.amount} />
      </div>
      {charge.boleto ? (
        <div className="mt-6 space-y-2 border-t-2 border-dashed pt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Linha digitável</p>
          <p className="font-mono text-sm font-semibold tracking-wide">{formatBoletoLine(charge.boleto.identificationField)}</p>
          {barcode ? <BoletoBarcode code={barcode} className="h-14 w-full max-w-xl" /> : null}
        </div>
      ) : null}
      {charge.pix?.qrCodeBase64 && !invoice.pixExpired ? (
        <div className="mt-6 flex items-center gap-4 border-t-2 border-dashed pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${charge.pix.qrCodeBase64}`} alt="QR Code Pix" className="size-32" />
          <p className="break-all font-mono text-[10px] leading-relaxed">{charge.pix.payload}</p>
        </div>
      ) : null}
      <div className="mt-8 flex justify-center print:hidden">
        <Button type="button" className="h-11 gap-2 rounded-xl" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          Imprimir
        </Button>
      </div>
    </main>
  )
}
