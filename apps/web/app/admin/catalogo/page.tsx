'use client'

import { useEffect, useState } from 'react'
import type { Convenio, HealthPlan, PriceTable, WaitingPeriod } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import {
  listOperatorConveniosAction,
  listOperatorPlansAction,
  listOperatorPriceTablesAction,
  listOperatorWaitingPeriodsAction,
} from '@/lib/actions/operator-api'
import { AlertCircle, ChevronRight, Layers, Loader2, Search, Table2 } from 'lucide-react'

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando catálogo da Digital Saúde…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" />
          Catálogo Digital Saúde
        </h1>
        <p className="text-muted-foreground">
          Convênios, planos, tabelas de preço e carências publicados pelo ERP — leitura direta, sem cópia local.
        </p>
      </div>

      {mensagemErro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{mensagemErro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convênios</CardTitle>
            <CardDescription>{convenios.length} ativo(s) no ERP</CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Filtrar por nome, código ou estipulante"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[520px] overflow-y-auto">
            {filtrados.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {convenios.length === 0
                  ? 'Este inquilino não tem convênio ativo no ERP — confira a integração em Inquilinos.'
                  : 'Nenhum convênio bate com o filtro.'}
              </p>
            )}
            {filtrados.map(convenio => (
              <button
                key={convenio.codigo}
                onClick={() => abrir(convenio)}
                className={`w-full text-left rounded-md px-3 py-2 transition-colors hover:bg-slate-100 ${
                  selecionado?.codigo === convenio.codigo ? 'bg-slate-100' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{convenio.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <code>{convenio.codigo}</code>
                  {convenio.stipulatorName && <span>· {convenio.stipulatorName}</span>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!selecionado && (
            <EmptyStateCard
              icon={Table2}
              title="Selecione um convênio"
              description="Planos, tabelas de preço e carências aparecem aqui."
            />
          )}

          {selecionado && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{selecionado.name}</CardTitle>
                  <CardDescription>
                    <code>{selecionado.codigo}</code>
                    {selecionado.productCodigo && <> · produto <code>{selecionado.productCodigo}</code></>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Estipulante</p>
                    <p className="font-medium">{selecionado.stipulatorName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Taxa de cadastro</p>
                    <p className="font-medium">
                      {money(selecionado.registrationFee)}
                      {selecionado.registrationFeeKind === 'por_vida' && ' / vida'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Próximo reajuste</p>
                    <p className="font-medium">{selecionado.nextAdjustmentDate ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Dia de vigência</p>
                    <p className="font-medium">{selecionado.effectiveDay ?? '—'}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="text-muted-foreground text-xs">Filiais</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selecionado.branches.length === 0 && <span className="text-muted-foreground">—</span>}
                      {selecionado.branches.map(b => (
                        <Badge key={b.codigo} variant="outline">
                          {b.name} · {b.codigo}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {carregandoDetalhe && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando o ERP…
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Planos</CardTitle>
                  <CardDescription>{planos.length} plano(s) no produto</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {planos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum plano retornado.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-4">Plano</th>
                          <th className="py-2 pr-4">Registro ANS</th>
                          <th className="py-2 pr-4">Abrangência</th>
                          <th className="py-2 pr-4">Acomodação</th>
                          <th className="py-2 pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planos.map(plano => (
                          <tr key={plano.codigo} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <span className="font-medium">{plano.name}</span>
                              <br />
                              <code className="text-xs text-muted-foreground">{plano.codigo}</code>
                            </td>
                            <td className="py-2 pr-4">{plano.ansRegistration ?? '—'}</td>
                            <td className="py-2 pr-4">{plano.coverage ?? '—'}</td>
                            <td className="py-2 pr-4">{plano.accommodation ?? '—'}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={plano.status === 'Aberto' ? 'default' : 'outline'}>
                                {plano.status ?? '—'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tabelas de preço</CardTitle>
                  <CardDescription>Valores por faixa etária, direto do ERP</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {tabelas.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma tabela para este convênio.</p>
                  )}
                  {tabelas.map(tabela => (
                    <div key={tabela.codigo}>
                      <div className="flex flex-wrap items-baseline gap-2 pb-2">
                        <span className="font-medium text-sm">{tabela.name}</span>
                        <code className="text-xs text-muted-foreground">{tabela.codigo}</code>
                        {tabela.effectiveDate && (
                          <span className="text-xs text-muted-foreground">vigência {tabela.effectiveDate}</span>
                        )}
                        {tabela.groupCodigo && (
                          <Badge variant="outline" className="text-xs">
                            grupo {tabela.groupCodigo}
                          </Badge>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-muted-foreground border-b">
                              <th className="py-2 pr-4">Faixa etária</th>
                              <th className="py-2 pr-4">Plano</th>
                              <th className="py-2 pr-4 text-right">Cobrança</th>
                              <th className="py-2 pr-4 text-right">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabela.entries.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-2 text-muted-foreground">
                                  Tabela sem faixas.
                                </td>
                              </tr>
                            )}
                            {tabela.entries.map((entry, index) => (
                              <tr key={`${tabela.codigo}-${index}`} className="border-b last:border-0">
                                <td className="py-1.5 pr-4">{entry.ageRangeName ?? '—'}</td>
                                <td className="py-1.5 pr-4">{entry.planName ?? '—'}</td>
                                <td className="py-1.5 pr-4 text-right font-medium">{money(entry.chargeValue)}</td>
                                <td className="py-1.5 pr-4 text-right text-muted-foreground">
                                  {money(entry.netValue)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Carências</CardTitle>
                </CardHeader>
                <CardContent>
                  {carencias.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma carência cadastrada para este convênio no ERP.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {carencias.map(c => (
                        <Badge key={c.codigo} variant="secondary">
                          {c.name} · {c.codigo}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
