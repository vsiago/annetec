'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Barcode,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  QrCode,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  CARD_BRAND_LABELS,
  ONE_OFF_CHARGE_LIMITS,
  formatBoletoLine,
  parseBRL,
  type ClubCardInfo,
  type ClubPaymentMethod,
  type CreateManualClubChargeInput,
  type ManualChargePreview,
  type ManualChargeResult,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/client/copy-button'
import { createManualChargeAction, getManualChargePreviewAction } from '@/lib/actions/faturamento-api'
import { formatBRL, formatDateBR, paymentMethodLabel } from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError } from './billing-ui'

/**
 * "Gerar cobrança" de uma assinatura ativa/em atraso: adiantar a próxima
 * mensalidade (mesmo período/valor que a automação geraria) ou lançar uma
 * cobrança avulsa. A forma de pagamento vem marcada com a preferência do
 * associado; no cartão, o admin escolhe entre cobrar o cartão salvo AGORA
 * (com confirmação explícita) ou mandar o link para o associado pagar no
 * portal. O associado recebe o aviso por e-mail com a marca do clube.
 */

type ChargeType = 'advance' | 'one_off'
type CardMode = 'charge_now' | 'link'

const METHOD_ORDER: ClubPaymentMethod[] = ['pix', 'boleto', 'credit_card']

