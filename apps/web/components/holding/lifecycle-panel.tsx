'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowRight, Ban, Eye, Info, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  accessLevelForStatus,
  tenantLifecycleInput,
  type HoldingTenantDetail,
  type TenantLifecycleAction,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { applyTenantLifecycleAction } from '@/lib/actions/holding-api'
import { cn } from '@/lib/utils'
import {
  describeError,
  endOfDaySaoPauloIso,
  formatDateTimeBR,
  lifecycleOptions,
  lifecycleSuccessMessage,
  todaySaoPaulo,
  type LifecycleOption,
} from '@/lib/adapters/holding'
import { AccessBadge } from './holding-ui'

const ACTION_ICONS: Record<TenantLifecycleAction, typeof Eye> = {
  restrict: Eye,
  suspend: Ban,
  reactivate: ShieldCheck,
  clear_override: RotateCcw,
}

const REASON_MAX = 500

/**
 * Controles do ciclo de vida do painel do inquilino (§0.5): restringir
 * (somente leitura), suspender (bloqueado), reativar (acesso completo, com
 * prazo opcional) e voltar à régua. Sempre com confirmação e motivo; a API
 * grava a auditoria, manda o e-mail e invalida o guard do painel.
 *
 * Só inquilino COM assinatura de plataforma é controlável; os demais mostram
 * os controles desabilitados com a explicação. Só superadmin executa.
 */
