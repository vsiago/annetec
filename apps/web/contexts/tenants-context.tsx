'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { CreatePlatformUserInput, CreateTenantInput, UpdateTenantInput } from '@annetec/contracts'
import type { Tenant, TenantPlan, PlatformUser } from '@/lib/types'
import {
  listTenantsAction,
  createTenantAction,
  updateTenantAction,
  listTenantPlansAction,
} from '@/lib/actions/tenants-api'
import { listPlatformUsersAction, createPlatformUserAction } from '@/lib/actions/platform-users-api'

interface TenantsContextType {
  isLoading: boolean
  tenants: Tenant[]
  plans: TenantPlan[]
  platformUsers: PlatformUser[]
  refresh: () => Promise<void>
  createTenant: (
    input: CreateTenantInput,
  ) => Promise<{ success: boolean; error?: string; data?: Tenant; ownerPassword?: string }>
  updateTenant: (id: string, patch: UpdateTenantInput) => Promise<{ success: boolean; error?: string }>
  createPlatformUser: (input: CreatePlatformUserInput) => Promise<{ success: boolean; error?: string }>
}

const TenantsContext = createContext<TenantsContextType | undefined>(undefined)

// Platform-level data (used only within /admin/** — the superadmin panel).
// Fala direto com a API — nada aqui é mock.
export function TenantsProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [plans, setPlans] = useState<TenantPlan[]>([])
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const [t, p, u] = await Promise.all([listTenantsAction(), listTenantPlansAction(), listPlatformUsersAction()])
    if (t.success) setTenants(t.data)
    if (p.success) setPlans(p.data)
    if (u.success) setPlatformUsers(u.data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <TenantsContext.Provider
      value={{
        isLoading,
        tenants,
        plans,
        platformUsers,
        refresh,
        createTenant: async input => {
          const result = await createTenantAction(input)
          await refresh()
          return result.success
            ? { success: true, data: result.data.tenant, ownerPassword: result.data.ownerPassword }
            : { success: false, error: result.error }
        },
        updateTenant: async (id, patch) => {
          const result = await updateTenantAction(id, patch)
          await refresh()
          return result.success ? { success: true } : { success: false, error: result.error }
        },
        createPlatformUser: async input => {
          const result = await createPlatformUserAction(input)
          await refresh()
          return result.success ? { success: true } : { success: false, error: result.error }
        },
      }}
    >
      {children}
    </TenantsContext.Provider>
  )
}

export function useTenants() {
  const context = useContext(TenantsContext)
  if (context === undefined) {
    throw new Error('useTenants must be used within a TenantsProvider')
  }
  return context
}
