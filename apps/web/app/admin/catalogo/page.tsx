'use client'

import { useEffect, useState } from 'react'
import type { Convenio, HealthPlan, PriceTable, WaitingPeriod } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import {
  listOperatorConveniosAction,
  listOperatorPlansAction,
  listOperatorPriceTablesAction,
  listOperatorWaitingPeriodsAction,
} from '@/lib/actions/operator-api'
import { ChevronRight, ClipboardList, Clock, FileText, Handshake, Layers, Search, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Catálogo da Digital Saúde para a equipe Annetec.
 *
 * O catálogo já existia na API (`/api/v1/t/:slug/catalogo/*`) e sessão de
 * plataforma sempre passou por `requireTenantRole` — o que faltava era a
 * TELA: o superadmin não tinha onde ver os convênios que o ERP publica, então
 * conferir preço, carência ou registro ANS obrigava a abrir o portal da
 * Digital Saúde. Esta página lê o catálogo pelo slug da operadora, do mesmo
 * jeito que o portal do inquilino faz.
 */

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CODE_CLASS = 'rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground'

export default function CatalogoPage() {
  const { slug: tenantSlug, isLoading: carregandoEscopo, error: scopeError } = useAdminScope()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const mensagemErro = scopeError || error

  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState<Convenio | null>(null)

  const [planos, setPlanos] = useState<HealthPlan[]>([])
  const [tabelas, setTabelas] = useState<PriceTable[]>([])
  const [carencias, setCarencias] = useState<WaitingPeriod[]>([])
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(carregandoEscopo)
      return
    }
    // Trocar de inquilino recarrega o catálogo: cada um tem seu próprio ERP.
    setLoading(true)
    setSelecionado(null)
    listOperatorConveniosAction(tenantSlug).then(lista => {
      setLoading(false)
      if (!lista.success) {
        setError(lista.error)
        return
      }
      setError('')
      setConvenios(lista.data)
    })
  }, [tenantSlug, carregandoEscopo])

  async function abrir(convenio: Convenio) {
    if (!tenantSlug) return
    setSelecionado(convenio)
    setCarregandoDetalhe(true)
    setPlanos([])
    setTabelas([])
    setCarencias([])

    const [planosResult, tabelasResult, carenciasResult] = await Promise.all([
      convenio.productCodigo
        ? listOperatorPlansAction(tenantSlug, convenio.productCodigo)
        : Promise.resolve({ success: true as const, data: [] as HealthPlan[] }),
      listOperatorPriceTablesAction(tenantSlug, convenio.codigo),
      listOperatorWaitingPeriodsAction(tenantSlug, convenio.codigo),
    ])

    setCarregandoDetalhe(false)
    if (planosResult.success) setPlanos(planosResult.data)
    if (tabelasResult.success) setTabelas(tabelasResult.data)
    if (carenciasResult.success) setCarencias(carenciasResult.data)
  }

  const filtrados = convenios.filter(c =>
    `${c.name} ${c.codigo} ${c.stipulatorName ?? ''}`.toLowerCase().includes(busca.toLowerCase()),
  )

  const cabecalho = (
    <PageHeader
      icon={Layers}
      title="Catálogo Digital Saúde"
      description="Convênios, planos, tabelas de preço e carências publicados pelo ERP — leitura direta, sem cópia local."
    />
  )

  if (loading) {
    return (
      <PageContainer>
        {cabecalho}
        <SectionCard>
          <SectionSkeleton rows={5} label="Carregando catálogo da Digital Saúde…" />
        </SectionCard>
      </PageContainer>
    )
  }

  if (mensagemErro) {
    return (
      <PageContainer>
        {cabecalho}
        <ErrorState description={mensagemErro} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {cabecalho}

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <SectionCard icon={Handshake} title="Convênios" description={`${convenios.length} ativo(s) no ERP`}>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Filtrar convênios"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Filtrar por nome, código ou estipulante"
                className="h-10 pl-9"
              />
            </div>

            <div className="flex max-h-130 flex-col gap-1 overflow-y-auto">
              {filtrados.length === 0 &&
                (convenios.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={Handshake}
                    title="Este clube não tem convênio ativo no ERP"
                    description="Confira a integração em Clubes."
                  />
                ) : (
                  <EmptyState size="sm" icon={Search} title="Nenhum convênio bate com o filtro" />
                ))}
              {filtrados.map(convenio => {
                const ativo = selecionado?.codigo === convenio.codigo
                return (
                  <button
                    key={convenio.codigo}
                    type="button"
                    onClick={() => abrir(convenio)}
                    aria-pressed={ativo}
                    className={cn(
                      'min-h-11 w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2',
                      ativo && 'bg-accent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{convenio.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <code className="font-mono">{convenio.codigo}</code>
                      {convenio.stipulatorName && <span className="truncate">· {convenio.stipulatorName}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-6">
          {!selecionado && (
            <EmptyState
              framed
              icon={Table2}
              title="Selecione um convênio"
              description="Planos, tabelas de preço e carências aparecem aqui."
            />
          )}

          {selecionado && (
            <>
              <SectionCard
                icon={FileText}
                title={selecionado.name}
                description={
                  <>
                    <code className={CODE_CLASS}>{selecionado.codigo}</code>
                    {selecionado.productCodigo && (
                      <>
                        {' '}
                        · produto <code className={CODE_CLASS}>{selecionado.productCodigo}</code>
                      </>
                    )}
                  </>
                }
              >
                <dl className="m-0 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[13px] text-muted-foreground">Estipulante</dt>
                    <dd className="m-0 font-semibold text-foreground">{selecionado.stipulatorName ?? '—'}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[13px] text-muted-foreground">Taxa de cadastro</dt>
                    <dd className="m-0 font-semibold text-foreground">
                      {money(selecionado.registrationFee)}
                      {selecionado.registrationFeeKind === 'por_vida' && ' / vida'}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[13px] text-muted-foreground">Próximo reajuste</dt>
                    <dd className="m-0 font-semibold text-foreground">{selecionado.nextAdjustmentDate ?? '—'}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[13px] text-muted-foreground">Dia de vigência</dt>
                    <dd className="m-0 font-semibold text-foreground">{selecionado.effectiveDay ?? '—'}</dd>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                    <dt className="text-[13px] text-muted-foreground">Filiais</dt>
                    <dd className="m-0 flex flex-wrap gap-2">
                      {selecionado.branches.length === 0 && <span className="text-muted-foreground">—</span>}
                      {selecionado.branches.map(b => (
                        <StatusPill key={b.codigo} tone="neutral">
                          {b.name} · {b.codigo}
                        </StatusPill>
                      ))}
                    </dd>
                  </div>
                </dl>
              </SectionCard>

              <SectionCard
                icon={ClipboardList}
                title="Planos"
                description={carregandoDetalhe ? 'Consultando o ERP…' : `${planos.length} plano(s) no produto`}
                padded={false}
              >
                {carregandoDetalhe ? (
                  <div className="p-6">
                    <SectionSkeleton rows={3} label="Consultando o ERP…" />
                  </div>
                ) : planos.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="Nenhum plano retornado" />
                ) : (
                  <DataTable caption="Planos do produto" framed={false} minWidth="min-w-[720px]">
                    <thead>
                      <tr>
                        <Th>Plano</Th>
                        <Th>Registro ANS</Th>
                        <Th>Abrangência</Th>
                        <Th>Acomodação</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {planos.map(plano => (
                        <Tr key={plano.codigo}>
                          <Td>
                            <p className="m-0 font-semibold text-foreground">{plano.name}</p>
                            <code className="font-mono text-[13px] text-muted-foreground">{plano.codigo}</code>
                          </Td>
                          <Td className="text-foreground">{plano.ansRegistration ?? '—'}</Td>
                          <Td className="text-foreground">{plano.coverage ?? '—'}</Td>
                          <Td className="text-foreground">{plano.accommodation ?? '—'}</Td>
                          <Td>
                            <StatusPill tone={plano.status === 'Aberto' ? 'success' : 'neutral'}>
                              {plano.status ?? '—'}
                            </StatusPill>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </SectionCard>

              <SectionCard
                icon={Table2}
                title="Tabelas de preço"
                description="Valores por faixa etária, direto do ERP"
              >
                {carregandoDetalhe ? (
                  <SectionSkeleton rows={4} label="Consultando o ERP…" />
                ) : tabelas.length === 0 ? (
                  <EmptyState icon={Table2} title="Nenhuma tabela para este convênio" className="py-6" />
                ) : (
                  <div className="flex flex-col gap-6">
                    {tabelas.map(tabela => (
                      <div key={tabela.codigo} className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <h3 className="m-0 text-sm font-semibold text-foreground">{tabela.name}</h3>
                          <code className="font-mono text-[13px] text-muted-foreground">{tabela.codigo}</code>
                          {tabela.effectiveDate && (
                            <span className="text-[13px] text-muted-foreground">vigência {tabela.effectiveDate}</span>
                          )}
                          {tabela.groupCodigo && <StatusPill tone="neutral">grupo {tabela.groupCodigo}</StatusPill>}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border">
                          {tabela.entries.length === 0 ? (
                            <EmptyState size="sm" icon={Table2} title="Tabela sem faixas" className="py-6" />
                          ) : (
                            <DataTable
                              caption={`Faixas etárias da tabela ${tabela.name}`}
                              framed={false}
                              minWidth="min-w-[560px]"
                            >
                              <thead>
                                <tr>
                                  <Th>Faixa etária</Th>
                                  <Th>Plano</Th>
                                  <Th align="right">Cobrança</Th>
                                  <Th align="right">Net</Th>
                                </tr>
                              </thead>
                              <tbody>
                                {tabela.entries.map((entry, index) => (
                                  <Tr key={`${tabela.codigo}-${index}`}>
                                    <Td className="text-foreground">{entry.ageRangeName ?? '—'}</Td>
                                    <Td className="text-foreground">{entry.planName ?? '—'}</Td>
                                    <Td align="right" className="font-semibold tabular-nums text-foreground">
                                      {money(entry.chargeValue)}
                                    </Td>
                                    <Td align="right" className="tabular-nums text-muted-foreground">
                                      {money(entry.netValue)}
                                    </Td>
                                  </Tr>
                                ))}
                              </tbody>
                            </DataTable>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard icon={Clock} title="Carências">
                {carregandoDetalhe ? (
                  <SectionSkeleton rows={2} label="Consultando o ERP…" />
                ) : carencias.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Nenhuma carência cadastrada para este convênio no ERP"
                    className="py-6"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {carencias.map(c => (
                      <StatusPill key={c.codigo} tone="neutral">
                        {c.name} · {c.codigo}
                      </StatusPill>
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
