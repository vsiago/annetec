'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, Printer, QrCode, TimerReset } from 'lucide-react'
import {
  PLATFORM_CHARGE_STATUS_LABELS,
  formatBRL,
  formatBoletoLine,
  type ClubBoletoData,
  type ClubPixData,
  type PlatformChargeItem,
  type PlatformChargeStatus,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'

/** Peças de cobrança da plataforma (fatura pública, acompanhamento e "Minha assinatura"). */

const STATUS_TONE: Record<PlatformChargeStatus, string> = {
  pending: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  overdue: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  failed: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  canceled: 'border-border bg-muted text-muted-foreground',
  refunded: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200',
}

export function ChargeStatusPill({ status, className }: { status: PlatformChargeStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[status], className)}>
      {PLATFORM_CHARGE_STATUS_LABELS[status]}
    </span>
  )
}

/** Copia para a área de transferência com retorno visual. */
export function CopyButton({ value, label = 'Copiar', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant={copied ? 'secondary' : 'default'}
      className={cn('h-11 gap-2 rounded-xl', className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2500)
        } catch {
          setCopied(false)
        }
      }}
      aria-live="polite"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? 'Copiado!' : label}
    </Button>
  )
}

export function PixPanel({ pix, compact }: { pix: ClubPixData; compact?: boolean }) {
  // Defesa: código vencido nunca aparece como pagável (quem chama deve oferecer um novo Pix).
  if (pix.expiresAt && new Date(pix.expiresAt).getTime() <= Date.now()) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        <TimerReset className="size-6" aria-hidden />
        Este código Pix expirou em {formatDateTime(pix.expiresAt)}. Gere um novo Pix para pagar.
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col items-center gap-4', !compact && 'sm:flex-row sm:items-start')}>
      {pix.qrCodeBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR Code Pix para pagamento"
          className={cn('shrink-0 rounded-xl border bg-white p-2', compact ? 'size-44' : 'size-52')}
        />
      ) : (
        <div className="flex size-44 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border bg-muted/40 text-center text-xs text-muted-foreground">
          <QrCode className="size-8" aria-hidden />
          Use o código copia-e-cola
        </div>
      )}
      <div className="w-full min-w-0 space-y-3">
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
          <li>Abra o app do seu banco e escolha pagar com Pix.</li>
          <li>Escaneie o QR Code ou cole o código abaixo.</li>
          <li>Confirme: a baixa aparece aqui em segundos.</li>
        </ol>
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="pix-payload">
          Pix copia e cola
        </label>
        <textarea
          id="pix-payload"
          readOnly
          value={pix.payload}
          rows={3}
          onFocus={event => event.currentTarget.select()}
          className="w-full resize-none rounded-xl border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <CopyButton value={pix.payload} label="Copiar código Pix" className="w-full sm:w-auto" />
        {pix.expiresAt ? (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <TimerReset className="size-3.5" aria-hidden />
            Código válido até {formatDateTime(pix.expiresAt)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function BoletoPanel({ boleto, printHref }: { boleto: ClubBoletoData; printHref?: string | null }) {
  const line = formatBoletoLine(boleto.identificationField)
  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="boleto-line">
        Linha digitável
      </label>
      <p id="boleto-line" className="break-all rounded-xl border bg-muted/40 p-3 font-mono text-[13px] leading-relaxed text-foreground">
        {line}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={boleto.identificationField} label="Copiar linha digitável" />
        {boleto.url ? (
          <Button asChild variant="outline" className="h-11 gap-2 rounded-xl">
            <a href={boleto.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Abrir boleto
            </a>
          </Button>
        ) : null}
        {printHref ? (
          <Button asChild variant="outline" className="h-11 gap-2 rounded-xl">
            <a href={printHref} target="_blank" rel="noopener noreferrer">
              <Printer className="size-4" aria-hidden />
              Versão para imprimir
            </a>
          </Button>
        ) : null}
      </div>
      <p className="text-[12px] text-muted-foreground">O boleto compensa em até 2 dias úteis após o pagamento.</p>
    </div>
  )
}

export function ChargeItems({ items, total }: { items: PlatformChargeItem[]; total: number }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Itens da fatura</caption>
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="py-2 font-semibold">
            Descrição
          </th>
          <th scope="col" className="py-2 text-right font-semibold">
            Valor
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.kind}-${index}`} className="border-b border-dashed last:border-0">
            <td className="py-2 pr-3 align-top text-foreground/90">
              {item.description}
              {item.quantity !== 1 ? (
                <span className="block text-[12px] text-muted-foreground">
                  {item.quantity.toLocaleString('pt-BR')} × {formatBRL(item.unitPrice)}
                </span>
              ) : null}
            </td>
            <td className={cn('py-2 text-right align-top tabular-nums', item.amount < 0 ? 'text-emerald-700' : 'text-foreground')}>
              {formatBRL(item.amount)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-3 text-left font-semibold text-foreground">
            Total
          </th>
          <td className="pt-3 text-right font-display text-lg font-extrabold tabular-nums text-foreground">{formatBRL(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
