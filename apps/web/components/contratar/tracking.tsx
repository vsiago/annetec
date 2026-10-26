'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Ban,
  CircleCheck,
  Clock3,
  ExternalLink,
  FlaskConical,
  Loader2,
  LogIn,
  PartyPopper,
  Receipt,
  RefreshCw,
  Rocket,
  Store,
  XCircle,
} from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  KYB_DOCUMENT_KIND_LABELS,
  KYB_DOCUMENT_STATUS_LABELS,
  ONBOARDING_STATUS_APPLICANT_HINTS,
  ONBOARDING_STATUS_LABELS,
  formatBRL,
  formatDateBR,
  type OnboardingApplicantView,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { simulatePlatformInvoiceAction } from '@/lib/actions/fatura-annetec-api'
import {
  TRACKING_STAGES,
  formatCnpj,
  formatDateTime,
  invoiceHref,
  invoiceKeyFrom,
  trackingStageIndex,
} from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { BoletoPanel, ChargeItems, ChargeStatusPill, PixPanel } from '@/components/platform-billing/charge-ui'
import { CancelProposalButton } from './cancel-dialog'
import { safeAction, usePolling } from './hooks'
import { QuoteSummaryCard } from './quote-summary'
import { Notice, Panel, Pill } from './ui'

interface TrackingProps {
  view: OnboardingApplicantView
  proposalId: string
  chave: string
  onViewChange: (view: OnboardingApplicantView) => void
  onReload: () => Promise<void> | void
}

const CANCELABLE = new Set(['submitted', 'in_review', 'approved', 'awaiting_payment'])

/** Intervalo do polling por estado: rápido quando algo acontece sozinho em segundos. */
function pollInterval(status: OnboardingApplicantView['status']): number | null {
  if (status === 'approved' || status === 'awaiting_payment' || status === 'provisioning') return 5_000
  if (status === 'submitted' || status === 'in_review') return 30_000
  return null
}

