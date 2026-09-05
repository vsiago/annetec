/**
 * Compara o Dicionário TI (`apps/web/lib/api-dictionary.ts`, escrito à mão)
 * com as rotas que a API realmente expõe e com o registro de endpoints da
 * Digital Saúde.
 *
 * O dicionário é mantido à mão de propósito: as descrições e o "quem pode
 * chamar" são conhecimento de negócio que nenhum gerador produz. O que ele não
 * consegue sozinho é perceber que uma rota nasceu, sumiu ou trocou de método —
 * e aí a página passa a documentar um sistema que não existe mais.
 *
 * Este script não reescreve nada: aponta a diferença para alguém decidir.
 * Sai com código 1 quando há deriva, então serve em CI.
 *
 * Uso: pnpm --filter @annetec/api exec tsx scripts/checar-dicionario.ts
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { digitalSaudeEndpoints } from '@annetec/contracts'
import { createApp } from '../src/app'

/** Resolvido a partir do cwd do pacote (`apps/api`). */
const CAMINHO_DICIONARIO = resolve(process.cwd(), '../web/lib/api-dictionary.ts')

/**
 * Rotas de infraestrutura que o dicionário não precisa listar. `/healthz`,
 * `/readyz` e as de rastreabilidade ESTÃO documentadas, então não entram aqui.
 */
const IGNORADAS: RegExp[] = []

function rotasReais(): { method: string; path: string }[] {
  const app = createApp()
  const vistas = new Set<string>()
  const rotas: { method: string; path: string }[] = []

  for (const rota of app.routes) {
    // Hono registra middleware como ALL/`*`; só interessa handler de rota.
    if (rota.method === 'ALL') continue
    if (IGNORADAS.some(padrao => padrao.test(rota.path))) continue
    const chave = `${rota.method} ${rota.path}`
    if (vistas.has(chave)) continue
    vistas.add(chave)
    rotas.push({ method: rota.method, path: rota.path })
  }

  return rotas.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

/**
 * Lê o dicionário como TEXTO em vez de importar: é um módulo do app web, com
 * imports que não resolvem daqui. Só precisamos de método + rota, e o formato
 * é estável (`{ method: 'GET', route: '/...' }`).
 */
function rotasDocumentadas(): {
  method: string
  route: string
  prefixo: string
  upstream: boolean
}[] {
  const fonte = readFileSync(CAMINHO_DICIONARIO, 'utf8')
  const itens: { method: string; route: string; prefixo: string; upstream: boolean }[] = []

  // Os itens aparecem em duas formas no arquivo — tudo numa linha, ou
  // `method:` e `route:` em linhas separadas — então a varredura é sobre o
  // texto inteiro, marcando as posições de `prefix:` e dos dois arrays
  // (`annetecModules` = nossa API, `digitalSaudeModules` = ERP) para saber a
  // qual bloco cada item pertence.
  const marcos: { pos: number; prefixo?: string; upstream?: boolean }[] = []
  for (const m of fonte.matchAll(/prefix:\s*'([^']*)'/g)) {
    marcos.push({ pos: m.index!, prefixo: m[1]! })
  }
  for (const m of fonte.matchAll(/(annetecModules|digitalSaudeModules)\s*:/g)) {
    marcos.push({ pos: m.index!, upstream: m[1] === 'digitalSaudeModules' })
  }
  marcos.sort((a, b) => a.pos - b.pos)

  for (const m of fonte.matchAll(
    /method:\s*'(GET|POST|PUT|PATCH|DELETE)',\s*route:\s*'([^']*)'/g,
  )) {
    let prefixo = ''
    let upstream = false
    for (const marco of marcos) {
      if (marco.pos > m.index!) break
      if (marco.prefixo !== undefined) prefixo = marco.prefixo
      if (marco.upstream !== undefined) upstream = marco.upstream
    }
    itens.push({ method: m[1]!, route: m[2]!, prefixo, upstream })
  }

  return itens
}

/**
 * `/faturas?x=1` → `/faturas`; junta prefixo e rota como o Hono monta.
 * Colapsa barras repetidas, porque o dicionário usa prefixo `/` em várias
 * seções e concatenar geraria `//healthz`.
 */
function normaliza(prefixo: string, rota: string): string {
  const semQuery = rota.split('?')[0]!
  const inteiro = `${prefixo}${semQuery === '/' ? '' : semQuery}`
  return inteiro.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
}

function main() {
  const reais = rotasReais()
  const documentadas = rotasDocumentadas()

  const conjuntoReal = new Set(reais.map(r => `${r.method} ${r.path.replace(/\/+$/, '') || '/'}`))
  const conjuntoDoc = new Set(
    documentadas
      // A seção da Digital Saúde documenta o upstream, não a nossa API.
      .filter(d => !d.upstream)
      .map(d => `${d.method} ${normaliza(d.prefixo, d.route)}`),
  )

  const naoDocumentadas = [...conjuntoReal].filter(r => !conjuntoDoc.has(r)).sort()
  const inexistentes = [...conjuntoDoc].filter(d => !conjuntoReal.has(d)).sort()

  console.log(`Rotas na API: ${conjuntoReal.size} · documentadas: ${conjuntoDoc.size}\n`)

  if (naoDocumentadas.length > 0) {
    console.log(`FALTAM NO DICIONÁRIO (${naoDocumentadas.length}):`)
    for (const rota of naoDocumentadas) console.log(`   + ${rota}`)
    console.log('')
  }

  if (inexistentes.length > 0) {
    console.log(`NO DICIONÁRIO MAS NÃO NA API (${inexistentes.length}):`)
    for (const rota of inexistentes) console.log(`   - ${rota}`)
    console.log('')
  }

  // Digital Saúde: o registro de endpoints é a fonte da verdade.
  const upstreamReal = new Set(
    Object.values(digitalSaudeEndpoints).map(
      endpoint =>
        `${endpoint.method} ${normaliza('', endpoint.path).replace(/\{[^}]+\}/g, ':param')}`,
    ),
  )
  const upstreamDoc = new Set(
    documentadas
      .filter(d => d.upstream)
      .map(d => `${d.method} ${normaliza(d.prefixo, d.route).replace(/\{[^}]+\}/g, ':param')}`),
  )
  const upstreamFaltando = [...upstreamReal].filter(r => !upstreamDoc.has(r)).sort()

  if (upstreamFaltando.length > 0) {
    console.log(`ENDPOINTS DA DIGITAL SAÚDE FORA DO DICIONÁRIO (${upstreamFaltando.length}):`)
    for (const rota of upstreamFaltando) console.log(`   + ${rota}`)
    console.log('')
  }

  const deriva = naoDocumentadas.length + inexistentes.length + upstreamFaltando.length
  if (deriva === 0) {
    console.log('Dicionário em dia com a API.')
    process.exit(0)
  }
  console.log(`${deriva} divergência(s). Atualize apps/web/lib/api-dictionary.ts.`)
  process.exit(1)
}

main()
