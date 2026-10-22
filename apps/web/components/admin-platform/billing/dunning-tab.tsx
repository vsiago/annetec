'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, Play, Save, ShieldAlert, Undo2 } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  validatePlatformDunningOrder,
  type ClubPaymentMethod,
  type PaymentGatewayProvider,
  type PlatformBillingAutomationReport,
  type PlatformBillingSettings,
  type UpdatePlatformBillingSettingsInput,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, SuperadminOnly, runCommand } from '@/components/admin-platform/billing/console-kit'
import { GatewayBadge } from '@/components/admin/faturamento/billing-ui'
import { updatePlatformBillingSettingsAction } from '@/lib/actions/platform-billing-api'
import {
  dunningSteps,
  formatDateTimeBR,
  formatRelative,
  formatRelativeDay,
  toneClass,
} from '@/lib/adapters/platform-console'
import { isDemoMode } from '@/lib/demo-mode'
import { cn } from '@/lib/utils'

/**
 * Régua da plataforma (linha única `platform_billing_settings`): o desenho dos
 * degraus, o formulário (só o superadmin grava — a API valida a ordem
 * restrição < suspensão < cancelamento no merge) e a automação com o último
 * relatório de execução.
 */

type NumericKey =
  | 'generateDaysBefore'
  | 'reminderDaysBefore'
  | 'restrictAfterDays'
  | 'suspendAfterDays'
  | 'cancelAfterDays'
  | 'boletoDueDays'
  | 'finePercent'
  | 'interestMonthlyPercent'
  | 'maxCardRetries'
  | 'cardRetryIntervalHours'
  | 'activationExpiryDays'
  | 'draftExpiryDays'

const FIELDS: { key: NumericKey; label: string; hint: string; min: number; max: number; step?: number; suffix: string }[] = [
  { key: 'generateDaysBefore', label: 'Gerar a fatura', hint: 'dias antes do vencimento', min: 0, max: 30, suffix: 'dias antes' },
  { key: 'reminderDaysBefore', label: 'Lembrete', hint: 'dias antes do vencimento', min: 0, max: 15, suffix: 'dias antes' },
  { key: 'boletoDueDays', label: 'Prazo de boleto/Pix', hint: 'para ativação e 2ª via', min: 1, max: 30, suffix: 'dias' },
  { key: 'restrictAfterDays', label: 'Somente leitura', hint: 'dias de atraso', min: 1, max: 90, suffix: 'dias de atraso' },
  { key: 'suspendAfterDays', label: 'Bloquear o painel', hint: 'dias de atraso', min: 2, max: 180, suffix: 'dias de atraso' },
  { key: 'cancelAfterDays', label: 'Cancelar a assinatura', hint: 'dias de atraso', min: 3, max: 365, suffix: 'dias de atraso' },
  { key: 'finePercent', label: 'Multa', hint: 'sobre a fatura vencida', min: 0, max: 2, step: 0.1, suffix: '%' },
  { key: 'interestMonthlyPercent', label: 'Juros', hint: 'ao mês', min: 0, max: 1, step: 0.1, suffix: '% a.m.' },
  { key: 'maxCardRetries', label: 'Retentativas no cartão', hint: 'antes de vencer', min: 0, max: 10, suffix: 'vezes' },
  { key: 'cardRetryIntervalHours', label: 'Intervalo entre tentativas', hint: 'no cartão', min: 1, max: 168, suffix: 'horas' },
  { key: 'activationExpiryDays', label: 'Ativação sem pagamento', hint: 'cancela a proposta aprovada', min: 1, max: 60, suffix: 'dias' },
  { key: 'draftExpiryDays', label: 'Rascunho parado', hint: 'cancela a proposta em preenchimento', min: 1, max: 180, suffix: 'dias' },
]

const GROUPS: { title: string; keys: NumericKey[] }[] = [
  { title: 'Emissão', keys: ['generateDaysBefore', 'reminderDaysBefore', 'boletoDueDays'] },
  { title: 'Degraus da inadimplência', keys: ['restrictAfterDays', 'suspendAfterDays', 'cancelAfterDays'] },
  { title: 'Multa, juros e cartão', keys: ['finePercent', 'interestMonthlyPercent', 'maxCardRetries', 'cardRetryIntervalHours'] },
  { title: 'Prazos da contratação', keys: ['activationExpiryDays', 'draftExpiryDays'] },
]

type FormState = Record<NumericKey, string> & {
  enabledMethods: ClubPaymentMethod[]
  gatewayOverride: 'auto' | PaymentGatewayProvider
}

function toForm(settings: PlatformBillingSettings): FormState {
  const form = {} as FormState
  for (const field of FIELDS) form[field.key] = String(settings[field.key]).replace('.', ',')
  form.enabledMethods = [...settings.enabledMethods]
  form.gatewayOverride = settings.gatewayOverride ?? 'auto'
  return form
}

function parse(value: string): number {
  return Number(value.replace(',', '.'))
}

