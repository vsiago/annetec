'use client'

import { useMemo } from 'react'
import { CheckCircle2, Printer, TriangleAlert } from 'lucide-react'
import {
  CLUB_CHARGE_STATUS_LABELS,
  formatBRL,
  formatBoletoLine,
  formatDateBR,
  onlyDigits,
  type CheckoutBoletoView,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CopyButton } from './copy-button'

/** Padrões do Intercalado 2 de 5 (n = estreita, w = larga) — o código de barras do boleto. */
const ITF_PATTERNS = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn']

function Itf25Barcode({ digits }: { digits: string }) {
  const bars = useMemo(() => {
    const code = onlyDigits(digits)
    if (code.length === 0 || code.length % 2 !== 0) return null
    const narrow = 1
    const wide = 3
    // Sequência de larguras alternando barra/espaço, começando por barra.
    const widths: number[] = [narrow, narrow, narrow, narrow] // início: barra, espaço, barra, espaço
    for (let i = 0; i < code.length; i += 2) {
      const barPattern = ITF_PATTERNS[Number(code[i])]!
      const spacePattern = ITF_PATTERNS[Number(code[i + 1])]!
      for (let k = 0; k < 5; k++) {
        widths.push(barPattern[k] === 'w' ? wide : narrow)
        widths.push(spacePattern[k] === 'w' ? wide : narrow)
      }
    }
    widths.push(wide, narrow, narrow) // fim: barra larga, espaço, barra
    const rects: Array<{ x: number; w: number }> = []
    let x = 0
    widths.forEach((width, index) => {
      if (index % 2 === 0) rects.push({ x, w: width })
      x += width
    })
    return { rects, total: x }
  }, [digits])

  if (!bars) return null
  return (
    <svg
      viewBox={`0 0 ${bars.total} 50`}
      preserveAspectRatio="none"
      className="h-14 w-full max-w-[420px]"
      role="img"
      aria-label="Código de barras do boleto"
    >
      {bars.rects.map(rect => (
        <rect key={rect.x} x={rect.x} y={0} width={rect.w} height={50} fill="#000" />
      ))}
    </svg>
  )
}

function Box({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('border-b border-r border-slate-300 px-3 py-2 print:border-black', className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 print:text-black">{label}</p>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  )
}

interface BoletoDocumentProps {
  view: CheckoutBoletoView
  tenant: Tenant
}

/**
 * Boleto imprimível SÓ do modo simulado (cedente = inquilino, pagador com CPF
 * mascarado). Boleto de gateway real nunca é desenhado aqui — a página leva
 * ao documento do próprio gateway; por garantia, sem `simulated` não renderiza.
 */
export function BoletoDocument({ view, tenant }: BoletoDocumentProps) {
  if (!view.simulated) return null
  const { charge } = view
  const line = charge.boleto?.identificationField ?? ''
  const barCode = charge.boleto?.barCode ?? ''
  const paid = charge.status === 'paid'
  const logo = tenant.branding?.logoUrl || tenant.branding?.logoLightUrl

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Boleto da sua assinatura</h1>
          <p className="text-sm text-muted-foreground">
            Pague até {formatDateBR(charge.dueDate)} no app do banco, internet banking ou lotérica.
          </p>
        </div>
        <div className="flex gap-2">
          {line ? <CopyButton value={line} label="Copiar linha" className="h-11 rounded-xl" /> : null}
          <Button type="button" onClick={() => window.print()} className="h-11 rounded-xl">
            <Printer className="size-4" aria-hidden />
            Imprimir
          </Button>
        </div>
      </div>

      {view.simulated ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 print:rounded-none print:bg-white">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Documento de demonstração — sem valor. Não pague este boleto.
        </div>
      ) : null}

      {paid ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 print:hidden">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Este boleto já foi pago{charge.paidAt ? ` em ${formatDateBR(charge.paidAt)}` : ''}. Nada mais a fazer.
        </div>
      ) : charge.status !== 'pending' && charge.status !== 'overdue' ? (
        <div className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm font-medium text-foreground print:hidden">
          Situação: {CLUB_CHARGE_STATUS_LABELS[charge.status]}
        </div>
      ) : null}

      <article className="relative overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-sm print:rounded-none print:shadow-none">
        {view.simulated ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black uppercase tracking-widest text-slate-900/[0.06] [transform:rotate(-18deg)] select-none"
            aria-hidden
          >
            Demonstração
          </span>
        ) : null}

        {/* Recibo do pagador */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-300 px-4 py-3 print:border-black">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={view.tenantName} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <span className="truncate text-lg font-extrabold">{view.tenantName}</span>
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 print:text-black">Recibo do pagador</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Box label="Beneficiário" className="col-span-2">{view.tenantName}</Box>
          <Box label="Vencimento">{formatDateBR(charge.dueDate)}</Box>
          <Box label="Valor do documento">{formatBRL(charge.amount)}</Box>
          <Box label="Pagador" className="col-span-2">
            {view.payerName} <span className="font-normal text-slate-600">· CPF {view.payerCpf}</span>
          </Box>
          <Box label="Referência" className="col-span-2">
            {charge.planName} · {formatDateBR(charge.periodStart)} a {formatDateBR(charge.periodEnd)}
          </Box>
        </div>

        <div className="border-b-2 border-dashed border-slate-300 px-4 py-2 text-right text-[10px] uppercase tracking-wider text-slate-400 print:border-black">
          Corte na linha pontilhada
        </div>

        {/* Ficha de compensação */}
        <div className="flex flex-col gap-2 border-b border-slate-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between print:border-black">
          <span className="text-sm font-bold">Banco Demonstração | 999-9</span>
          <span className="font-mono text-[13px] font-semibold tracking-wide break-all sm:text-sm">{line ? formatBoletoLine(line) : '—'}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Box label="Local de pagamento" className="col-span-2 sm:col-span-3">
            Pagável em qualquer banco ou lotérica até o vencimento
          </Box>
          <Box label="Vencimento">{formatDateBR(charge.dueDate)}</Box>
          <Box label="Beneficiário" className="col-span-2 sm:col-span-3">{view.tenantName}</Box>
          <Box label="(=) Valor do documento">{formatBRL(charge.amount)}</Box>
          <Box label="Instruções" className="col-span-2 sm:col-span-4">
            <span className="font-normal">
              Mensalidade do clube de benefícios. Após o vencimento, sujeito a multa e juros conforme as condições da
              assinatura.
            </span>
          </Box>
          <Box label="Pagador" className="col-span-2 sm:col-span-4">
            {view.payerName} · CPF {view.payerCpf}
          </Box>
        </div>
        <div className="px-4 py-4">
          {barCode ? <Itf25Barcode digits={barCode} /> : null}
          <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500 print:text-black">Autenticação mecânica — ficha de compensação</p>
        </div>
      </article>
    </div>
  )
}
