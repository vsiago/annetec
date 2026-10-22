'use client'

import { Fragment, type ReactNode } from 'react'
import { ScrollText } from 'lucide-react'
import {
  describeLoyalty,
  formatBRL,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanQuote,
} from '@annetec/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LegalNotice } from './plan-facts'

/** `**negrito**` vira <strong>; o resto é texto puro (o React escapa). */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    )
}

/** Regulamento em texto (`plan.terms`): parágrafos por linha em branco, quebras preservadas. */
function TermsText({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.replace(/^>\s?/gm, '').trim())
    .filter(Boolean)
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      {blocks.map((block, index) => (
        <p key={index} className="whitespace-pre-line">
          {inline(block)}
        </p>
      ))}
    </div>
  )
}

interface PlanTermsDialogProps {
  plan: ClubPlan
  quote: ClubPlanQuote
  tenantName: string
  method: ClubPaymentMethod
  nextCharge: string
}

/**
 * "Ler regulamento": resumo do que está sendo contratado (valores, 1ª
 * cobrança, fidelidade) + o regulamento do plano (`plan.terms`) e o aviso
 * legal. Sem regulamento cadastrado, mostra as políticas de cancelamento e
 * reajuste do plano.
 */
export function PlanTermsDialog({ plan, quote, tenantName, method, nextCharge }: PlanTermsDialogProps) {
  const hasFee = quote.enrollmentFee > 0
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          <ScrollText className="size-3.5" aria-hidden />
          Ler regulamento
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regulamento do plano {plan.name}</DialogTitle>
          <DialogDescription>{tenantName} · leia com calma antes de aceitar.</DialogDescription>
        </DialogHeader>

        <section className="rounded-xl bg-muted/50 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resumo da sua assinatura</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
            <li>
              Mensalidade de <strong>{formatBRL(quote.total)}</strong>, somando titular e dependentes, com renovação
              automática todo mês.
            </li>
            <li>
              1ª cobrança de <strong>{formatBRL(quote.firstChargeTotal)}</strong>
              {hasFee ? `, com a adesão de ${formatBRL(quote.enrollmentFee)} (cobrada uma única vez)` : ''}, paga{' '}
              {method === 'boleto' ? 'até o vencimento do boleto' : 'agora'}. A próxima vence em{' '}
              <strong>{nextCharge}</strong> e as seguintes no mesmo dia de cada mês.
            </li>
            <li>{describeLoyalty(plan.loyaltyMonths)}.</li>
            {method === 'credit_card' ? (
              <li>
                As mensalidades são cobradas automaticamente no cartão informado. Guardamos só a bandeira e os 4
                últimos dígitos; o número completo e o CVV não ficam gravados.
              </li>
            ) : (
              <li>
                As próximas cobranças ficam na sua área do associado antes do vencimento. Atrasos podem suspender o uso
                das carteirinhas até a regularização.
              </li>
            )}
            <li>As carteirinhas digitais são emitidas assim que o 1º pagamento é confirmado.</li>
            <li>Você acessa a área do associado com o seu CPF e e-mail — sem senha.</li>
          </ul>
        </section>

        {plan.terms?.trim() ? (
          <section>
            <TermsText text={plan.terms} />
          </section>
        ) : (
          <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
            {plan.cancellationPolicy ? (
              <p>
                <strong className="font-semibold text-foreground">Cancelamento.</strong> {plan.cancellationPolicy}
              </p>
            ) : null}
            {plan.adjustmentPolicy ? (
              <p>
                <strong className="font-semibold text-foreground">Reajuste.</strong> {plan.adjustmentPolicy}
              </p>
            ) : null}
            <p>
              <strong className="font-semibold text-foreground">Dados pessoais.</strong> Usados apenas para prestar os
              benefícios do clube e cobrar a assinatura, conforme a LGPD.
            </p>
          </section>
        )}

        <LegalNotice className="border-t pt-4" />
      </DialogContent>
    </Dialog>
  )
}
