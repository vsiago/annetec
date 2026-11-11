'use client'

import { useEffect, useState } from 'react'
import { Loader2, Search, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { PAPEL_COMERCIAL_LABELS, type VendasAgente, type VendasLead } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { listarAgentesAction, reatribuirLeadAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import { PresencaDot } from '../ui/presenca-dot'
import { FOCUS_RING } from '../ui/tokens'
import { devolverAoPool } from './acoes'
import { cn } from '@/lib/utils'

/**
 * Reatribuir: lista dos agentes que o seu papel enxerga (`GET /rede/agentes`),
 * com busca, e a opção "Devolver ao pool". Devolver mostra toast com "Desfazer".
 */
export function ReatribuirDialog({
  aberto,
  aoFechar,
  escopo,
  lead,
  aoConcluir,
}: {
  aberto: boolean
  aoFechar: () => void
  escopo: EscopoVendas
  lead: Pick<VendasLead, 'id' | 'nome' | 'agenteId'>
  aoConcluir: () => void
}) {
  const [agentes, setAgentes] = useState<VendasAgente[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let cancelado = false
    setAgentes(null)
    setErro(null)
    setBusca('')
    void listarAgentesAction(escopo, { perPage: 100 }).then(r => {
      if (cancelado) return
      if (r.success) setAgentes(r.data.filter(a => a.ativo && a.papel !== 'balcao'))
      else setErro(r.error)
    })
    return () => {
      cancelado = true
    }
  }, [aberto, escopo])

  const termo = busca.trim().toLowerCase()
  const visiveis = (agentes ?? []).filter(a => !termo || a.nome.toLowerCase().includes(termo))

  async function atribuir(agente: VendasAgente) {
    setSalvando(agente.id)
    const r = await reatribuirLeadAction(escopo, lead.id, agente.id)
    setSalvando(null)
    if (!r.success) {
      toast.error(r.error)
      return
    }
    toast.success(`${lead.nome} agora está com ${agente.nome}`)
    aoConcluir()
    aoFechar()
  }

  async function devolver() {
    setSalvando('pool')
    const ok = await devolverAoPool(escopo, lead, aoConcluir)
    setSalvando(null)
    if (ok) aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={o => (!o && !salvando ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reatribuir lead</DialogTitle>
          <DialogDescription>Escolha quem passa a cuidar de {lead.nome}, ou devolva ao pool para qualquer agente pegar.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar agente pelo nome"
              aria-label="Buscar agente pelo nome"
              className="min-h-11 pl-9"
            />
          </div>
          <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
            {!agentes && !erro ? (
              <li className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Carregando agentes…
              </li>
            ) : null}
            {erro ? (
              <li role="alert" className="py-6 text-center text-sm text-[#B42318]">
                {erro}
              </li>
            ) : null}
            {agentes && visiveis.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">Nenhum agente encontrado.</li>
            ) : null}
            {visiveis.map(a => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => void atribuir(a)}
                  disabled={Boolean(salvando) || a.id === lead.agenteId}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-[#F2F4F7] disabled:opacity-50',
                    FOCUS_RING,
                  )}
                >
                  <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-xs font-bold text-[#1E2A4A]">
                    {initialsOf(a.nome)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">{a.nome}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {PAPEL_COMERCIAL_LABELS[a.papel]}
                      {a.id === lead.agenteId ? ' · já está com ele(a)' : ''}
                    </span>
                  </span>
                  {salvando === a.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PresencaDot online={a.online} rotulo />}
                </button>
              </li>
            ))}
          </ul>
          {lead.agenteId ? (
            <button
              type="button"
              onClick={() => void devolver()}
              disabled={Boolean(salvando)}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-foreground hover:bg-[#F2F4F7] disabled:opacity-50',
                FOCUS_RING,
              )}
            >
              {salvando === 'pool' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Undo2 className="size-4" aria-hidden="true" />}
              Devolver ao pool
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
