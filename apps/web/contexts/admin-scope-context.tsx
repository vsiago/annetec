'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Tenant } from '@annetec/contracts'
import { getOperatorAction } from '@/lib/actions/operator-api'
import { useTenants } from './tenants-context'

/**
 * Sobre QUEM as telas operacionais do /admin agem.
 *
 * As rotas de operação são todas por inquilino (`/api/v1/t/:slug/*`) e sessão
 * de plataforma passa livre por `requireTenantRole`, então a equipe Annetec
 * consegue abrir a carteira de qualquer inquilino. O que faltava era escolher
 * de quem: cada tela chamava `getOperatorAction()` direto e ficava presa à
 * Annetec-como-operadora. Na prática, Leads e Parceiros apareciam vazios
 * enquanto havia dados nos inquilinos — sem nada na tela explicando por quê.
 *
 * Aqui a escolha vira estado compartilhado. O padrão continua sendo a
 * operadora (é a carteira que a Annetec opera todo dia); trocar para um
 * inquilino repõe o mesmo conjunto de telas com os dados dele.
 */
const STORAGE_KEY = 'annetec.admin.escopo'

export interface AdminScopeOption {
  /** Id da organização — as rotas `/platform/tenants/:id/*` são por id, não por slug. */
  id: string
  slug: string
  name: string
  kind: 'platform' | 'operator'
  status: Tenant['status']
}

interface AdminScopeContextType {
  isLoading: boolean
  /** `null` enquanto carrega ou quando a operadora não está configurada. */
  slug: string | null
  tenantId: string | null
  current: AdminScopeOption | null
  options: AdminScopeOption[]
  /** Mensagem pronta para a tela quando não há escopo utilizável. */
  error: string
  select: (slug: string) => void
}

const AdminScopeContext = createContext<AdminScopeContextType | undefined>(undefined)

export function AdminScopeProvider({ children }: { children: ReactNode }) {
  const { tenants, isLoading: loadingTenants } = useTenants()
  const [operator, setOperator] = useState<AdminScopeOption | null>(null)
  const [loadingOperator, setLoadingOperator] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    getOperatorAction().then(result => {
      setLoadingOperator(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      if (!result.data) {
        setError(
          'A Annetec ainda não está configurada como operadora. Escolha um inquilino para operar, ou crie a operadora em Inquilinos.',
        )
        return
      }
      setOperator({
        id: result.data.id,
        slug: result.data.slug,
        name: `${result.data.name} (operadora)`,
        kind: 'platform',
        status: result.data.status,
      })
    })
  }, [])

  const options = useMemo<AdminScopeOption[]>(() => {
    const doInquilino = tenants
      // Inquilino cancelado não resolve nas rotas de API — não oferecer.
      .filter(tenant => tenant.status !== 'cancelled')
      .map<AdminScopeOption>(tenant => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        kind: 'operator',
        status: tenant.status as Tenant['status'],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

    return operator ? [operator, ...doInquilino] : doInquilino
  }, [operator, tenants])

  // Restaura a última escolha só depois que as opções existem, para não fixar
  // um slug que sumiu (inquilino cancelado, por exemplo).
  useEffect(() => {
    if (options.length === 0 || selected) return
    let inicial = options[0]!.slug
    try {
      const guardado = localStorage.getItem(STORAGE_KEY)
      if (guardado && options.some(option => option.slug === guardado)) inicial = guardado
    } catch {
      // Navegador sem storage: segue com o padrão.
    }
    setSelected(inicial)
  }, [options, selected])

  const select = useCallback((slug: string) => {
    setSelected(slug)
    try {
      localStorage.setItem(STORAGE_KEY, slug)
    } catch {
      // Preferência é conveniência; não vale quebrar a tela por ela.
    }
  }, [])

  const current = options.find(option => option.slug === selected) ?? null
  const isLoading = loadingOperator || loadingTenants

  return (
    <AdminScopeContext.Provider
      value={{
        isLoading,
        slug: current?.slug ?? null,
        tenantId: current?.id ?? null,
        current,
        options,
        error: !isLoading && options.length === 0 ? error || 'Nenhum inquilino disponível.' : '',
        select,
      }}
    >
      {children}
    </AdminScopeContext.Provider>
  )
}

export function useAdminScope() {
  const context = useContext(AdminScopeContext)
  if (!context) throw new Error('useAdminScope precisa estar dentro de AdminScopeProvider')
  return context
}