function StageTrack({ view }: { view: OnboardingApplicantView }) {
  const current = trackingStageIndex(view.status)
  const stopped = view.status === 'rejected' || view.status === 'canceled'
  return (
    <ol className="grid gap-3 sm:grid-cols-6" aria-label="Etapas até o clube no ar">
      {TRACKING_STAGES.map((stage, index) => {
        const done = !stopped && index < current
        const active = !stopped && index === current
        return (
          <li key={stage.id} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-semibold',
                done && 'border-emerald-500 bg-emerald-500 text-white',
                active && 'border-primary bg-background text-primary shadow-[0_0_0_4px_rgba(232,67,100,0.14)]',
                !done && !active && 'border-border bg-background text-muted-foreground',
              )}
              aria-hidden
            >
              {done ? <CircleCheck className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : index + 1}
            </span>
            <span className={cn('text-sm font-medium', active ? 'text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground')}>
              {stage.label}
              <span className="sr-only">{done ? ' (concluída)' : active ? ' (em andamento)' : ''}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ActivationCard({ view, onPaid }: { view: OnboardingApplicantView; onPaid: () => void }) {
  const charge = view.activationCharge
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!charge) return null
  const open = charge.status === 'pending' || charge.status === 'overdue' || charge.status === 'failed'
  const href = invoiceHref(charge.publicUrl)
  const key = invoiceKeyFrom(charge.publicUrl)

  async function simulate() {
    if (!charge || !key) return
    setBusy(true)
    setError(null)
    const result = await safeAction(() => simulatePlatformInvoiceAction(charge.id, key))
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    toast.success('Pagamento simulado', { description: 'Confirmando e criando o seu clube…' })
    onPaid()
  }

  return (
    <Panel className="border-primary/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Receipt className="size-4" aria-hidden />
            Cobrança de ativação
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-tight text-foreground">{formatBRL(charge.amount)}</p>
          <p className="text-sm text-muted-foreground">
            {CLUB_PAYMENT_METHOD_LABELS[charge.method]} · vencimento {formatDateBR(charge.dueDate)}
          </p>
        </div>
        <ChargeStatusPill status={charge.status} />
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border bg-muted/20 p-4">
          <ChargeItems items={charge.items} total={charge.amount} />
        </div>
        <div className="space-y-4">
          {open && charge.pix && charge.method === 'pix' ? <PixPanel pix={charge.pix} compact /> : null}
          {open && charge.boleto && charge.method === 'boleto' ? <BoletoPanel boleto={charge.boleto} /> : null}
          {open && charge.method === 'credit_card' ? (
            <Notice tone="info">Os dados do cartão são digitados na página segura da fatura.</Notice>
          ) : null}
          {open ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="h-12 flex-1 gap-2 rounded-xl text-base font-semibold shadow-md">
                <Link href={href}>
                  Pagar a ativação
                  <ArrowRight className="size-5" aria-hidden />
                </Link>
              </Button>
              {view.canSimulatePayment && key ? (
                <Button type="button" variant="outline" className="h-12 gap-2 rounded-xl" onClick={() => void simulate()} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
                  Simular pagamento
                </Button>
              ) : null}
            </div>
          ) : charge.status === 'paid' ? (
            <Notice tone="success" title="Ativação paga">
              Pagamento confirmado em {formatDateTime(charge.paidAt)}. <Link href={href}>Ver comprovante da fatura</Link>.
            </Notice>
          ) : (
            <Button asChild variant="outline" className="h-11 gap-2 rounded-xl">
              <Link href={href}>
                Ver fatura
                <ExternalLink className="size-4" aria-hidden />
              </Link>
            </Button>
          )}
          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <p className="text-[12px] text-muted-foreground">
            O clube é criado automaticamente assim que o pagamento é confirmado — em segundos no Pix e no cartão.
          </p>
        </div>
      </div>
    </Panel>
  )
}

export function Tracking({ view, proposalId, chave, onViewChange, onReload }: TrackingProps) {
  const [refreshing, setRefreshing] = useState(false)
  const interval = pollInterval(view.status)
  usePolling(() => onReload(), interval ?? 60_000, interval !== null)

  const companyName = view.company?.tradeName || view.company?.legalName || view.receita?.legalName || 'Sua instituição'
  const facts = [
    { label: 'Protocolo', value: <span className="font-mono text-[13px]">{view.code}</span> },
    { label: 'CNPJ', value: formatCnpj(view.cnpj) },
    ...(view.submittedAt ? [{ label: 'Enviada em', value: formatDateTime(view.submittedAt) }] : []),
  ]
  const tone =
    view.status === 'active'
      ? 'success'
      : view.status === 'rejected' || view.status === 'canceled'
        ? 'danger'
        : view.status === 'awaiting_payment'
          ? 'warning'
          : 'brand'

  async function refresh() {
    setRefreshing(true)
    await onReload()
    setRefreshing(false)
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={tone}>{ONBOARDING_STATUS_LABELS[view.status]}</Pill>
            <span className="font-mono text-xs text-muted-foreground">{view.code}</span>
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{companyName}</h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {ONBOARDING_STATUS_APPLICANT_HINTS[view.status]}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden />
          Atualizar
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          {view.status !== 'rejected' && view.status !== 'canceled' ? (
            <Panel>
              <StageTrack view={view} />
            </Panel>
          ) : null}

          {view.status === 'rejected' ? (
            <Notice tone="error" title="A proposta não foi aprovada.">
              {view.rejectionReason ?? 'A análise cadastral não aprovou a contratação.'} Nenhum valor foi cobrado. Se quiser,
              fale com o nosso time comercial pelo contato@annetec.org.br.
            </Notice>
          ) : null}

          {view.status === 'canceled' ? (
            <Notice
              tone="info"
              title="Esta proposta foi cancelada."
              action={
                <Button asChild size="sm" className="rounded-lg">
                  <Link href="/contratar">Nova contratação</Link>
                </Button>
              }
            >
              Nenhum valor foi cobrado. Para contratar a plataforma, comece uma nova proposta.
            </Notice>
          ) : null}

          {view.status === 'submitted' || view.status === 'in_review' ? (
            <Panel>
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700" aria-hidden>
                  <Clock3 className="size-5" />
                </span>
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-foreground">
                    {view.status === 'submitted' ? 'Na fila do compliance' : 'Em análise pela equipe de compliance'}
                  </p>
                  <p className="text-muted-foreground">
                    Conferimos a situação na Receita, o quadro societário, os poderes de representação e os documentos. Se
                    precisarmos de algo, avisamos por e-mail e a pendência aparece aqui. O prazo de resposta é de até 1 dia útil.
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          {view.status === 'approved' && !view.activationCharge ? (
            <Notice tone="success" title="Proposta aprovada!">
              Estamos emitindo a cobrança de ativação. Esta página atualiza sozinha.
            </Notice>
          ) : null}

          {view.activationCharge && view.status !== 'active' ? <ActivationCard view={view} onPaid={() => void onReload()} /> : null}

          {view.status === 'provisioning' ? (
            <Panel className="border-emerald-300">
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700" aria-hidden>
                  <Rocket className="size-6" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Pagamento confirmado — criando o seu clube</p>
                  <p className="text-sm text-muted-foreground">
                    Organização, painel, planos e assinatura estão sendo configurados. Leva poucos segundos.
                  </p>
                </div>
                <Loader2 className="ml-auto size-6 shrink-0 animate-spin text-emerald-600" aria-label="Provisionando" />
              </div>
            </Panel>
          ) : null}

          {view.status === 'active' && view.tenant ? (
            <section className="overflow-hidden rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:from-emerald-500/10 dark:to-transparent">
              <div className="p-5 sm:p-7">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  <PartyPopper className="size-5" aria-hidden />
                  {view.tenant.name} está no ar!
                </p>
                <p className="mt-2 text-sm text-foreground/80">
                  Enviamos para o e-mail do administrador{view.brand?.admin.email ? ` (${view.brand.admin.email})` : ''} o acesso
                  ao painel com uma senha provisória. No primeiro acesso, troque a senha.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button asChild className="h-12 gap-2 rounded-xl text-base font-semibold">
                    <a href={view.tenant.loginUrl}>
                      <LogIn className="size-5" aria-hidden />
                      Entrar no painel
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="h-12 gap-2 rounded-xl bg-background text-base">
                    <a href={view.tenant.siteUrl} target="_blank" rel="noopener noreferrer">
                      <Store className="size-5" aria-hidden />
                      Ver a vitrine do clube
                    </a>
                  </Button>
                </div>
                <p className="mt-3 break-all font-mono text-[12px] text-muted-foreground">{view.tenant.siteUrl}</p>
              </div>
            </section>
          ) : null}

          {view.documents.length ? (
            <Panel>
              <h2 className="font-sans text-sm font-semibold text-foreground">Documentos enviados</h2>
              <ul className="mt-3 divide-y">
                {view.documents
                  .filter(document => document.status !== 'replaced')
                  .map(document => (
                    <li key={document.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                      <span className="font-medium text-foreground">
                        {KYB_DOCUMENT_KIND_LABELS[document.kind]}
                        {document.personName ? ` — ${document.personName}` : ''}
                      </span>
                      <span className="ml-auto">
                        <Pill tone={document.status === 'approved' ? 'success' : document.status === 'rejected' ? 'danger' : 'info'}>
                          {KYB_DOCUMENT_STATUS_LABELS[document.status]}
                        </Pill>
                      </span>
                      {document.status === 'rejected' && document.reviewNote ? (
                        <span className="w-full text-rose-800 dark:text-rose-200">Motivo: {document.reviewNote}</span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <h2 className="font-sans text-sm font-semibold text-foreground">Linha do tempo</h2>
            {view.events.length ? (
              <ol className="mt-4 space-y-4 border-l-2 border-border pl-5">
                {view.events.map(event => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="text-sm font-medium text-foreground">{event.message}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Os acontecimentos da proposta aparecem aqui.</p>
            )}
          </Panel>

          {CANCELABLE.has(view.status) ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Ban className="size-3.5" aria-hidden />
              <CancelProposalButton
                view={view}
                proposalId={proposalId}
                chave={chave}
                onCanceled={next => {
                  onViewChange(next)
                  toast.success('Proposta cancelada')
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <QuoteSummaryCard
            offer={view.plan.offer}
            quote={view.plan.quote}
            method={view.paymentMethod}
            facts={facts}
            title={view.status === 'active' ? 'Sua assinatura ANNETEC' : 'Resumo da contratação'}
          />
          {view.status === 'rejected' || view.status === 'canceled' ? (
            <p className="flex items-center gap-2 px-1 text-[13px] text-muted-foreground">
              <XCircle className="size-4" aria-hidden />
              Proposta encerrada em {formatDateTime(view.updatedAt)}.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
