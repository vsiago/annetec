'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, CalendarClock, Loader2, Play, Save, Settings2, ShieldAlert, Undo2 } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  validatePlatformDunningOrder,
  type ClubPaymentMethod,
  type PaymentGatewayProvider,
  type PlatformBillingAutomationReport,
  type PlatformBillingSettings,
  type UpdatePlatformBillingSettingsInput,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadError, SuperadminOnly, runCommand } from '@/components/admin-platform/billing/console-kit'
import { updatePlatformBillingSettingsAction } from '@/lib/actions/platform-billing-api'
import {
  dunningSteps,
  formatDateTimeBR,
  formatRelative,
  toneClass,
} from '@/lib/adapters/platform-console'
import { isDemoMode } from '@/lib/demo-mode'
import { cn } from '@/lib/utils'

/**
 * Regras de cobrança da plataforma (linha única `platform_billing_settings`):
 * o desenho das etapas, o formulário (só o superadmin grava — a API valida a
 * ordem somente leitura < bloqueio < cancelamento no merge) e a automação com
 * o último relatório de execução. Vive em `/admin/financeiro/regras`.
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
  { key: 'generateDaysBefore', label: 'Gerar a fatura', hint: 'antes do vencimento', min: 0, max: 30, suffix: 'dias antes' },
  { key: 'reminderDaysBefore', label: 'Enviar lembrete', hint: 'antes do vencimento', min: 0, max: 15, suffix: 'dias antes' },
  { key: 'boletoDueDays', label: 'Prazo do boleto e do Pix', hint: 'na primeira fatura e na segunda via', min: 1, max: 30, suffix: 'dias' },
  { key: 'restrictAfterDays', label: 'Painel em somente leitura', hint: 'depois deste atraso', min: 1, max: 90, suffix: 'dias de atraso' },
  { key: 'suspendAfterDays', label: 'Bloquear o painel do clube', hint: 'depois deste atraso', min: 2, max: 180, suffix: 'dias de atraso' },
  { key: 'cancelAfterDays', label: 'Cancelar a assinatura', hint: 'depois deste atraso', min: 3, max: 365, suffix: 'dias de atraso' },
  { key: 'finePercent', label: 'Multa', hint: 'sobre a fatura vencida', min: 0, max: 2, step: 0.1, suffix: '%' },
  { key: 'interestMonthlyPercent', label: 'Juros', hint: 'ao mês', min: 0, max: 1, step: 0.1, suffix: '% ao mês' },
  { key: 'maxCardRetries', label: 'Novas tentativas no cartão', hint: 'antes de a fatura vencer', min: 0, max: 10, suffix: 'vezes' },
  { key: 'cardRetryIntervalHours', label: 'Intervalo entre tentativas', hint: 'no cartão', min: 1, max: 168, suffix: 'horas' },
  { key: 'activationExpiryDays', label: 'Clube aprovado que não paga', hint: 'depois deste prazo a contratação é cancelada', min: 1, max: 60, suffix: 'dias' },
  { key: 'draftExpiryDays', label: 'Contratação parada', hint: 'depois deste prazo o cadastro é cancelado', min: 1, max: 180, suffix: 'dias' },
]

const GROUPS: { title: string; keys: NumericKey[] }[] = [
  { title: 'Faturas e lembretes', keys: ['generateDaysBefore', 'reminderDaysBefore', 'boletoDueDays'] },
  { title: 'Quando o clube atrasa', keys: ['restrictAfterDays', 'suspendAfterDays', 'cancelAfterDays'] },
  { title: 'Multa, juros e cartão', keys: ['finePercent', 'interestMonthlyPercent', 'maxCardRetries', 'cardRetryIntervalHours'] },
  { title: 'Prazos da contratação', keys: ['activationExpiryDays', 'draftExpiryDays'] },
]

/** Segundos → "5 min" / "90 s" (o número sempre com unidade). */
function formatInterval(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

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

/** Textos das etapas na língua do dono (os do adaptador falam em "degrau" e "inquilino"). */
const LADDER_COPY: Record<string, { label: string; detail: string }> = {
  generate: { label: 'Fatura gerada', detail: 'O clube recebe o e-mail com o link de pagamento' },
  reminder: { label: 'Lembrete', detail: 'E-mail de lembrete para o financeiro do clube' },
  due: { label: 'Vencimento', detail: 'Sem pagamento, o clube passa a "em atraso" e o painel segue completo' },
  restrict: { label: 'Somente leitura', detail: 'A equipe do clube só consulta. Os associados não são afetados' },
  suspend: { label: 'Painel bloqueado', detail: 'A equipe do clube só acessa a tela de pagamento. Os associados não são afetados' },
  cancel: { label: 'Assinatura cancelada', detail: 'O clube em si nunca é cancelado automaticamente' },
}

/** -10 → "10 dias antes", 0 → "No vencimento", 10 → "10 dias depois". */
function ladderDay(day: number): string {
  if (day === 0) return 'No vencimento'
  const abs = Math.abs(day)
  return `${abs} ${abs === 1 ? 'dia' : 'dias'} ${day < 0 ? 'antes' : 'depois'}`
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
  /** Marca "Agora" na etapa em que o clube está (dias em relação ao vencimento da fatura em aberto mais antiga). */
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
              current ? 'border-secondary shadow-sm ring-2 ring-secondary/15' : 'border-border',
              reached && !current && 'bg-muted/40',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', toneClass(step.tone))}>
                {ladderDay(step.day)}
              </span>
              {current && <span className="text-[10px] font-semibold uppercase tracking-wide text-secondary">Agora</span>}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{LADDER_COPY[step.key]?.label ?? step.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{LADDER_COPY[step.key]?.detail ?? step.detail}</p>
          </li>
        )
      })}
    </ol>
  )
}

