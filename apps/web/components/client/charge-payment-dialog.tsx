'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { formatBRL, formatBoletoLine, formatDateBR, type ClubCharge } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { payMyClubChargeAction, reissueMyClubChargeAction } from '@/lib/actions/cliente-assinatura-api'
import {
  canReissue,
  cardInfoLabel,
  chargeDueText,
  chargeStatusView,
  chargeTitle,
  formatDateTimeBR,
  formatPeriod,
  isChargeLate,
  isChargeOpen,
  paymentMethodLabel,
  paymentPanelFor,
  pixQrSrc,
  type PaymentPanel,
} from '@/lib/adapters/cliente-assinatura'
import { ChargeCardPayment } from './charge-card-payment'
import { CopyButton } from './copy-button'
import { ToneBadge } from './status-ui'

/** Polling do pagamento: Pix confirma em segundos, boleto em minutos. Para depois de 15 min sem resposta. */
const POLL_PIX_MS = 4_000
const POLL_BOLETO_MS = 8_000
const POLL_LIMIT_MS = 15 * 60_000

const SERVER_UNREACHABLE = 'Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.'

interface ChargePaymentDialogProps {
  charge: ClubCharge | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  /** Primeiro nome do titular, para o "obrigado". */
  holderFirstName?: string
  /** Troca a fatura na lista depois de gerar Pix/boleto/segunda via. */
  onChargeUpdated: (charge: ClubCharge) => void
  /** Relê as faturas — é o polling enquanto o pagamento não confirma. */
  onPoll: () => Promise<void>
  /** Pagamento confirmado: a assinatura muda no portal inteiro. */
  onPaid: () => void
}

/**
 * Detalhe de uma fatura e o pagamento dela: Pix (QR + copia-e-cola +
 * confirmação automática), boleto (linha digitável + PDF) e segunda via.
 * No celular o diálogo vira gaveta de baixo (componente `Dialog` do projeto).
 */
