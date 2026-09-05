/**
 * Mostra as últimas linhas da trilha de auditoria — serve para conferir que
 * `recordAudit` está mesmo gravando depois de uma operação.
 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function main() {
  const linhas = (await db.execute(sql`
    select action, resource, actor_scope, resource_id, metadata, created_at
    from audit_logs
    order by created_at desc
    limit 20
  `)) as unknown as Record<string, unknown>[]

  console.log(`audit_logs: ${linhas.length} linha(s) recentes\n`)
  for (const linha of linhas) {
    console.log(
      `  ${String(linha.action).padEnd(30)} ${String(linha.resource).padEnd(18)} ${String(
        linha.actor_scope,
      ).padEnd(9)} ${JSON.stringify(linha.metadata ?? {}).slice(0, 90)}`,
    )
  }
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
