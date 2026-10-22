/**
 * Configura a conta Asaas para a ANNETEC — idempotente, pode rodar quantas
 * vezes quiser (ex.: a cada vez que a URL do túnel muda).
 *
 *  1. valida a chave (`GET /myAccount/commercialInfo/`) e mostra conta e ambiente;
 *  2. cria ou atualiza os dois webhooks (clube e plataforma) com os 7 eventos
 *     que o código trata. Webhook já existente (mesma URL ou mesmo nome) é
 *     atualizado com `PUT`, nunca duplicado;
 *  3. com `--pix-key`, cria uma chave Pix aleatória (EVP) se a conta não tiver
 *     nenhuma — a sandbox só gera QR Code Pix com chave cadastrada.
 *
 * Lê do `apps/api/.env`: ASAAS_API_KEY, ASAAS_ENV, ASAAS_WEBHOOK_TOKEN,
 * PLATFORM_ASAAS_API_KEY, PLATFORM_ASAAS_WEBHOOK_TOKEN (e ASAAS_USER_AGENT,
 * ASAAS_TIMEOUT_MS, API_BASE_URL). Nunca escreve no `.env` e nunca imprime
 * chave ou token completos.
 *
 * Uso:
 *   pnpm --filter @annetec/api asaas:setup --public-url https://abc123.ngrok-free.app --pix-key
 *   pnpm --filter @annetec/api asaas:setup --public-url https://api.seudominio.com.br
 *   ... --dry-run           (só consulta; não cria nem altera nada no Asaas)
 *   ... --email ops@x.com   (e-mail de aviso de falha do webhook; padrão: e-mail da conta)
 *
 * Sem `--public-url`, usa API_BASE_URL se ela for pública (não localhost).
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import type { AsaasClient } from '../src/integrations/asaas/client'
import type { AsaasEnvironment, AsaasWebhook } from '../src/integrations/asaas/types'

/** Os 7 eventos que `club-billing/events.service.ts` e `platform-billing/events.service.ts` tratam. */
const EVENTS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
]

/** Status de chave Pix que contam como "a conta já tem chave". */
const LIVE_PIX_STATUSES = new Set(['ACTIVE', 'AWAITING_ACTIVATION'])

class SetupError extends Error {}

interface Args {
  publicUrl: string | null
  dryRun: boolean
  pixKey: boolean
  email: string | null
}

interface WebhookSpec {
  label: string
  name: string
  url: string
  authToken: string
  tokenVar: string
}

const summary: string[] = []

function parseArgs(argv: string[]): Args {
  const args: Args = { publicUrl: null, dryRun: false, pixKey: false, email: null }
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!
    if (raw === '--') continue
    const [flag, inline] = raw.includes('=') ? [raw.slice(0, raw.indexOf('=')), raw.slice(raw.indexOf('=') + 1)] : [raw, undefined]
    const value = () => {
      const v = inline ?? argv[++i]
      if (!v || v.startsWith('--')) throw new SetupError(`${flag} precisa de um valor.`)
      return v
    }
    switch (flag) {
      case '--public-url':
        args.publicUrl = value()
        break
      case '--email':
        args.email = value()
        break
      case '--dry-run':
        args.dryRun = true
        break
      case '--pix-key':
        args.pixKey = true
        break
      case '--help':
      case '-h':
        console.log(
          'Uso: pnpm --filter @annetec/api asaas:setup --public-url https://<url-publica-da-api> [--pix-key] [--dry-run] [--email ops@dominio]',
        )
        process.exit(0)
      default:
        throw new SetupError(`Argumento desconhecido: ${raw}. Use --help.`)
    }
  }
  return args
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

