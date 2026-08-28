import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()

/**
 * Toda variável de ambiente passa por aqui. Se faltar algo obrigatório o
 * processo morre no boot com uma mensagem legível — nunca com um `undefined`
 * três camadas abaixo.
 */
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