export function LifecyclePanel({
  detail,
  canOperate,
  onChanged,
}: {
  detail: HoldingTenantDetail
  canOperate: boolean
  onChanged: (detail: HoldingTenantDetail) => void
}) {
  const { tenant, subscription } = detail
  const managed = tenant.managed && subscription !== null
  const options = lifecycleOptions(tenant.access, subscription)
  const [selected, setSelected] = useState<LifecycleOption | null>(null)

  return (
    <Card className="gap-4 border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Controle do ciclo de vida</CardTitle>
        <CardDescription className="text-xs">
          Afeta só o painel da equipe do clube (admin e vendedor). Associados, vitrine, checkout e carteirinhas
          seguem funcionando.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Acesso atual:</span>
            <AccessBadge level={tenant.access} override={subscription?.access.source === 'override'} />
          </div>
          {subscription ? (
            subscription.access.source === 'override' ? (
              <p className="text-xs text-muted-foreground">
                Decisão manual da holding
                {subscription.access.overrideUntil
                  ? ` até ${formatDateTimeBR(subscription.access.overrideUntil)}`
                  : ' sem prazo'}
                {subscription.access.overrideReason ? ` — “${subscription.access.overrideReason}”` : ''}. Fora dela, a
                régua daria: {PLATFORM_SUBSCRIPTION_STATUS_LABELS[subscription.status].toLowerCase()}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Segue a régua de cobrança: assinatura{' '}
                {PLATFORM_SUBSCRIPTION_STATUS_LABELS[subscription.status].toLowerCase()}
                {subscription.daysLate > 0 ? `, ${subscription.daysLate} dias de atraso` : ''}.
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">Sem assinatura de plataforma.</p>
          )}
        </div>

        {!managed && (
          <div className="flex gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong className="font-medium text-foreground">Fora da cobrança automática.</strong> Este clube não
              tem assinatura de plataforma (contrato legado ou próprio da ANNETEC). A equipe só acompanha os números —
              restringir, suspender e reativar não se aplicam e a API recusa o comando.
            </p>
          </div>
        )}

        {managed && subscription?.status === 'canceled' && (
          <div className="flex gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              A assinatura de plataforma está <strong className="font-medium text-foreground">cancelada</strong>. Para
              voltar a cobrar, reative a assinatura no{' '}
              <Link href={`/admin/financeiro/assinaturas/${subscription.id}`} className="font-medium text-secondary hover:underline">
                Financeiro
              </Link>
              ; os comandos abaixo só mudam o acesso ao painel.
            </p>
          </div>
        )}

        {managed && !canOperate && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldOff className="h-3.5 w-3.5" />
            Somente superadmin executa estes comandos.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {options.map(option => {
            const Icon = ACTION_ICONS[option.action]
            const disabled = !managed || !canOperate || option.unavailableReason !== null
            return (
              <div key={option.action} className="space-y-1">
                <Button
                  type="button"
                  variant={option.tone === 'danger' && !disabled ? 'destructive' : 'outline'}
                  className="w-full justify-start"
                  disabled={disabled}
                  onClick={() => setSelected(option)}
                  title={option.unavailableReason ?? option.description}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </Button>
                {managed && option.unavailableReason && (
                  <p className="px-1 text-[11px] leading-tight text-muted-foreground">{option.unavailableReason}</p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>

      <LifecycleDialog
        option={selected}
        detail={detail}
        onClose={() => setSelected(null)}
        onDone={next => {
          setSelected(null)
          onChanged(next)
        }}
      />
    </Card>
  )
}

function LifecycleDialog({
  option,
  detail,
  onClose,
  onDone,
}: {
  option: LifecycleOption | null
  detail: HoldingTenantDetail
  onClose: () => void
  onDone: (detail: HoldingTenantDetail) => void
}) {
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; until?: string; form?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const { tenant, subscription } = detail

  const reset = () => {
    setReason('')
    setUntil('')
    setErrors({})
    setSubmitting(false)
  }

  const close = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const submit = async () => {
    if (!option) return
    const untilIso = option.allowUntil && until ? endOfDaySaoPauloIso(until) : undefined
    if (option.allowUntil && until && !untilIso) {
      setErrors({ until: 'Data inválida' })
      return
    }
    if (untilIso && new Date(untilIso).getTime() <= Date.now()) {
      setErrors({ until: 'Escolha uma data a partir de hoje' })
      return
    }
    const parsed = tenantLifecycleInput.safeParse({ action: option.action, reason, until: untilIso ?? undefined })
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors
      setErrors({ reason: flat.reason?.[0], until: flat.until?.[0] })
      return
    }
    setSubmitting(true)
    setErrors({})
    const result = await applyTenantLifecycleAction(tenant.organizationId, parsed.data)
    if (!result.success) {
      setSubmitting(false)
      setErrors({
        form: describeError(result.error).message,
        reason: result.fieldErrors?.reason,
        until: result.fieldErrors?.until,
      })
      return
    }
    toast.success(lifecycleSuccessMessage(option.action, tenant.name))
    reset()
    onDone(result.data)
  }

  const resulting = option
    ? (option.resultingAccess ?? (subscription ? accessLevelForStatus(subscription.status) : tenant.access))
    : tenant.access

  return (
    <Dialog open={option !== null} onOpenChange={open => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        {option && (
          <>
            <DialogHeader>
              <DialogTitle>
                {option.label} — {tenant.name}
              </DialogTitle>
              <DialogDescription>{option.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Painel da equipe:</span>
                <AccessBadge level={tenant.access} />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <AccessBadge level={resulting} />
                {option.resultingAccess === null && (
                  <span className="text-xs text-muted-foreground">(pela régua de cobrança)</span>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lifecycle-reason">Motivo (vai para a auditoria)</Label>
                <Textarea
                  id="lifecycle-reason"
                  value={reason}
                  onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
                  placeholder="Ex.: 2 faturas vencidas sem retorno do financeiro do clube"
                  rows={3}
                  aria-invalid={errors.reason ? true : undefined}
                  disabled={submitting}
                />
                <div className="flex justify-between gap-2 text-xs">
                  <span className={cn(errors.reason ? 'text-[#B42318]' : 'text-muted-foreground')}>
                    {errors.reason ?? 'Mínimo de 5 caracteres.'}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {reason.length}/{REASON_MAX}
                  </span>
                </div>
              </div>

              {option.allowUntil && (
                <div className="space-y-1.5">
                  <Label htmlFor="lifecycle-until">Vale até (opcional)</Label>
                  <Input
                    id="lifecycle-until"
                    type="date"
                    value={until}
                    min={todaySaoPaulo()}
                    onChange={event => setUntil(event.target.value)}
                    className="w-48"
                    aria-invalid={errors.until ? true : undefined}
                    disabled={submitting}
                  />
                  <p className={cn('text-xs', errors.until ? 'text-[#B42318]' : 'text-muted-foreground')}>
                    {errors.until ?? option.untilHint}
                  </p>
                </div>
              )}

              {errors.form && (
                <p className="rounded-md bg-[#B42318]/10 px-3 py-2 text-sm text-[#B42318]" role="alert">
                  {errors.form}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant={option.tone === 'danger' ? 'destructive' : 'default'}
                onClick={submit}
                disabled={submitting || reason.trim().length < 5}
              >
                {submitting ? 'Aplicando…' : option.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
