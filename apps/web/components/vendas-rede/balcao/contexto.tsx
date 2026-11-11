'use client'

import { createContext, useContext } from 'react'
import type { VendasEu } from '@annetec/contracts'

export type BalcaoCtx = {
  slug: string
  eu: VendasEu
  /** Nome da unidade onde a pessoa atende (ou o do clube, para o admin sem unidade). */
  unidade: string
  recarregarEu: () => Promise<void>
}

export const BalcaoContexto = createContext<BalcaoCtx | null>(null)

export function useBalcao(): BalcaoCtx {
  const ctx = useContext(BalcaoContexto)
  if (!ctx) throw new Error('useBalcao precisa estar dentro do layout do balcão')
  return ctx
}
