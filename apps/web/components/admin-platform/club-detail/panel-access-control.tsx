'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Ban, Eye, Info, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  accessLevelForStatus,
  tenantLifecycleInput,
  type HoldingTenantDetail,
  type PlatformAccessLevel,
  type TenantLifecycleAction,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
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
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { applyTenantLifecycleAction } from '@/lib/actions/holding-api'
import {
  describeError,
  endOfDaySaoPauloIso,
  formatDateTimeBR,
  lifecycleOptions,
  todaySaoPaulo,
} from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'

/**
 * "Acesso da equipe ao painel": os controles do ciclo de vida da holding
 * (`POST /platform/holding/inquilinos/:orgId/ciclo-de-vida`), ditos em
 * português simples.
 *
 * O que o código REALMENTE faz (guard `platform-access.ts` + `applyTenantLifecycle`):
 *  - mexe só no painel da equipe do clube (administradores e vendedores);
 *    associados, site, checkout e a página "Minha assinatura" seguem
 *    abertos;
 *  - grava uma decisão manual na assinatura da ANNETEC, que vale mais que a
 *    cobrança automática até a data limite (ou até alguém voltar ao automático);
 *  - só existe para clube COM assinatura da ANNETEC (os demais recebem 422);
 *  - só superadmin executa; restringir, bloquear e liberar mandam e-mail para o
 *    contato de cobrança do clube; tudo entra no histórico de alterações.
 */

export const ACCESS_LABEL: Record<PlatformAccessLevel, string> = {
  full: 'Acesso completo',
  read_only: 'Só para consulta',
  blocked: 'Bloqueado',
}

const ACCESS_TONE: Record<PlatformAccessLevel, StatusPillTone> = {
  full: 'success',
  read_only: 'warning',
  blocked: 'danger',
}

interface ActionCopy {
  /** Título da opção na lista. */
  title: string
  /** O que acontece, em uma frase. */
  description: string
  /** Botão da lista. */
  button: string
  /** Pergunta da confirmação (recebe o nome do clube). */
  question: (name: string) => string
  /** Consequência dita na confirmação. */
  consequence: string
  /** Botão de confirmar. */
  confirm: string
  /** Frase do aviso depois de aplicar (recebe o nome do clube). */
  done: (name: string) => string
  /** Por que a opção está indisponível. */
  alreadyHint: string
  icon: typeof Eye
  danger?: boolean
}

const COPY: Record<TenantLifecycleAction, ActionCopy> = {
  restrict: {
    title: 'Deixar o painel só para consulta',
    description:
      'A equipe do clube continua vendo tudo, mas não consegue alterar nada. Associados, site e checkout seguem normais.',
    button: 'Deixar só para consulta',
    question: name => `Deixar o painel do ${name} só para consulta?`,
    consequence:
      'A equipe do clube (administradores e vendedores) continua vendo tudo, mas não consegue alterar nada. Associados, site e checkout seguem normais. O clube recebe um e-mail avisando.',
    confirm: 'Deixar só para consulta',
    done: name => `Painel do ${name} só para consulta.`,
    alreadyHint: 'O painel já está só para consulta.',
    icon: Eye,
  },
  suspend: {
    title: 'Bloquear o painel',
    description:
      'A equipe do clube perde o acesso ao painel; só a página "Minha assinatura" continua aberta. Associados, site e checkout seguem normais.',
    button: 'Bloquear o painel',
    question: name => `Bloquear o painel do ${name}?`,
    consequence:
      'A equipe do clube perde o acesso ao painel até você liberar; só a página "Minha assinatura" continua aberta. Associados, site e checkout seguem normais. Nada é apagado. O clube recebe um e-mail avisando.',
    confirm: 'Bloquear o painel',
    done: name => `Painel do ${name} bloqueado.`,
    alreadyHint: 'O painel já está bloqueado.',
    icon: Ban,
    danger: true,
  },
  reactivate: {
    title: 'Liberar o painel',
    description:
      'Devolve o acesso completo agora, mesmo com mensalidade da ANNETEC em aberto (por exemplo, uma promessa de pagamento). A cobrança continua normal.',
    button: 'Liberar o painel',
    question: name => `Liberar o painel do ${name}?`,
    consequence:
      'A equipe do clube volta a ter acesso completo agora, mesmo com mensalidade da ANNETEC em aberto. A cobrança continua normal. O clube recebe um e-mail avisando.',
    confirm: 'Liberar o painel',
    done: name => `Painel do ${name} liberado.`,
    alreadyHint: 'O painel já está com acesso completo.',
    icon: ShieldCheck,
  },
  clear_override: {
    title: 'Voltar ao automático',
    description:
      'Remove a decisão manual. O acesso volta a seguir a mensalidade da ANNETEC: em dia, completo; atrasada por muitos dias, só consulta e depois bloqueio.',
    button: 'Voltar ao automático',
    question: name => `Voltar o painel do ${name} ao automático?`,
    consequence:
      'Sua decisão manual é removida e o acesso passa a seguir a mensalidade da ANNETEC: em dia, completo; atrasada por muitos dias, só consulta e depois bloqueio.',
    confirm: 'Voltar ao automático',
    done: name => `Painel do ${name} voltou a seguir a cobrança automática.`,
    alreadyHint: 'Não há decisão manual: o acesso já segue a mensalidade da ANNETEC.',
    icon: RotateCcw,
  },
}

