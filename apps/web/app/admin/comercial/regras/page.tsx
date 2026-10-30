'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calculator, Lock, Percent, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { DEFAULT_SALES_COMMISSION_SETTINGS, discountAmount } from '@annetec/contracts'
import { LoadError, SuperadminOnly, runCommand, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { ComercialNav, SUPERADMIN_ONLY } from '@/components/admin-platform/comercial/comercial-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { maskDecimal, maskMoney, moneyInput, parseDecimal, parseMoney } from '@/components/admin-platform/ui/wizard'
import { formatDateTime, formatMoney, formatPct } from '@/components/sales/sales-ui'
import { getCommissionSettingsAction, updateCommissionSettingsAction } from '@/lib/actions/comercial-api'
import { cn } from '@/lib/utils'

/**
 * Comercial › Regras de comissão: a escala por mensalidade paga (1ª, 2ª, 3ª…)
 * e o percentual da adesão. Vale a regra vigente no momento do pagamento da
 * fatura. O exemplo ao lado recalcula enquanto você edita.
 */

const MAX_MONTHS = 36

function percentText(value: number): string {
  return String(value).replace('.', ',')
}

function parsePercent(value: string): number | null {
  const n = parseDecimal(value)
  return n === null || n < 0 || n > 100 ? null : n
}

const inputCls =
  'h-11 w-full rounded-[10px] border border-[#D0D5DD] bg-white px-3 text-right text-sm tabular-nums text-foreground outline-none transition-colors focus-visible:border-secondary focus-visible:ring-[3px] focus-visible:ring-secondary/25 disabled:cursor-not-allowed disabled:bg-[#F9FAFB] aria-[invalid=true]:border-[#B42318]'

export default function CommissionRulesPage() {
  const { isSuperadmin } = usePlatformRole()
  const settings = useConsoleData(() => getCommissionSettingsAction(), [])
  const [schedule, setSchedule] = useState<string[]>([])
  const [setup, setSetup] = useState('')
  const [planFee, setPlanFee] = useState(moneyInput(697))
  const [setupFee, setSetupFee] = useState(moneyInput(990))
  const [saving, setSaving] = useState(false)

  const loaded = settings.data
  const reset = () => {
    if (!loaded) return
    setSchedule(loaded.monthlySchedule.map(percentText))
    setSetup(percentText(loaded.setupFeePercent))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reset, [loaded])

  const parsedSchedule = schedule.map(parsePercent)
  const parsedSetup = parsePercent(setup)
  const invalid = parsedSetup === null || parsedSchedule.some(value => value === null)
  const dirty =
    !!loaded &&
    (parsedSetup !== loaded.setupFeePercent ||
      parsedSchedule.length !== loaded.monthlySchedule.length ||
      parsedSchedule.some((value, index) => value !== loaded.monthlySchedule[index]))

  const fee = parseMoney(planFee) ?? 0
  const adesao = parseMoney(setupFee) ?? 0
  const example = useMemo(() => {
    const rows = parsedSchedule.map((pct, index) => ({
      label: `${index + 1}ª mensalidade`,
      pct: pct ?? 0,
      amount: discountAmount(fee, pct ?? 0),
    }))
    const setupAmount = discountAmount(adesao, parsedSetup ?? 0)
    const total = rows.reduce((acc, row) => acc + row.amount, setupAmount)
    return { rows, setupAmount, total }
  }, [parsedSchedule, parsedSetup, fee, adesao])

  const save = async () => {
    if (invalid || !dirty || saving) return
    setSaving(true)
    const updated = await runCommand(
      updateCommissionSettingsAction({ monthlySchedule: parsedSchedule as number[], setupFeePercent: parsedSetup as number }),
      'Regra de comissão salva. Vale para as próximas faturas pagas',
    )
    setSaving(false)
    if (updated) settings.setData(updated)
  }

  const readOnly = !isSuperadmin

  return (
    <PageContainer>
      <PageHeader
        icon={Percent}
        title="Regras de comissão"
        description="Quanto o vendedor ganha de cada fatura paga pelo clube que trouxe. Vale a regra do dia em que a fatura é paga."
        actions={
          <>
            <Button variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={reset} disabled={!dirty || saving}>
              <RotateCcw aria-hidden="true" />
              Desfazer alterações
            </Button>
            <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
              <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={save} disabled={!dirty || invalid || saving}>
                <Save aria-hidden="true" />
                {saving ? 'Salvando…' : 'Salvar regra'}
              </Button>
            </SuperadminOnly>
          </>
        }
      />
      <ComercialNav />

      {settings.error && !loaded ? (
        <LoadError message={settings.error} onRetry={() => settings.reload()} />
      ) : !loaded ? (
        <SectionCard>
          <SectionSkeleton rows={5} />
        </SectionCard>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <SectionCard
            title="Escala"
            description={`Padrão: ${DEFAULT_SALES_COMMISSION_SETTINGS.monthlySchedule.map(n => `${n}%`).join(', ')} das 3 primeiras mensalidades e ${DEFAULT_SALES_COMMISSION_SETTINGS.setupFeePercent}% da adesão.`}
            icon={Percent}
          >
            {readOnly ? (
              <p className="m-0 mb-4 flex items-center gap-2 rounded-xl bg-[#F6F8FB] px-3 py-2 text-sm text-muted-foreground">
                <Lock className="size-4 shrink-0" aria-hidden="true" />
                Só o superadmin altera a regra. Você vê a regra vigente.
              </p>
            ) : null}
            <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
              <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <label htmlFor="regra-adesao" className="text-sm font-medium text-foreground">
                  Adesão paga
                  <span className="block text-[13px] font-normal text-muted-foreground">Percentual sobre o valor pago da adesão (com desconto, se houver).</span>
                </label>
                <div className="relative">
                  <input
                    id="regra-adesao"
                    inputMode="decimal"
                    value={setup}
                    onChange={event => setSetup(maskDecimal(event.target.value, 2))}
                    aria-invalid={parsedSetup === null}
                    className={cn(inputCls, 'pr-8')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="m-0 text-sm font-medium text-foreground">Mensalidades pagas</p>
                <p className="m-0 text-[13px] text-muted-foreground">
                  A 1ª é a que vai na ativação. Depois da última linha, as mensalidades não geram comissão.
                </p>
                {schedule.length === 0 ? (
                  <p className="m-0 rounded-xl border border-dashed border-[#D0D5DD] px-3 py-4 text-center text-sm text-muted-foreground">
                    Sem comissão sobre mensalidades.
                  </p>
                ) : (
                  <ol className="m-0 flex list-none flex-col gap-2 p-0">
                    {schedule.map((value, index) => (
                      <li key={index} className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_2.75rem]">
                        <label htmlFor={`regra-mes-${index}`} className="text-sm text-foreground">
                          {index + 1}ª mensalidade
                        </label>
                        <div className="relative">
                          <input
                            id={`regra-mes-${index}`}
                            inputMode="decimal"
                            value={value}
                            onChange={event => {
                              const next = [...schedule]
                              next[index] = maskDecimal(event.target.value, 2)
                              setSchedule(next)
                            }}
                            aria-invalid={parsedSchedule[index] === null}
                            className={cn(inputCls, 'pr-8')}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          onClick={() => setSchedule(schedule.filter((_, i) => i !== index))}
                          aria-label={`Remover a ${index + 1}ª mensalidade`}
                          className="text-[#B42318] hover:text-[#B42318]"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-[10px] px-3 text-sm font-semibold"
                    onClick={() => setSchedule([...schedule, schedule.length ? schedule[schedule.length - 1]! : '10'])}
                    disabled={schedule.length >= MAX_MONTHS}
                  >
                    <Plus aria-hidden="true" />
                    Adicionar mensalidade
                  </Button>
                </div>
              </div>
              {invalid ? (
                <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">
                  Use percentuais de 0% a 100%.
                </p>
              ) : null}
            </fieldset>
            <p className="m-0 mt-5 text-xs text-muted-foreground">
              Última alteração: {loaded.updatedAt ? `${formatDateTime(loaded.updatedAt)}${loaded.updatedByName ? ` por ${loaded.updatedByName}` : ''}` : 'nunca (regra padrão)'}.
            </p>
          </SectionCard>

          <SectionCard title="Exemplo" description="Quanto um vendedor recebe por um clube, com a regra acima." icon={Calculator} iconTone="green">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Mensalidade do plano
                <span className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input inputMode="numeric" value={planFee} onChange={event => setPlanFee(maskMoney(event.target.value))} className={cn(inputCls, 'pl-10')} />
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Adesão
                <span className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input inputMode="numeric" value={setupFee} onChange={event => setSetupFee(maskMoney(event.target.value))} className={cn(inputCls, 'pl-10')} />
                </span>
              </label>
            </div>
            <p className="m-0 mt-2 text-xs text-muted-foreground">Ex.: plano Profissional de R$ 697/mês com adesão de R$ 990.</p>
            <dl className="m-0 mt-4 divide-y divide-[#EEF0F3] overflow-hidden rounded-2xl border border-border" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">
                  Adesão · {formatPct(parsedSetup ?? 0)} de {formatMoney(adesao)}
                </dt>
                <dd className="m-0 font-medium tabular-nums">{formatMoney(example.setupAmount)}</dd>
              </div>
              {example.rows.map(row => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">
                    {row.label} · {formatPct(row.pct)} de {formatMoney(fee)}
                  </dt>
                  <dd className="m-0 font-medium tabular-nums">{formatMoney(row.amount)}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 bg-[#F6FEF9] px-4 py-3 text-sm">
                <dt className="font-semibold text-foreground">Total por clube</dt>
                <dd className="m-0 text-base font-bold tabular-nums text-[#067647]">{formatMoney(example.total)}</dd>
              </div>
            </dl>
            <p className="m-0 mt-3 text-xs text-muted-foreground">
              Desconto aprovado na venda reduz a base: a comissão é sobre o que o clube pagou de fato.
            </p>
          </SectionCard>
        </div>
      )}
    </PageContainer>
  )
}
