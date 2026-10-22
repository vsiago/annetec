import type { env as runtimeEnv } from './env'

/**
 * Trava de boot de PRODUÇÃO: nada de simulação com dinheiro, e-mail, CNPJ ou
 * arquivos de verdade. Fora de produção não faz nada (dev/test seguem com o
 * gateway simulado, outbox, disco local…).
 *
 * Chamado em `src/index.ts` e `src/vercel.ts` ANTES de subir a API. Junta
 * TODAS as violações e lança um único `Error` com a lista, para quem estiver
 * configurando o deploy corrigir tudo de uma vez.
 *
 * Função pura sobre o objeto de env recebido (testável sem mexer no
 * `process.env`): `tests/assert-production.test.ts`.
 */

type RuntimeEnv = typeof runtimeEnv

/** Só os campos que a checagem lê (objetos parciais nos testes). */
export type ProductionConfigInput = Partial<
  Pick<
    RuntimeEnv,
    | 'PAYMENT_GATEWAY'
    | 'PLATFORM_PAYMENT_GATEWAY'
    | 'ASAAS_API_KEY'
    | 'PLATFORM_ASAAS_API_KEY'
    | 'ASAAS_ENV'
    | 'ASAAS_WEBHOOK_TOKEN'
    | 'EMAIL_PROVIDER'
    | 'RESEND_API_KEY'
    | 'SENDGRID_API_KEY'
    | 'CNPJ_LOOKUP_PROVIDER'
    | 'STORAGE_DRIVER'
    | 'SUPABASE_URL'
    | 'SUPABASE_SERVICE_ROLE_KEY'
    | 'S3_BUCKET'
    | 'S3_ACCESS_KEY_ID'
    | 'S3_SECRET_ACCESS_KEY'
    | 'BILLING_AUTOMATION_ENABLED'
    | 'PLATFORM_BILLING_AUTOMATION_ENABLED'
  >
> & { NODE_ENV?: string }

interface WarnLogger {
  warn: (context: Record<string, unknown> | string, message?: string) => void
}

const PROD_KEY_PREFIX = '$aact_prod_'

/** Lista (em português) do que impede a API de subir em produção. Vazia = ok. */
export function productionConfigViolations(e: ProductionConfigInput): string[] {
  if (e.NODE_ENV !== 'production') return []
  const v: string[] = []

  // Cobrança (clube e plataforma) — só Asaas de produção.
  if (e.PAYMENT_GATEWAY !== 'asaas') {
    v.push(`PAYMENT_GATEWAY precisa ser "asaas" (atual: "${e.PAYMENT_GATEWAY ?? 'simulated'}")`)
  }
  if (e.PLATFORM_PAYMENT_GATEWAY !== 'asaas') {
    v.push(`PLATFORM_PAYMENT_GATEWAY precisa ser "asaas" (atual: "${e.PLATFORM_PAYMENT_GATEWAY ?? 'simulated'}")`)
  }
  if (!e.ASAAS_API_KEY) {
    v.push(`ASAAS_API_KEY ausente (precisa ser uma chave de produção ${PROD_KEY_PREFIX}…)`)
  } else if (!e.ASAAS_API_KEY.startsWith(PROD_KEY_PREFIX)) {
    v.push(`ASAAS_API_KEY não é chave de produção (precisa começar com ${PROD_KEY_PREFIX})`)
  }
  if (e.PLATFORM_ASAAS_API_KEY && !e.PLATFORM_ASAAS_API_KEY.startsWith(PROD_KEY_PREFIX)) {
    v.push(`PLATFORM_ASAAS_API_KEY não é chave de produção (precisa começar com ${PROD_KEY_PREFIX})`)
  }
  if (e.ASAAS_ENV !== 'production') {
    v.push(`ASAAS_ENV precisa ser "production" (atual: "${e.ASAAS_ENV ?? 'sandbox'}")`)
  }
  if (!e.ASAAS_WEBHOOK_TOKEN) {
    v.push('ASAAS_WEBHOOK_TOKEN ausente (sem ele os webhooks do Asaas são recusados)')
  }

  // E-mail transacional.
  const emailProvider = e.EMAIL_PROVIDER ?? 'outbox'
  if (emailProvider === 'outbox') {
    v.push('EMAIL_PROVIDER não pode ser "outbox" (use "resend" ou "sendgrid")')
  } else if (emailProvider === 'resend' && !e.RESEND_API_KEY) {
    v.push('EMAIL_PROVIDER=resend sem RESEND_API_KEY')
  } else if (emailProvider === 'sendgrid' && !e.SENDGRID_API_KEY) {
    v.push('EMAIL_PROVIDER=sendgrid sem SENDGRID_API_KEY')
  }

  // Consulta de CNPJ.
  if ((e.CNPJ_LOOKUP_PROVIDER ?? 'brasilapi') === 'simulated') {
    v.push('CNPJ_LOOKUP_PROVIDER não pode ser "simulated" (use "brasilapi")')
  }

  // Armazenamento (driver sem credencial cairia no disco local).
  const storage = e.STORAGE_DRIVER ?? 'local'
  if (storage === 'local') {
    v.push('STORAGE_DRIVER não pode ser "local" (use "supabase" ou "s3")')
  } else if (storage === 'supabase' && (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) {
    v.push('STORAGE_DRIVER=supabase sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY')
  } else if (storage === 's3' && (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY)) {
    v.push('STORAGE_DRIVER=s3 sem S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY')
  }

  return v
}

/** Avisos (não bloqueiam): automações de cobrança desligadas em produção. */
export function productionConfigWarnings(e: ProductionConfigInput): string[] {
  if (e.NODE_ENV !== 'production') return []
  const warnings: string[] = []
  // Mesma regra de `config/env.ts`: sem env explícita, desligada em produção.
  const club = e.BILLING_AUTOMATION_ENABLED ?? false
  const platform = e.PLATFORM_BILLING_AUTOMATION_ENABLED ?? club
  if (!club) {
    warnings.push(
      'Automação de cobrança do clube DESLIGADA em produção: agende um cron externo chamando ' +
        'POST /api/v1/t/:tenantSlug/faturamento/automacao/executar (por inquilino) (ou ligue BILLING_AUTOMATION_ENABLED=true)',
    )
  }
  if (!platform) {
    warnings.push(
      'Automação de cobrança da plataforma DESLIGADA em produção: agende um cron externo chamando ' +
        'POST /api/v1/platform/billing/automacao/executar (ou ligue PLATFORM_BILLING_AUTOMATION_ENABLED=true)',
    )
  }
  return warnings
}

/**
 * Lança se a configuração de produção permitir simulação; loga os avisos.
 * Fora de produção: no-op.
 */
export function assertProductionConfig(e: ProductionConfigInput, log?: WarnLogger): void {
  const violations = productionConfigViolations(e)
  if (violations.length > 0) {
    throw new Error(
      `Configuração inválida para produção (${violations.length} problema(s)) — a API não vai subir:\n` +
        violations.map(item => `  - ${item}`).join('\n'),
    )
  }
  for (const warning of productionConfigWarnings(e)) log?.warn({ boot: 'production-config' }, warning)
}
