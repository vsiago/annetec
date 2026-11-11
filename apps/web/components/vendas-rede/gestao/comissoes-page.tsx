'use client'

import { useEffect, useMemo, useState } from 'react'
import { Ban, Banknote, CircleCheck, Clock, HandCoins, Loader2, MinusCircle, Wallet, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  PARTE_COMISSAO_LABELS,
  STATUS_COMISSAO,
  STATUS_COMISSAO_LABELS,
  type PapelComercial,
  type StatusComissao,
  type VendasComissao,
  type VendasComissoesResposta,
  type VendasEu,
} from '@annetec/contracts'
import { ConfirmDialog, LoadError, RefreshButton, TableSkeleton, runCommand, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { FilterSelect } from '@/components/admin-platform/ui/table-controls'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cancelarComissaoAction, listComissoesAction, pagarComissoesAction, resumoComissoesAction } from '@/lib/actions/vendas-rede-gestao-api'
import { AcaoPrincipal } from '../ui/acao-principal'
import { ComissaoExtrato, type LinhaComissao } from '../ui/comissao-extrato'
import { EstadoVazio } from '../ui/estado-vazio'
import { formatarMoeda, formatarPercentual } from '../ui/mascaras'
import { KpiGrid } from '../ui/kpi-grid'
import { ValorMoeda } from '../ui/valor-moeda'
import { CabecalhoTela, PortaoDePapel, mesAtual, ultimosMeses } from './comum'
import type { ConsoleTone } from '@/components/admin-platform/ui/tone'
import type { EscopoRede, ResumoComissoes } from './tipos'

/**
 * Comissões: seletor de mês, cartões de totais por status, extrato com filtro
 * por status e agente, e resumo por beneficiário. O vendedor vê só as suas. O
 * master (no escopo) ganha seleção em lote, "Marcar como pago" (com referência
 * e data) e "Cancelar" com motivo, ambos com confirmação.
 */

const TOM_STATUS: Record<StatusComissao, StatusPillTone> = {
  prevista: 'info',
  a_pagar: 'warning',
  paga: 'success',
  cancelada: 'neutral',
  a_descontar: 'danger',
}

const DICA_STATUS: Record<StatusComissao, string> = {
  prevista: 'Fatura ainda não paga',
  a_pagar: 'Fatura paga, comissão liberada',
  paga: 'Comissão paga',
  cancelada: 'Estornada ou cancelada',
  a_descontar: 'Abatida do próximo pagamento',
}

const VISUAL_STATUS: Record<StatusComissao, { icone: LucideIcon; tom: ConsoleTone }> = {
  prevista: { icone: Clock, tom: 'blue' },
  a_pagar: { icone: HandCoins, tom: 'amber' },
  paga: { icone: CircleCheck, tom: 'green' },
  cancelada: { icone: Ban, tom: 'neutral' },
  a_descontar: { icone: MinusCircle, tom: 'red' },
}

export function ComissoesPage({ escopo }: { escopo: EscopoRede }) {
  return <PortaoDePapel escopo={escopo} tela="comissoes">{eu => <ComissoesConteudo escopo={escopo} eu={eu} />}</PortaoDePapel>
}

