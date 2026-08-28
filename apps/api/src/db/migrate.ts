import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client'
import { logger } from '@/lib/logger'

/** `pnpm db:migrate` — aplica as migrações geradas por `drizzle-kit generate`. */
async function main() {
  logger.info('Aplicando migrações...')
  await migrate(db, { migrationsFolder: 'src/db/migrations' })
  logger.info('Migrações aplicadas com sucesso')
  await sql.end()
}

main().catch(error => {
  logger.error({ err: error }, 'Falha ao aplicar migrações')
  process.exit(1)
})
