/**
 * Remove os inquilinos criados pelo `e2e-inquilino.ts` (slug `e2e-<carimbo>`)
 * e as contas provisionadas junto com eles.
 *
 * O E2E cancela o inquilino no fim, mas cancelamento é lógico — de propósito,
 * porque em produção apagar uma organização derrubaria contrato e histórico
 * de venda em cascata. Para dado de teste, apagar é o certo.
 *
 * Roda em modo seco por padrão; `--apagar` executa.
 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

const APAGAR = process.argv.includes('--apagar')

async function main() {
  const alvos = (await db.execute(sql`
    select o.id, o.slug, o.name, p.status
    from organization o
    join tenant_profiles p on p.organization_id = o.id
    where o.slug like 'e2e-%'
    order by o.slug
  `)) as unknown as { id: string; slug: string; name: string; status: string }[]

  if (alvos.length === 0) {
    console.log('Nenhum inquilino de teste encontrado.')
    process.exit(0)
  }

  console.log(`${alvos.length} inquilino(s) de teste:`)
  for (const alvo of alvos) console.log(`   ${alvo.slug} · ${alvo.name} · ${alvo.status}`)

  const contas = (await db.execute(sql`
    select email from "user" where email like '%@e2e-%'
  `)) as unknown as { email: string }[]
  console.log(`\n${contas.length} conta(s) provisionada(s):`)
  for (const conta of contas) console.log(`   ${conta.email}`)

  if (!APAGAR) {
    console.log('\nModo seco. Rode com --apagar para remover.')
    process.exit(0)
  }

  // A organização cascateia para perfil, integração, contratos, leads,
  // vendas, parceiros, benefícios e vínculos de membro.
  await db.execute(sql`delete from organization where slug like 'e2e-%'`)
  await db.execute(sql`delete from "user" where email like '%@e2e-%'`)
  console.log('\nRemovidos.')
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