/** 8 primeiros + 4 últimos. */
function mask(secret: string): string {
  if (secret.length <= 12) return '*'.repeat(secret.length)
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

function resolvePublicUrl(arg: string | null): string {
  const candidate = arg ?? envValue('API_BASE_URL') ?? null
  const source = arg ? '--public-url' : 'API_BASE_URL'
  if (!candidate) {
    throw new SetupError('Informe a URL pública da API: --public-url https://<túnel ou domínio>.')
  }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new SetupError(`${source} não é uma URL válida: ${candidate}`)
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(url.hostname)) {
    throw new SetupError(
      `${source} aponta para ${url.hostname}; o Asaas não alcança sua máquina. ` +
        'Suba um túnel (ngrok http 3333 ou cloudflared tunnel --url http://localhost:3333) e passe --public-url https://<túnel>.',
    )
  }
  if (url.protocol !== 'https:') {
    throw new SetupError(`${source} precisa ser HTTPS (recebido ${url.protocol}//${url.host}).`)
  }
  if (url.pathname.replace(/\/+$/, '').endsWith('/api/v1')) {
    throw new SetupError(`Passe só a base da API, sem /api/v1 (ex.: ${url.origin}).`)
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

function checkToken(name: string, value: string) {
  if (value.length < 32 || value.length > 255) {
    throw new SetupError(
      `${name} tem ${value.length} caracteres; o Asaas exige de 32 a 255. Gere outro: ` +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    )
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as { httpStatus?: number }).httpStatus
    const codes = (error as { errorCodes?: string[] }).errorCodes
    const extra = [status ? `HTTP ${status}` : null, codes?.length ? codes.join(',') : null].filter(Boolean).join(' · ')
    return extra ? `${error.message} (${extra})` : error.message
  }
  return String(error)
}

async function createClient(apiKey: string, environment: AsaasEnvironment): Promise<AsaasClient> {
  // Import tardio: o client puxa `config/env.ts`, que valida o .env inteiro.
  // Assim os erros das variáveis do Asaas aparecem antes, com mensagem própria.
  // O log de debug de cada chamada só polui a saída do setup.
  process.env.LOG_LEVEL = 'warn'
  const { createAsaasClient } = await import('../src/integrations/asaas/client')
  const timeout = Number(envValue('ASAAS_TIMEOUT_MS') ?? 20_000)
  return createAsaasClient({
    apiKey,
    environment,
    userAgent: envValue('ASAAS_USER_AGENT') ?? 'ANNETEC-Clube/1.0',
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000,
  })
}

async function describeAccount(client: AsaasClient, label: string, apiKey: string, environment: AsaasEnvironment) {
  try {
    const info = await client.account.commercialInfo()
    const name = info.companyName || info.tradingName || info.name || '(sem nome)'
    console.log(`  ${label}: ${name} <${info.email ?? 'sem e-mail'}> · status ${info.status ?? '?'} · chave ${mask(apiKey)}`)
    return info
  } catch (error) {
    throw new SetupError(
      `A chave ${label} (${mask(apiKey)}) foi recusada em ${environment}: ${describeError(error)}. ` +
        'Chave $aact_hmlg_ é da sandbox (ASAAS_ENV=sandbox); $aact_prod_ é de produção (ASAAS_ENV=production).',
    )
  }
}

async function listAllWebhooks(client: AsaasClient): Promise<AsaasWebhook[]> {
  const all: AsaasWebhook[] = []
  for (let offset = 0; offset < 1_000; offset += 100) {
    const page = await client.webhooks.list({ offset, limit: 100 })
    all.push(...page.data)
    if (!page.hasMore) break
  }
  return all
}

async function upsertWebhook(client: AsaasClient, existing: AsaasWebhook[], spec: WebhookSpec, email: string, dryRun: boolean) {
  // Mesma URL vence; senão, mesmo nome (o túnel mudou de endereço) — atualiza em vez de duplicar.
  const match =
    existing.find(w => normalizeUrl(w.url) === normalizeUrl(spec.url)) ??
    existing.find(w => w.name?.trim().toLowerCase() === spec.name.toLowerCase())

  const base = {
    name: spec.name,
    url: spec.url,
    enabled: true,
    interrupted: false,
    authToken: spec.authToken,
    sendType: 'SEQUENTIALLY' as const,
    events: [...EVENTS],
  }

  if (match) {
    const changes: string[] = []
    if (normalizeUrl(match.url) !== normalizeUrl(spec.url)) changes.push(`url ${match.url} → ${spec.url}`)
    if (match.enabled === false) changes.push('reativado')
    if (match.interrupted) changes.push('fila retomada')
    const current = new Set(match.events ?? [])
    if (current.size !== EVENTS.length || EVENTS.some(e => !current.has(e))) changes.push('eventos ajustados')
    if (match.apiVersion !== undefined && match.apiVersion !== 3) {
      changes.push(`apiVersion ${match.apiVersion} (o PUT não altera; recrie no painel se precisar)`)
    }
    const detail = changes.length ? changes.join('; ') : 'token reenviado, resto igual'
    if (dryRun) {
      console.log(`  [dry-run] atualizaria ${spec.label} (${match.id}): ${detail}`)
      summary.push(`${spec.label}: atualizaria ${match.id} → ${spec.url}`)
      return
    }
    const updated = await client.webhooks.update(match.id, base)
    console.log(`  ${spec.label}: atualizado ${updated.id ?? match.id} (${detail})`)
    summary.push(`${spec.label}: atualizado ${updated.id ?? match.id} → ${spec.url} · token ${spec.tokenVar}`)
    return
  }

  if (dryRun) {
    console.log(`  [dry-run] criaria ${spec.label}: ${spec.url}`)
    summary.push(`${spec.label}: criaria → ${spec.url}`)
    return
  }
  const created = await client.webhooks.create({ ...base, email, apiVersion: 3 })
  existing.push(created)
  console.log(`  ${spec.label}: criado ${created.id}`)
  summary.push(`${spec.label}: criado ${created.id} → ${spec.url} · token ${spec.tokenVar}`)
}

async function ensurePixKey(client: AsaasClient, dryRun: boolean) {
  const { data } = await client.pix.listAddressKeys({ limit: 100 })
  const live = data.filter(k => LIVE_PIX_STATUSES.has(k.status ?? ''))
  if (live.length > 0) {
    const desc = live.map(k => `${k.type ?? '?'} ${k.status}`).join(', ')
    console.log(`  já existe chave Pix (${desc}); nada a fazer`)
    summary.push(`Chave Pix: já existia (${desc})`)
    return
  }
  if (dryRun) {
    console.log('  [dry-run] criaria uma chave Pix aleatória (EVP)')
    summary.push('Chave Pix: criaria EVP')
    return
  }
  try {
    const key = await client.pix.createAddressKey()
    console.log(`  chave Pix EVP criada (${key.id}, status ${key.status ?? '?'})`)
    summary.push(`Chave Pix: EVP criada (${key.status ?? '?'})`)
  } catch (error) {
    throw new SetupError(
      `Não deu para criar a chave Pix: ${describeError(error)}. Em produção o Asaas exige conta aprovada; ` +
        'cadastre a chave pelo painel (Pix → Minhas chaves) se continuar recusando.',
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const apiKey = envValue('ASAAS_API_KEY')
  const rawEnv = envValue('ASAAS_ENV') ?? 'sandbox'
  if (rawEnv !== 'sandbox' && rawEnv !== 'production') {
    throw new SetupError(`ASAAS_ENV inválido: "${rawEnv}". Use sandbox ou production.`)
  }
  const environment: AsaasEnvironment = rawEnv
  const platformApiKey = envValue('PLATFORM_ASAAS_API_KEY')

  console.log(`Asaas setup · ambiente ${environment}${args.dryRun ? ' · DRY-RUN (nada será criado ou alterado)' : ''}`)

  if (!apiKey) {
    throw new SetupError(
      'ASAAS_API_KEY está vazia em apps/api/.env. Gere a chave no painel do Asaas ' +
        `(${environment === 'sandbox' ? 'https://sandbox.asaas.com' : 'https://www.asaas.com'} → Integrações → Chaves de API), ` +
        `cole em ASAAS_API_KEY=${environment === 'sandbox' ? '$aact_hmlg_...' : '$aact_prod_...'} e rode de novo.`,
    )
  }
  const expectedPrefix = environment === 'sandbox' ? '$aact_hmlg_' : '$aact_prod_'
  for (const [name, key] of [['ASAAS_API_KEY', apiKey], ['PLATFORM_ASAAS_API_KEY', platformApiKey]] as const) {
    if (key && key.startsWith('$aact_') && !key.startsWith(expectedPrefix)) {
      throw new SetupError(`${name} (${mask(key)}) não parece ser de ${environment} (esperado prefixo ${expectedPrefix}). Confira ASAAS_ENV.`)
    }
  }

  let clubToken = envValue('ASAAS_WEBHOOK_TOKEN')
  if (!clubToken) {
    const generated = randomBytes(32).toString('hex')
    console.log('\nASAAS_WEBHOOK_TOKEN está vazio. Token gerado agora (não foi gravado em lugar nenhum):')
    console.log(`\n  ASAAS_WEBHOOK_TOKEN=${generated}\n`)
    console.log('Grave essa linha em apps/api/.env (e no ambiente do servidor), reinicie a API e rode o setup de novo.')
    if (!args.dryRun) {
      throw new SetupError('Webhooks não cadastrados: o token precisa estar no .env antes, senão a API responde 401.')
    }
    clubToken = generated
  }
  checkToken('ASAAS_WEBHOOK_TOKEN', clubToken)
  const platformTokenOwn = envValue('PLATFORM_ASAAS_WEBHOOK_TOKEN')
  if (platformTokenOwn) checkToken('PLATFORM_ASAAS_WEBHOOK_TOKEN', platformTokenOwn)
  const platformToken = platformTokenOwn ?? clubToken

  const publicUrl = resolvePublicUrl(args.publicUrl)

  console.log('\n1. Conta')
  const clubClient = await createClient(apiKey, environment)
  const clubInfo = await describeAccount(clubClient, 'ASAAS_API_KEY', apiKey, environment)
  const separatePlatform = Boolean(platformApiKey && platformApiKey !== apiKey)
  let platformClient = clubClient
  let platformInfo = clubInfo
  if (separatePlatform) {
    platformClient = await createClient(platformApiKey!, environment)
    platformInfo = await describeAccount(platformClient, 'PLATFORM_ASAAS_API_KEY', platformApiKey!, environment)
  } else {
    console.log('  plataforma: mesma conta (PLATFORM_ASAAS_API_KEY vazia ou igual)')
  }
  summary.push(`Ambiente: ${environment} · API pública: ${publicUrl}`)

  const clubEmail = args.email ?? clubInfo.email ?? null
  const platformEmail = args.email ?? platformInfo.email ?? null
  if (!clubEmail || !platformEmail) {
    throw new SetupError('A conta não devolveu e-mail; passe --email ops@seudominio para receber os avisos de falha do webhook.')
  }

  console.log('\n2. Webhooks')
  const clubSpec: WebhookSpec = {
    label: 'webhook do clube',
    name: 'ANNETEC clube',
    url: `${publicUrl}/api/v1/webhooks/asaas`,
    authToken: clubToken,
    tokenVar: 'ASAAS_WEBHOOK_TOKEN',
  }
  const platformSpec: WebhookSpec = {
    label: 'webhook da plataforma',
    name: 'ANNETEC plataforma',
    url: `${publicUrl}/api/v1/webhooks/asaas-plataforma`,
    authToken: platformToken,
    tokenVar: platformTokenOwn ? 'PLATFORM_ASAAS_WEBHOOK_TOKEN' : 'ASAAS_WEBHOOK_TOKEN (fallback)',
  }

  const clubHooks = await listAllWebhooks(clubClient)
  console.log(`  conta ${separatePlatform ? 'do clube' : 'única'}: ${clubHooks.length} webhook(s) cadastrado(s)`)
  await upsertWebhook(clubClient, clubHooks, clubSpec, clubEmail, args.dryRun)
  if (separatePlatform) {
    const platformHooks = await listAllWebhooks(platformClient)
    console.log(`  conta da plataforma: ${platformHooks.length} webhook(s) cadastrado(s)`)
    await upsertWebhook(platformClient, platformHooks, platformSpec, platformEmail, args.dryRun)
  } else {
    await upsertWebhook(clubClient, clubHooks, platformSpec, clubEmail, args.dryRun)
  }

  if (args.pixKey) {
    console.log('\n3. Chave Pix')
    await ensurePixKey(clubClient, args.dryRun)
    if (separatePlatform) {
      console.log('  (conta da plataforma)')
      await ensurePixKey(platformClient, args.dryRun)
    }
  }

  console.log('\nResumo')
  for (const line of summary) console.log(`  - ${line}`)
  console.log(`  - Eventos: ${EVENTS.join(', ')}`)
  console.log(
    args.dryRun
      ? '\nDry-run: nada foi alterado no Asaas. Rode sem --dry-run para aplicar.'
      : '\nPronto. Teste o token: curl -i -X POST "' +
          clubSpec.url +
          '" -H "asaas-access-token: <ASAAS_WEBHOOK_TOKEN>" -H "content-type: application/json" -d "{}"  → 200',
  )
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`\nErro: ${error instanceof SetupError ? error.message : describeError(error)}`)
    if (summary.length) {
      console.error('Feito até aqui:')
      for (const line of summary) console.error(`  - ${line}`)
    }
    process.exit(1)
  })