export function ComissoesConteudo({ escopo, eu }: { escopo: EscopoRede; eu: VendasEu }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const papel: PapelComercial = eu.papel
  const master = papel === 'master'
  const veTodos = papel !== 'vendedor'
  const meses = useMemo(() => ultimosMeses(12), [])
  const [mes, setMes] = useState(mesAtual())
  const [status, setStatus] = useState('all')
  const [agente, setAgente] = useState('all')
  const [pagina, setPagina] = useState(1)
  const [versao, setVersao] = useState(0)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [pagando, setPagando] = useState(false)
  const [cancelando, setCancelando] = useState<VendasComissao | null>(null)

  const lista = useConsoleData<VendasComissoesResposta>(
    () =>
      listComissoesAction(escopo, {
        mes,
        page: pagina,
        perPage: 100,
        ...(status !== 'all' ? { status: status as StatusComissao } : {}),
        ...(agente !== 'all' ? { agente } : {}),
      }),
    [chave, mes, status, agente, pagina, versao],
  )
  const resumo = useConsoleData<ResumoComissoes>(veTodos ? () => resumoComissoesAction(escopo, mes) : null, [chave, mes, veTodos, versao])

  const itens = useMemo(() => lista.data?.items ?? [], [lista.data])
  const pagaveis = itens.filter(i => i.status === 'a_pagar')
  const selecionadas = pagaveis.filter(i => marcadas.has(i.id))
  const somaSelecionada = selecionadas.reduce((s, i) => s + i.valor, 0)
  const todasMarcadas = pagaveis.length > 0 && selecionadas.length === pagaveis.length

  const recarregar = () => {
    setMarcadas(new Set())
    setVersao(v => v + 1)
  }
  const trocar = <T,>(fn: (v: T) => void) => (v: T) => {
    setMarcadas(new Set())
    setPagina(1)
    fn(v)
  }

  const opcoesAgente = (resumo.data?.beneficiarios ?? [])
    .filter(b => b.beneficiarioAgenteId)
    .map(b => ({ value: b.beneficiarioAgenteId as string, label: b.nome }))
  const totais = lista.data?.totais
  const totalPaginas = lista.data ? Math.max(1, Math.ceil(lista.data.total / lista.data.perPage)) : 1

  const linhas: LinhaComissao[] = itens.map(c => ({
    id: c.id,
    descricao: [c.leadNome ?? (c.tipo === 'adesao' ? 'Taxa de adesão' : 'Mensalidade'), veTodos ? c.beneficiarioNome : null].filter(Boolean).join(' · '),
    parcela: c.parcela,
    tipo: c.tipo,
    base: c.base,
    percentual: c.percentual,
    valor: c.valor,
    parte: c.parte,
    status: c.status,
  }))

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoTela
        icone={Wallet}
        titulo="Comissões"
        descricao={
          master
            ? 'Acompanhe o que foi gerado no mês, marque as comissões como pagas e cancele o que não vale mais.'
            : veTodos
              ? 'As comissões do período, do vendedor ao gerente, por fatura paga.'
              : 'Cada fatura paga de um cliente seu gera uma comissão. Aqui está o extrato do mês.'
        }
        acao={
          <>
            <RefreshButton loading={lista.loading} onClick={recarregar} />
            {master && selecionadas.length > 0 ? (
              <AcaoPrincipal icone={<Banknote />} onClick={() => setPagando(true)}>
                Marcar {selecionadas.length} como {selecionadas.length === 1 ? 'paga' : 'pagas'} · {formatarMoeda(somaSelecionada)}
              </AcaoPrincipal>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-56">
          <Select value={mes} onValueChange={trocar(setMes)}>
            <SelectTrigger aria-label="Mês de referência" className="w-full rounded-xl border-border bg-card data-[size=default]:h-12">
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-[11px] leading-none text-muted-foreground">Mês</span>
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {meses.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FilterSelect
          label="Situação"
          value={status}
          onChange={trocar(setStatus)}
          allLabel="Todas"
          options={STATUS_COMISSAO.map(s => ({ value: s, label: STATUS_COMISSAO_LABELS[s] }))}
        />
        {veTodos && opcoesAgente.length > 0 ? (
          <FilterSelect label="Beneficiário" value={agente} onChange={trocar(setAgente)} allLabel="Todos" options={opcoesAgente} />
        ) : null}
      </div>

      {totais ? (
        <KpiGrid
          colunas={5}
          className="grid-cols-2 gap-3 sm:gap-4 [&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(odd)]:col-span-1"
          itens={STATUS_COMISSAO.map(st => ({
            rotulo: STATUS_COMISSAO_LABELS[st],
            valor: <ValorMoeda valor={totais[st]} limite="xs" />,
            dica: DICA_STATUS[st],
            icone: VISUAL_STATUS[st].icone,
            tom: VISUAL_STATUS[st].tom,
          }))}
        />
      ) : null}

      {lista.loading && !lista.data ? (
        <TableSkeleton rows={6} />
      ) : !lista.data ? (
        <LoadError message={lista.error ?? 'Não foi possível carregar as comissões.'} onRetry={() => void lista.reload()} />
      ) : itens.length === 0 ? (
        <EstadoVazio
          ilustracao="comissoes"
          moldura
          titulo="Nenhuma comissão neste filtro"
          descricao={
            status !== 'all' || agente !== 'all'
              ? 'Limpe os filtros ou escolha outro mês para ver mais comissões.'
              : 'Quando um cliente pagar a primeira fatura, a comissão aparece aqui. Escolha outro mês para ver o histórico.'
          }
          acao={
            status !== 'all' || agente !== 'all' ? (
              <AcaoPrincipal
                variante="secundaria"
                onClick={() => {
                  setStatus('all')
                  setAgente('all')
                  setPagina(1)
                }}
              >
                Limpar filtros
              </AcaoPrincipal>
            ) : undefined
          }
        />
      ) : (
        <SectionCard
          title={`Extrato de ${meses.find(m => m.value === mes)?.label ?? mes}`}
          description={`${lista.data.total.toLocaleString('pt-BR')} ${lista.data.total === 1 ? 'lançamento' : 'lançamentos'}`}
          icon={Wallet}
          padded={!master}
        >
          {master ? (
            <TabelaMaster
              itens={itens}
              marcadas={marcadas}
              pagaveis={pagaveis.length}
              todasMarcadas={todasMarcadas}
              aoMarcarTodas={v => setMarcadas(v ? new Set(pagaveis.map(p => p.id)) : new Set())}
              aoMarcar={id =>
                setMarcadas(atual => {
                  const p = new Set(atual)
                  if (p.has(id)) p.delete(id)
                  else p.add(id)
                  return p
                })
              }
              aoCancelar={setCancelando}
            />
          ) : (
            <ComissaoExtrato linhas={linhas} />
          )}
          {totalPaginas > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Página {lista.data.page} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
                  Anterior
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          ) : null}
        </SectionCard>
      )}

      {veTodos ? (
        <SectionCard title="Resumo por beneficiário" description="Quanto cada pessoa ou corretora tem no mês. Líquido = a pagar + paga − a descontar." padded={false}>
          {resumo.loading && !resumo.data ? (
            <TableSkeleton rows={3} className="p-4" />
          ) : !resumo.data ? (
            <div className="p-4">
              <LoadError message={resumo.error ?? 'Não foi possível carregar o resumo.'} onRetry={() => void resumo.reload()} framed={false} />
            </div>
          ) : resumo.data.beneficiarios.length === 0 ? (
            <EstadoVazio ilustracao="comissoes" titulo="Sem beneficiários neste mês" descricao="O resumo aparece quando houver comissões no mês." className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#F8F9FB] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-2 font-medium">Beneficiário</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Prevista</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">A pagar</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Paga</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">A descontar</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.data.beneficiarios.map(b => (
                    <tr key={b.beneficiarioAgenteId ?? b.beneficiarioCorretoraId ?? b.nome} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="max-w-[220px] truncate px-4 py-2.5 text-left font-semibold">
                        {b.nome}
                        {b.beneficiarioCorretoraId && !b.beneficiarioAgenteId ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">corretora</span> : null}
                      </th>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(b.totais.prevista)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(b.totais.a_pagar)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(b.totais.paga)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatarMoeda(b.totais.a_descontar)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{formatarMoeda(b.liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {master ? (
        <>
          <PagarDialog
            aberto={pagando}
            quantidade={selecionadas.length}
            total={somaSelecionada}
            aoFechar={() => setPagando(false)}
            aoConfirmar={async (ref, data) => {
              const r = await runCommand(
                pagarComissoesAction(escopo, {
                  ids: selecionadas.map(s => s.id),
                  pagamentoRef: ref || null,
                  pagoEm: new Date(`${data}T12:00:00-03:00`).toISOString(),
                }),
              )
              if (!r) return false
              toast.success(`${r.pagas} ${r.pagas === 1 ? 'comissão marcada como paga' : 'comissões marcadas como pagas'}.`, {
                description: r.ignoradas > 0 ? `${r.ignoradas} ${r.ignoradas === 1 ? 'já estava paga ou cancelada' : 'já estavam pagas ou canceladas'}.` : undefined,
              })
              recarregar()
              return true
            }}
          />
          <ConfirmDialog
            open={cancelando !== null}
            onOpenChange={aberto => !aberto && setCancelando(null)}
            title="Cancelar esta comissão?"
            description={
              cancelando ? (
                <p className="m-0">
                  {PARTE_COMISSAO_LABELS[cancelando.parte]} · {cancelando.beneficiarioNome ?? 'sem beneficiário'} · {formatarMoeda(cancelando.valor)}. Ela deixa de contar nos totais e não pode ser paga.
                </p>
              ) : null
            }
            confirmLabel="Sim, cancelar comissão"
            destructive
            reason={{ label: 'Motivo do cancelamento', placeholder: 'Ex.: cliente pediu estorno da fatura', minLength: 3, maxLength: 500 }}
            onConfirm={async motivo => {
              if (!cancelando) return false
              const r = await runCommand(cancelarComissaoAction(escopo, cancelando.id, { motivo }), 'Comissão cancelada.')
              if (r) recarregar()
              return r !== null
            }}
          />
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

function TabelaMaster({
  itens,
  marcadas,
  pagaveis,
  todasMarcadas,
  aoMarcarTodas,
  aoMarcar,
  aoCancelar,
}: {
  itens: VendasComissao[]
  marcadas: Set<string>
  pagaveis: number
  todasMarcadas: boolean
  aoMarcarTodas: (v: boolean) => void
  aoMarcar: (id: string) => void
  aoCancelar: (c: VendasComissao) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-[#F8F9FB] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 px-4 py-2">
              <Checkbox
                checked={todasMarcadas}
                disabled={pagaveis === 0}
                onCheckedChange={v => aoMarcarTodas(v === true)}
                aria-label="Selecionar todas as comissões a pagar desta página"
              />
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">Referência</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Parcela</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Base</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">%</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
            <th scope="col" className="py-2 pr-3 font-medium">Parte</th>
            <th scope="col" className="py-2 pr-3 font-medium">Situação</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {itens.map(c => {
            const pagavel = c.status === 'a_pagar'
            const cancelavel = c.status !== 'cancelada' && c.status !== 'paga'
            return (
              <tr key={c.id} className={`border-b border-border/60 ${c.status === 'cancelada' ? 'text-muted-foreground' : ''}`}>
                <td className="px-4 py-2.5">
                  <Checkbox
                    checked={marcadas.has(c.id)}
                    disabled={!pagavel}
                    onCheckedChange={() => aoMarcar(c.id)}
                    aria-label={pagavel ? `Selecionar comissão de ${c.beneficiarioNome ?? 'sem beneficiário'}` : `Comissão ${STATUS_COMISSAO_LABELS[c.status].toLowerCase()}: não selecionável`}
                  />
                </td>
                <td className="max-w-[240px] py-2.5 pr-3">
                  <span className="block truncate font-medium">{c.beneficiarioNome ?? 'Sem beneficiário'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.leadNome ?? (c.tipo === 'adesao' ? 'Taxa de adesão' : 'Mensalidade')}</span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{c.tipo === 'adesao' ? 'Adesão' : `${c.parcela}ª`}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatarMoeda(c.base)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{formatarPercentual(c.percentual, 2)}</td>
                <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${c.status === 'cancelada' ? 'line-through' : ''}`}>{formatarMoeda(c.valor)}</td>
                <td className="py-2.5 pr-3">{PARTE_COMISSAO_LABELS[c.parte]}</td>
                <td className="py-2.5 pr-3">
                  <StatusPill tone={TOM_STATUS[c.status]}>{STATUS_COMISSAO_LABELS[c.status]}</StatusPill>
                  {c.status === 'paga' && c.pagamentoRef ? <span className="mt-0.5 block text-xs text-muted-foreground">Ref. {c.pagamentoRef}</span> : null}
                </td>
                <td className="py-2.5 pr-4 text-right">
                  {cancelavel ? (
                    <Button type="button" variant="ghost" size="sm" className="text-[#B42318] hover:text-[#B42318]" onClick={() => aoCancelar(c)}>
                      Cancelar
                    </Button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PagarDialog({
  aberto,
  quantidade,
  total,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  quantidade: number
  total: number
  aoFechar: () => void
  aoConfirmar: (referencia: string, data: string) => Promise<boolean>
}) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const [referencia, setReferencia] = useState('')
  const [data, setData] = useState(hoje)
  useEffect(() => {
    if (aberto) {
      setReferencia('')
      setData(hoje)
    }
  }, [aberto, hoje])
  const [enviando, setEnviando] = useState(false)

  return (
    <Dialog
      open={aberto}
      onOpenChange={a => {
        if (!enviando && !a) aoFechar()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como {quantidade === 1 ? 'paga' : 'pagas'}</DialogTitle>
          <DialogDescription>
            {quantidade} {quantidade === 1 ? 'comissão' : 'comissões'}, {formatarMoeda(total)} no total. Isto só registra o pagamento; não envia dinheiro. Faça o pagamento primeiro e registre aqui.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pagamento-ref">Referência do pagamento (opcional)</Label>
            <Input id="pagamento-ref" value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} placeholder="Ex.: lote Pix de 10/11, comprovante 123" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pagamento-data">Data do pagamento</Label>
            <Input id="pagamento-data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button
            type="button"
            disabled={enviando || !data}
            className="gap-2"
            onClick={async () => {
              setEnviando(true)
              const ok = await aoConfirmar(referencia.trim(), data)
              setEnviando(false)
              if (ok) aoFechar()
            }}
          >
            {enviando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Banknote aria-hidden="true" />}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