export function AutomationReportView({ report }: { report: PlatformBillingAutomationReport }) {
  const items: [string, number][] = [
    ['Faturas conferidas', report.synced],
    ['Faturas geradas', report.generated],
    ['Cartões cobrados', report.cardCharged],
    ['Cartões recusados', report.cardFailed],
    ['Lembretes enviados', report.remindersSent],
    ['Faturas vencidas', report.markedOverdue],
    ['Clubes em atraso', report.pastDue],
    ['Clubes em somente leitura', report.restricted],
    ['Clubes bloqueados', report.suspended],
    ['Assinaturas canceladas', report.canceled],
    ['Clubes reativados', report.reactivated],
    ['Acessos manuais encerrados', report.overridesExpired],
    ['Contratações expiradas', report.proposalsExpired],
  ]
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Rodou {formatRelative(report.ranAt)} · {formatDateTimeBR(report.ranAt)} · levou {report.durationMs.toLocaleString('pt-BR')} ms
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div
            key={label}
            className={cn('rounded-xl border px-3 py-2', value > 0 ? 'border-secondary/30 bg-accent' : 'border-border')}
          >
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={cn('text-lg font-semibold tabular-nums', value > 0 ? 'text-foreground' : 'text-muted-foreground')}>{value}</dd>
          </div>
        ))}
      </dl>
      {report.errors.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-[#B42318] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
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
      <div className="flex flex-col gap-6">
        <SectionCard>
          <SectionSkeleton rows={3} label="Carregando as regras de cobrança…" />
        </SectionCard>
        <SectionCard>
          <SectionSkeleton rows={8} label="Carregando as regras de cobrança…" />
        </SectionCard>
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
  const methodsError = form.enabledMethods.length === 0 ? 'Marque pelo menos uma forma de pagamento.' : null
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
    const updated = await runCommand(updatePlatformBillingSettingsAction(diff), 'Alterações salvas')
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
    <div className="flex flex-col gap-6">
      <SectionCard
        title="O que acontece quando um clube atrasa"
        icon={CalendarClock}
        description="Os dias contam a partir do vencimento da fatura em aberto mais antiga. Os associados, a vitrine e o portal do clube nunca são afetados."
      >
        <DunningLadder settings={preview} />
      </SectionCard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <SectionCard
          title="Prazos, multa e formas de pagamento"
          icon={Settings2}
          description={
            isSuperadmin
              ? 'Vale para todos os clubes a partir da próxima rodada da automação.'
              : 'Somente o superadmin altera estas regras.'
          }
          actions={
            dirty && isSuperadmin ? (
              <Button
                variant="ghost"
                className="min-h-10 gap-1.5 rounded-[10px] px-3.5 font-semibold"
                onClick={() => setForm(toForm(settings))}
                disabled={saving}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Descartar alterações
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-6">
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
                            className={cn('pr-24', invalid && 'border-[#B42318]')}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {field.suffix}
                          </span>
                        </div>
                        <p className={cn('m-0 text-[11px]', invalid ? 'text-[#B42318]' : 'text-muted-foreground')}>
                          {invalid ? `Use um valor entre ${field.min} e ${field.max}${field.step ? '' : ' (número inteiro)'}.` : field.hint}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            ))}

            <fieldset className="space-y-3" disabled={!isSuperadmin}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formas de pagamento e recebimento</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(CLUB_PAYMENT_METHOD_LABELS) as ClubPaymentMethod[]).map(method => (
                  <label key={method} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
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
                <Label>Recebimento das mensalidades</Label>
                <Select
                  value={form.gatewayOverride}
                  onValueChange={value => setForm(current => (current ? { ...current, gatewayOverride: value as FormState['gatewayOverride'] } : current))}
                  disabled={!isSuperadmin}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (definido no servidor)</SelectItem>
                    {/* "Simulado" só quando o servidor diz que é demonstração (gateway simulado, sandbox ou ferramentas de demo); em produção, só Asaas. */}
                    {demo && <SelectItem value="simulated">Simulado (demonstração)</SelectItem>}
                    <SelectItem value="asaas" disabled={!settings.asaasConfigured}>
                      Asaas{settings.asaasConfigured ? (settings.sandbox ? ' · ambiente de testes' : '') : ' (chave não configurada)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {(orderError || methodsError) && (
              <p className="m-0 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-[#B42318] dark:bg-red-500/10 dark:text-red-300">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {orderError ?? methodsError}
              </p>
            )}

            <div className="flex justify-end border-t border-border pt-4">
              <SuperadminOnly isSuperadmin={isSuperadmin}>
                <Button onClick={save} disabled={!canSave} className="min-h-10 gap-2 rounded-[10px] px-4 font-semibold">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar alterações
                </Button>
              </SuperadminOnly>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Automação"
          icon={Bot}
          description={
            settings.automation.enabled
              ? `Roda sozinha a cada ${formatInterval(settings.automation.intervalSeconds)}: confere os pagamentos, gera faturas, envia lembretes e aplica o que acontece com o clube em atraso.`
              : 'A automação não está ligada neste servidor. Use o botão abaixo para rodar quando precisar.'
          }
        >
          <div className="flex flex-col gap-4">
            {settings.demoToolsEnabled && demo && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                  Ferramentas de demonstração ligadas
                </span>
              </div>
            )}
            <p className="m-0 text-sm text-muted-foreground">
              Última execução:{' '}
              {settings.automation.lastRunAt ? (
                <span className="text-foreground" title={formatDateTimeBR(settings.automation.lastRunAt)}>
                  {formatRelative(settings.automation.lastRunAt)}
                </span>
              ) : (
                'nunca'
              )}
            </p>
            <Button onClick={onRunAutomation} disabled={running} className="min-h-10 w-full gap-2 rounded-[10px] px-4 font-semibold">
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              Executar automação
            </Button>
            <p className="m-0 text-xs text-muted-foreground">Ação de suporte: faz agora o que a automação faria sozinha.</p>
            {lastReport && (
              <div className="border-t border-border pt-4">
                <AutomationReportView report={lastReport} />
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
