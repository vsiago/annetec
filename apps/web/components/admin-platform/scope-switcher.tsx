'use client'

import { Building2, ChevronDown, Layers } from 'lucide-react'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Diz de quem são os dados nas telas operacionais e deixa trocar.
 *
 * Fica no topo da área de conteúdo, não na sidebar: a sidebar navega entre
 * assuntos, isto muda o sujeito — e ele precisa estar visível justamente nas
 * telas onde a pessoa está lendo os números.
 */
export function ScopeSwitcher() {
  const { current, options, select, isLoading } = useAdminScope()

  if (isLoading) {
    return <div className="h-9 w-64 rounded-md bg-muted/60 animate-pulse" aria-hidden="true" />
  }

  if (options.length === 0) return null

  const operadora = options.filter(option => option.kind === 'platform')
  const inquilinos = options.filter(option => option.kind === 'operator')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Exibindo dados de
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Trocar o inquilino exibido"
          >
            {current?.kind === 'platform' ? (
              <Layers className="h-4 w-4 text-primary" />
            ) : (
              <Building2 className="h-4 w-4 text-secondary" />
            )}
            <span className="max-w-[220px] truncate">{current?.name ?? 'Selecione'}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72">
          {operadora.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Carteira própria
              </DropdownMenuLabel>
              {operadora.map(option => (
                <DropdownMenuItem key={option.slug} onClick={() => select(option.slug)}>
                  <Layers className="mr-2 h-4 w-4 text-primary" />
                  <span className="truncate">{option.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Inquilinos ({inquilinos.length})
          </DropdownMenuLabel>
          {inquilinos.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum inquilino ativo.</p>
          )}
          {inquilinos.map(option => (
            <DropdownMenuItem key={option.slug} onClick={() => select(option.slug)}>
              <Building2 className="mr-2 h-4 w-4 text-secondary" />
              <span className="flex-1 truncate">{option.name}</span>
              {option.status !== 'active' && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  {option.status === 'trial' ? 'Trial' : 'Suspenso'}
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {current?.kind === 'operator' && (
        <span className="text-xs text-muted-foreground">
          Você está vendo a carteira de um inquilino, não a da Annetec.
        </span>
      )}
    </div>
  )
}
