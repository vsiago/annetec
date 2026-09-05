'use client'

import { useEffect, useState } from 'react'
import type { IntegrationDiscovery, TenantIntegrationPublic } from '@annetec/contracts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  discoverTenantIntegrationAction,
  getTenantIntegrationAction,
  probeTenantCapabilitiesAction,
  saveTenantIntegrationAction,
  testTenantIntegrationAction,
} from '@/lib/actions/tenants-api'
import { AlertCircle, CheckCircle2, Loader2, Plug, RefreshCw, Search, XCircle } from 'lucide-react'

/**
 * Ligação do inquilino com a Digital Saúde.
 *
 * Existia só na API. Sem tela, ninguém via se a credencial estava valendo, e
 * os códigos obrigatórios do ERP (grupo, filial, convênio, produto, grupo de
 * produtor) eram copiados do portal e digitados à mão — `grupoProdutor` nem
 * campo tinha, era redigitado a cada cadastro de vendedor.
 *
 * Três blocos, na ordem em que a pessoa precisa deles:
 *   1. credenciais, validadas contra o ERP antes de gravar;
 *   2. descoberta, que lê os códigos do próprio ERP;
 *   3. permissões, que dizem quais operações o token realmente executa —
 *      o 401 da Digital Saúde é por endpoint, então cotação pode estar
 *      bloqueada mesmo com a credencial perfeita.
 */

/** Rótulo humano para cada operação apurada. */
const OPERACOES: Record<string, { label: string; consequencia: string }> = {
  convenioListar: { label: 'Listar convênios', consequencia: 'Catálogo e adesão' },
  planoPorProduto: { label: 'Planos por produto', consequencia: 'Escolha de plano na venda' },
  tabelaPorConvenio: { label: 'Tabelas de preço', consequencia: 'Valor da mensalidade' },
  carenciaPorConvenio: { label: 'Carências', consequencia: 'Regras de carência na adesão' },
  faturaVencidas: { label: 'Faturas vencidas', consequencia: 'Tela de cobrança' },
  calculoSimular: { label: 'Cotação (/calculo/)', consequencia: 'Simulação de preço pelo vendedor' },
}

