import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env, isProduction } from '@/config/env'
import * as schema from './schema'

/**
 * Conexão única com o Postgres/Supabase.
 *
 * `prepare: false` é obrigatório quando a DATABASE_URL aponta para o pooler
 * em modo transaction do Supabase (porta 6543) — prepared statements não
 * sobrevivem ao pooling. Em conexão direta o custo é desprezível.
 */
const client = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  prepare: false,
  onnotice: () => {},
})

export const db = drizzle(client, { schema, casing: 'snake_case' })
export type Database = typeof db
export { client as sql, schema }
