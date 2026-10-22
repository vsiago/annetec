'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, KeyRound, RefreshCw, SearchX } from 'lucide-react'
import type { OnboardingApplicantView } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { getOnboardingAction } from '@/lib/actions/contratacao-api'
import { rememberProposal, trackingPath } from '@/lib/adapters/contratacao'
import { B2BFooter, B2BHeader } from './shell'
import { Tracking } from './tracking'
import { PageLoading } from './ui'
import { Wizard } from './wizard'

const FALHA = 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.'

/**
 * `/contratar/<id>?chave=` — a mesma página serve o wizard (proposta em
 * `draft` ou `pending_info`) e o acompanhamento (demais estados). A visão vem
 * da API a cada ação, então recarregar a página nunca perde o que foi salvo.
 */
export function OnboardingApp() {
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const id = params?.id ?? ''
  const chave = search.get('chave') ?? ''
  const [view, setView] = useState<OnboardingApplicantView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const sequence = useRef(0)

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const current = ++sequence.current
      if (!id || !chave) {
        setError('O link da proposta está incompleto. Use o link completo enviado por e-mail.')
        setLoading(false)
        return
      }
      if (!options?.silent) setLoading(true)
      try {
        const result = await getOnboardingAction(id, chave)
        if (current !== sequence.current) return
        if (result.success) {
          setView(result.data)
          setError(null)
        } else if (!options?.silent) {
          setError(result.error)
        }
      } catch {
        if (current === sequence.current && !options?.silent) setError(FALHA)
      } finally {
        if (current === sequence.current) setLoading(false)
      }
    },
    [id, chave],
  )

  useEffect(() => {
    void load()
  }, [load])

  // Guarda o atalho "continuar proposta" neste navegador (só o caminho com a chave).
  useEffect(() => {
    if (view && !['active', 'rejected', 'canceled'].includes(view.status)) {
      rememberProposal({ id: view.id, code: view.code, path: trackingPath(view.id, chave) })
    }
  }, [view, chave])

  const applyView = useCallback((next: OnboardingApplicantView) => {
    sequence.current++
    setView(next)
    setError(null)
  }, [])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${trackingPath(id, chave)}`)
      toast.success('Link copiado', { description: 'Guarde este link: é por ele que você volta à proposta.' })
    } catch {
      toast.error('Não foi possível copiar. Copie o endereço da barra do navegador.')
    }
  }

  const header = (
    <B2BHeader
      action={
        view ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => void copyLink()}>
            <Copy className="size-4" aria-hidden />
            <span className="hidden sm:inline">Copiar link da proposta</span>
            <span className="sm:hidden">Link</span>
          </Button>
        ) : null
      }
    />
  )

  if (!view) {
    return (
      <>
        {header}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
          {loading ? (
            <PageLoading label="Carregando a proposta…" />
          ) : (
            <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
              <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <SearchX className="size-8" aria-hidden />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Não abrimos esta proposta</h1>
              <p className="mt-2 text-muted-foreground">{error}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Se o link foi copiado pela metade ou é antigo, peça um novo: enviamos para o e-mail cadastrado.
              </p>
              <div className="mt-6 flex w-full flex-col gap-3">
                <Button type="button" onClick={() => void load()} className="h-12 gap-2 rounded-xl">
                  <RefreshCw className="size-4" aria-hidden />
                  Tentar novamente
                </Button>
                <Button asChild variant="outline" className="h-12 gap-2 rounded-xl">
                  <Link href="/contratar/recuperar">
                    <KeyRound className="size-4" aria-hidden />
                    Receber o link por e-mail
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </main>
        <B2BFooter />
      </>
    )
  }

  return (
    <>
      {header}
      {view.canEdit ? (
        <Wizard view={view} proposalId={id} chave={chave} onViewChange={applyView} onReload={() => load({ silent: true })} />
      ) : (
        <Tracking view={view} proposalId={id} chave={chave} onViewChange={applyView} onReload={() => load({ silent: true })} />
      )}
      <B2BFooter />
    </>
  )
}
