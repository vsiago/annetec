'use client'

import { useEffect, useState } from 'react'
import { sortClubPlansForDisplay, type ClubPaymentMethod } from '@annetec/contracts'
import { getCheckoutContextAction } from '@/lib/actions/checkout-api'
import { listPublicClubPlansAction, type PublicClubPlan } from '@/lib/actions/tenant-public-api'

/**
 * Plano como a vitrine usa: o `ClubPlan` do contrato. Os campos do modelo
 * completo (coberturas, adesão, fidelidade...) são opcionais: sem eles, a
 * vitrine mostra o que mostrava antes (`features`).
 */
export type VitrinePlan = PublicClubPlan

/**
 * Cache por slug no módulo: ir da landing para `/planos` e voltar não refaz a
 * busca, e várias seções montando ao mesmo tempo dividem a mesma requisição.
 */
const cache = new Map<string, VitrinePlan[]>()
const inFlight = new Map<string, Promise<{ plans: VitrinePlan[] | null; error: string | null }>>()

function fetchPlans(slug: string) {
  const pending = inFlight.get(slug)
  if (pending) return pending
  const request = listPublicClubPlansAction(slug)
    .then(result => {
      if (result.success) {
        // Ordem de exibição oficial: `sortOrder`, depois destaque, preço e nome.
        const plans = sortClubPlansForDisplay(result.data)
        cache.set(slug, plans)
        return { plans, error: null }
      }
      return { plans: null, error: result.error }
    })
    .catch(() => ({ plans: null, error: 'Não foi possível carregar os planos.' }))
    .finally(() => inFlight.delete(slug))
  inFlight.set(slug, request)
  return request
}

/** Planos ativos do clube, lidos da vitrine pública (sem sessão), na ordem de exibição. */
export function usePublicPlans(slug: string | undefined) {
  const cached = slug ? cache.get(slug) : undefined
  const [plans, setPlans] = useState<VitrinePlan[]>(cached ?? [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let active = true
    fetchPlans(slug).then(({ plans: loaded, error: failure }) => {
      if (!active) return
      if (loaded) setPlans(loaded)
      setError(failure)
      setIsLoading(false)
    })
    return () => {
      active = false
    }
  }, [slug])

  return { plans, isLoading, error }
}

const methodsCache = new Map<string, ClubPaymentMethod[]>()
const methodsInFlight = new Map<string, Promise<ClubPaymentMethod[] | null>>()

function fetchPaymentMethods(slug: string): Promise<ClubPaymentMethod[] | null> {
  const cached = methodsCache.get(slug)
  if (cached) return Promise.resolve(cached)
  const pending = methodsInFlight.get(slug)
  if (pending) return pending
  const request = getCheckoutContextAction(slug)
    .then(result => (result.success ? result.data.enabledMethods : null))
    .catch(() => null)
    .then(methods => {
      if (methods) methodsCache.set(slug, methods)
      return methods
    })
    .finally(() => methodsInFlight.delete(slug))
  methodsInFlight.set(slug, request)
  return request
}

/**
 * Formas de pagamento habilitadas no clube (as mesmas do checkout), para a
 * vitrine mostrar as formas EFETIVAS de cada plano. `null` enquanto carrega
 * ou se a leitura falhar: a tela usa só o que o próprio plano informa.
 */
export function usePublicPaymentMethods(slug: string | undefined): ClubPaymentMethod[] | null {
  const [methods, setMethods] = useState<ClubPaymentMethod[] | null>(() => (slug ? methodsCache.get(slug) ?? null : null))

  useEffect(() => {
    if (!slug) return
    let active = true
    fetchPaymentMethods(slug).then(loaded => {
      if (active && loaded) setMethods(loaded)
    })
    return () => {
      active = false
    }
  }, [slug])

  return methods
}
