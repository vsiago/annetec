'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  FlaskConical,
  Link2,
  Loader2,
  LogIn,
  PartyPopper,
  QrCode,
  RefreshCw,
  Smartphone,
} from 'lucide-react'
import {
  DEPENDENT_RELATIONSHIP_LABELS,
  formatBRL,
  formatBoletoLine,
  formatDateBR,
  type CheckoutContext,
  type CheckoutStatus,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { boletoPagePath, firstChargeBreakdown } from '@/lib/adapters/checkout'
import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CopyButton } from './copy-button'
import { MembershipCard } from './membership-card'

// ---------------------------------------------------------------------------
// Blocos comuns
// ---------------------------------------------------------------------------

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Validade do Pix: data se faltar mais de 24h; senão contagem em h/min. */
function formatExpiry(expiresAt: number, remaining: number): string {
  const DAY = 24 * 3600 * 1000
  if (remaining > DAY) {
    const date = new Date(expiresAt)
    const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `Válido até ${day} às ${time}`
  }
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `Expira em ${hours}h ${minutes}min`
  return `Expira em ${minutes} min`
}

export function PanelCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-3xl border bg-card p-5 shadow-sm sm:p-7', className)}>{children}</section>
}

export function WaitingIndicator({ label, stale }: { label: string; stale?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2.5 rounded-full bg-muted/70 px-4 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
      <span className="relative flex size-2.5">
        <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', stale ? 'bg-amber-500' : 'bg-primary')} />
        <span className={cn('relative inline-flex size-2.5 rounded-full', stale ? 'bg-amber-500' : 'bg-primary')} />
      </span>
      {stale ? 'Reconectando ao servidor…' : label}
    </div>
  )
}

export function SimulateBox({
  onSimulate,
  busy,
  hint,
}: {
  onSimulate: () => void
  busy: boolean
  hint?: string | null
}) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-400/70 bg-amber-50/70 p-4 text-center dark:border-amber-500/40 dark:bg-amber-950/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
        Ambiente de testes
      </p>
      {hint ? <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-100/80">{hint}</p> : null}
      <Button
        type="button"
        variant="outline"
        onClick={onSimulate}
        disabled={busy}
        className="mt-3 h-11 rounded-xl border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-100"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
        Simular pagamento (teste)
      </Button>
    </div>
  )
}

