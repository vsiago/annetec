'use client'

import { useEffect, useState } from 'react'
import { isDemoMode, type DemoModeContext } from '@/lib/demo-mode'

/** Tipo do módulo de atalhos — só tipo: não puxa o código para o bundle. */
export type ContratarDemo = typeof import('./index')

/**
 * Atalhos de demonstração da contratação, carregados sob demanda. Devolve o
 * módulo só quando o DTO da API diz que o ambiente é de demonstração
 * (`isDemoMode`, normalmente `demoToolsEnabled`); fora disso, `null` e o
 * chunk com os dados fictícios nem é baixado.
 */
export function useContratarDemo(source: DemoModeContext | null | undefined): ContratarDemo | null {
  const enabled = isDemoMode(source)
  const [demo, setDemo] = useState<ContratarDemo | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    import('./index')
      .then(mod => {
        if (alive) setDemo(mod)
      })
      .catch(() => {
        // Sem o chunk só não há atalhos; a jornada segue normal.
      })
    return () => {
      alive = false
    }
  }, [enabled])

  return enabled ? demo : null
}
