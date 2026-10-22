'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { PageMeta, PaymentEvent, PaymentEventSource } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterSelect } from '@/components/dashboard/table-controls'
import { listPaymentEventsAction } from '@/lib/actions/faturamento-api'
import { PAYMENT_EVENT_SOURCE_LABELS } from '@/lib/adapters/faturamento'
import { EventsTimeline, LoadError } from './billing-ui'

const SOURCE_OPTIONS = (Object.keys(PAYMENT_EVENT_SOURCE_LABELS) as PaymentEventSource[]).map(value => ({
  value,
  label: PAYMENT_EVENT_SOURCE_LABELS[value],
}))

/**
 * Linha do tempo de `payment_events` do inquilino, mais recente primeiro.
 * É a prova de que a cobrança anda sozinha: cada linha diz o que aconteceu e
 * quem fez (webhook do gateway, automação, checkout, equipe ou simulação).
 */
export function EventsFeed({
  tenantSlug,
  version = 0,
  perPage = 15,
  showFilter = true,
  allowMore = true,
}: {
  tenantSlug: string
  /** Muda quando algo foi alterado na tela — recarrega a primeira página. */
  version?: number
  perPage?: number
  showFilter?: boolean
  allowMore?: boolean
}) {
  const [source, setSource] = useState<'all' | PaymentEventSource>('all')
  const [items, setItems] = useState<PaymentEvent[]>([])
  const [meta, setMeta] = useState<PageMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sequence = useRef(0)

  async function load(page: number, append: boolean) {
    if (!tenantSlug) return
    const id = ++sequence.current
    if (append) setLoadingMore(true)
    else if (items.length === 0) setLoading(true)
    try {
      const result = await listPaymentEventsAction(tenantSlug, {
        page,
        perPage,
        source: source === 'all' ? undefined : source,
      })
      if (id !== sequence.current) return
      if (!result.success) {
        setError(result.error)
        return
      }
      setError(null)
      setMeta(result.data.meta)
      setItems(previous => (append ? [...previous, ...result.data.items] : result.data.items))
    } catch {
      if (id === sequence.current) setError('Não foi possível carregar o histórico de eventos.')
    } finally {
      if (id === sequence.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    void load(1, false)
    // `load` lê o filtro atual; recarrega quando ele ou a versão mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, source, version, perPage])

  const page = meta?.page ?? 1
  const hasMore = allowMore && meta !== null && page < meta.totalPages

  return (
    <div className="space-y-4">
      {showFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {meta ? `${meta.total.toLocaleString('pt-BR')} eventos registrados` : 'Carregando eventos…'}
          </p>
          <FilterSelect
            label="Origem"
            value={source}
            onChange={value => setSource(value as 'all' | PaymentEventSource)}
            allLabel="Todas as origens"
            options={SOURCE_OPTIONS}
          />
        </div>
      )}

      {error && <LoadError message={error} onRetry={() => void load(1, false)} />}

      {loading && items.length === 0 && !error ? (
        <div className="space-y-4">
          {Array.from({ length: Math.min(perPage, 5) }, (_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        !error && (
          <EventsTimeline
            events={items}
            emptyText={
              source === 'all'
                ? 'Nenhum evento ainda. Eles aparecem aqui assim que o primeiro checkout ou a automação rodar.'
                : 'Nenhum evento desta origem.'
            }
          />
        )
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="gap-2"
            disabled={loadingMore}
            onClick={() => void load(page + 1, true)}
          >
            {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  )
}