const METHOD_META: Record<ClubPaymentMethod, { icon: typeof QrCode; label: string; detail: string }> = {
  pix: { icon: QrCode, label: 'Pix', detail: 'QR e copia e cola no e-mail' },
  boleto: { icon: Barcode, label: 'Boleto', detail: 'Linha digitável no e-mail' },
  credit_card: { icon: CreditCard, label: 'Cartão', detail: 'Cartão salvo ou link' },
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `gc-${crypto.randomUUID()}`
  return `gc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function cardText(card: ClubCardInfo): string {
  return `${CARD_BRAND_LABELS[card.brand] ?? 'Cartão'} •••• ${card.last4}`
}

export interface GenerateChargeTarget {
  id: string
  holderName: string
  planName: string
}

export function GenerateChargeDialog({
  tenantSlug,
  target,
  onOpenChange,
  onCreated,
  onViewCharge,
}: {
  tenantSlug: string
  target: GenerateChargeTarget | null
  onOpenChange: (open: boolean) => void
  /** Cobrança criada (ou cartão cobrado/recusado): recarregar listas e detalhe. */
  onCreated?: (result: ManualChargeResult) => void
  /** "Ver cobrança": abre o detalhe da cobrança no Faturamento. */
  onViewCharge?: (chargeId: string) => void
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[92vh] sm:overflow-y-auto">
        {target && (
          <GenerateChargeBody
            key={target.id}
            tenantSlug={tenantSlug}
            target={target}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
            onViewCharge={onViewCharge}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function GenerateChargeBody({
  tenantSlug,
  target,
  onClose,
  onCreated,
  onViewCharge,
}: {
  tenantSlug: string
  target: GenerateChargeTarget
  onClose: () => void
  onCreated?: (result: ManualChargeResult) => void
  onViewCharge?: (chargeId: string) => void
}) {
  const [preview, setPreview] = useState<ManualChargePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<ChargeType>('advance')
  const [description, setDescription] = useState('')
  const [amountText, setAmountText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [method, setMethod] = useState<ClubPaymentMethod>('pix')
  const [cardMode, setCardMode] = useState<CardMode>('link')
  const [cardConfirmed, setCardConfirmed] = useState(false)
  const [touched, setTouched] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ManualChargeResult | null>(null)
  // Uma chave por tentativa de "gerar": clique duplo ou reenvio após falha de rede devolvem a mesma cobrança.
  const idempotencyKey = useRef(newIdempotencyKey())
  const submittingRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await getManualChargePreviewAction(tenantSlug, target.id)
      if (!response.success) {
        setLoadError(response.error)
        return
      }
      const data = response.data
      setPreview(data)
      setType(data.advance.available ? 'advance' : 'one_off')
      setDueDate(data.oneOff.defaultDueDate)
      const preferred = data.enabledMethods.includes(data.preferredMethod) ? data.preferredMethod : data.enabledMethods[0]
      if (preferred) setMethod(preferred)
      setCardMode(data.savedCard ? 'charge_now' : 'link')
    } catch {
      setLoadError('Não conseguimos falar com o servidor. Verifique a conexão e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Só ao abrir para esta assinatura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, target.id])

  // Mudou o que vai ser cobrado: a confirmação do cartão precisa ser dada de novo.
  useEffect(() => {
    setCardConfirmed(false)
  }, [type, amountText, method, cardMode])

  const amount = useMemo(() => {
    if (!preview) return null
    if (type === 'advance') return preview.advance.amount
    return parseBRL(amountText)
  }, [preview, type, amountText])

  const oneOffIssues = useMemo(() => {
    const issues: Record<string, string> = {}
    if (!preview || type !== 'one_off') return issues
    const text = description.trim()
    if (!text) issues.description = 'Informe a descrição da cobrança.'
    else if (text.length > ONE_OFF_CHARGE_LIMITS.descriptionMax) issues.description = `Até ${ONE_OFF_CHARGE_LIMITS.descriptionMax} caracteres.`
    if (amount === null) issues.amount = 'Informe o valor.'
    else if (amount <= 0) issues.amount = 'O valor precisa ser maior que zero.'
    else if (amount > ONE_OFF_CHARGE_LIMITS.amountMax) issues.amount = 'O valor máximo é R$ 10.000,00.'
    if (!dueDate) issues.dueDate = 'Informe o vencimento.'
    else if (dueDate < preview.oneOff.minDueDate) issues.dueDate = 'O vencimento não pode estar no passado.'
    else if (dueDate > preview.oneOff.maxDueDate) issues.dueDate = `No máximo até ${formatDateBR(preview.oneOff.maxDueDate)}.`
    return issues
  }, [preview, type, description, amount, dueDate])

  if (loading && !preview) return <PreviewSkeleton holderName={target.holderName} />
  if (!preview) {
    return (
      <div className="space-y-4">
        <Header target={target} />
        <LoadError message={loadError ?? 'Não foi possível carregar.'} onRetry={() => void load()} />
      </div>
    )
  }

  if (result) {
    return (
      <ResultView
        result={result}
        preview={preview}
        onClose={onClose}
        onViewCharge={onViewCharge}
        onAnother={() => {
          idempotencyKey.current = newIdempotencyKey()
          setResult(null)
          setSubmitError(null)
          setDescription('')
          setAmountText('')
          setTouched(false)
          void load()
        }}
      />
    )
  }

  if (!preview.eligible) {
    return (
      <div className="space-y-4">
        <Header target={target} />
        <Notice tone="warning" icon={AlertTriangle} title="Esta assinatura não aceita cobrança agora">
          {preview.ineligibleReason}
        </Notice>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </div>
    )
  }

  const enabled = (value: ClubPaymentMethod) => preview.enabledMethods.includes(value)
  const savedCard = preview.savedCard
  const chargeNow = method === 'credit_card' && cardMode === 'charge_now' && savedCard !== null
  const advanceBlocked = type === 'advance' && !preview.advance.available
  const issuesVisible = touched ? { ...oneOffIssues, ...fieldErrors } : fieldErrors
  const canSubmit =
    !submitting &&
    !advanceBlocked &&
    enabled(method) &&
    (type === 'advance' || Object.keys(oneOffIssues).length === 0) &&
    (!chargeNow || cardConfirmed)

  const amountLabel = amount !== null && amount > 0 ? formatBRL(amount) : 'R$ —'
  const due = type === 'advance' ? preview.advance.dueDate : dueDate
  const submitLabel = chargeNow ? `Cobrar ${amountLabel} no cartão` : `Gerar cobrança de ${amountLabel}`

  const submit = async () => {
    setTouched(true)
    if (submittingRef.current || !canSubmit || amount === null) return
    const base = { method, chargeSavedCard: chargeNow, idempotencyKey: idempotencyKey.current }
    const input: CreateManualClubChargeInput =
      type === 'advance'
        ? { type: 'advance', ...base }
        : { type: 'one_off', ...base, description: description.trim(), amount, dueDate }
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    setFieldErrors({})
    try {
      const response = await createManualChargeAction(tenantSlug, target.id, input)
      if (!response.success) {
        setSubmitError(response.error)
        if (response.fieldErrors) setFieldErrors(response.fieldErrors)
        // Erro de regra (nada foi gravado): a próxima tentativa usa outra chave.
        idempotencyKey.current = newIdempotencyKey()
        return
      }
      setResult(response.data)
      onCreated?.(response.data)
    } catch {
      // Falha de rede: a cobrança pode ter sido criada — repetir com a MESMA chave devolve a mesma linha.
      setSubmitError('Não conseguimos confirmar com o servidor. Tente de novo: se a cobrança já tiver sido criada, ela não é duplicada.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <Header target={target} />

      {/* Tipo */}
      <div role="tablist" aria-label="Tipo de cobrança" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(
          [
            { key: 'advance', label: 'Adiantar mensalidade' },
            { key: 'one_off', label: 'Cobrança avulsa' },
          ] as const
        ).map(option => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={type === option.key}
            onClick={() => {
              setType(option.key)
              setSubmitError(null)
              setFieldErrors({})
            }}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              type === option.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {type === 'advance' ? (
        preview.advance.available ? (
          <p className="text-sm text-muted-foreground">
            Gera agora a mensalidade de{' '}
            <strong className="text-foreground">{preview.advance.label?.replace('Mensalidade ', '')}</strong>, com o mesmo
            valor e o mesmo vencimento que a cobrança automática teria. A automação não gera essa mensalidade de novo e o
            vencimento dos próximos ciclos não muda.
          </p>
        ) : (
          <Notice tone="info" icon={CalendarClock} title="Nada para adiantar agora">
            <span>{preview.advance.unavailableReason}.</span>
            {preview.advance.existingCharge && onViewCharge && (
              <Button
                type="button"
                variant="link"
                className="h-auto gap-1 p-0 text-sm"
                onClick={() => onViewCharge(preview.advance.existingCharge!.id)}
              >
                Ver a mensalidade
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
          </Notice>
        )
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="gc-description">
                Descrição <span className="text-destructive">*</span>
              </Label>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  description.trim().length > ONE_OFF_CHARGE_LIMITS.descriptionMax ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {description.trim().length}/{ONE_OFF_CHARGE_LIMITS.descriptionMax}
              </span>
            </div>
            <Textarea
              id="gc-description"
              rows={2}
              maxLength={ONE_OFF_CHARGE_LIMITS.descriptionMax + 20}
              value={description}
              placeholder="Ex.: 2ª via da carteirinha física"
              onChange={event => setDescription(event.target.value)}
              aria-invalid={Boolean(issuesVisible.description)}
            />
            <FieldError message={issuesVisible.description} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gc-amount">
                Valor <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  id="gc-amount"
                  inputMode="decimal"
                  className="pl-9"
                  placeholder="0,00"
                  value={amountText}
                  onChange={event => setAmountText(event.target.value)}
                  onBlur={() => {
                    const value = parseBRL(amountText)
                    if (value !== null && value > 0) {
                      setAmountText(value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                    }
                  }}
                  aria-invalid={Boolean(issuesVisible.amount)}
                />
              </div>
              <FieldError message={issuesVisible.amount} hint="Até R$ 10.000,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc-due">
                Vencimento <span className="text-destructive">*</span>
              </Label>
              <Input
                id="gc-due"
                type="date"
                min={preview.oneOff.minDueDate}
                max={preview.oneOff.maxDueDate}
                value={dueDate}
                onChange={event => setDueDate(event.target.value)}
                aria-invalid={Boolean(issuesVisible.dueDate)}
              />
              <FieldError message={issuesVisible.dueDate} hint={`Até ${formatDateBR(preview.oneOff.maxDueDate)}`} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A avulsa não muda a assinatura nem o ciclo: se vencer sem pagamento, não deixa a assinatura em atraso. O
            associado recebe um lembrete antes do vencimento.
          </p>
        </div>
      )}

      {!advanceBlocked && (
        <>
          {/* Forma de pagamento */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Forma de pagamento</h3>
            <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {METHOD_ORDER.map(option => {
                const meta = METHOD_META[option]
                const active = option === method
                const available = enabled(option)
                const preferred = option === preview.preferredMethod
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!available || submitting}
                    onClick={() => {
                      setMethod(option)
                      setSubmitError(null)
                    }}
                    className={cn(
                      'relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <meta.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold leading-tight text-foreground">{meta.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {available ? meta.detail : 'Desabilitado no clube'}
                      </span>
                      {preferred && (
                        <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Preferência do associado
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {method === 'credit_card' && (
            <section className="space-y-2">
              <CardOption
                active={cardMode === 'charge_now' && savedCard !== null}
                disabled={!savedCard || submitting}
                icon={Zap}
                title={savedCard ? `Cobrar agora no cartão salvo (${cardText(savedCard)})` : 'Cobrar agora no cartão salvo'}
                detail={
                  savedCard
                    ? 'A cobrança é feita na hora e o resultado aparece aqui. Aprovada, o associado recebe o comprovante.'
                    : 'Esta assinatura não tem cartão salvo neste gateway.'
                }
                onSelect={() => setCardMode('charge_now')}
              />
              <CardOption
                active={cardMode === 'link' || savedCard === null}
                disabled={submitting}
                icon={Link2}
                title="Enviar link para o associado pagar com cartão"
                detail={
                  type === 'advance' && savedCard
                    ? 'Nada é cobrado agora: o associado paga pelo portal. Se não pagar, o cartão salvo é cobrado no vencimento, como sempre.'
                    : 'Nada é cobrado agora: o associado recebe o e-mail com o botão "Pagar com cartão" e paga pelo portal.'
                }
                onSelect={() => setCardMode('link')}
              />
            </section>
          )}

          {/* Resumo */}
          <section className="rounded-xl border bg-muted/30 p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Resumo</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <SummaryItem label="Associado" value={preview.holderName} />
              <SummaryItem label="Plano" value={preview.planName} />
              {type === 'advance' ? (
                <SummaryItem
                  label="Período"
                  value={
                    preview.advance.periodStart && preview.advance.periodEnd
                      ? `${preview.advance.label} · ${formatDateBR(preview.advance.periodStart)} a ${formatDateBR(preview.advance.periodEnd)}`
                      : '—'
                  }
                />
              ) : (
                <SummaryItem label="Descrição" value={description.trim() || '—'} />
              )}
              <SummaryItem label="Valor" value={<span className="font-semibold">{amountLabel}</span>} />
              <SummaryItem label="Vencimento" value={due ? formatDateBR(due) : '—'} />
              <SummaryItem
                label="Pagamento"
                value={
                  method === 'credit_card'
                    ? chargeNow && savedCard
                      ? `Cobrança agora no ${cardText(savedCard)}`
                      : 'Cartão — link para o associado pagar'
                    : paymentMethodLabel(method)
                }
              />
            </dl>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {chargeNow
                ? `Aprovado, ${preview.holderEmail} recebe o comprovante por e-mail.`
                : `${preview.holderEmail} recebe o aviso por e-mail com a marca do clube${
                    method === 'pix' ? ' e o Pix copia e cola' : method === 'boleto' ? ' e a linha digitável' : ' e o botão "Pagar com cartão"'
                  }. A cobrança aparece em Faturas, no portal do associado.`}
            </p>
          </section>

          {chargeNow && savedCard && (
            <label
              htmlFor="gc-confirm-card"
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm',
                cardConfirmed ? 'border-primary bg-primary/5' : 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
              )}
            >
              <Checkbox
                id="gc-confirm-card"
                checked={cardConfirmed}
                onCheckedChange={value => setCardConfirmed(value === true)}
                disabled={submitting || amount === null || amount <= 0}
                className="mt-0.5"
              />
              <span className="text-foreground">
                Confirmo a cobrança de <strong>{amountLabel}</strong> no cartão final <strong>{savedCard.last4}</strong>.
              </span>
            </label>
          )}
        </>
      )}

      {submitError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {submitError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        {!advanceBlocked && (
          <Button type="button" onClick={() => void submit()} disabled={submitting || (touched && !canSubmit)} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : chargeNow ? <CreditCard className="h-4 w-4" /> : null}
            {submitting ? (chargeNow ? 'Cobrando no cartão…' : 'Gerando…') : submitLabel}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

function Header({ target }: { target: GenerateChargeTarget }) {
  return (
    <DialogHeader>
      <DialogTitle>Gerar cobrança</DialogTitle>
      <DialogDescription>
        {target.holderName} · {target.planName}
      </DialogDescription>
    </DialogHeader>
  )
}

function PreviewSkeleton({ holderName }: { holderName: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={`Carregando a cobrança de ${holderName}`}>
      <DialogHeader>
        <DialogTitle>Gerar cobrança</DialogTitle>
        <DialogDescription>{holderName}</DialogDescription>
      </DialogHeader>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid gap-2 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  )
}

function FieldError({ message, hint }: { message?: string; hint?: string }) {
  if (message) return <p className="text-xs text-destructive">{message}</p>
  return hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{value}</dd>
    </>
  )
}

function CardOption({
  active,
  disabled,
  icon: Icon,
  title,
  detail,
  onSelect,
}: {
  active: boolean
  disabled?: boolean
  icon: typeof Zap
  title: string
  detail: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          active ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'info' | 'warning' | 'success' | 'danger'
  icon: typeof AlertTriangle
  title: string
  children?: ReactNode
}) {
  const tones = {
    info: 'border-border bg-muted/40 text-foreground',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100',
  }
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4 text-sm', tones[tone])}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="space-y-1 opacity-90">{children}</div>}
      </div>
    </div>
  )
}

function ResultView({
  result,
  preview,
  onClose,
  onViewCharge,
  onAnother,
}: {
  result: ManualChargeResult
  preview: ManualChargePreview
  onClose: () => void
  onViewCharge?: (chargeId: string) => void
  onAnother: () => void
}) {
  const charge = result.charge
  const amount = formatBRL(charge.amount)
  const card = charge.card ?? preview.savedCard
  const what = charge.kind === 'one_off' ? `Cobrança avulsa “${charge.description}”` : `Mensalidade de ${formatDateBR(charge.periodStart).slice(3)}`
  const noticeText =
    result.notice === 'sent'
      ? result.outcome === 'card_approved'
        ? `Comprovante enviado para ${preview.holderEmail}.`
        : `Aviso enviado para ${preview.holderEmail}.`
      : result.notice === 'failed'
        ? 'Não conseguimos enviar o e-mail ao associado — a falha ficou registrada no histórico.'
        : null

  let body: ReactNode
  if (result.outcome === 'card_approved') {
    body = (
      <Notice tone="success" icon={CheckCircle2} title={`Pagamento de ${amount} aprovado`}>
        <p>
          {what} cobrada no {card ? cardText(card) : 'cartão salvo'}.
        </p>
        {noticeText && <p>{noticeText}</p>}
      </Notice>
    )
  } else if (result.outcome === 'card_declined') {
    body = (
      <Notice tone="danger" icon={XCircle} title="Cartão recusado">
        <p>{result.message ?? 'A operadora não autorizou a cobrança.'}</p>
        <p>
          A cobrança de {amount} ficou registrada como recusada. Dá para enviar o link para o associado pagar com outro
          cartão, Pix ou boleto pelo portal.
        </p>
      </Notice>
    )
  } else if (result.outcome === 'gateway_failed') {
    body = (
      <Notice tone="warning" icon={AlertTriangle} title="Cobrança gravada, mas não emitida">
        <p>{result.message}</p>
        <p>Abra a cobrança e use “Segunda via” para emitir de novo. O associado ainda não foi avisado.</p>
      </Notice>
    )
  } else {
    body = (
      <Notice tone="success" icon={CheckCircle2} title={result.reused ? 'Esta cobrança já tinha sido gerada' : `Cobrança de ${amount} gerada`}>
        <p>
          {what} · vence em {formatDateBR(charge.dueDate)} ·{' '}
          {charge.method === 'credit_card' ? 'cartão (o associado paga pelo portal)' : paymentMethodLabel(charge.method)}.
        </p>
        {noticeText && <p>{noticeText}</p>}
      </Notice>
    )
  }

  return (
    <div className="space-y-5">
      <DialogHeader>
        <DialogTitle>Gerar cobrança</DialogTitle>
        <DialogDescription>
          {preview.holderName} · {preview.planName}
        </DialogDescription>
      </DialogHeader>
      {body}

      {charge.pix?.payload && charge.status !== 'paid' && (
        <div className="space-y-2">
          <Label htmlFor="gc-pix">Pix copia e cola</Label>
          <textarea
            id="gc-pix"
            readOnly
            rows={3}
            value={charge.pix.payload}
            onFocus={event => event.currentTarget.select()}
            className="w-full resize-none rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <CopyButton
            value={charge.pix.payload}
            label="Copiar código Pix"
            copiedLabel="Código copiado!"
            successMessage="Código Pix copiado."
            variant="outline"
            size="default"
            className="w-full"
          />
        </div>
      )}
      {charge.boleto?.identificationField && charge.status !== 'paid' && (
        <div className="space-y-2">
          <Label>Linha digitável</Label>
          <p className="rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all select-all">
            {formatBoletoLine(charge.boleto.identificationField)}
          </p>
          <CopyButton
            value={charge.boleto.identificationField}
            label="Copiar linha digitável"
            copiedLabel="Linha copiada!"
            successMessage="Linha digitável copiada."
            variant="outline"
            size="default"
            className="w-full"
          />
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" onClick={onAnother}>
          Gerar outra
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {onViewCharge && (
            <Button type="button" className="gap-2" onClick={() => onViewCharge(charge.id)}>
              <ExternalLink className="h-4 w-4" />
              Ver cobrança
            </Button>
          )}
        </div>
      </DialogFooter>
    </div>
  )
}