export function DunningLadder({
  settings,
  highlightDay,
  className,
}: {
  settings: Pick<
    PlatformBillingSettings,
    'generateDaysBefore' | 'reminderDaysBefore' | 'restrictAfterDays' | 'suspendAfterDays' | 'cancelAfterDays'
  >
  /** Marca "você está aqui" (dias em relação ao vencimento mais antigo em aberto). */
  highlightDay?: number | null
  className?: string
}) {
  const steps = dunningSteps(settings)
  const currentIndex =
    highlightDay === null || highlightDay === undefined ? -1 : steps.reduce((acc, step, index) => (highlightDay >= step.day ? index : acc), -1)
  return (
    <ol className={cn('grid gap-2 sm:grid-cols-3 xl:grid-cols-6', className)}>
      {steps.map((step, index) => {
        const reached = currentIndex >= index
        const current = currentIndex === index
        return (
          <li
            key={step.key}
            className={cn(
              'relative rounded-xl border p-3 transition-colors',
              current ? 'border-primary shadow-sm ring-2 ring-primary/15' : 'border-border',
              reached && !current && 'bg-muted/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold', toneClass(step.tone))}>
                {formatRelativeDay(step.day)}
              </span>
              {current && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Agora</span>}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{step.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
          </li>
        )
      })}
    </ol>
  )
}

export function AutomationReportView({ report }: { report: PlatformBillingAutomationReport }) {
  const items: [string, number][] = [
    ['Sincronizadas', report.synced],
    ['Faturas geradas', report.generated],
    ['Cartões cobrados', report.cardCharged],
    ['Cartões recusados', report.cardFailed],
    ['Lembretes', report.remindersSent],
    ['Vencidas', report.markedOverdue],
    ['Em atraso', report.pastDue],
    ['Somente leitura', report.restricted],
    ['Bloqueadas', report.suspended],
    ['Canceladas', report.canceled],
    ['Reativadas', report.reactivated],
    ['Overrides expirados', report.overridesExpired],
    ['Propostas expiradas', report.proposalsExpired],
  ]
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Rodou {formatRelative(report.ranAt)} · {formatDateTimeBR(report.ranAt)} · {report.durationMs} ms
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div
            key={label}
            className={cn('rounded-lg border px-3 py-2', value > 0 ? 'border-primary/30 bg-primary/5' : 'border-border')}
          >
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={cn('text-lg font-semibold tabular-nums', value > 0 ? 'text-foreground' : 'text-muted-foreground')}>{value}</dd>
          </div>
        ))}
      </dl>
      {report.errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {report.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DunningTab({
  settings,
  error,
  onRetry,
  isSuperadmin,
  onSaved,
  lastReport,
  running,
  onRunAutomation,
}: {
  settings: PlatformBillingSettings | null
  error: string | null
  onRetry: () => void
  isSuperadmin: boolean
  onSaved: (settings: PlatformBillingSettings) => void
  lastReport: PlatformBillingAutomationReport | null
  running: boolean
  onRunAutomation: () => void
}) {
  const [form, setForm] = useState<FormState | null>(settings ? toForm(settings) : null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setForm(toForm(settings))
  }, [settings])

  const diff = useMemo<UpdatePlatformBillingSettingsInput>(() => {
    if (!settings || !form) return {}
    const changes: UpdatePlatformBillingSettingsInput = {}
    for (const field of FIELDS) {
      const value = parse(form[field.key])
      if (Number.isFinite(value) && value !== settings[field.key]) {
        ;(changes as Record<string, number>)[field.key] = value
      }
    }
    const methods = [...form.enabledMethods].sort()
    if (methods.join(',') !== [...settings.enabledMethods].sort().join(',')) changes.enabledMethods = form.enabledMethods
    const override = form.gatewayOverride === 'auto' ? null : form.gatewayOverride
    if (override !== settings.gatewayOverride) changes.gatewayOverride = override
    return changes
  }, [form, settings])

  if (error && !settings) return <LoadError message={error} onRetry={onRetry} />
  if (!settings || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  const demo = isDemoMode({
    gateway: settings.gateway,
    sandbox: settings.sandbox,
    demoToolsEnabled: settings.demoToolsEnabled,
  })

  const invalidFields = FIELDS.filter(field => {
    const value = parse(form[field.key])
    const integer = !field.step
    return !Number.isFinite(value) || value < field.min || value > field.max || (integer && !Number.isInteger(value))
  })
  const orderError =
    invalidFields.length === 0
      ? validatePlatformDunningOrder({
          restrictAfterDays: parse(form.restrictAfterDays),
          suspendAfterDays: parse(form.suspendAfterDays),
          cancelAfterDays: parse(form.cancelAfterDays),
        })
      : null
  const methodsError = form.enabledMethods.length === 0 ? 'Mantenha ao menos um meio de pagamento' : null
  const dirty = Object.keys(diff).length > 0
  const canSave = isSuperadmin && dirty && invalidFields.length === 0 && !orderError && !methodsError && !saving

  const preview = {
    generateDaysBefore: parse(form.generateDaysBefore) || 0,
    reminderDaysBefore: parse(form.reminderDaysBefore) || 0,
    restrictAfterDays: parse(form.restrictAfterDays) || 0,
    suspendAfterDays: parse(form.suspendAfterDays) || 0,
    cancelAfterDays: parse(form.cancelAfterDays) || 0,
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const updated = await runCommand(updatePlatformBillingSettingsAction(diff), 'Régua da plataforma atualizada')
    setSaving(false)
    if (updated) onSaved(updated)
  }

  const set = (key: NumericKey, value: string) => setForm(current => (current ? { ...current, [key]: value } : current))
  const toggleMethod = (method: ClubPaymentMethod, checked: boolean) =>
    setForm(current =>
      current
        ? {
            ...current,
            enabledMethods: checked
              ? [...new Set([...current.enabledMethods, method])]
              : current.enabledMethods.filter(item => item !== method),
          }
        : current,
    )

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Como a régua anda</CardTitle>
          <CardDescription>
            Contado a partir do vencimento da fatura em aberto mais antiga. Associados, vitrine e portal do clube nunca são afetados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DunningLadder settings={preview} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Configuração da régua</CardTitle>
            <CardDescription>
              {isSuperadmin ? 'Vale para todas as assinaturas de plataforma a partir da próxima rodada da automação.' : 'Somente o superadmin altera a régua.'}
            </CardDescription>
            {dirty && isSuperadmin && (
              <CardAction>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setForm(toForm(settings))} disabled={saving}>
                  <Undo2 className="h-4 w-4" />
                  Descartar
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {GROUPS.map(group => (
              <fieldset key={group.title} className="space-y-3" disabled={!isSuperadmin}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.keys.map(key => {
                    const field = FIELDS.find(item => item.key === key)!
                    const invalid = invalidFields.includes(field)
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label htmlFor={`regua-${key}`}>{field.label}</Label>
                        <div className="relative">
                          <Input
                            id={`regua-${key}`}
                            inputMode={field.step ? 'decimal' : 'numeric'}
                            value={form[key]}
                            onChange={event => set(key, event.target.value)}
                            aria-invalid={invalid}
                            className={cn('pr-24', invalid && 'border-destructive')}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {field.suffix}
                          </span>
                        </div>
                        <p className={cn('text-[11px]', invalid ? 'text-destructive' : 'text-muted-foreground')}>
                          {invalid ? `Entre ${field.min} e ${field.max}${field.step ? '' : ' (inteiro)'}` : field.hint}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            ))}

            <fieldset className="space-y-3" disabled={!isSuperadmin}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meios e gateway</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(CLUB_PAYMENT_METHOD_LABELS) as ClubPaymentMethod[]).map(method => (
                  <label key={method} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.enabledMethods.includes(method)}
                      onCheckedChange={value => toggleMethod(method, value === true)}
                      disabled={!isSuperadmin}
                    />
                    {CLUB_PAYMENT_METHOD_LABELS[method]}
                  </label>
                ))}
              </div>
              <div className="max-w-sm space-y-1.5">
                <Label>Gateway da plataforma</Label>
                <Select
                  value={form.gatewayOverride}
                  onValueChange={value => setForm(current => (current ? { ...current, gatewayOverride: value as FormState['gatewayOverride'] } : current))}
                  disabled={!isSuperadmin}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (variável de ambiente)</SelectItem>
                    {/* "Simulado" só em demonstração (gateway simulado/sandbox/ferramentas de demo); em produção, só Asaas. */}
                    {demo && <SelectItem value="simulated">Simulado (demonstração)</SelectItem>}
                    <SelectItem value="asaas" disabled={!settings.asaasConfigured}>
                      Asaas{settings.asaasConfigured ? (settings.sandbox ? ' · sandbox' : '') : ' (sem chave configurada)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {(orderError || methodsError) && (
              <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {orderError ?? methodsError}
              </p>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <SuperadminOnly isSuperadmin={isSuperadmin}>
                <Button onClick={save} disabled={!canSave} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar régua
                </Button>
              </SuperadminOnly>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-muted-foreground" />
              Automação
            </CardTitle>
            <CardDescription>
              {settings.automation.enabled
                ? `Roda sozinha a cada ${settings.automation.intervalSeconds} s: sincroniza, gera ciclos, lembra, vence e aplica os degraus.`
                : 'Timer automático desligado neste servidor — rode manualmente.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <GatewayBadge provider={settings.gateway} sandbox={settings.sandbox} />
              {settings.demoToolsEnabled && demo && (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                  Ferramentas de demonstração ligadas
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Última execução:{' '}
              {settings.automation.lastRunAt ? (
                <span className="text-foreground" title={formatDateTimeBR(settings.automation.lastRunAt)}>
                  {formatRelative(settings.automation.lastRunAt)}
                </span>
              ) : (
                'nunca'
              )}
            </p>
            <Button onClick={onRunAutomation} disabled={running} className="w-full gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Executar automação agora
            </Button>
            {lastReport && (
              <div className="border-t border-border pt-4">
                <AutomationReportView report={lastReport} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
