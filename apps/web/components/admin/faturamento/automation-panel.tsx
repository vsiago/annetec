'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  BellRing,
  Bot,
  CircleCheckBig,
  CirclePause,
  Hourglass,
  KeyRound,
  LoaderCircle,
  Play,
  ReceiptText,
  RotateCcw,
  Send,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  parseBRL,
  updateBillingSettingsInput,
  type BillingAutomationReport,
  type BillingSettings,
  type ClubPaymentMethod,
  type PaymentGatewayProvider,
  type UpdateBillingSettingsInput,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { FormSelect } from '@/components/dashboard/form-dialog'
import { runBillingAutomationAction, updateBillingSettingsAction } from '@/lib/actions/faturamento-api'
import {
  formatDateTimeBR,
  formatRelative,
  gatewayLabel,
  PAYMENT_METHOD_OPTIONS,
} from '@/lib/adapters/faturamento'
import { isDemoMode } from '@/lib/demo-mode'
import { cn } from '@/lib/utils'
import { GatewayBadge, LoadError } from './billing-ui'
import { EventsFeed } from './events-feed'

// ---------------------------------------------------------------------------
// Fluxo automático
// ---------------------------------------------------------------------------

interface FlowStep {
  icon: LucideIcon
  title: string
  text: string
  tone: string
}

function flowSteps(settings: BillingSettings | null): FlowStep[] {
  const s = settings
  const n = (value: number | undefined, fallback: string) => (value === undefined ? fallback : String(value))
  return [
    {
      icon: ReceiptText,
      title: 'Gerar',
      text: `A cobrança do próximo ciclo nasce sozinha ${n(s?.generateDaysBefore, 'alguns')} dias antes do vencimento.`,
      tone: 'bg-primary/10 text-primary',
    },
    {
      icon: Send,
      title: 'Enviar',
      text: 'Pix e boleto são emitidos no gateway na hora; o cartão salvo é cobrado no dia do vencimento.',
      tone: 'bg-primary/10 text-primary',
    },
    {
      icon: BellRing,
      title: 'Lembrar',
      text: `Lembrete automático ${n(s?.reminderDaysBefore, 'alguns')} dias antes de vencer.`,
      tone: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    },
    {
      icon: CircleCheckBig,
      title: 'Confirmar',
      text: 'O gateway avisa o pagamento (webhook) e a baixa é feita sozinha; a carteirinha é liberada.',
      tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      icon: Hourglass,
      title: 'Inadimplência',
      text: `Venceu sem pagar: a assinatura fica em atraso. Cartão recusado ganha até ${n(s?.maxCardRetries, 'algumas')} novas tentativas, a cada ${n(s?.cardRetryIntervalHours, '24')} h.`,
      tone: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
    },
    {
      icon: CirclePause,
      title: 'Suspender',
      text: `Com ${n(s?.suspendAfterDays, 'N')} dias em aberto, as carteirinhas são bloqueadas.`,
      tone: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
    },
    {
      icon: Ban,
      title: 'Cancelar',
      text: `Com ${n(s?.cancelAfterDays, 'N')} dias em aberto, a assinatura é cancelada.`,
      tone: 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
    },
  ]
}

export function AutomationFlow({ settings }: { settings: BillingSettings | null }) {
  const steps = flowSteps(settings)
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-5 w-5 text-primary" />
          Como a cobrança acontece sozinha
        </CardTitle>
        <CardDescription>
          Ninguém da equipe gera boleto, lote ou remessa: o motor de cobrança percorre este ciclo para cada assinante,
          todo dia, com as regras da régua abaixo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.title} className="relative flex gap-3 rounded-xl border border-border bg-card p-3 2xl:flex-col">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', step.tone)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                    {step.title}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
          Pagou depois de vencer? A assinatura volta a ficar ativa sozinha e as carteirinhas são liberadas de novo.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Gateway + executar agora
// ---------------------------------------------------------------------------

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

