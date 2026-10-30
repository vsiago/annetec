'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Info, Search, TriangleAlert } from 'lucide-react'
import { isValidCnpj, onlyDigits, type PlatformPlanOffer, type PublicCnpjLookupResponse } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Notice } from '@/components/admin-platform/ui/wizard'
import type { CnpjLookupState } from '@/components/contratar/hooks'
import { listSellerPlansAction } from '@/lib/actions/vendas-api'

/**
 * Peças comuns da área do vendedor: planos ANNETEC (inclusive os fora da
 * vitrine, que só o vendedor oferece) e o aviso da consulta do CNPJ na Receita.
 */

let plansCache: PlatformPlanOffer[] | null = null

/** Planos para o vendedor (`GET /vendas/planos`), guardados enquanto a aba estiver aberta. */
export function useSellerPlans() {
  const [plans, setPlans] = useState<PlatformPlanOffer[] | null>(plansCache)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(plansCache === null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listSellerPlansAction()
      if (result.success) {
        const sorted = [...result.data].sort(
          (a, b) => (a.pricing.sortOrder ?? 999) - (b.pricing.sortOrder ?? 999) || a.priceMonthly - b.priceMonthly,
        )
        plansCache = sorted
        setPlans(sorted)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Não foi possível carregar os planos. Verifique a conexão e tente de novo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (plansCache === null) void reload()
  }, [reload])

  return { plans: plans ?? [], loaded: plans !== null, error, loading, reload }
}

/** Nome que a Receita dá à empresa (fantasia, senão razão social). */
export function receitaName(response: PublicCnpjLookupResponse | null | undefined): string | null {
  const result = response?.found ? response.result : null
  if (!result) return null
  return result.tradeName?.trim() || result.legalName?.trim() || null
}

/** Aviso abaixo do campo CNPJ: consultando, encontrado, não encontrado ou Receita fora do ar. */
export function CnpjLookupNotice({ cnpj, lookup, onRetry }: { cnpj: string; lookup: CnpjLookupState; onRetry: () => void }) {
  const digits = onlyDigits(cnpj)
  const complete = digits.length === 14 && isValidCnpj(digits)
  if (!complete) return null
  const receita = lookup.state === 'done' ? lookup.response : null
  const situation = receita?.result?.registrationStatus
  const inactive = Boolean(situation && situation.toUpperCase() !== 'ATIVA')
  return (
    <div aria-live="polite" className="sm:col-span-12">
      {lookup.state === 'loading' ? (
        <Notice tone="neutral" icon={Search}>
          Consultando o CNPJ na Receita Federal…
        </Notice>
      ) : null}
      {receita?.found && receita.result ? (
        <Notice
          tone={inactive ? 'warning' : 'success'}
          icon={inactive ? TriangleAlert : CheckCircle2}
          title={inactive ? `Na Receita, a situação deste CNPJ é ${situation}.` : 'CNPJ encontrado na Receita Federal.'}
        >
          {receita.result.legalName}
          {receita.result.address.city ? ` · ${receita.result.address.city}/${receita.result.address.state ?? ''}` : ''}
        </Notice>
      ) : null}
      {receita && !receita.found && !receita.unavailable ? (
        <Notice tone="warning" icon={TriangleAlert}>
          Não encontramos este CNPJ na Receita Federal. Confira o número.
        </Notice>
      ) : null}
      {receita?.unavailable || lookup.state === 'error' ? (
        <Notice
          tone="neutral"
          icon={Info}
          action={
            <Button type="button" variant="outline" onClick={onRetry} className="h-10 rounded-[10px] border-[#D0D5DD] px-3 text-[13px] font-semibold text-[#344054]">
              Tentar de novo
            </Button>
          }
        >
          A consulta à Receita não respondeu agora. Dá para continuar — a ANNETEC confere de novo na análise.
        </Notice>
      ) : null}
    </div>
  )
}