export function ChargePaymentDialog({ charge, open, onOpenChange, ...rest }: ChargePaymentDialogProps) {
  return (
    <Dialog open={open && charge !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:max-h-[90vh] sm:overflow-y-auto">
        {charge && <ChargePaymentBody key={charge.id} charge={charge} onClose={() => onOpenChange(false)} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = Omit<ChargePaymentDialogProps, 'charge' | 'open' | 'onOpenChange'> & {
  charge: ClubCharge
  onClose: () => void
}

function ChargePaymentBody({
  charge,
  tenantSlug,
  holderFirstName,
  onChargeUpdated,
  onPoll,
  onPaid,
  onClose,
}: BodyProps) {
  const status = chargeStatusView(charge.status)
  const chargeIsOpen = isChargeOpen(charge)
  const oneOff = charge.kind === 'one_off'
  // Cartão: a mensalidade em dia é cobrada sozinha no cartão salvo; a avulsa
  // "para pagar com cartão" (link do e-mail) espera o associado digitar o cartão.
  const cardAllowed = charge.method === 'credit_card'
  const [method, setMethod] = useState<PortalMethod>(
    charge.method === 'boleto' ? 'boleto' : oneOff && charge.method === 'credit_card' ? 'credit_card' : 'pix',
  )
  const [showAlternatives, setShowAlternatives] = useState(
    !(charge.method === 'credit_card' && charge.status === 'pending' && !oneOff),
  )
  const [busy, setBusy] = useState<null | 'pay' | 'reissue'>(null)
  const [checking, setChecking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [justPaid, setJustPaid] = useState(false)
  const [pollTimedOut, setPollTimedOut] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const panel: PaymentPanel | null =
    chargeIsOpen && showAlternatives && method !== 'credit_card' ? paymentPanelFor(charge, method, now) : null
  const pollEvery =
    panel?.kind === 'pix-ready' ? POLL_PIX_MS : panel?.kind === 'boleto-ready' ? POLL_BOLETO_MS : null

  // Pagamento confirmado enquanto a tela estava aberta.
  const previousStatus = useRef(charge.status)
  useEffect(() => {
    if (previousStatus.current !== 'paid' && charge.status === 'paid') {
      setJustPaid(true)
      toast.success('Pagamento confirmado! Obrigado.')
      onPaid()
    }
    previousStatus.current = charge.status
  }, [charge.status, onPaid])

  // Polling até confirmar (só com a aba visível, e com teto de tempo).
  useEffect(() => {
    if (pollEvery === null) return
    setPollTimedOut(false)
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) {
        clearInterval(timer)
        setPollTimedOut(true)
        return
      }
      setNow(Date.now())
      if (document.visibilityState === 'visible') void onPoll()
    }, pollEvery)
    return () => clearInterval(timer)
  }, [pollEvery, onPoll])

  const generate = async (action: 'pay' | 'reissue') => {
    if (method === 'credit_card') return
    setBusy(action)
    setActionError(null)
    try {
      const result =
        action === 'pay'
          ? await payMyClubChargeAction(tenantSlug, charge.id, { method })
          : await reissueMyClubChargeAction(tenantSlug, charge.id, { method })
      if (!result.success) {
        setActionError(result.error)
        return
      }
      onChargeUpdated(result.data)
      setNow(Date.now())
      // A API não lança quando o gateway falha: devolve a fatura `failed` com o motivo.
      if (result.data.status === 'failed') {
        setActionError(
          result.data.failureReason ??
            `Não conseguimos gerar o ${method === 'pix' ? 'Pix' : 'boleto'} agora. Tente de novo em instantes.`,
        )
        return
      }
      toast.success(
        action === 'reissue'
          ? `Segunda via gerada. Novo vencimento: ${formatDateBR(result.data.dueDate)}.`
          : method === 'pix'
            ? 'Pix gerado! Agora é só pagar pelo app do seu banco.'
            : 'Boleto gerado!',
      )
    } catch {
      setActionError(SERVER_UNREACHABLE)
    } finally {
      setBusy(null)
    }
  }

  const checkNow = async () => {
    setChecking(true)
    try {
      await onPoll()
      setPollTimedOut(false)
    } finally {
      setChecking(false)
    }
  }

  const simulated = charge.gatewayProvider === 'simulated'

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle>{oneOff ? chargeTitle(charge) : `Fatura ${chargeTitle(charge).replace('Mensalidade ', '')}`}</DialogTitle>
        <DialogDescription>
          {oneOff ? `Cobrança avulsa do clube · ${charge.planName}` : `${charge.planName} · período de ${formatPeriod(charge)}`}
        </DialogDescription>
      </DialogHeader>

      {/* Resumo */}
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Valor</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{formatBRL(charge.amount)}</p>
          </div>
          <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Vencimento</p>
            <p className="font-medium">{formatDateBR(charge.dueDate)}</p>
            {chargeIsOpen && (
              <p className={cn('text-xs', isChargeLate(charge) ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                {chargeDueText(charge)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Forma de pagamento</p>
            <p className="font-medium">
              {charge.method === 'credit_card' ? cardInfoLabel(charge.card) : paymentMethodLabel(charge.method)}
            </p>
          </div>
        </div>
      </div>

      {/* Paga */}
      {charge.status === 'paid' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-center text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-2 text-lg font-semibold">{justPaid ? 'Pagamento confirmado!' : 'Fatura paga'}</p>
          <p className="text-sm opacity-90">
            {charge.paidAt ? `Recebemos ${formatBRL(charge.paidAmount ?? charge.amount)} em ${formatDateTimeBR(charge.paidAt)}.` : 'Pagamento recebido.'}
          </p>
          {justPaid && (
            <>
              <p className="mt-2 text-sm">
                Obrigado{holderFirstName ? `, ${holderFirstName}` : ''}!{oneOff ? '' : ' Sua assinatura já está atualizada.'}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                {!oneOff && (
                  <Button asChild className="bg-primary hover:opacity-90 text-white">
                    <Link href={`/${tenantSlug}/cliente/carteirinha`} onClick={onClose}>
                      Ver minha carteirinha
                    </Link>
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Cancelada / estornada */}
      {(charge.status === 'canceled' || charge.status === 'refunded') && (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          {charge.status === 'canceled'
            ? `Esta fatura foi cancelada${charge.canceledAt ? ` em ${formatDateBR(charge.canceledAt)}` : ''} e não precisa ser paga.`
            : `O pagamento desta fatura foi estornado${charge.refundedAt ? ` em ${formatDateBR(charge.refundedAt)}` : ''}.`}
        </p>
      )}

      {/* Em aberto: pagar */}
      {chargeIsOpen && (
        <div className="space-y-4">
          {charge.status === 'failed' && !actionError && (
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {charge.method === 'credit_card'
                    ? `Não conseguimos cobrar no ${cardInfoLabel(charge.card)}`
                    : `Não conseguimos gerar o ${paymentMethodLabel(charge.method)} desta fatura`}
                </p>
                {charge.failureReason && <p className="opacity-90">{charge.failureReason}</p>}
                <p className="mt-1 opacity-90">
                  {charge.method === 'credit_card'
                    ? 'Tente outro cartão ou pague agora por Pix ou boleto.'
                    : 'Tente de novo abaixo ou escolha outra forma de pagamento.'}
                </p>
              </div>
            </div>
          )}

          {!showAlternatives ? (
            <div className="space-y-3 rounded-xl border p-4 text-sm">
              <div className="flex gap-3">
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Esta fatura será cobrada automaticamente no <strong>{cardInfoLabel(charge.card)}</strong> no dia{' '}
                  {formatDateBR(charge.dueDate)}. Você não precisa fazer nada.
                </p>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => setShowAlternatives(true)}>
                Prefiro pagar agora com Pix ou boleto
              </Button>
            </div>
          ) : (
            <>
              <MethodPicker
                value={method}
                onChange={next => {
                  setMethod(next)
                  setActionError(null)
                }}
                disabled={busy !== null}
                withCard={cardAllowed}
              />

              {charge.method === 'credit_card' && method !== 'credit_card' && !oneOff && (
                <p className="text-xs text-muted-foreground">
                  Ao pagar esta fatura por Pix ou boleto, as próximas mensalidades também passam a vir nessa forma de
                  pagamento.
                </p>
              )}

              {method === 'credit_card' && (
                <ChargeCardPayment
                  key={charge.id}
                  tenantSlug={tenantSlug}
                  charge={charge}
                  disabled={busy !== null}
                  onUpdated={updated => {
                    onChargeUpdated(updated)
                    setNow(Date.now())
                  }}
                />
              )}

              {panel?.kind === 'pix-ready' && charge.pix && (
                <PixPanel pix={charge.pix} simulated={simulated} />
              )}

              {panel?.kind === 'boleto-ready' && charge.boleto && (
                <BoletoPanel boleto={charge.boleto} dueDate={charge.dueDate} simulated={simulated} />
              )}

              {panel?.kind === 'generate' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{panel.hint}</p>
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full bg-primary text-base text-white hover:opacity-90"
                    onClick={() => generate(panel.action)}
                    disabled={busy !== null}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : method === 'pix' ? <QrCode /> : <Barcode />}
                    {busy ? 'Gerando…' : panel.label}
                  </Button>
                </div>
              )}

              {(panel?.kind === 'pix-ready' || panel?.kind === 'boleto-ready') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground" role="status">
                    {pollTimedOut ? (
                      <span>Ainda não recebemos a confirmação. Já pagou? Toque em “Já paguei”.</span>
                    ) : (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Aguardando o pagamento — a confirmação aparece aqui sozinha.</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" className="flex-1" onClick={checkNow} disabled={checking}>
                      <RefreshCw className={cn(checking && 'animate-spin')} />
                      Já paguei, verificar agora
                    </Button>
                    {canReissue(charge) && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="flex-1"
                        onClick={() => generate('reissue')}
                        disabled={busy !== null}
                      >
                        {busy === 'reissue' && <Loader2 className="animate-spin" />}
                        Gerar segunda via
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {actionError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {actionError}
            </p>
          )}
        </div>
      )}

      {charge.invoiceUrl && charge.status !== 'canceled' && (
        <Button asChild variant="link" className="h-auto w-full p-0 text-sm">
          <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">
            Ver fatura completa no site do banco
            <ExternalLink />
          </a>
        </Button>
      )}
    </div>
  )
}

type PortalMethod = 'pix' | 'boleto' | 'credit_card'

function MethodPicker({
  value,
  onChange,
  disabled,
  withCard,
}: {
  value: PortalMethod
  onChange: (method: PortalMethod) => void
  disabled?: boolean
  /** Fatura no cartão: oferece "Cartão" (digitar o cartão) além de Pix e boleto. */
  withCard?: boolean
}) {
  const options: { key: PortalMethod; icon: typeof QrCode; label: string; detail: string }[] = [
    ...(withCard ? [{ key: 'credit_card' as const, icon: CreditCard, label: 'Cartão', detail: 'Aprovação na hora' }] : []),
    { key: 'pix', icon: QrCode, label: 'Pix', detail: 'Confirmação na hora' },
    { key: 'boleto', icon: Barcode, label: 'Boleto', detail: 'Até 3 dias úteis' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Forma de pagamento"
      className={cn('grid gap-2', options.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}
    >
      {options.map(option => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
              active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
              )}
            >
              <option.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-tight">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.detail}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PixPanel({ pix, simulated }: { pix: NonNullable<ClubCharge['pix']>; simulated: boolean }) {
  const qr = pixQrSrc(pix.qrCodeBase64)
  return (
    <div className="space-y-4">
      {qr && (
        <div className="flex justify-center">
          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR Code do Pix" className="h-52 w-52 sm:h-56 sm:w-56" />
          </div>
        </div>
      )}
      <ol className="space-y-1 text-sm text-muted-foreground">
        <li>1. Abra o app do seu banco e escolha <strong className="text-foreground">Pix</strong>.</li>
        <li>2. Leia o QR Code ou use o <strong className="text-foreground">Pix Copia e Cola</strong>.</li>
        <li>3. Confira o valor e confirme. Pronto!</li>
      </ol>
      <div className="space-y-2">
        <label htmlFor="pix-copia-e-cola" className="text-sm font-medium">
          Pix Copia e Cola
        </label>
        <textarea
          id="pix-copia-e-cola"
          readOnly
          value={pix.payload}
          rows={3}
          onFocus={event => event.currentTarget.select()}
          className="w-full resize-none rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <CopyButton
          value={pix.payload}
          label="Copiar código Pix"
          copiedLabel="Código copiado!"
          successMessage="Código Pix copiado. Agora é só colar no app do banco."
          variant="default"
          size="lg"
          className="h-12 w-full bg-primary text-base text-white hover:opacity-90"
        />
        {pix.expiresAt && (
          <p className="text-center text-xs text-muted-foreground">Válido até {formatDateTimeBR(pix.expiresAt)}</p>
        )}
      </div>
      {simulated && <SimulatedHint text="Modo demonstração: este Pix é confirmado automaticamente em instantes, sem dinheiro de verdade." />}
    </div>
  )
}

function BoletoPanel({
  boleto,
  dueDate,
  simulated,
}: {
  boleto: NonNullable<ClubCharge['boleto']>
  dueDate: string
  simulated: boolean
}) {
  const line = formatBoletoLine(boleto.identificationField)
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Linha digitável</p>
        <p className="rounded-lg border bg-muted/40 p-3 font-mono text-sm leading-relaxed break-all select-all">{line}</p>
        <CopyButton
          value={boleto.identificationField}
          label="Copiar linha digitável"
          copiedLabel="Linha copiada!"
          successMessage="Linha digitável copiada. Cole no app do banco para pagar."
          variant="default"
          size="lg"
          className="h-12 w-full bg-primary text-base text-white hover:opacity-90"
        />
      </div>
      {boleto.url && (
        <Button asChild variant="outline" className="h-11 w-full">
          <a href={boleto.url} target="_blank" rel="noopener noreferrer">
            <Barcode />
            Abrir boleto para imprimir
            <ExternalLink />
          </a>
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Vencimento em {formatDateBR(dueDate)}. O banco leva até 3 dias úteis para compensar; assim que confirmar, a fatura
        aparece como paga aqui.
      </p>
      {simulated && <SimulatedHint text="Modo demonstração: este boleto é compensado automaticamente em alguns minutos." />}
    </div>
  )
}

function SimulatedHint({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      {text}
    </p>
  )
}
