'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, CircleCheck, Clock, Handshake, PiggyBank, RefreshCw, Store } from 'lucide-react'
import {
  RESULTADOS_BALCAO,
  RESULTADO_BALCAO_LABELS,
  type ResultadoBalcao,
  type VendasAgente,
  type VendasAtendimentoBalcao,
  type VendasBalcaoHoje,
} from '@annetec/contracts'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { type Column, DataTable, FilterSelect, StatusPill, TablePagination } from '@/components/dashboard/table-controls'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { balcaoAtendimentosAction, balcaoHojeAction } from '@/lib/actions/vendas-balcao-api'
import { listarAgentesAction } from '@/lib/actions/vendas-rede-api'
import type { Paged } from '@/lib/adapters/platform-console'
import { formatCurrency } from '@/lib/analytics'

const POR_PAGINA = 20

const COR_RESULTADO: Record<ResultadoBalcao, string> = {
  assinou: 'bg-emerald-50 text-emerald-700',
  vai_pensar: 'bg-amber-50 text-amber-700',
  recusou: 'bg-muted text-muted-foreground',
  ja_associado: 'bg-sky-50 text-sky-700',
  so_informacao: 'bg-muted text-muted-foreground',
}

function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dataHora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Balcão do clube: atendimentos de todas as unidades, com os totais do dia.
 * Filtros por dia, resultado e atendente.
 */
export function BalcaoClube({ slug }: { slug: string }) {
  const [dia, setDia] = useState(hojeLocal)
  const [resultado, setResultado] = useState('all')
  const [agente, setAgente] = useState('all')
  const [pagina, setPagina] = useState(1)
  const [agentes, setAgentes] = useState<VendasAgente[]>([])
  const [hoje, setHoje] = useState<VendasBalcaoHoje | null>(null)
  const [lista, setLista] = useState<Paged<VendasAtendimentoBalcao> | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void listarAgentesAction({ kind: 'tenant', slug }, { papel: 'balcao' }).then(r => {
      if (r.success) setAgentes(r.data)
    })
  }, [slug])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const [totais, atendimentos] = await Promise.all([
      balcaoHojeAction(slug),
      balcaoAtendimentosAction(slug, {
        dia: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : undefined,
        resultado: resultado === 'all' ? undefined : (resultado as ResultadoBalcao),
        agente: agente === 'all' ? undefined : agente,
        page: pagina,
        perPage: POR_PAGINA,
      }),
    ])
    setCarregando(false)
    if (totais.success) setHoje(totais.data)
    if (atendimentos.success) setLista(atendimentos.data)
    else setErro(atendimentos.error)
  }, [slug, dia, resultado, agente, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const colunas = useMemo<Column<VendasAtendimentoBalcao>[]>(
    () => [
      { key: 'quando', header: 'Quando', render: a => <span className="whitespace-nowrap">{dataHora(a.createdAt)}</span> },
      {
        key: 'pessoa',
        header: 'Pessoa',
        render: a => (
          <div className="min-w-0">
            <p className="m-0 truncate font-medium text-foreground">{a.nome}</p>
            {a.telefone ? <p className="m-0 text-xs text-muted-foreground">{a.telefone}</p> : null}
          </div>
        ),
      },
      { key: 'servico', header: 'Serviço', hideOnMobile: true, render: a => a.servico },
      {
        key: 'valor',
        header: 'Tabela / com plano',
        align: 'right',
        hideOnMobile: true,
        render: a =>
          a.valorTabela > 0 ? (
            <span className="tabular-nums">
              {formatCurrency(a.valorTabela)}
              {a.planoId ? <span className="text-muted-foreground"> → {formatCurrency(a.valorComPlano)}</span> : null}
            </span>
          ) : (
            '—'
          ),
      },
      { key: 'atendente', header: 'Atendente', hideOnMobile: true, render: a => a.agenteNome ?? '—' },
      {
        key: 'resultado',
        header: 'Resultado',
        render: a => <StatusPill label={a.resultadoLabel} className={COR_RESULTADO[a.resultado]} />,
      },
    ],
    [],
  )

  const totais = hoje?.totais
  const total = lista?.meta.total ?? 0
  const totalPaginas = Math.max(1, lista?.meta.totalPages ?? 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Balcão" description="Atendimentos de todas as unidades do clube: quem foi atendido, o que foi oferecido e como terminou.">
        <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={carregando ? 'animate-spin' : ''} aria-hidden="true" />
          Atualizar
        </Button>
      </PageHeader>

      <section aria-label="Totais de hoje" className="flex flex-col gap-3">
        <h2 className="m-0 text-sm font-semibold text-muted-foreground">Hoje</h2>
        {!totais ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Atendimentos" value={totais.atendimentos} icon={Store} />
            <StatCard label="Ofertas de plano" value={totais.ofertas} icon={Handshake} accent="info" />
            <StatCard label="Adesões" value={totais.adesoes} icon={CircleCheck} accent="success" />
            <StatCard label="Vão pensar" value={totais.vaiPensar} icon={Clock} accent="warning" />
            <StatCard
              label="Economia média"
              value={formatCurrency(totais.economiaMedia)}
              hint="Por oferta, sobre o valor de tabela"
              icon={PiggyBank}
              accent="success"
            />
          </div>
        )}
      </section>

      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Dia
              <Input
                type="date"
                value={dia}
                max={hojeLocal()}
                onChange={e => {
                  setDia(e.target.value)
                  setPagina(1)
                }}
                className="h-9 w-44"
              />
            </label>
            <FilterSelect
              label="Resultado"
              value={resultado}
              onChange={v => {
                setResultado(v)
                setPagina(1)
              }}
              allLabel="Todos"
              options={RESULTADOS_BALCAO.map(r => ({ value: r, label: RESULTADO_BALCAO_LABELS[r] }))}
            />
            <FilterSelect
              label="Atendente"
              value={agente}
              onChange={v => {
                setAgente(v)
                setPagina(1)
              }}
              allLabel="Todos"
              options={agentes.map(a => ({ value: a.id, label: a.nome }))}
            />
            {dia ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDia('')
                  setPagina(1)
                }}
              >
                <CalendarCheck aria-hidden="true" />
                Todos os dias
              </Button>
            ) : null}
          </div>
        </CardContent>

        {erro ? (
          <div role="alert" className="border-t border-border p-6 text-sm text-destructive">
            {erro}{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </div>
        ) : carregando && !lista ? (
          <div className="flex flex-col gap-2 border-t border-border p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (lista?.items.length ?? 0) === 0 ? (
          <EmptyStateCard
            icon={Store}
            title={agentes.length === 0 ? 'Nenhum atendente de balcão cadastrado' : 'Nenhum atendimento neste filtro'}
            description={
              agentes.length === 0
                ? 'Os atendimentos feitos no balcão das unidades aparecem aqui. Cadastre um atendente de balcão em Rede para começar.'
                : 'Os atendimentos feitos no balcão das unidades aparecem aqui. Tente outro dia ou limpe os filtros.'
            }
            action={
              agentes.length === 0 ? (
                <Button asChild>
                  <Link href={`/${slug}/admin/comercial/rede`}>Cadastrar atendente</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={colunas} rows={lista?.items ?? []} rowKey={a => a.id} />
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
              <p className="m-0 text-sm text-muted-foreground">{total.toLocaleString('pt-BR')} atendimentos</p>
              <TablePagination page={pagina} totalPages={totalPaginas} onChange={setPagina} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