const ACTION_ORDER: TenantLifecycleAction[] = ['restrict', 'suspend', 'reactivate', 'clear_override']
const REASON_MAX = 500

export function PanelAccessControl({
  detail,
  loading,
  canOperate,
  onChanged,
}: {
  detail: HoldingTenantDetail | null
  loading: boolean
  canOperate: boolean
  /** Recebe o retrato novo depois de aplicar uma ação. */
  onChanged: () => void
}) {
  const [selected, setSelected] = useState<TenantLifecycleAction | null>(null)

  if (!detail) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {loading ? 'Carregando o acesso atual…' : 'Não foi possível ler o acesso atual do painel. Feche e abra de novo.'}
      </p>
    )
  }

  const { tenant, subscription } = detail
  const managed = tenant.managed && subscription !== null
  const options = lifecycleOptions(tenant.access, subscription)
  const override = subscription?.access.source === 'override'
  const statusLabel = subscription ? PLATFORM_SUBSCRIPTION_STATUS_LABELS[subscription.status].toLowerCase() : ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-[#F9FAFB] p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Agora:</span>
          <StatusPill tone={ACCESS_TONE[tenant.access]}>{ACCESS_LABEL[tenant.access]}</StatusPill>
          {override ? <StatusPill tone="info">Decisão manual</StatusPill> : null}
        </div>
        {subscription ? (
          override ? (
            <p className="m-0 text-[13px] text-muted-foreground">
              Decisão manual{' '}
              {subscription.access.overrideUntil
                ? `até ${formatDateTimeBR(subscription.access.overrideUntil)}`
                : 'sem data para acabar'}
              {subscription.access.overrideReason ? `: “${subscription.access.overrideReason}”` : ''}. Sem ela, o acesso
              seguiria a mensalidade da ANNETEC (assinatura {statusLabel}).
            </p>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">
              Segue a mensalidade da ANNETEC: assinatura {statusLabel}
              {subscription.daysLate > 0 ? `, ${subscription.daysLate} dias de atraso` : ''}.
            </p>
          )
        ) : (
          <p className="m-0 text-[13px] text-muted-foreground">Este clube não tem assinatura da ANNETEC.</p>
        )}
      </div>

      {!managed ? (
        <div className="flex gap-2 rounded-xl border border-dashed border-[#D0D5DD] p-3 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            <strong className="font-semibold text-foreground">Sem cobrança automática.</strong> Como o clube não tem
            assinatura da ANNETEC, o acesso ao painel nunca é restringido e as opções abaixo não se aplicam.
          </p>
        </div>
      ) : null}

      {managed && subscription?.status === 'canceled' ? (
        <div className="flex gap-2 rounded-xl border border-dashed border-[#D0D5DD] p-3 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            A assinatura da ANNETEC está <strong className="font-semibold text-foreground">cancelada</strong>. Para voltar
            a cobrar, reative a assinatura no{' '}
            <Link
              href={`/admin/financeiro/assinaturas/${subscription.id}`}
              className="font-semibold text-secondary hover:underline"
            >
              Financeiro
            </Link>
            . As opções abaixo só mudam o acesso ao painel.
          </p>
        </div>
      ) : null}

      {managed && !canOperate ? (
        <p className="m-0 text-[13px] text-muted-foreground">Somente o superadmin pode mudar o acesso ao painel.</p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {options.map(option => {
          const copy = COPY[option.action]
          const Icon = copy.icon
          const unavailable = option.unavailableReason !== null
          const disabled = !managed || !canOperate || unavailable
          return (
            <li
              key={option.action}
              className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-foreground">{copy.title}</p>
                <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">{copy.description}</p>
                {managed && unavailable ? (
                  <p className="m-0 mt-1 text-xs font-medium text-muted-foreground">{copy.alreadyHint}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant={copy.danger && !disabled ? 'destructive' : 'outline'}
                disabled={disabled}
                onClick={() => setSelected(option.action)}
                className="min-h-11 shrink-0 gap-2 rounded-[10px] px-4 text-sm font-semibold"
              >
                <Icon aria-hidden="true" />
                {copy.button}
              </Button>
            </li>
          )
        })}
      </ul>

      <LifecycleDialog
        action={selected}
        detail={detail}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null)
          onChanged()
        }}
      />
    </div>
  )
}

