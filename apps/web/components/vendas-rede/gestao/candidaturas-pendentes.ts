'use client'

import { useEffect, useState } from 'react'
import { resumoCandidaturasAction } from '@/lib/actions/vendas-candidaturas-gestao-api'
import type { EscopoRede } from './tipos'

/** Evento disparado após aprovar/recusar, para o contador do menu recarregar sem polling. */
const EVENTO = 'annetec:candidaturas-atualizadas'

export function avisarCandidaturasAtualizadas(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO))
}

/**
 * Candidaturas em análise (badge do menu). Carrega uma vez ao montar e de novo
 * após cada decisão; qualquer falha (ex.: sem permissão) esconde o badge.
 */
export function usePendentesCandidaturas(escopo: EscopoRede): number {
  const [pendentes, setPendentes] = useState(0)
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug

  useEffect(() => {
    let ativo = true
    const carregar = () => {
      void resumoCandidaturasAction(chave === 'platform' ? { kind: 'platform' } : { kind: 'tenant', slug: chave }).then(r => {
        if (ativo) setPendentes(r.success ? r.data.pendentes : 0)
      })
    }
    carregar()
    window.addEventListener(EVENTO, carregar)
    return () => {
      ativo = false
      window.removeEventListener(EVENTO, carregar)
    }
  }, [chave])

  return pendentes
}
