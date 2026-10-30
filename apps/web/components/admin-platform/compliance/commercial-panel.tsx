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
import { Field } from '@/components/admin-platform/billing/console-kit'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { formatDateTimeBR, formatPercent } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Plano contratado (com a cotação que vira a cobrança), marca e endereço do
 * site, e o registro do aceite eletrônico — o que a equipe confere em
 * "Plano, preço e forma de pagamento" e "Nome, marca e endereço".
 */

export function CommercialPanel({ proposal }: { proposal: OnboardingProposalDetail }) {
  const { plan, brand, contract } = proposal
  const quote = plan.quote

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard
        title="Plano e pagamento"
        icon={Receipt}
        description={
          <>
            {plan.offer ? `Plano ${plan.offer.name}` : 'Plano não escolhido'} · {plan.expectedLives.toLocaleString('pt-BR')} vidas
            previstas
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Mensalidade do plano">{plan.offer ? formatBRL(plan.offer.priceMonthly) : '—'}</Field>
            <Field label="Limite de vidas">{plan.offer ? plan.offer.memberLimit.toLocaleString('pt-BR') : '—'}</Field>
            <Field label="Forma de pagamento">
              {proposal.paymentMethod ? CLUB_PAYMENT_METHOD_LABELS[proposal.paymentMethod] : 'Não escolhida'}
            </Field>
            <Field label="Uso previsto">{quote ? formatPercent(quote.usagePct) : '—'}</Field>
          </div>
          {quote && (
            <div className="rounded-xl border border-border bg-[#F9FAFB] p-4 text-sm">
              <div className="flex justify-between gap-3 py-0.5">
                <span className="text-muted-foreground">Mensalidade estimada</span>
                <span className="font-medium text-foreground">{formatBRL(quote.monthlyTotal)}</span>
              </div>
              {quote.extraLives > 0 && (
                <div className="flex justify-between gap-3 py-0.5 text-xs">
                  <span className="text-muted-foreground">
                    inclui {quote.extraLives.toLocaleString('pt-BR')} {quote.extraLives === 1 ? 'vida acima do limite' : 'vidas acima do limite'} ×{' '}
                    {formatBRL(quote.pricePerExtraLife)}
                  </span>
                  <span className="text-muted-foreground">{formatBRL(quote.overageTotal)}</span>
                </div>
              )}
              <div className="flex justify-between gap-3 py-0.5">
                <span className="text-muted-foreground">Adesão</span>
                <span className="text-foreground">{formatBRL(quote.setupFee)}</span>
              </div>
              {quote.setupFeeDiscount > 0 ? (
                <div className="flex justify-between gap-3 py-0.5 text-[#067647]">
                  <span>
                    {quote.setupFeeDiscountPercent >= 100 ? 'Isenção da adesão' : `Desconto de ${quote.setupFeeDiscountPercent.toLocaleString('pt-BR')}% na adesão`}
                  </span>
                  <span>−{formatBRL(quote.setupFeeDiscount)}</span>
                </div>
              ) : null}
              {quote.planFeeDiscount > 0 ? (
                <div className="flex justify-between gap-3 py-0.5 text-[#067647]">
                  <span>
                    Desconto de {quote.planFeeDiscountPercent.toLocaleString('pt-BR')}% na mensalidade
                    {plan.discount ? (plan.discount.monthlyMonths === null ? ' (permanente)' : ` (${plan.discount.monthlyMonths} ${plan.discount.monthlyMonths === 1 ? 'mês' : 'meses'})`) : ''}
                  </span>
                  <span>−{formatBRL(quote.planFeeDiscount)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                <span className="text-foreground">Cobrança de ativação</span>
                <span className="text-foreground">{formatBRL(quote.activationTotal)}</span>
              </div>
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                Adesão mais a 1ª mensalidade{plan.discount ? ', já com a condição especial aprovada' : ''}. O clube recebe essa cobrança quando você aprova.
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Marca e site" icon={Palette} description={brand ? brand.clubName : undefined}>
        {brand ? (
          <div className="flex flex-col gap-4">
            {/* Prévia com as cores que o próprio clube escolheu (dado do cadastro, não decoração do console). */}
            <div
              className="flex items-center gap-3 rounded-xl p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}
            >
              {brand.logoUrl ? (
                // Logo público servido pela API; next/image não se aplica.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white/90 object-contain p-1" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-bold" aria-hidden="true">
                  {brand.clubName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="m-0 truncate font-semibold">{brand.clubName}</p>
                {brand.tagline && <p className="m-0 truncate text-xs text-white/80">{brand.tagline}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Endereço do site">
                <a
                  href={brand.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                >
                  /{brand.slug}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </Field>
              <Field label="Cores">
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  {[brand.primaryColor, brand.secondaryColor].map(color => (
                    <span key={color} className="inline-flex items-center gap-1 font-mono text-xs">
                      <span
                        className="h-4 w-4 rounded border border-border"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
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
          </div>
        ) : (
          <EmptyState icon={Palette} size="sm" title="O clube ainda não preencheu esta parte" />
        )}
      </SectionCard>

      <SectionCard
        title="Aceite do contrato"
        icon={FileSignature}
        description={contract ? `Aceito em ${formatDateTimeBR(contract.acceptedAt)}` : undefined}
        className="xl:col-span-2"
      >
        {contract ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Signatário">
              {contract.signerName}
              <br />
              <span className="font-mono text-xs text-muted-foreground">{formatCpf(contract.signerCpf)}</span>
            </Field>
            <Field label="Versões aceitas">
              Termos de uso {contract.termsVersion} · Tratamento de dados {contract.dpaVersion}
            </Field>
            <details className="min-w-0 sm:col-span-2">
              <summary className="min-h-10 cursor-pointer select-none rounded text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2">
                Detalhes técnicos
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Código de integridade (sha-256)">
                  <span className="font-mono text-xs" title={`${contract.termsHash}\n${contract.dpaHash}`}>
                    {contract.termsHash.slice(0, 12)}… · {contract.dpaHash.slice(0, 12)}…
                  </span>
                </Field>
                <Field label="De onde foi aceito">
                  <span className="text-xs">
                    IP {contract.ip ?? '—'}
                    {contract.userAgent ? <span className="block truncate text-muted-foreground">{contract.userAgent}</span> : null}
                  </span>
                </Field>
              </div>
            </details>
          </div>
        ) : (
          <EmptyState icon={FileSignature} size="sm" title="O clube ainda não aceitou os termos." />
        )}
      </SectionCard>
    </div>
  )
}

/** Correção pedida ao clube (aberta ou resolvida) e o motivo da recusa ou da decisão, quando houver. */
export function DecisionNotes({ proposal }: { proposal: OnboardingProposalDetail }) {
  const pending = proposal.pendingRequest
  const decision = proposal.decision
  if (!pending && !decision && !proposal.rejectionReason) return null

  return (
    <div className="flex flex-col gap-4">
      {pending && (
        <div
          className={cn(
            'rounded-xl border p-4',
            pending.resolvedAt ? 'border-border bg-muted/30' : 'border-[#FEDF89] bg-[#FFFAEB]',
          )}
        >
          <p className="m-0 text-sm font-semibold text-foreground">
            {pending.resolvedAt ? 'Correção reenviada pelo clube' : 'Correção pedida ao clube'}
          </p>
          <p className="m-0 mt-1 text-sm text-muted-foreground">{pending.message}</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm">
            {pending.items.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {ONBOARDING_SECTION_LABELS[item.section]}
                </span>
                <span className="text-foreground">{item.note}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            Pedida em {formatDateTimeBR(pending.requestedAt)}
            {pending.requestedBy ? ` por ${pending.requestedBy}` : ''}
            {pending.resolvedAt ? ` · reenviada em ${formatDateTimeBR(pending.resolvedAt)}` : ''}
          </p>
        </div>
      )}
      {proposal.rejectionReason && (
        <div className="rounded-xl border border-[#FDA29B] bg-[#FEF3F2] p-4">
          <p className="m-0 text-sm font-semibold text-[#B42318]">Motivo da recusa</p>
          <p className="m-0 mt-1 text-sm text-[#B42318]">{proposal.rejectionReason}</p>
        </div>
      )}
      {decision && (decision.note || decision.overrideReason) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
          <p className="m-0 font-semibold text-foreground">
            Decisão{decision.decidedBy ? ` tomada por ${decision.decidedBy}` : ''}
            {decision.decidedAt ? ` · ${formatDateTimeBR(decision.decidedAt)}` : ''}
          </p>
          {decision.note && <p className="m-0 mt-1 text-muted-foreground">{decision.note}</p>}
          {decision.overrideReason && (
            <p className="m-0 mt-2 rounded-lg bg-[#FFFAEB] px-3 py-2 text-[#B54708]">
              Aprovado com ressalva: {decision.overrideReason}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
