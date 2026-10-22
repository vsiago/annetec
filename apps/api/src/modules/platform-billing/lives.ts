import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

/**
 * "Vida" (blueprint da plataforma §0.1-14): titular + dependentes das
 * assinaturas do CLUBE (`club_subscriptions`) com status `active|past_due`.
 * Os espelhos da Digital Saúde (`contracts`/`beneficiaries`) NÃO contam —
 * é o que a ANNETEC fatura como excedente e o que a holding soma.
 */

type Executor = Pick<typeof db, 'execute'>

interface LivesRow {
  org: string
  holders: number | string | null
  dependents: number | string | null
}

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[]
}

function livesQuery(orgId?: string) {
  return sql`
    select s.organization_id as org,
           count(*)::int as holders,
           coalesce(sum(d.cnt), 0)::int as dependents
    from club_subscriptions s
    left join (
      select subscription_id, count(*)::int as cnt
      from club_subscription_dependents
      group by subscription_id
    ) d on d.subscription_id = s.id
    where s.status in ('active', 'past_due')
    ${orgId ? sql`and s.organization_id = ${orgId}` : sql``}
    group by s.organization_id`
}

/** Vidas ativas de um inquilino agora. */
export async function countLives(orgId: string, executor: Executor = db): Promise<number> {
  const [row] = rowsOf<LivesRow>(await executor.execute(livesQuery(orgId)))
  return row ? Number(row.holders ?? 0) + Number(row.dependents ?? 0) : 0
}

/** Vidas ativas por inquilino (só quem tem ao menos uma). */
export async function countLivesByOrg(executor: Executor = db): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const row of rowsOf<LivesRow>(await executor.execute(livesQuery()))) {
    map.set(row.org, Number(row.holders ?? 0) + Number(row.dependents ?? 0))
  }
  return map
}
