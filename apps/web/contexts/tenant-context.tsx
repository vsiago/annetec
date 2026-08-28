'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import type { Tenant } from '@/lib/types'
import { getTenantPublicAction } from '@/lib/actions/tenant-public-api'

interface TenantContextType {
  tenant: Tenant | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

// Resolves the tenant for the current /[tenant]/... route from its slug.
// Every tenant-scoped provider/page below this one in the tree can rely on
// `tenant` being non-null once `isLoading` is false (TenantGate below
// handles the not-found case).
export function TenantProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ tenant: string }>()
  const slug = params?.tenant
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    if (!slug) return
    setIsLoading(true)
    const result = await getTenantPublicAction(slug)
    setTenant(result.success ? result.data : null)
    setIsLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  return (
    <TenantContext.Provider value={{ tenant, isLoading, refresh: load }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}
