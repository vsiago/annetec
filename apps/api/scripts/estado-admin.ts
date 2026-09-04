/**
 * Fotografia do que existe no banco por trás das telas do /admin.
 *
 * Cada tela do superadmin lê um pedaço diferente: inquilinos vêm de
 * `tenant_profiles`, mas Clientes/Vendedores/Leads/Financeiro/Comissões/
 * Parceiros/Catálogo leem a organização com `kind = 'platform'` (a Annetec
 * operando como operadora). Se essa linha não existir, sete telas mostram
 * estado vazio sem que nada esteja quebrado.
 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'

async function conta(rotulo: string, consulta: ReturnType<typeof sql>) {
  try {
    const linhas = (await db.execute(consulta)) as unknown as Record<string, unknown>[]
    console.log(`${rotulo}:`)
    if (linhas.length === 0) console.log('   (vazio)')
    for (const linha of linhas) console.log('   ', JSON.stringify(linha))
  } catch (error) {
    console.log(`${rotulo}: ERRO ${(error as Error).message.slice(0, 120)}`)
  }
}

async function main() {
  await conta(
    'Organizações por tipo',
    sql`select p.kind, p.status, o.slug, o.name from tenant_profiles p
        join organization o on o.id = p.organization_id order by p.kind, o.slug`,
  )
  await conta('Planos de assinatura', sql`select name, price_monthly, member_limit from tenant_plans order by name`)
  await conta(
    'Integração configurada por inquilino',
    sql`select o.slug, i.enabled, i.last_check_ok, i.default_grupo_codigo, i.default_grupo_produtor_codigo,
               (i.capabilities is not null) as tem_capabilities
        from tenant_integrations i join organization o on o.id = i.organization_id order by o.slug`,
  )
  await conta(
    'Usuários por escopo',
    sql`select coalesce(m.role, u.role, 'sem papel') as papel, count(*)::int as total
        from "user" u left join member m on m.user_id = u.id group by 1 order by 2 desc`,
  )
  await conta(
    'Dados de negócio por organização',
    sql`select o.slug,
           (select count(*)::int from contracts c where c.organization_id = o.id) as contratos,
           (select count(*)::int from leads l where l.organization_id = o.id) as leads,
           (select count(*)::int from sales s where s.organization_id = o.id) as vendas,
           (select count(*)::int from partners p where p.organization_id = o.id) as parceiros,
           (select count(*)::int from benefits b where b.organization_id = o.id) as beneficios,
           (select count(*)::int from seller_profiles sp where sp.organization_id = o.id) as vendedores
        from organization o order by o.slug`,
  )
  await conta(
    'Vendedores com produtor vinculado (necessário para comissão)',
    sql`select o.slug, count(*)::int as total,
           count(sp.upstream_produtor_codigo)::int as com_codigo,
           count(sp.upstream_produtor_password_encrypted)::int as com_senha
        from seller_profiles sp join organization o on o.id = sp.organization_id group by o.slug`,
  )
  await conta('Eventos de rastreabilidade', sql`select kind, count(*)::int as total from activity_events group by 1`)
  await conta('Trilha de auditoria', sql`select count(*)::int as total from audit_logs`)
  process.exit(0)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
