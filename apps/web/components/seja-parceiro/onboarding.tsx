'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { CandidaturaPublica } from '@annetec/contracts'
import { Notice, PageLoading } from '@/components/contratar/ui'
import { obterCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import { Acompanhamento } from './acompanhamento'
import { basePath, type Escopo } from './escopo'
import { RecuperarAcessoDialog } from './recuperar-acesso'
import { FALHA_SERVIDOR } from './steps'
import { Wizard } from './wizard'

type Load =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; view: CandidaturaPublica }

/**
 * `/seja-parceiro/<id>?chave=` — wizard enquanto for rascunho; acompanhamento
 * nos demais status. Sem chave, ou com chave inválida, oferece recuperar o acesso.
 */
export function Onboarding({ escopo, id }: { escopo: Escopo; id: string }) {
  const chave = useSearchParams().get('chave') ?? ''
  const [load, setLoad] = useState<Load>(chave ? { state: 'loading' } : { state: 'error', message: '' })

  const fetchView = useCallback(async () => {
    if (!chave) return
    try {
      const result = await obterCandidaturaAction(escopo, id, chave)
      setLoad(
        result.success
          ? { state: 'ready', view: result.data }
          : { state: 'error', message: result.error },
      )
    } catch {
      setLoad({ state: 'error', message: FALHA_SERVIDOR })
    }
  }, [escopo, id, chave])

  useEffect(() => {
    void fetchView()
  }, [fetchView])

  const wrapper = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
  )

  if (!chave || load.state === 'error') {
    return wrapper(
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-foreground">Não foi possível abrir sua candidatura</h1>
        <Notice tone="warning" title={chave ? load.state === 'error' && load.message ? load.message : 'Link inválido ou expirado.' : 'Este link está incompleto (falta a chave de acesso).'}>
          Use o link que você recebeu por e-mail ou peça um novo com o e-mail da candidatura.
        </Notice>
        <div className="flex flex-wrap items-center gap-4">
          <RecuperarAcessoDialog escopo={escopo} label="Recuperar acesso" />
          <a href={basePath(escopo)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Começar uma nova candidatura
          </a>
        </div>
      </div>,
    )
  }

  if (load.state === 'loading') return wrapper(<PageLoading label="Carregando sua candidatura…" />)

  const { view } = load
  return wrapper(
    view.status === 'rascunho' ? (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Complete sua candidatura, {view.nome.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Seu progresso fica salvo neste link. Guarde-o para continuar depois.
          </p>
        </header>
        <Wizard escopo={escopo} view={view} chave={chave} onViewChange={next => setLoad({ state: 'ready', view: next })} />
      </div>
    ) : (
      <Acompanhamento escopo={escopo} view={view} />
    ),
  )
}
