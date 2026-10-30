'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, Loader2, Plus, Search } from 'lucide-react'
import type { Prospect } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StagePill } from '@/components/sales/sales-ui'
import { listSellerProspectsAction } from '@/lib/actions/vendas-api'
import { proposalInProgress } from './prospect-actions'

/**
 * Escolher para qual prospect gerar o link (atalho "Gerar link" do painel).
 * Só aparecem os que podem ganhar link: no funil, sem proposta em andamento.
 */
export function canGenerateLink(prospect: Pick<Prospect, 'stage' | 'proposal'>): boolean {
  return prospect.stage !== 'ganho' && !proposalInProgress(prospect)
}

export function ProspectPickerDialog({
  open,
  onOpenChange,
  onPick,
  onCreateNew,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (prospect: Prospect) => void
  onCreateNew: () => void
}) {
  const [items, setItems] = useState<Prospect[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setSearch('')
    let alive = true
    void listSellerProspectsAction({ status: 'all', perPage: 200 }).then(result => {
      if (!alive) return
      if (result.success) {
        setItems(result.data.items.filter(canGenerateLink))
        setError(null)
      } else setError(result.error)
    })
    return () => {
      alive = false
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = items ?? []
    if (!term) return list
    return list.filter(item => [item.name, item.contactName, item.city, item.cnpj].some(value => value?.toLowerCase().includes(term)))
  }, [items, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-4 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar link para qual prospect?</DialogTitle>
          <DialogDescription>O link de contratação nasce de um prospect do seu funil.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por nome, contato ou cidade"
            aria-label="Buscar prospect"
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm outline-none focus-visible:border-secondary focus-visible:ring-[3px] focus-visible:ring-secondary/25"
          />
        </div>
        <div className="-mx-6 max-h-[48vh] overflow-y-auto border-y border-border">
          {error ? (
            <p role="alert" className="m-0 px-6 py-6 text-sm text-[#B42318]">
              {error}
            </p>
          ) : items === null ? (
            <p className="m-0 flex items-center gap-2 px-6 py-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando seus prospects…
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Building2}
              title={items.length === 0 ? 'Nenhum prospect pronto para o link' : 'Nenhum prospect com essa busca'}
              description={items.length === 0 ? 'Cadastre o prospect primeiro; o link sai dele.' : undefined}
            />
          ) : (
            <ul className="m-0 list-none divide-y divide-border p-0">
              {filtered.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[item.contactName, item.city && item.state ? `${item.city}/${item.state}` : item.city].filter(Boolean).join(' · ') ||
                          'Sem contato cadastrado'}
                      </span>
                    </span>
                    <StagePill stage={item.stage} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="h-11 rounded-[10px] px-4 font-semibold" onClick={onCreateNew}>
            <Plus aria-hidden="true" />
            Cadastrar novo prospect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