function AmountHeader({ status, eyebrow, title, subtitle }: { status: CheckoutStatus; eyebrow: string; title: string; subtitle?: ReactNode }) {
  // Valor da cobrança REAL (a 1ª, com a adesão quando houver) e a mensalidade que vale depois.
  const first = firstChargeBreakdown(status)
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      <p className="mt-4 font-display text-4xl font-extrabold tracking-tight text-foreground">{formatBRL(first.total)}</p>
      <p className="text-sm text-muted-foreground">
        {status.planName} ·{' '}
        {first.enrollmentFee > 0
          ? `1ª mensalidade ${formatBRL(first.monthly)} + adesão ${formatBRL(first.enrollmentFee)}`
          : '1ª mensalidade'}
      </p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Depois: <span className="font-medium text-foreground">{formatBRL(first.monthly)}/mês</span>
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pix
// ---------------------------------------------------------------------------

interface PixPanelProps {
  status: CheckoutStatus
  context: CheckoutContext | null
  stale: boolean
  simulating: boolean
  onSimulate: () => void
  onRegenerate: () => void
  regenerating: boolean
  footer?: ReactNode
}

export function PixPanel({ status, context, stale, simulating, onSimulate, onRegenerate, regenerating, footer }: PixPanelProps) {
  const pix = status.charge.pix
  const now = useNow(1000)
  const expiresAt = pix?.expiresAt ? Date.parse(pix.expiresAt) : null
  const remaining = expiresAt !== null ? expiresAt - now : null
  const expired = remaining !== null && remaining <= 0
  const autoSeconds = context?.simulation?.pixApproveSeconds ?? 0

  return (
    <PanelCard>
      <AmountHeader
        status={status}
        eyebrow="Falta só o Pix"
        title={`${status.holderFirstName}, pague o Pix para ativar sua assinatura`}
        subtitle="Assim que o pagamento cair, esta tela se atualiza sozinha e suas carteirinhas são emitidas na hora."
      />

      {expired ? (
        <div className="mt-6 space-y-3 rounded-2xl bg-amber-50 p-5 text-center dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-100">Este código Pix expirou</p>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">Gere um novo código — leva um segundo.</p>
          <Button type="button" onClick={onRegenerate} disabled={regenerating} className="h-11 rounded-xl">
            {regenerating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            Gerar novo Pix
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="order-2 mx-auto flex flex-col items-center gap-2 sm:order-1">
            <div className="rounded-2xl border-2 border-primary/20 bg-white p-3 shadow-sm">
              {pix?.qrCodeBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${pix.qrCodeBase64}`}
                  alt="QR Code do Pix para pagamento"
                  className="size-52 [image-rendering:pixelated] sm:size-56"
                />
              ) : (
                <div className="flex size-52 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground sm:size-56">
                  <QrCode className="size-10" aria-hidden />
                  Use o código copia e cola
                </div>
              )}
            </div>
            {remaining !== null && expiresAt !== null ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="off">
                <Clock className="size-3.5" aria-hidden />
                <span className="font-semibold text-foreground">{formatExpiry(expiresAt, remaining)}</span>
              </p>
            ) : null}
          </div>

          <div className="order-1 min-w-0 space-y-4 sm:order-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">Pix copia e cola</p>
              <div className="rounded-xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all text-foreground/80 select-all">
                {pix?.payload ?? '—'}
              </div>
              {pix?.payload ? (
                <CopyButton
                  value={pix.payload}
                  label="Copiar código Pix"
                  copiedLabel="Código copiado!"
                  successMessage="Código Pix copiado. Cole no app do seu banco."
                  variant="default"
                  className="mt-3 h-12 w-full rounded-xl text-base font-semibold"
                />
              ) : null}
            </div>
            <ol className="space-y-2 text-sm text-foreground/85">
              <li className="flex gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  Abra o app do seu banco e escolha <strong className="font-semibold">Pix</strong>.
                </span>
              </li>
              <li className="flex gap-2">
                <QrCode className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Leia o QR Code ou cole o código copiado.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Confira o valor e confirme. Pronto!
              </li>
            </ol>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {!expired ? <WaitingIndicator label="Aguardando o pagamento — esta tela atualiza sozinha" stale={stale} /> : null}
        {status.canSimulatePayment && !expired ? (
          <SimulateBox
            onSimulate={onSimulate}
            busy={simulating}
            hint={autoSeconds > 0 ? `O Pix de teste é confirmado sozinho em cerca de ${autoSeconds} s — ou clique abaixo.` : null}
          />
        ) : null}
        {footer}
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// Boleto
// ---------------------------------------------------------------------------

interface BoletoPanelProps {
  slug: string
  chave: string
  status: CheckoutStatus
  context: CheckoutContext | null
  stale: boolean
  simulating: boolean
  onSimulate: () => void
  footer?: ReactNode
}

export function BoletoPanel({ slug, chave, status, context, stale, simulating, onSimulate, footer }: BoletoPanelProps) {
  const charge = status.charge
  const line = charge.boleto?.identificationField ?? ''
  // No modo simulado a página imprimível é desta mesma aplicação: monta o
  // caminho local em vez de confiar no `WEB_BASE_URL` da API.
  const href =
    charge.gatewayProvider === 'simulated'
      ? boletoPagePath(slug, status.subscriptionId, charge.id, chave)
      : (charge.boleto?.url ?? charge.invoiceUrl)
  const autoSeconds = context?.simulation?.boletoApproveSeconds ?? 0
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.href), [])

  return (
    <PanelCard>
      <AmountHeader
        status={status}
        eyebrow="Boleto gerado"
        title={`Tudo certo, ${status.holderFirstName}! Agora é só pagar o boleto`}
        subtitle={
          <>
            Vencimento em <strong className="text-foreground">{formatDateBR(charge.dueDate)}</strong>. Após a compensação
            (até 3 dias úteis), sua assinatura é ativada e as carteirinhas ficam disponíveis.
          </>
        }
      />

      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-foreground">Linha digitável</p>
        <div className="rounded-xl border bg-muted/40 p-4 text-center font-mono text-[13px] leading-relaxed tracking-wide break-all text-foreground select-all sm:text-sm">
          {line ? formatBoletoLine(line) : 'Gerando…'}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {line ? (
            <CopyButton
              value={line}
              label="Copiar linha digitável"
              copiedLabel="Linha copiada!"
              successMessage="Linha digitável copiada. Cole no app do seu banco."
              variant="default"
              className="h-12 rounded-xl text-base font-semibold"
            />
          ) : null}
          {href ? (
            <Button asChild variant="outline" className="h-12 rounded-xl text-base">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Abrir boleto para imprimir
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <WaitingIndicator label="Aguardando a compensação — esta tela atualiza sozinha" stale={stale} />
        <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="space-y-2">
            <p>Você pode fechar esta página: a ativação acontece automaticamente assim que o banco confirmar.</p>
            {origin ? (
              <CopyButton
                value={origin}
                label="Copiar link de acompanhamento"
                copiedLabel="Link copiado!"
                variant="ghost"
                className="-ml-3 h-9 rounded-lg text-primary hover:text-primary"
              />
            ) : null}
          </div>
        </div>
        {status.canSimulatePayment ? (
          <SimulateBox
            onSimulate={onSimulate}
            busy={simulating}
            hint={
              autoSeconds > 0
                ? `O boleto de teste compensa sozinho em cerca de ${Math.max(1, Math.round(autoSeconds / 60))} min — ou clique abaixo.`
                : 'O boleto de teste só compensa por este botão.'
            }
          />
        ) : null}
        {footer}
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
// Sucesso
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['var(--primary)', 'var(--secondary)', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

function Confetti() {
  const reduceMotion = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, index) => ({
        angle: (index / 36) * Math.PI * 2 + Math.random() * 0.35,
        distance: 110 + Math.random() * 140,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        spin: 180 + Math.random() * 360,
        round: index % 3 === 0,
        delay: Math.random() * 0.15,
      })),
    [],
  )
  if (reduceMotion) return null
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-10 size-0" aria-hidden>
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute block"
          style={{
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 0.45,
            background: piece.color,
            borderRadius: piece.round ? 9999 : 2,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{
            x: Math.cos(piece.angle) * piece.distance,
            y: Math.sin(piece.angle) * piece.distance + 90,
            opacity: 0,
            rotate: piece.spin,
            scale: 1,
          }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 + piece.delay }}
        />
      ))}
    </div>
  )
}

function SuccessMark() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 14 }}
      className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_12px_40px_-8px_rgba(16,185,129,0.6)]"
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40 [animation-iteration-count:2]" aria-hidden />
      <svg viewBox="0 0 24 24" className="relative size-10" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduceMotion ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, delay: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  )
}

interface SuccessPanelProps {
  slug: string
  tenant: Tenant
  status: CheckoutStatus
  holderName?: string
  /** CPF e e-mail usados no checkout (só em memória) — lembrete para o login do portal. */
  loginHint?: { email: string; cpf: string }
  signedIn: boolean
  celebrate: boolean
}

export function SuccessPanel({ slug, tenant, status, holderName, loginHint, signedIn, celebrate }: SuccessPanelProps) {
  const [going, setGoing] = useState(false)
  const members = [
    { name: holderName || status.holderFirstName, cardNumber: status.cardNumber, role: 'Titular' },
    ...status.dependents.map(dependent => ({
      name: dependent.name,
      cardNumber: dependent.cardNumber,
      role: DEPENDENT_RELATIONSHIP_LABELS[dependent.relationship],
    })),
  ]

  const openArea = () => {
    setGoing(true)
    // Navegação completa: o AuthProvider do layout relê a sessão recém-aberta.
    window.location.assign(`/${slug}/cliente`)
  }

  return (
    <div className="relative">
      {celebrate ? <Confetti /> : null}
      <PanelCard className="relative overflow-hidden text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-50 to-transparent dark:from-emerald-950/30" aria-hidden />
        <div className="relative">
          <SuccessMark />
          <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <PartyPopper className="size-4" aria-hidden />
            Assinatura confirmada
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Bem-vindo(a) ao {tenant.name}, {status.holderFirstName}!
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Pagamento de <strong className="text-foreground">{formatBRL(status.charge.paidAmount ?? status.charge.amount)}</strong>
            {firstChargeBreakdown(status).enrollmentFee > 0 ? ' (1ª mensalidade + adesão)' : ''} confirmado.{' '}
            {members.length > 1 ? 'Suas carteirinhas digitais já estão ativas' : 'Sua carteirinha digital já está ativa'} —
            é só apresentar na rede credenciada.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Próximas mensalidades: <strong className="text-foreground">{formatBRL(status.amount)}/mês</strong>.
          </p>
        </div>

        <div className={cn('relative mx-auto mt-8 grid gap-4 text-left', members.length > 1 ? 'sm:grid-cols-2' : 'max-w-sm')}>
          {members.map((member, index) => (
            <div key={`${member.role}-${index}`} className="space-y-2">
              <MembershipCard
                tenant={tenant}
                name={member.name}
                cardNumber={member.cardNumber}
                planName={status.planName}
                role={member.role}
                index={index}
              />
              {member.cardNumber ? (
                <CopyButton
                  value={member.cardNumber}
                  label={`Copiar nº ${member.cardNumber}`}
                  copiedLabel="Número copiado!"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full rounded-lg text-xs text-muted-foreground"
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="relative mx-auto mt-8 max-w-sm space-y-3">
          {signedIn ? (
            <Button type="button" size="lg" onClick={openArea} disabled={going} className="h-12 w-full rounded-xl text-base font-semibold shadow-md">
              {going ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              Acessar minha área
              {!going ? <ArrowRight className="size-5" aria-hidden /> : null}
            </Button>
          ) : (
            <>
              <Button asChild size="lg" className="h-12 w-full rounded-xl text-base font-semibold shadow-md">
                <Link href={`/${slug}/login`}>
                  <LogIn className="size-5" aria-hidden />
                  Acessar minha área
                </Link>
              </Button>
              {loginHint ? (
                <div className="rounded-xl bg-muted/60 px-4 py-3 text-left text-sm text-muted-foreground">
                  <p>Entre sem senha, com os dados que você cadastrou:</p>
                  <p className="mt-1">
                    CPF <strong className="font-mono text-foreground">{loginHint.cpf}</strong>
                  </p>
                  <p className="break-all">
                    E-mail <strong className="text-foreground">{loginHint.email}</strong>
                  </p>
                  <p className="mt-2">
                    Se esse e-mail for uma conta Google, também dá para entrar com <strong className="text-foreground">Google</strong>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Entre com o seu <strong className="text-foreground">CPF e e-mail</strong> cadastrados — sem senha. Ou entre com{' '}
                  <strong className="text-foreground">Google</strong>, usando o mesmo e-mail do cadastro.
                </p>
              )}
            </>
          )}
          <Button asChild variant="ghost" className="h-11 w-full rounded-xl">
            <Link href={`/${slug}`}>Voltar ao site</Link>
          </Button>
        </div>
      </PanelCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estados simples
// ---------------------------------------------------------------------------

export function MessagePanel({
  icon,
  tone = 'neutral',
  title,
  children,
  actions,
}: {
  icon: ReactNode
  tone?: 'neutral' | 'danger' | 'warning' | 'progress'
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  const toneClass = {
    neutral: 'bg-muted text-foreground',
    danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    progress: 'bg-primary/10 text-primary',
  }[tone]
  return (
    <PanelCard className="text-center">
      <div className={cn('mx-auto flex size-16 items-center justify-center rounded-2xl', toneClass)}>{icon}</div>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {children ? <div className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted-foreground">{children}</div> : null}
      {actions ? <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">{actions}</div> : null}
    </PanelCard>
  )
}

export function ConfirmingPanel({ title, text, stale }: { title: string; text: string; stale: boolean }) {
  return (
    <MessagePanel icon={<Loader2 className="size-8 animate-spin" aria-hidden />} tone="progress" title={title}>
      <p>{text}</p>
      <div className="mt-5">
        <WaitingIndicator label="Atualizando automaticamente" stale={stale} />
      </div>
    </MessagePanel>
  )
}

export function TrackingLinkHint() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
      <Link2 className="size-3.5" aria-hidden />
      Guarde o endereço desta página para acompanhar o pedido.
    </p>
  )
}