const REPORT_ITEMS: { key: keyof BillingAutomationReport; label: string }[] = [
  { key: 'synced', label: 'Sincronizadas com o gateway' },
  { key: 'generated', label: 'Cobranças geradas' },
  { key: 'cardCharged', label: 'Cartões cobrados' },
  { key: 'cardFailed', label: 'Cartões recusados' },
  { key: 'remindersSent', label: 'Lembretes enviados' },
  { key: 'markedOverdue', label: 'Marcadas como vencidas' },
  { key: 'suspended', label: 'Assinaturas suspensas' },
  { key: 'canceled', label: 'Assinaturas canceladas' },
  { key: 'reactivated', label: 'Assinaturas reativadas' },
]

export function GatewayAutomationCard({
  tenantSlug,
  settings,
  lastRunAt,
  onRan,
  onOpenReceiving,
}: {
  tenantSlug: string
  settings: BillingSettings | null
  lastRunAt: string | null
  onRan: (report: BillingAutomationReport) => void
  /** Leva à aba "Recebimento", onde a conta Asaas do clube é conectada. */
  onOpenReceiving?: () => void
}) {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<BillingAutomationReport | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  async function runNow() {
    setRunning(true)
    setRunError(null)
    try {
      const result = await runBillingAutomationAction(tenantSlug)
      if (!result.success) {
        setRunError(result.error)
        toast.error('A automação não pôde ser executada', { description: result.error })
        return
      }
      setReport(result.data)
      const changes = REPORT_ITEMS.reduce((sum, item) => sum + Number(result.data[item.key] ?? 0), 0)
      toast.success('Automação executada', {
        description:
          changes === 0
            ? 'Nada pendente — tudo em dia.'
            : `${changes.toLocaleString('pt-BR')} ${changes === 1 ? 'ação realizada' : 'ações realizadas'} em ${result.data.durationMs} ms.`,
      })
      onRan(result.data)
    } finally {
      setRunning(false)
    }
  }

  const provider = settings?.gateway
  const sandbox = settings?.sandbox ?? false
  const lastRun = lastRunAt ?? settings?.automation.lastRunAt ?? null
  const reportChanges = report
    ? REPORT_ITEMS.reduce((sum, item) => sum + Number(report[item.key] ?? 0), 0)
    : 0

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Gateway e automação</CardTitle>
        <CardDescription>Quem processa os pagamentos e quando o motor rodou pela última vez.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <GatewayBadge provider={provider} sandbox={sandbox} className="text-sm" />
              <p className="text-sm text-muted-foreground">
                {!isDemoMode({ gateway: provider, sandbox })
                  ? 'Asaas em produção: cobranças e recebimentos reais.'
                  : provider === 'simulated'
                    ? 'Modo demonstração: nenhum dinheiro real circula. O Pix compensa sozinho em segundos, o boleto em alguns minutos, e "Simular pagamento" confirma na hora.'
                    : 'Asaas em sandbox: cobranças reais do gateway, com dinheiro de teste.'}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" />
                <span>
                  Conta Asaas do clube: {settings.asaasConfigured ? 'conectada' : 'não conectada'}
                  {settings.gatewayOverride
                    ? ` · escolhido para este clube: ${gatewayLabel(settings.gatewayOverride)}`
                    : ' · segue o padrão do servidor'}
                </span>
                {onOpenReceiving && (
                  <button
                    type="button"
                    onClick={onOpenReceiving}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {settings.asaasConfigured ? 'Ver recebimento' : 'Conectar'}
                  </button>
                )}
              </p>
            </div>

            <div
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3',
                settings.automation.enabled
                  ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                  : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
              )}
            >
              <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                {settings.automation.enabled && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-2.5 w-2.5 rounded-full',
                    settings.automation.enabled ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                />
              </span>
              <div className="text-sm">
                <p className="font-semibold text-foreground">
                  {settings.automation.enabled
                    ? `Automação ligada — roda sozinha a cada ${formatInterval(settings.automation.intervalSeconds)}`
                    : 'Automação agendada desligada neste servidor'}
                </p>
                <p className="text-muted-foreground">
                  {lastRun
                    ? `Última execução ${formatRelative(lastRun)} (${formatDateTimeBR(lastRun)})`
                    : 'Ainda não rodou para este clube.'}
                </p>
              </div>
            </div>
          </>
        )}

        <Button className="w-full gap-2" onClick={() => void runNow()} disabled={running || !tenantSlug}>
          {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Executando…' : 'Executar automação agora'}
        </Button>

        {runError && <LoadError message={runError} />}

        {report && (
          <div className="space-y-3 rounded-xl border border-border p-3" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                {reportChanges === 0 ? 'Nada pendente — tudo em dia' : 'Resultado da execução'}
              </p>
              <span className="text-xs text-muted-foreground">
                {formatDateTimeBR(report.ranAt)} · {report.durationMs} ms
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REPORT_ITEMS.map(item => {
                const value = Number(report[item.key] ?? 0)
                return (
                  <div
                    key={item.key}
                    className={cn(
                      'rounded-lg px-2.5 py-2',
                      value > 0 ? 'bg-primary/10' : 'bg-muted/50',
                    )}
                  >
                    <dt className="text-[11px] leading-tight text-muted-foreground">{item.label}</dt>
                    <dd className={cn('text-lg font-bold', value > 0 ? 'text-primary' : 'text-foreground')}>
                      {value.toLocaleString('pt-BR')}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {report.errors.length > 0 && (
              <div className="space-y-1 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="flex items-center gap-1.5 font-semibold">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {report.errors.length} {report.errors.length === 1 ? 'item não processado' : 'itens não processados'} (o
                  restante seguiu normalmente)
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {report.errors.slice(0, 5).map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Régua de cobrança (billing_settings)
// ---------------------------------------------------------------------------

type NumberField =
  | 'generateDaysBefore'
  | 'reminderDaysBefore'
  | 'boletoDueDays'
  | 'maxCardRetries'
  | 'cardRetryIntervalHours'
  | 'suspendAfterDays'
  | 'cancelAfterDays'
  | 'finePercent'
  | 'interestMonthlyPercent'

type FormState = Record<NumberField, string> & {
  enabledMethods: ClubPaymentMethod[]
  gatewayOverride: 'default' | PaymentGatewayProvider
}

const NUMBER_FIELDS: {
  key: NumberField
  label: string
  suffix: string
  hint: string
  min: number
  max: number
  decimal?: boolean
}[] = [
  { key: 'generateDaysBefore', label: 'Gerar a cobrança', suffix: 'dias antes', hint: 'Antecedência da cobrança do próximo ciclo (0 a 30).', min: 0, max: 30 },
  { key: 'reminderDaysBefore', label: 'Lembrete de vencimento', suffix: 'dias antes', hint: '0 desliga o lembrete antecipado (até 15).', min: 0, max: 15 },
  { key: 'boletoDueDays', label: 'Prazo do boleto', suffix: 'dias', hint: 'Vencimento do 1º boleto e da segunda via (1 a 30).', min: 1, max: 30 },
  { key: 'maxCardRetries', label: 'Novas tentativas no cartão', suffix: 'vezes', hint: 'Depois disso a cobrança vence (0 a 10).', min: 0, max: 10 },
  { key: 'cardRetryIntervalHours', label: 'Intervalo entre tentativas', suffix: 'horas', hint: '1 a 168 horas.', min: 1, max: 168 },
  { key: 'suspendAfterDays', label: 'Suspender após', suffix: 'dias', hint: 'Bloqueia as carteirinhas (1 a 180).', min: 1, max: 180 },
  { key: 'cancelAfterDays', label: 'Cancelar após', suffix: 'dias', hint: 'Precisa ser maior que a suspensão (até 365).', min: 2, max: 365 },
  { key: 'finePercent', label: 'Multa por atraso', suffix: '%', hint: 'Até 2% (limite do CDC).', min: 0, max: 2, decimal: true },
  { key: 'interestMonthlyPercent', label: 'Juros ao mês', suffix: '%', hint: 'Até 1% ao mês.', min: 0, max: 1, decimal: true },
]

function toForm(settings: BillingSettings): FormState {
  const decimal = (value: number) => String(value).replace('.', ',')
  return {
    generateDaysBefore: String(settings.generateDaysBefore),
    reminderDaysBefore: String(settings.reminderDaysBefore),
    boletoDueDays: String(settings.boletoDueDays),
    maxCardRetries: String(settings.maxCardRetries),
    cardRetryIntervalHours: String(settings.cardRetryIntervalHours),
    suspendAfterDays: String(settings.suspendAfterDays),
    cancelAfterDays: String(settings.cancelAfterDays),
    finePercent: decimal(settings.finePercent),
    interestMonthlyPercent: decimal(settings.interestMonthlyPercent),
    enabledMethods: [...settings.enabledMethods],
    gatewayOverride: settings.gatewayOverride ?? 'default',
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    NUMBER_FIELDS.every(field => a[field.key].trim() === b[field.key].trim()) &&
    a.gatewayOverride === b.gatewayOverride &&
    [...a.enabledMethods].sort().join() === [...b.enabledMethods].sort().join()
  )
}

export function BillingRulesForm({
  tenantSlug,
  settings,
  loading,
  error,
  onRetry,
  onSaved,
  onOpenReceiving,
}: {
  tenantSlug: string
  settings: BillingSettings | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onSaved: (settings: BillingSettings) => void
  /** Leva à aba "Recebimento", onde a conta Asaas do clube é conectada. */
  onOpenReceiving?: () => void
}) {
  const initial = useMemo(() => (settings ? toForm(settings) : null), [settings])
  const [form, setForm] = useState<FormState | null>(initial)
  const [errors, setErrors] = useState<Partial<Record<NumberField | 'enabledMethods', string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(initial)
    setErrors({})
  }, [initial])

  if (!settings || !form || !initial) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Régua de cobrança</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !loading ? (
            <LoadError message={error} onRetry={onRetry} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const dirty = !sameForm(form, initial)
  const demo = isDemoMode({ gateway: settings.gateway, sandbox: settings.sandbox })

  function setField(key: NumberField, value: string) {
    setForm(previous => (previous ? { ...previous, [key]: value } : previous))
    setErrors(previous => ({ ...previous, [key]: undefined }))
  }

  function toggleMethod(method: ClubPaymentMethod, checked: boolean) {
    setForm(previous => {
      if (!previous) return previous
      const set = new Set(previous.enabledMethods)
      if (checked) set.add(method)
      else set.delete(method)
      return { ...previous, enabledMethods: PAYMENT_METHOD_OPTIONS.map(o => o.value).filter(m => set.has(m)) }
    })
    setErrors(previous => ({ ...previous, enabledMethods: undefined }))
  }

  async function save() {
    if (!form) return
    const nextErrors: typeof errors = {}
    const payload: UpdateBillingSettingsInput = {
      gatewayOverride: form.gatewayOverride === 'default' ? null : form.gatewayOverride,
      enabledMethods: form.enabledMethods,
    }

    for (const field of NUMBER_FIELDS) {
      const raw = form[field.key].trim()
      const value = field.decimal ? parseBRL(raw) : raw === '' ? null : Number(raw)
      if (value === null || !Number.isFinite(value) || (!field.decimal && !Number.isInteger(value))) {
        nextErrors[field.key] = field.decimal ? 'Informe um número.' : 'Informe um número inteiro.'
        continue
      }
      if (value < field.min || value > field.max) {
        nextErrors[field.key] = `Use um valor entre ${field.min} e ${field.max}.`
        continue
      }
      payload[field.key] = value
    }

    if (form.enabledMethods.length === 0) nextErrors.enabledMethods = 'Deixe ao menos uma forma de pagamento.'
    if (
      payload.cancelAfterDays !== undefined &&
      payload.suspendAfterDays !== undefined &&
      payload.cancelAfterDays <= payload.suspendAfterDays
    ) {
      nextErrors.cancelAfterDays = 'O cancelamento precisa vir depois da suspensão.'
    }

    const parsed = updateBillingSettingsInput.safeParse(payload)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as NumberField | 'enabledMethods' | undefined
        if (key && !nextErrors[key]) nextErrors[key] = issue.message
      }
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast.error('Confira a régua', { description: 'Há campos com valor fora do permitido.' })
      return
    }

    setSaving(true)
    try {
      const result = await updateBillingSettingsAction(tenantSlug, payload)
      if (!result.success) {
        if (result.fieldErrors) {
          setErrors(previous => ({ ...previous, ...(result.fieldErrors as typeof errors) }))
        }
        toast.error('Não foi possível salvar a régua', { description: result.error })
        return
      }
      toast.success('Régua de cobrança atualizada', {
        description: 'A automação passa a usar as novas regras na próxima execução.',
      })
      onSaved(result.data)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Régua de cobrança</CardTitle>
        <CardDescription>
          As regras que a automação segue para cada assinante. Mudou aqui, vale na próxima execução.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {NUMBER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`regua-${field.key}`} className="text-sm font-medium">
                {field.label}
              </Label>
              <div className="relative">
                <Input
                  id={`regua-${field.key}`}
                  inputMode={field.decimal ? 'decimal' : 'numeric'}
                  value={form[field.key]}
                  onChange={event => setField(field.key, event.target.value)}
                  aria-invalid={!!errors[field.key]}
                  className="pr-24"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {field.suffix}
                </span>
              </div>
              {errors[field.key] ? (
                <p className="text-xs text-destructive">{errors[field.key]}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Formas de pagamento aceitas</p>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_METHOD_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={form.enabledMethods.includes(option.value)}
                    onCheckedChange={checked => toggleMethod(option.value, checked === true)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {errors.enabledMethods ? (
              <p className="text-xs text-destructive">{errors.enabledMethods}</p>
            ) : (
              <p className="text-xs text-muted-foreground">O que o checkout oferece a novos assinantes.</p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Gateway deste clube</p>
            <FormSelect
              value={form.gatewayOverride}
              onChange={value =>
                setForm(previous =>
                  previous ? { ...previous, gatewayOverride: value as FormState['gatewayOverride'] } : previous,
                )
              }
              placeholder="Padrão do servidor"
              options={[
                { value: 'default', label: 'Padrão do servidor' },
                // "Simulado" só existe em demonstração (gateway simulado/sandbox); em produção, só Asaas.
                ...(demo ? [{ value: 'simulated', label: 'Simulado (demonstração)' }] : []),
                // O Asaas é a conta PRÓPRIA do clube: sem ela conectada a API recusa a escolha.
                // Se já era a escolha gravada, a opção continua visível para o select mostrar o valor atual.
                {
                  value: 'asaas',
                  label: settings.asaasConfigured ? 'Asaas' : 'Asaas (conecte a conta do clube)',
                  disabled: !settings.asaasConfigured && form.gatewayOverride !== 'asaas',
                },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {settings.asaasConfigured ? (
                'Vale para as próximas cobranças; as já emitidas seguem no gateway de origem.'
              ) : (
                <>
                  Para usar o Asaas, o clube precisa ter a própria conta conectada.{' '}
                  {onOpenReceiving && (
                    <button
                      type="button"
                      onClick={onOpenReceiving}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Conectar na aba Recebimento
                    </button>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {dirty && <span className="mr-auto text-xs text-muted-foreground">Alterações não salvas</span>}
          <Button
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => {
              setForm(initial)
              setErrors({})
            }}
          >
            Descartar
          </Button>
          <Button className="gap-2" disabled={!dirty || saving} onClick={() => void save()}>
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Salvar régua
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aba completa
// ---------------------------------------------------------------------------

export function AutomationPanel({
  tenantSlug,
  settings,
  settingsLoading,
  settingsError,
  onReloadSettings,
  onSettingsSaved,
  lastRunAt,
  onRan,
  version,
  onOpenReceiving,
}: {
  tenantSlug: string
  settings: BillingSettings | null
  settingsLoading: boolean
  settingsError: string | null
  onReloadSettings: () => void
  onSettingsSaved: (settings: BillingSettings) => void
  lastRunAt: string | null
  onRan: (report: BillingAutomationReport) => void
  version: number
  onOpenReceiving?: () => void
}) {
  return (
    <div className="space-y-5">
      <AutomationFlow settings={settings} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <GatewayAutomationCard
            tenantSlug={tenantSlug}
            settings={settings}
            lastRunAt={lastRunAt}
            onRan={onRan}
            onOpenReceiving={onOpenReceiving}
          />
        </div>
        <div className="xl:col-span-8">
          <BillingRulesForm
            tenantSlug={tenantSlug}
            settings={settings}
            loading={settingsLoading}
            error={settingsError}
            onRetry={onReloadSettings}
            onSaved={onSettingsSaved}
            onOpenReceiving={onOpenReceiving}
          />
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Linha do tempo dos pagamentos</CardTitle>
          <CardDescription>
            Tudo o que o motor e o gateway fizeram, com a origem de cada evento: webhook, automação, checkout, equipe
            ou simulação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventsFeed tenantSlug={tenantSlug} version={version} />
        </CardContent>
      </Card>
    </div>
  )
}
