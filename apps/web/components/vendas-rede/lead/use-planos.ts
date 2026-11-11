'use client'

import { useCallback, useEffect, useState } from 'react'
import { listarPlanosAction } from '@/lib/actions/vendas-rede-api'
import { chaveDoEscopo, type EscopoVendas } from '@/lib/vendas-rede/escopo'
import type { PlanoVendavel } from '@/lib/vendas-rede/tipos'

/** Planos que o agente pode oferecer neste escopo (carregados na 1ª vez que a aba de conversão abre). */
export function usePlanos(escopo: EscopoVendas, ativo = true) {
  const [planos, setPlanos] = useState<PlanoVendavel[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const chave = chaveDoEscopo(escopo)

  const carregar = useCallback(async () => {
    setErro(null)
    const r = await listarPlanosAction(escopo)
    if (r.success) setPlanos(r.data)
    else setErro(r.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  useEffect(() => {
    if (ativo && planos === null) void carregar()
  }, [ativo, planos, carregar])

  return { planos, erro, recarregar: carregar }
}
