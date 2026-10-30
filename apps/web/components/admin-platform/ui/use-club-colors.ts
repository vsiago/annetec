'use client'

import { useCallback, useMemo } from 'react'
import { useTenants } from '@/contexts/tenants-context'

/**
 * Cor primária cadastrada de cada clube (Aparência), pelo id da organização —
 * para o `EntityAvatar` das listas do console. Usa a lista de clubes que o
 * layout do /admin já carrega (`TenantsProvider`); enquanto ela não chega, ou
 * para um clube sem cor, devolve `null` e o avatar fica marinho.
 */
export function useClubColors(): (organizationId: string | null | undefined) => string | null {
  const { tenants } = useTenants()
  const byId = useMemo(() => {
    const map = new Map<string, string>()
    for (const tenant of tenants) {
      const color = tenant.branding?.primaryColor
      if (color) map.set(tenant.id, color)
    }
    return map
  }, [tenants])
  return useCallback((organizationId: string | null | undefined) => (organizationId ? byId.get(organizationId) ?? null : null), [byId])
}
