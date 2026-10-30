import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()

/**
 * Toda variável de ambiente passa por aqui. Se faltar algo obrigatório o
 * processo morre no boot com uma mensagem legível — nunca com um `undefined`
 * três camadas abaixo.
 */
/** Variável presente mas vazia (`FOO=` no .env) vale como ausente — cai no padrão. */
function emptyAsUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

/**
 * `true/false/1/0/yes/no/on/off`. NÃO usar `z.coerce.boolean`: ele transforma
 * a string "false" em `true`.
 */
function parseBooleanish(value: unknown) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim().toLowerCase()
  if (text === '') return undefined
  if (['true', '1', 'yes', 'on', 'sim'].includes(text)) return true
  if (['false', '0', 'no', 'off', 'nao', 'não'].includes(text)) return false
  return value
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  /** Connection string do Postgres/Supabase (use o pooler em serverless). */
  DATABASE_URL: z.string().url(),

  /** URL pública desta API — usada pelo Better Auth para montar cookies/links. */
  API_BASE_URL: z.string().url().default('http://localhost:3333'),

  /** Segredo do Better Auth (assinatura de sessão/cookie). Mín. 32 caracteres. */
  BETTER_AUTH_SECRET: z.string().min(32),

  /**
   * Login com Google (fluxo ID token, ver docs/login-google.md). Opcionais: sem
   * os DOIS o provider não é registrado e `/auth/login/google` responde "Login
   * com Google não configurado". Obter em Google Cloud Console → APIs e
   * serviços → Credenciais → ID do cliente OAuth (tipo "Aplicativo da Web").
   * O client id precisa ser o MESMO de `NEXT_PUBLIC_GOOGLE_CLIENT_ID` no web:
   * é a audiência que a API confere no token.
   */
  GOOGLE_CLIENT_ID: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),

  /**
   * Confiar em `x-forwarded-for`/`x-real-ip` para descobrir o IP do cliente
   * (rate limit, auditoria, `remoteIp` do Asaas). Só ligue atrás de um proxy
   * que SOBRESCREVE esses cabeçalhos (Caddy do docker-compose, Vercel) e com a
   * porta da API fechada para a internet — senão qualquer um forja o IP.
   * Vazio = ligado na Vercel e fora de produção (comportamento anterior);
   * desligado em produção num servidor Node comum (usa o IP do socket).
   */
  TRUST_PROXY: z.preprocess(parseBooleanish, z.boolean().optional()),

  /**
   * `preview` = deploy de DEMONSTRAÇÃO com `NODE_ENV=production`: a trava de
   * boot (`config/assert-production.ts`) aceita Asaas SANDBOX, e-mail na caixa
   * de saída (`outbox`) e disco local, e PROÍBE chave/ambiente de produção do
   * Asaas. Loga um aviso grande no boot. Vazio = produção de verdade (estrito).
   */
  DEPLOY_STAGE: z.preprocess(emptyAsUndefined, z.enum(['preview']).optional()),

  /** Origens autorizadas no CORS, separadas por vírgula. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  /**
   * Credenciais globais da Digital Saúde. Servem de fallback quando o
   * inquilino não tem credenciais próprias configuradas — o caso comum é cada
   * administradora ter as suas, gravadas em `tenant_integrations`.
   */
  DIGITALSAUDE_BASE_URL: z.string().url().default('https://digitalsaude.com.br/api/v2'),
  DIGITALSAUDE_APP_TOKEN: z.string().optional(),
  DIGITALSAUDE_API_PASSWORD: z.string().optional(),
  DIGITALSAUDE_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /**
   * Em PRODUÇÃO, slugs de inquilinos (separados por vírgula) que podem usar as
   * credenciais globais `DIGITALSAUDE_*` sem linha própria em
   * `tenant_integrations` (ex.: o piloto). Os demais recebem
   * `INTEGRATION_NOT_CONFIGURED`. Fora de produção o fallback vale para todos.
   */
  DIGITALSAUDE_GLOBAL_TENANTS: z.preprocess(emptyAsUndefined, z.string().optional()),

  /**
   * Clube de Benefícios — cobrança própria (blueprint §0.10). Sem nada
   * configurado o checkout roda no gateway SIMULADO (sem dinheiro). Com
   * `asaas`, cada clube recebe na PRÓPRIA conta Asaas (chave colada pelo admin
   * em Faturamento → Configurações → Recebimento, tabela `tenant_asaas_accounts`);
   * clube sem conta conectada tem adesão/cobrança bloqueadas
   * (`RECEBIMENTO_NAO_CONFIGURADO`) — nunca cai na conta da ANNETEC.
   */
  PAYMENT_GATEWAY: z.preprocess(emptyAsUndefined, z.enum(['simulated', 'asaas']).default('simulated')),
  /**
   * Conta Asaas da ANNETEC (PLATAFORMA): `$aact_hmlg_…` (sandbox) ou
   * `$aact_prod_…` (produção). Usada só pela cobrança da plataforma (fallback de
   * `PLATFORM_ASAAS_API_KEY`) — o club-billing NUNCA usa esta chave.
   */
  ASAAS_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(10).optional()),
  /** Ambiente da conta da ANNETEC. A chave de cada clube carrega o próprio ambiente no prefixo. */
  ASAAS_ENV: z.preprocess(emptyAsUndefined, z.enum(['sandbox', 'production']).default('sandbox')),
  /**
   * Fallback de `PLATFORM_ASAAS_WEBHOOK_TOKEN` (webhook da plataforma). O webhook
   * de cada clube tem token próprio, gerado e guardado cifrado ao conectar o recebimento.
   */
  ASAAS_WEBHOOK_TOKEN: z.preprocess(emptyAsUndefined, z.string().min(1).max(255).optional()),
  /** O Asaas exige `User-Agent` em contas novas. */
  ASAAS_USER_AGENT: z.preprocess(emptyAsUndefined, z.string().default('ANNETEC-Clube/1.0')),
  ASAAS_TIMEOUT_MS: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().default(20_000)),
  /** Segundos até o Pix simulado compensar sozinho; 0 = só pelo botão "Simular pagamento". */
  SIMULATED_PIX_APPROVE_SECONDS: z.preprocess(emptyAsUndefined, z.coerce.number().int().nonnegative().default(20)),
  /** Idem para o boleto simulado. */
  SIMULATED_BOLETO_APPROVE_SECONDS: z.preprocess(emptyAsUndefined, z.coerce.number().int().nonnegative().default(120)),
  /** Chave Pix (EVP) fictícia embutida no BR Code simulado. */
  SIMULATED_PIX_KEY: z.preprocess(
    emptyAsUndefined,
    z.string().max(77).default('7d9f0335-8dcc-4054-9bf9-0dbd61d36906'),
  ),
  /** Motor de cobrança automático (timer em `src/index.ts`). Padrão: ligado, exceto em produção. */
  BILLING_AUTOMATION_ENABLED: z.preprocess(parseBooleanish, z.boolean().optional()),
  BILLING_AUTOMATION_INTERVAL_SECONDS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(10).default(60),
  ),
  /** URL pública da web (links do boleto simulado). Padrão: 1ª origem de `CORS_ORIGINS`. */
  WEB_BASE_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),

  /**
   * Plataforma ANNETEC → inquilinos (blueprint da plataforma §0.7). TUDO
   * opcional: sem nada aqui a contratação, a cobrança da plataforma, o
   * armazenamento e o e-mail rodam simulados (demo sem chave externa).
   * Driver/provedor sem credencial cai no padrão com aviso no log (1×).
   */
  /** Gateway da cobrança da plataforma (o override da tela de régua vence). */
  PLATFORM_PAYMENT_GATEWAY: z.preprocess(emptyAsUndefined, z.enum(['simulated', 'asaas']).default('simulated')),
  /** Chave do Asaas da conta ANNETEC. Vazio = `ASAAS_API_KEY`. */
  PLATFORM_ASAAS_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(10).optional()),
  /** Token do webhook `POST /api/v1/webhooks/asaas-plataforma`. Vazio = `ASAAS_WEBHOOK_TOKEN`. */
  PLATFORM_ASAAS_WEBHOOK_TOKEN: z.preprocess(emptyAsUndefined, z.string().min(1).max(255).optional()),
  /** Automação da cobrança da plataforma. Vazio = segue a regra da automação do clube. */
  PLATFORM_BILLING_AUTOMATION_ENABLED: z.preprocess(parseBooleanish, z.boolean().optional()),
  PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().int().min(10).default(60),
  ),
  /** Recebedor exibido no Pix/boleto simulado da plataforma. */
  PLATFORM_MERCHANT_NAME: z.preprocess(emptyAsUndefined, z.string().min(1).default('ANNETEC')),
  PLATFORM_MERCHANT_CITY: z.preprocess(emptyAsUndefined, z.string().min(1).default('Rio de Janeiro')),
  /** Atalhos de demonstração ("avançar N dias"). Vazio = ligado fora de produção. */
  PLATFORM_DEMO_TOOLS_ENABLED: z.preprocess(parseBooleanish, z.boolean().optional()),

  /** Consulta de CNPJ na contratação. Os CNPJs de demonstração respondem sem rede em qualquer modo. */
  CNPJ_LOOKUP_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(['brasilapi', 'simulated']).default('brasilapi')),
  CNPJ_LOOKUP_TIMEOUT_MS: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().default(6_000)),
  CNPJ_LOOKUP_CACHE_TTL_SECONDS: z.preprocess(emptyAsUndefined, z.coerce.number().int().nonnegative().default(86_400)),

  /** Armazenamento de documentos (KYB) e logos. `local` = disco fora do repositório. */
  STORAGE_DRIVER: z.preprocess(emptyAsUndefined, z.enum(['local', 'supabase', 's3']).default('local')),
  /**
   * Aceite explícito de `STORAGE_DRIVER=local` em produção ESTRITA (sem
   * `DEPLOY_STAGE=preview`). Os documentos ficam no disco do servidor (volume
   * `api_storage`): sem backup diário e snapshot do EBS, perder a instância é
   * perder os documentos. Ver `config/assert-production.ts` e `deploy/README.md`.
   */
  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: z.preprocess(parseBooleanish, z.boolean().optional()),
  /** Pasta do driver `local`. Vazio = `<tmp do sistema>/annetec-storage`. */
  STORAGE_LOCAL_DIR: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  SUPABASE_URL: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyAsUndefined, z.string().min(10).optional()),
  SUPABASE_STORAGE_BUCKET: z.preprocess(emptyAsUndefined, z.string().min(1).default('annetec-kyb')),
  S3_BUCKET: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  S3_REGION: z.preprocess(emptyAsUndefined, z.string().min(1).default('us-east-1')),
  /** Endpoint compatível com S3 (R2, MinIO…). Vazio = AWS (`s3.<região>.amazonaws.com`). */
  S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),

  /** E-mail transacional. `outbox` = só grava na caixa de saída (visível no console). */
  EMAIL_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(['outbox', 'resend', 'sendgrid']).default('outbox')),
  EMAIL_FROM: z.preprocess(emptyAsUndefined, z.string().min(3).default('ANNETEC <nao-responda@annetec.org.br>')),
  RESEND_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
  SENDGRID_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
  throw new Error(`Variáveis de ambiente inválidas:\n${issues}`)
}

