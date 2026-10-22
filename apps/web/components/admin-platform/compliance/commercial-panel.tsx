'use client'

import { ExternalLink, FileSignature, Palette, Receipt } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  ONBOARDING_SECTION_LABELS,
  formatBRL,
  formatCpf,
  formatPhone,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/admin-platform/billing/console-kit'
import { formatDateTimeBR, formatPercent } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Plano contratado (com a cotação que vira a cobrança), marca e endereço do
 * site, e o registro do aceite eletrônico — o que o compliance confere em
 * "Plano, preço e forma de pagamento" e "Nome, marca e endereço".
 */

export function CommercialPanel({ proposal }: { proposal: OnboardingProposalDetail }) {
  const { plan, brand, contract } = proposal
  const quote = plan.quote

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Plano e pagamento
          </CardTitle>
          <CardDescription>
            {plan.offer ? `Plano ${plan.offer.name}` : 'Plano não escolhido'} · {plan.expectedLives.toLocaleString('pt-BR')} vidas
            previstas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mensalidade do plano">{plan.offer ? formatBRL(plan.offer.priceMonthly) : '—'}</Field>
            <Field label="Limite de vidas">{plan.offer ? plan.offer.memberLimit.toLocaleString('pt-BR') : '—'}</Field>
            <Field label="Forma de pagamento">
              {proposal.paymentMethod ? CLUB_PAYMENT_METHOD_LABELS[proposal.paymentMethod] : 'Não escolhida'}
            </Field>
            <Field label="Uso previsto">{quote ? formatPercent(quote.usagePct) : '—'}</Field>
          </div>
          {quote && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Mensal recorrente estimado</span>
                <span className="font-medium text-foreground">{formatBRL(quote.monthlyTotal)}</span>
              </div>
              {quote.extraLives > 0 && (
                <div className="flex justify-between py-0.5 text-xs">
                  <span className="text-muted-foreground">
                    inclui {quote.extraLives.toLocaleString('pt-BR')} vida(s) excedente(s) × {formatBRL(quote.pricePerExtraLife)}
                  </span>
                  <span className="text-muted-foreground">{formatBRL(quote.overageTotal)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Adesão</span>
                <span className="text-foreground">{formatBRL(quote.setupFee)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-semibold">
                <span className="text-foreground">Cobrança de ativação</span>
                <span className="text-foreground">{formatBRL(quote.activationTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Adesão + 1ª mensalidade, emitida na aprovação.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Marca e site
          </CardTitle>
          <CardDescription>{brand ? brand.clubName : 'Etapa ainda não preenchida'}</CardDescription>
        </CardHeader>
        {brand && (
          <CardContent className="space-y-4">
            <div
              className="flex items-center gap-3 rounded-xl p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}
            >
              {brand.logoUrl ? (
                // Logo público servido pela API; next/image não se aplica.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white/90 object-contain p-1" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-bold">
                  {brand.clubName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{brand.clubName}</p>
                {brand.tagline && <p className="truncate text-xs text-white/80">{brand.tagline}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Endereço do site">
                <a href={brand.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  /{brand.slug}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Field>
              <Field label="Cores">
                <span className="inline-flex items-center gap-1.5">
                  {[brand.primaryColor, brand.secondaryColor].map(color => (
                    <span key={color} className="inline-flex items-center gap-1 font-mono text-xs">
                      <span className="h-4 w-4 rounded border border-border" style={{ backgroundColor: color }} />
                      {color}
                    </span>
                  ))}
                </span>
              </Field>
              <Field label="Administrador do painel" className="col-span-2">
                {brand.admin.name} · {brand.admin.email}
                {brand.admin.phone ? ` · ${formatPhone(brand.admin.phone)}` : ''}
              </Field>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="gap-4 shadow-none xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-muted-foreground" />
            Aceite do contrato
          </CardTitle>
          <CardDescription>
            {contract ? `Aceito em ${formatDateTimeBR(contract.acceptedAt)}` : 'O contratante ainda não aceitou os termos.'}
          </CardDescription>
        </CardHeader>
        {contract && (
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Signatário">
              {contract.signerName}
              <br />
              <span className="font-mono text-xs text-muted-foreground">{formatCpf(contract.signerCpf)}</span>
            </Field>
            <Field label="Versões">
              Termos {contract.termsVersion} · DPA {contract.dpaVersion}
            </Field>
            <Field label="Integridade (sha-256)">
              <span className="font-mono text-xs" title={`${contract.termsHash}\n${contract.dpaHash}`}>
                {contract.termsHash.slice(0, 12)}… · {contract.dpaHash.slice(0, 12)}…
              </span>
            </Field>
            <Field label="Origem">
              <span className="text-xs">
                IP {contract.ip ?? '—'}
                {contract.userAgent ? <span className="block truncate text-muted-foreground">{contract.userAgent}</span> : null}
              </span>
            </Field>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

/** Pendência aberta (ou resolvida) e o motivo de reprovação/decisão, quando houver. */
export function DecisionNotes({ proposal }: { proposal: OnboardingProposalDetail }) {
  const pending = proposal.pendingRequest
  const decision = proposal.decision
  if (!pending && !decision && !proposal.rejectionReason) return null

  return (
    <div className="space-y-3">
      {pending && (
        <div
          className={cn(
            'rounded-xl border p-4',
            pending.resolvedAt
              ? 'border-border bg-muted/30'
              : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
          )}
        >
          <p className="text-sm font-semibold text-foreground">
            {pending.resolvedAt ? 'Pendência resolvida' : 'Pendência aberta com o contratante'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{pending.message}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {ONBOARDING_SECTION_LABELS[item.section]}
                </span>
                <span className="text-foreground">{item.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Pedida {formatDateTimeBR(pending.requestedAt)}
            {pending.requestedBy ? ` por ${pending.requestedBy}` : ''}
            {pending.resolvedAt ? ` · reenviada ${formatDateTimeBR(pending.resolvedAt)}` : ''}
          </p>
        </div>
      )}
      {proposal.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Motivo da reprovação</p>
          <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">{proposal.rejectionReason}</p>
        </div>
      )}
      {decision && (decision.note || decision.overrideReason) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
          <p className="font-semibold text-foreground">
            Decisão{decision.decidedBy ? ` de ${decision.decidedBy}` : ''}
            {decision.decidedAt ? ` · ${formatDateTimeBR(decision.decidedAt)}` : ''}
          </p>
          {decision.note && <p className="mt-1 text-muted-foreground">{decision.note}</p>}
          {decision.overrideReason && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Aprovada com ressalva: {decision.overrideReason}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