export function IntegrationPanel({ tenantId }: { tenantId: string }) {
  const [integration, setIntegration] = useState<TenantIntegrationPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [appToken, setAppToken] = useState('')
  const [apiPassword, setApiPassword] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://digitalsaude.com.br/api/v2')

  const [convenio, setConvenio] = useState('')
  const [produto, setProduto] = useState('')
  const [filial, setFilial] = useState('')
  const [grupo, setGrupo] = useState('')
  const [grupoProdutor, setGrupoProdutor] = useState('')

  const [discovery, setDiscovery] = useState<IntegrationDiscovery | null>(null)
  const [descobrindo, setDescobrindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [apurando, setApurando] = useState(false)

  useEffect(() => {
    getTenantIntegrationAction(tenantId).then(result => {
      setLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      aplica(result.data)
    })
  }, [tenantId])

  function aplica(dados: TenantIntegrationPublic | null) {
    setIntegration(dados)
    if (!dados) return
    setBaseUrl(dados.baseUrl)
    setConvenio(dados.defaultConvenioCodigo ?? '')
    setProduto(dados.defaultProdutoCodigo ?? '')
    setFilial(dados.defaultFilialCodigo ?? '')
    setGrupo(dados.defaultGrupoCodigo ?? '')
    setGrupoProdutor(dados.defaultGrupoProdutorCodigo ?? '')
  }

  async function salvar() {
    setError('')
    setAviso('')
    if (!appToken || !apiPassword) {
      setError('Informe token e senhaApi. Eles não são exibidos depois de gravados — para trocar os códigos, informe-os de novo.')
      return
    }
    setSalvando(true)
    const result = await saveTenantIntegrationAction(tenantId, {
      provider: 'digitalsaude',
      baseUrl,
      appToken,
      apiPassword,
      defaultConvenioCodigo: convenio || undefined,
      defaultProdutoCodigo: produto || undefined,
      defaultFilialCodigo: filial || undefined,
      defaultGrupoCodigo: grupo || undefined,
      defaultGrupoProdutorCodigo: grupoProdutor || undefined,
      enabled: true,
    })
    setSalvando(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    aplica(result.data)
    setAppToken('')
    setApiPassword('')
    setAviso('Credenciais validadas contra o ERP e gravadas.')
  }

  async function testar() {
    setTestando(true)
    setAviso('')
    setError('')
    const result = await testTenantIntegrationAction(tenantId)
    setTestando(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setAviso(result.data.ok ? 'A Digital Saúde respondeu.' : 'A Digital Saúde recusou as credenciais.')
    const atual = await getTenantIntegrationAction(tenantId)
    if (atual.success) aplica(atual.data)
  }

  async function descobrir() {
    setDescobrindo(true)
    setError('')
    setAviso('')
    const result = await discoverTenantIntegrationAction(tenantId)
    setDescobrindo(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setDiscovery(result.data)
    // Preenche só o que ainda está vazio — não sobrescreve escolha da pessoa.
    const { sugestao } = result.data
    if (!convenio) setConvenio(sugestao.defaultConvenioCodigo ?? result.data.convenios[0]?.codigo ?? '')
    if (!produto) setProduto(sugestao.defaultProdutoCodigo ?? result.data.produtos[0]?.codigo ?? '')
    if (!filial) setFilial(sugestao.defaultFilialCodigo ?? result.data.filiais[0]?.codigo ?? '')
    if (!grupo) setGrupo(sugestao.defaultGrupoCodigo ?? result.data.grupos[0]?.codigo ?? '')
    if (!grupoProdutor) setGrupoProdutor(sugestao.defaultGrupoProdutorCodigo ?? '')
  }

  async function apurarPermissoes() {
    setApurando(true)
    setError('')
    const result = await probeTenantCapabilitiesAction(tenantId)
    setApurando(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    const atual = await getTenantIntegrationAction(tenantId)
    if (atual.success) aplica(atual.data)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando integração…
        </CardContent>
      </Card>
    )
  }

  const capabilities = integration?.capabilities ?? null
  const bloqueadas = capabilities
    ? Object.entries(capabilities).filter(([, permitido]) => !permitido)
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plug className="h-5 w-5 text-primary" />
          Integração Digital Saúde
        </CardTitle>
        <CardDescription>
          {integration
            ? `Configurada. Última verificação: ${
                integration.lastCheckedAt
                  ? new Date(integration.lastCheckedAt).toLocaleString('pt-BR')
                  : 'nunca'
              }`
            : 'Ainda não configurada — este inquilino não consegue ler o catálogo nem a carteira.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {aviso && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{aviso}</AlertDescription>
          </Alert>
        )}

        {integration && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={integration.lastCheckOk ? 'default' : 'destructive'}>
              {integration.lastCheckOk ? 'Credencial aceita' : 'Credencial recusada'}
            </Badge>
            {!integration.enabled && <Badge variant="outline">Integração desativada</Badge>}
            <Button size="sm" variant="outline" onClick={testar} disabled={testando}>
              {testando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Testar agora
            </Button>
          </div>
        )}

        {/* ---------------------------------------------------- credenciais */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Credenciais</h3>
          <p className="text-sm text-muted-foreground">
            O par <code className="text-xs">token</code>/<code className="text-xs">senhaApi</code> é gerado
            no painel da Digital Saúde — não há endpoint que o crie. A senha nunca é exibida de volta.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="appToken">token</Label>
              <Input
                id="appToken"
                value={appToken}
                onChange={e => setAppToken(e.target.value)}
                placeholder={integration ? '•••••••• (informe para trocar)' : 'Ex: ATX3SHGT3S'}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiPassword">senhaApi</Label>
              <Input
                id="apiPassword"
                type="password"
                value={apiPassword}
                onChange={e => setApiPassword(e.target.value)}
                placeholder={integration ? '•••••••• (informe para trocar)' : ''}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input id="baseUrl" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------- descoberta */}
        <div className="space-y-3 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Códigos do ERP</h3>
            <Button size="sm" variant="outline" onClick={descobrir} disabled={descobrindo || !integration}>
              {descobrindo ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-2 h-3.5 w-3.5" />}
              Descobrir no ERP
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            A Digital Saúde não tem endpoint de grupo, filial ou grupo de produtor — mas esses códigos
            aparecem dentro de outras respostas. A descoberta percorre essa trilha para você escolher em
            vez de digitar.
          </p>

          {discovery?.avisos.map(texto => (
            <Alert key={texto}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{texto}</AlertDescription>
            </Alert>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoCodigo
              id="convenio"
              label="Convênio padrão"
              valor={convenio}
              aoMudar={setConvenio}
              opcoes={discovery?.convenios}
            />
            <CampoCodigo
              id="produto"
              label="Produto padrão"
              label2="usado em /plano/procurarPorProduto"
              valor={produto}
              aoMudar={setProduto}
              opcoes={discovery?.produtos}
            />
            <CampoCodigo
              id="filial"
              label="Filial"
              valor={filial}
              aoMudar={setFilial}
              opcoes={discovery?.filiais}
            />
            <CampoCodigo
              id="grupo"
              label="Grupo"
              label2="obrigatório no POST /contrato/"
              valor={grupo}
              aoMudar={setGrupo}
              opcoes={discovery?.grupos}
            />
            <CampoCodigo
              id="grupoProdutor"
              label="Grupo de produtor"
              label2="obrigatório no POST /produtor/"
              valor={grupoProdutor}
              aoMudar={setGrupoProdutor}
              opcoes={discovery?.gruposProdutor}
            />
          </div>
        </div>

        {/* ----------------------------------------------------- permissões */}
        <div className="space-y-3 border-t pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">O que este token pode fazer</h3>
            <Button size="sm" variant="outline" onClick={apurarPermissoes} disabled={apurando || !integration}>
              {apurando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Apurar permissões
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            O 401 da Digital Saúde é por operação, não por credencial: o mesmo token que lê todo o
            catálogo pode ter a cotação bloqueada. Apurar aqui evita descobrir isso na frente do cliente.
          </p>

          {!capabilities && (
            <p className="text-sm text-muted-foreground">
              Ainda não apurado
              {integration ? '.' : ' — configure as credenciais primeiro.'}
            </p>
          )}

          {capabilities && (
            <>
              <ul className="divide-y rounded-md border">
                {Object.entries(capabilities).map(([operacao, permitido]) => {
                  const meta = OPERACOES[operacao]
                  return (
                    <li key={operacao} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{meta?.label ?? operacao}</span>
                        {meta && (
                          <span className="block text-xs text-muted-foreground">{meta.consequencia}</span>
                        )}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
                          permitido ? 'text-emerald-700' : 'text-destructive'
                        }`}
                      >
                        {permitido ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {permitido ? 'Liberado' : 'Bloqueado'}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {bloqueadas.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {bloqueadas.length === 1 ? 'Uma operação está bloqueada' : `${bloqueadas.length} operações estão bloqueadas`}{' '}
                    para este token. Isso se resolve do lado da Digital Saúde — peça liberação ao suporte
                    deles citando o endpoint.
                  </AlertDescription>
                </Alert>
              )}
              {integration?.capabilitiesCheckedAt && (
                <p className="text-xs text-muted-foreground">
                  Apurado em {new Date(integration.capabilitiesCheckedAt).toLocaleString('pt-BR')}.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end border-t pt-6">
          <Button onClick={salvar} disabled={salvando} className="bg-primary text-white hover:opacity-90">
            {salvando ? 'Validando com o ERP…' : 'Salvar integração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Campo de código do ERP: vira `select` assim que a descoberta traz opções e
 * continua aceitando digitação enquanto não trouxe — alguns códigos só existem
 * no portal e podem precisar ser colados na mão.
 */
function CampoCodigo({
  id,
  label,
  label2,
  valor,
  aoMudar,
  opcoes,
}: {
  id: string
  label: string
  label2?: string
  valor: string
  aoMudar: (valor: string) => void
  opcoes?: { codigo: string; nome: string }[]
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {label2 && <span className="ml-1 text-xs font-normal text-muted-foreground">· {label2}</span>}
      </Label>
      {opcoes && opcoes.length > 0 ? (
        <Select value={valor} onValueChange={aoMudar}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map(opcao => (
              <SelectItem key={opcao.codigo} value={opcao.codigo}>
                {opcao.nome || opcao.codigo} · {opcao.codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input id={id} value={valor} onChange={e => aoMudar(e.target.value)} placeholder="Código do ERP" />
      )}
    </div>
  )
}
