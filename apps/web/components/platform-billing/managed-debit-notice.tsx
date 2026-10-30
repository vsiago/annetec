'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Handshake } from 'lucide-react'
import type { AppNotification, MyPlatformSubscription } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/contratar/ui'
import { getReceivingAccountAction } from '@/lib/actions/faturamento-api'
import { listNotificationsAction } from '@/lib/actions/notificacoes-api'
import { formatDateTimeBR } from '@/lib/adapters/faturamento'
import { tenantInvoicePath } from './access-gate'

/** Falha com mais de 10 dias já não é "recente": a fatura segue o fluxo normal. */
const RECENT_FAILURE_MS = 10 * 24 * 60 * 60 * 1000

/**
 * Conta de recebimento gerenciada pela ANNETEC: mostra se o débito automático
 * do saldo no vencimento está ligado e, quando a última tentativa falhou
 * (notificação `platform_auto_debit_failed`), o motivo e o link para pagar a
 * fatura. Some sozinho para clubes sem conta gerenciada ou se a consulta falhar.
 */
export function ManagedDebitNotice({ slug, data }: { slug: string; data: MyPlatformSubscription }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [failure, setFailure] = useState<AppNotification | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    async function load() {
      try {
        const account = await getReceivingAccountAction(slug)
        if (cancelled || !account.success || account.data.source !== 'subaccount' || !account.data.managed) return
        setEnabled(account.data.managed.autoDebitEnabled)
        const list = await listNotificationsAction({ kind: 'tenant', slug }, 30)
        if (cancelled || !list.success) return
        const now = Date.now()
        const recent = list.data.items.find(
          item => item.kind === 'platform_auto_debit_failed' && now - Date.parse(item.createdAt) < RECENT_FAILURE_MS,
        )
        setFailure(recent ?? null)
      } catch {
        // Sem resposta: o bloco simplesmente não aparece.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug, data.access.payChargeId, data.openCharges.length])

  if (enabled === null) return null

  const chargeId = failure?.payload.platformChargeId ?? data.access.payChargeId
  const hasOpen = data.openCharges.length > 0

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
        <Handshake className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium text-foreground">Débito automático do saldo no vencimento:</span>
        <span className={enabled ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-muted-foreground'}>
          {enabled ? 'ativo' : 'desativado'}
        </span>
        <span className="text-xs text-muted-foreground">
          {enabled
            ? 'A fatura é quitada com o saldo da conta de recebimento gerenciada pela ANNETEC.'
            : 'As faturas são pagas por Pix ou boleto.'}
        </span>
      </section>

      {failure && hasOpen ? (
        <Notice
          tone="warning"
          title="Não conseguimos debitar a fatura do saldo"
          action={
            chargeId ? (
              <Button asChild size="sm" className="rounded-lg">
                <Link href={tenantInvoicePath(slug, chargeId)}>Pagar a fatura</Link>
              </Button>
            ) : null
          }
        >
          {failure.body ?? failure.title} Tentativa em {formatDateTimeBR(failure.createdAt)}. Pague a fatura por Pix ou
          boleto.
        </Notice>
      ) : null}
    </div>
  )
}
