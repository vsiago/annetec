'use client'

import { useRef, useState } from 'react'
import type { HoldingTenantDetail, TenantStatus } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/admin-platform/billing/console-kit'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { PanelAccessControl } from '@/components/admin-platform/club-detail/panel-access-control'
import { CLUB_STATUS_LABEL, CLUB_STATUS_TONE } from '@/components/admin-platform/club-detail/club-model'
import { toast } from 'sonner'
import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * "Situação do clube": o que a ANNETEC pode mudar no acesso do clube, numa
 * seção só.
 *
 * Antes eram dois controles soltos ("Zona de risco" no cadastro e o ciclo de
 * vida da holding) que mexiam no acesso do MESMO clube sem dizer o que cada um
 * fazia. Não dá para fundi-los num controle só sem mudar o comportamento: um
 * grava uma marcação no cadastro (PATCH do clube), o outro grava uma decisão
 * manual na assinatura da ANNETEC (com motivo, prazo e e-mail ao clube) e só
 * existe para clube com assinatura. Por isso ficam lado a lado, com título e
 * texto claros:
 *
 *  1. "Acesso da equipe ao painel" → `PanelAccessControl` (ciclo de vida).
 *  2. "Cadastro do clube" → a situação do cadastro. Hoje só "Encerrado" tem
 *     efeito (a API recusa tudo em `/t/<slug>/*`: site, login, painel e
 *     associados); "Em teste" e "Suspenso" são marcações — o código não bloqueia
 *     nada por elas.
 */

interface StatusCopy {
  description: string
  button: string
  question: (name: string, from: TenantStatus) => string
  consequence: (from: TenantStatus) => string
  confirm: string
  done: (name: string) => string
  destructive?: boolean
}

const STATUS_COPY: Record<TenantStatus, StatusCopy> = {
  trial: {
    description: 'Clube em período de teste. É só uma marcação: ninguém perde acesso.',
    button: 'Marcar como em teste',
    question: name => `Marcar o ${name} como em teste?`,
    consequence: from =>
      from === 'cancelled'
        ? 'O clube volta a aparecer como em teste e o site, o login e o painel voltam a abrir.'
        : 'É só uma marcação nas listas do console: ninguém perde acesso.',
    confirm: 'Marcar como em teste',
    done: name => `${name} marcado como em teste.`,
  },
  active: {
    description: 'Cliente regular. Se o clube estava encerrado, o site, o login e o painel voltam a abrir.',
    button: 'Marcar como ativo',
    question: name => `Marcar o ${name} como ativo?`,
    consequence: from =>
      from === 'cancelled'
        ? 'O site, o login e o painel do clube voltam a abrir para todos.'
        : 'O clube passa a aparecer como ativo nas listas do console.',
    confirm: 'Marcar como ativo',
    done: name => `${name} marcado como ativo.`,
  },
  suspended: {
    description:
      'Aparece como suspenso nas listas do console. Hoje isso não bloqueia o site nem o painel; para tirar o acesso da equipe, use "Acesso da equipe ao painel".',
    button: 'Suspender o clube',
    question: name => `Suspender o ${name}?`,
    consequence: () =>
      'O clube passa a aparecer como suspenso no console. Isso não bloqueia o site nem o painel; para tirar o acesso da equipe, bloqueie o painel. Nada é apagado.',
    confirm: 'Suspender o clube',
    done: name => `${name} marcado como suspenso.`,
  },
  cancelled: {
    description:
      'O site, o login e o painel deixam de abrir para todos, inclusive associados. Nada é apagado e dá para reativar depois. A assinatura da ANNETEC não é cancelada junto.',
    button: 'Encerrar o clube',
    question: name => `Encerrar o ${name}?`,
    consequence: () =>
      'O site, o login e o painel deixam de abrir para todos, inclusive associados, até você reativar o clube. Nada é apagado. A assinatura da ANNETEC não é cancelada junto.',
    confirm: 'Encerrar o clube',
    done: name => `${name} encerrado.`,
    destructive: true,
  },
}