export const env = parsed.data

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/**
 * Deploy de demonstração (`DEPLOY_STAGE=preview`) rodando com `NODE_ENV=production`.
 * Só relaxa o que é "integração de verdade" (Asaas sandbox, e-mail em outbox,
 * disco local); auth, rate limit, ferramentas de demo etc. seguem de produção.
 */
export const isPreviewDeploy = isProduction && env.DEPLOY_STAGE === 'preview'

/** Ver `TRUST_PROXY`: sem env explícita, confia na Vercel e fora de produção. */
export const trustProxy = env.TRUST_PROXY ?? (Boolean(process.env.VERCEL) || !isProduction)

/** Automação de cobrança do clube: env explícita manda; sem ela, ligada fora de produção. */
export const billingAutomationEnabled = env.BILLING_AUTOMATION_ENABLED ?? !isProduction

/** Base dos links da web montados pela API (boleto simulado). */
export const webBaseUrl = (env.WEB_BASE_URL ?? corsOrigins[0] ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Automação da cobrança da plataforma: env explícita manda; sem ela, segue a do clube. */
export const platformBillingAutomationEnabled = env.PLATFORM_BILLING_AUTOMATION_ENABLED ?? billingAutomationEnabled

/**
 * Simulação/atalhos de demonstração (gateway simulado, "Simular pagamento",
 * "avançar dias", CNPJs de demo…) só existem FORA de produção. Nenhuma env
 * liga isso em produção — ver também `config/assert-production.ts`.
 */
export const demoToolsAllowed = !isProduction

/**
 * Ferramentas de demonstração da plataforma (avançar dias): env explícita manda,
 * mas nunca em produção (`demoToolsAllowed`); sem env, ligada fora de produção.
 */
export const platformDemoToolsEnabled = demoToolsAllowed && (env.PLATFORM_DEMO_TOOLS_ENABLED ?? true)

/** Slugs liberados para as credenciais globais da Digital Saúde em produção. */
export const digitalSaudeGlobalTenants: ReadonlySet<string> = new Set(
  (env.DIGITALSAUDE_GLOBAL_TENANTS ?? '')
    .split(',')
    .map(slug => slug.trim().toLowerCase())
    .filter(Boolean),
)

/** Login com Google ligado: client id E secret configurados. */
export const googleLoginEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
