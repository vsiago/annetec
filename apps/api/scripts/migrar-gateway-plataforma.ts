/**
 * Migra a assinatura ANNETEC de um inquilino para outro gateway (padrão:
 * Asaas) pela camada de serviço (`migratePlatformSubscriptionGateway`):
 * cliente no destino, faturas abertas canceladas ("Migrada para o Asaas") e
 * reemitidas no destino com `plt_<id>`, régua intacta, auditoria gravada.
 *
 * Sem `--confirmar` só mostra o que faria (nada muda no banco nem no gateway).
 * Nunca imprime chave de API; imprime o link público das faturas novas.
 *
 * Uso:
 *   pnpm --filter @annetec/api platform:migrar-gateway --org mapcard2
 *   pnpm --filter @annetec/api platform:migrar-gateway --org mapcard2 --confirmar
 *   ... --para asaas                (destino; padrão asaas)
 *   ... --realinhar-vencimento      (mensalidade vence no 1º dia do período — só
 *                                    para dado montado fora da régua, ex.: seed antigo)
 */
import 'dotenv/config'
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm'
import { paymentGatewayProvider } from '@annetec/contracts'
import { db, sql } from '../src/db/client'
import { organization, platformCharges, platformSubscriptions } from '../src/db/schema'
import { todaySP } from '../src/modules/club-billing/dates'
import { migratedChargeSchedule, migratePlatformSubscriptionGateway } from '../src/modules/platform-billing/gateway-migration.service'
import { OPEN_PLATFORM_CHARGE_STATUSES } from '../src/modules/platform-billing/presenter'
import { loadPlatformSettings } from '../src/modules/platform-billing/settings.service'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

async function main() {
  const org = arg('org')
  if (!org) throw new Error('Informe --org <slug ou id da organização>')
  const target = paymentGatewayProvider.parse(arg('para') ?? 'asaas')
  const confirm = flag('confirmar')
  const realign = flag('realinhar-vencimento')

  const [tenant] = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name })
    .from(organization)
    .where(or(eq(organization.slug, org), eq(organization.id, org)))
    .limit(1)
  if (!tenant) throw new Error(`Organização "${org}" não encontrada`)
  const [sub] = await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.organizationId, tenant.id)).limit(1)
  if (!sub) throw new Error(`${tenant.slug} não tem assinatura da plataforma`)

  console.log(`Inquilino: ${tenant.name} (${tenant.slug}) — assinatura ${sub.id}`)
  console.log(`  status ${sub.status} · gateway ${sub.gatewayProvider} → ${target} · past_due_at ${sub.pastDueAt?.toISOString() ?? '—'}`)

  const settings = await loadPlatformSettings()
  const today = todaySP()
  const open = await db
    .select()
    .from(platformCharges)
    .where(
      and(
        eq(platformCharges.subscriptionId, sub.id),
        inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES),
        ne(platformCharges.gatewayProvider, target),
      ),
    )
    .orderBy(asc(platformCharges.dueDate))
  console.log(`Faturas abertas fora do ${target}: ${open.length}`)
  for (const charge of open) {
    const plan = migratedChargeSchedule(charge, { today, boletoDueDays: settings.boletoDueDays, dueDay: sub.dueDay, realignMonthlyDueDate: realign })
    console.log(
      `  ${charge.id} ${charge.kind} R$ ${charge.amount} ${charge.status} · período ${charge.periodStart ?? '—'}–${charge.periodEnd ?? '—'}` +
        ` · vence ${charge.dueDate} → linha ${plan.dueDate} (${plan.status}), gateway ${plan.gatewayDueDate}`,
    )
  }

  if (!confirm) {
    console.log('\nSimulação: nada foi alterado. Rode com --confirmar para migrar.')
    return
  }

  const result = await migratePlatformSubscriptionGateway(sub.id, target, { realignMonthlyDueDate: realign })
  console.log(`\nMigrada: ${result.from} → ${result.to} · cliente ${result.customerId}`)
  for (const charge of result.charges) {
    console.log(`  antiga ${charge.oldId} → nova ${charge.newId}`)
    console.log(`    status ${charge.status} · vence ${charge.dueDate} (gateway ${charge.gatewayDueDate}) · pagamento ${charge.gatewayChargeId ?? '—'}`)
    if (charge.failureReason) console.log(`    FALHA: ${charge.failureReason}`)
    console.log(`    ${charge.publicUrl}`)
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => sql.end())