function LifecycleDialog({
  action,
  detail,
  onClose,
  onDone,
}: {
  action: TenantLifecycleAction | null
  detail: HoldingTenantDetail
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; until?: string; form?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const { tenant, subscription } = detail

  const option = action ? lifecycleOptions(tenant.access, subscription).find(item => item.action === action) : undefined
  const copy = action ? COPY[action] : null

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
    if (!action || !option) return
    const untilIso = option.allowUntil && until ? endOfDaySaoPauloIso(until) : undefined
    if (option.allowUntil && until && !untilIso) {
      setErrors({ until: 'Escolha uma data válida.' })
      return
    }
    if (untilIso && new Date(untilIso).getTime() <= Date.now()) {
      setErrors({ until: 'Escolha uma data a partir de hoje.' })
      return
    }
    const parsed = tenantLifecycleInput.safeParse({ action, reason, until: untilIso ?? undefined })
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
    toast.success(copy ? copy.done(tenant.name) : 'Alterações salvas')
    reset()
    onDone()
  }

  const resulting: PlatformAccessLevel =
    option?.resultingAccess ?? (subscription ? accessLevelForStatus(subscription.status) : tenant.access)

  return (
    <Dialog open={action !== null} onOpenChange={open => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        {action && option && copy ? (
          <>
            <DialogHeader>
              <DialogTitle>{copy.question(tenant.name)}</DialogTitle>
              <DialogDescription>{copy.consequence}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-[#F9FAFB] p-3 text-sm">
                <span className="text-muted-foreground">Acesso da equipe:</span>
                <StatusPill tone={ACCESS_TONE[tenant.access]}>{ACCESS_LABEL[tenant.access]}</StatusPill>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                <StatusPill tone={ACCESS_TONE[resulting]}>{ACCESS_LABEL[resulting]}</StatusPill>
                {option.resultingAccess === null ? (
                  <span className="text-xs text-muted-foreground">(pela mensalidade da ANNETEC)</span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="situation-reason">Motivo (fica no histórico de alterações)</Label>
                <Textarea
                  id="situation-reason"
                  value={reason}
                  onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
                  placeholder="Ex.: 2 mensalidades vencidas sem retorno do clube"
                  rows={3}
                  aria-invalid={errors.reason ? true : undefined}
                  disabled={submitting}
                />
                <div className="flex justify-between gap-2 text-xs">
                  <span className={cn(errors.reason ? 'text-[#B42318]' : 'text-muted-foreground')}>
                    {errors.reason ?? 'Escreva pelo menos 5 caracteres.'}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {reason.length}/{REASON_MAX}
                  </span>
                </div>
              </div>

              {option.allowUntil ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="situation-until">Vale até (opcional)</Label>
                  <Input
                    id="situation-until"
                    type="date"
                    value={until}
                    min={todaySaoPaulo()}
                    onChange={event => setUntil(event.target.value)}
                    className="w-48"
                    aria-invalid={errors.until ? true : undefined}
                    disabled={submitting}
                  />
                  <p className={cn('m-0 text-xs', errors.until ? 'text-[#B42318]' : 'text-muted-foreground')}>
                    {errors.until ??
                      (action === 'reactivate'
                        ? 'Use para a data prometida do pagamento. Sem data, vale até alguém voltar ao automático.'
                        : 'Na data, a decisão acaba e o acesso volta a seguir a mensalidade da ANNETEC.')}
                  </p>
                </div>
              ) : null}

              {errors.form ? (
                <p className="m-0 rounded-md bg-[#B42318]/10 px-3 py-2 text-sm text-[#B42318]" role="alert">
                  {errors.form}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant={copy.danger ? 'destructive' : 'default'}
                onClick={submit}
                disabled={submitting || reason.trim().length < 5}
                className={cn('gap-2', !copy.danger && 'bg-secondary text-white hover:bg-secondary/90')}
              >
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {submitting ? 'Aplicando…' : copy.confirm}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