const STATUS_ORDER: TenantStatus[] = ['trial', 'active', 'suspended', 'cancelled']

export function ClubSituationSheet({
  open,
  onOpenChange,
  tenant,
  detail,
  detailLoading,
  isSuperadmin,
  onChangeStatus,
  onAccessChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenant: Tenant
  detail: HoldingTenantDetail | null
  detailLoading: boolean
  isSuperadmin: boolean
  /** Grava a nova situação do cadastro; devolve a frase de erro, ou `null` se deu certo. */
  onChangeStatus: (status: TenantStatus) => Promise<string | null>
  /** Depois de mudar o acesso ao painel: a tela relê o retrato do clube. */
  onAccessChanged: () => void
}) {
  const [pending, setPending] = useState<TenantStatus | null>(null)
  // Guarda o último pedido para o texto não sumir durante a animação de fechar.
  const lastPending = useRef<TenantStatus>('active')
  if (pending) lastPending.current = pending
  const copy = STATUS_COPY[pending ?? lastPending.current]

  async function confirmStatus(): Promise<boolean> {
    if (!pending) return false
    const error = await onChangeStatus(pending)
    if (error) {
      toast.error('Não foi possível mudar a situação do clube.', { description: error })
      return false
    }
    toast.success(STATUS_COPY[pending].done(tenant.name))
    return true
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border p-6 pr-12">
            <SheetTitle className="text-lg font-bold text-foreground">Situação do clube</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Duas coisas mudam o acesso do {tenant.name}: o acesso da equipe ao painel e o cadastro do clube. Cada opção
              diz o que acontece.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-8 p-6">
            {!isSuperadmin ? (
              <p className="m-0 rounded-xl bg-[#F2F4F7] px-4 py-3 text-sm text-[#344054]">
                Somente o superadmin pode mudar a situação do clube. Você pode ver como ela está.
              </p>
            ) : null}

            <section aria-labelledby="situation-access" className="flex flex-col gap-3">
              <div>
                <h3 id="situation-access" className="m-0 text-base font-bold text-foreground">
                  Acesso da equipe ao painel
                </h3>
                <p className="m-0 mt-1 text-[13px] text-muted-foreground">
                  Vale para administradores e vendedores do clube. Associados, site e checkout não são afetados.
                </p>
              </div>
              <PanelAccessControl
                detail={detail}
                loading={detailLoading}
                canOperate={isSuperadmin}
                onChanged={onAccessChanged}
              />
            </section>

            <section aria-labelledby="situation-status" className="flex flex-col gap-3">
              <div>
                <h3 id="situation-status" className="m-0 text-base font-bold text-foreground">
                  Cadastro do clube
                </h3>
                <p className="m-0 mt-1 text-[13px] text-muted-foreground">
                  A situação do clube na ANNETEC. Só “Encerrado” muda o que as pessoas conseguem abrir.
                </p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {STATUS_ORDER.map(status => {
                  const current = tenant.status === status
                  const text = STATUS_COPY[status]
                  return (
                    <li
                      key={status}
                      className={cn(
                        'flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
                        current ? 'border-secondary bg-accent' : 'border-border bg-white',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                          {CLUB_STATUS_LABEL[status]}
                          {current ? <StatusPill tone={CLUB_STATUS_TONE[status]}>Situação atual</StatusPill> : null}
                        </p>
                        <p className="m-0 mt-0.5 text-[13px] leading-snug text-muted-foreground">{text.description}</p>
                      </div>
                      {current ? null : (
                        <Button
                          type="button"
                          variant={text.destructive ? 'destructive' : 'outline'}
                          disabled={!isSuperadmin}
                          onClick={() => setPending(status)}
                          className="min-h-11 shrink-0 rounded-[10px] px-4 text-sm font-semibold"
                        >
                          {text.button}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={next => !next && setPending(null)}
        title={copy.question(tenant.name, tenant.status)}
        description={copy.consequence(tenant.status)}
        confirmLabel={copy.confirm}
        destructive={copy.destructive}
        onConfirm={() => confirmStatus()}
      />
    </>
  )
}
