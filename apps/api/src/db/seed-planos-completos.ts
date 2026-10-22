import { checkClubPlanConsistency, createClubPlanInput, effectivePaymentMethods } from '@annetec/contracts'
import { and, eq, notInArray } from 'drizzle-orm'
import { db, sql } from './client'
import { PLANOS_COMPLETOS, montarRegulamento } from './planos-completos'
import { clubPlans, organization } from './schema'
import { loadBillingSettings } from '@/modules/club-billing/settings.service'
import { clubPlanColumns, toClubPlan } from '@/modules/network/controller'

// Trava de produção: seeds/scripts de demonstração gravam contas com senha
// trivial e dados fictícios. Em produção só rodam com liberação explícita.
// (Avaliado depois dos imports — `./client` só conecta na primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[seed-planos-completos] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * `pnpm --filter @annetec/api demo:planos <slug> [--manter-outros]`
 *
 * Grava os 3 planos completos do clube (Essencial, Plus, Família — conteúdo do
 * blueprint de planos, §Planos) no inquilino. Idempotente: casa por
 * (inquilino, nome) — o índice único `club_plans_org_name_key` — então os IDs
 * que já têm assinatura são reaproveitados; rodar 2× dá o mesmo estado.
 * Sem `--manter-outros`, os demais planos ATIVOS do inquilino viram `inactive`
 * (não são apagados: as assinaturas deles seguem cobradas pelo retrato).
 */

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

/** JSON com chaves ordenadas (o jsonb do Postgres reordena as chaves). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

async function main() {
  const slug = process.argv[2]?.toLowerCase()
  const keepOthers = process.argv.includes('--manter-outros')
  if (!slug || slug.startsWith('--')) {
    console.error('Uso: demo:planos <slug-do-inquilino> [--manter-outros]')
    process.exit(1)
  }
  const [org] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)
  if (!org) {
    console.error(`Inquilino "${slug}" não encontrado.`)
    process.exit(1)
  }

  const settings = await loadBillingSettings(org.id)

  // Valida tudo ANTES de escrever.
  const inputs = PLANOS_COMPLETOS.map(seed => {
    const input = createClubPlanInput.parse({ ...seed, terms: montarRegulamento(seed, org.name, settings) })
    const issues = checkClubPlanConsistency(input)
    if (effectivePaymentMethods(input, settings.enabledMethods).length === 0) {
      issues.push({ path: 'paymentMethods', message: 'Nenhuma forma de pagamento do plano está habilitada no clube', code: 'no_payment_method' })
    }
    if (issues.length > 0) {
      console.error(`Plano "${seed.name}" inconsistente:`, issues)
      process.exit(1)
    }
    return input
  })

  const report = await db.transaction(async tx => {
    const lines: Array<{ id: string; nome: string; acao: string; status: string }> = []
    for (const input of inputs) {
      const [current] = await tx
        .select()
        .from(clubPlans)
        .where(and(eq(clubPlans.organizationId, org.id), eq(clubPlans.name, input.name)))
        .limit(1)
      if (!current) {
        const [row] = await tx
          .insert(clubPlans)
          .values({ organizationId: org.id, name: input.name, ...clubPlanColumns(input), status: 'active' })
          .returning({ id: clubPlans.id, status: clubPlans.status })
        lines.push({ id: row!.id, nome: input.name, acao: 'criado', status: row!.status })
        continue
      }
      const before = toClubPlan(current)
      const changed = Object.entries(input).some(
        ([field, value]) => stable(before[field as keyof typeof before]) !== stable(value),
      )
      if (!changed && current.status === 'active') {
        lines.push({ id: current.id, nome: input.name, acao: 'inalterado', status: current.status })
        continue
      }
      const [row] = await tx
        .update(clubPlans)
        .set({ ...clubPlanColumns(input), status: 'active', updatedAt: new Date() })
        .where(eq(clubPlans.id, current.id))
        .returning({ id: clubPlans.id, status: clubPlans.status })
      lines.push({ id: row!.id, nome: input.name, acao: 'atualizado', status: row!.status })
    }

    const others = await tx
      .select({ id: clubPlans.id, name: clubPlans.name, status: clubPlans.status })
      .from(clubPlans)
      .where(and(eq(clubPlans.organizationId, org.id), notInArray(clubPlans.name, inputs.map(input => input.name))))
    for (const other of others) {
      if (!keepOthers && other.status === 'active') {
        await tx.update(clubPlans).set({ status: 'inactive', updatedAt: new Date() }).where(eq(clubPlans.id, other.id))
        lines.push({ id: other.id, nome: other.name, acao: 'inativado', status: 'inactive' })
      } else {
        lines.push({ id: other.id, nome: other.name, acao: 'mantido', status: other.status })
      }
    }
    return lines
  })

  console.log(`\nPlanos do clube — ${org.name} (${slug})`)
  console.table(report)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await sql.end()
  })
