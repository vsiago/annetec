import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { env } from '@/config/env'
import { encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { db, sql } from './client'
import { organization, tenantIntegrations, tenantProfiles, user } from './schema'

/**
 * Cria (ou atualiza) a organização `kind: 'platform'` — a Annetec operando
 * como operadora, com clientes diretos na Digital Saúde.
 *
 * Fica separada de propósito da organização de demonstração `annetec`
 * (slug `annetec`, seedada por `db/seed.ts`, com senhas triviais e
 * publicadas no repo): aquela existe só para exercitar o painel de inquilino
 * comum e NUNCA deve carregar credenciais reais da Digital Saúde. Esta aqui
 * é a operadora de verdade, no slug `annetec-operadora`.
 *
 * Idempotente: rodar de novo atualiza cadastro/credenciais em vez de
 * duplicar.
 *
 *   pnpm --filter @annetec/api exec tsx src/db/create-platform-operator.ts
 */
const SLUG = 'annetec-operadora'

async function main() {
  const appToken = env.DIGITALSAUDE_APP_TOKEN
  const apiPassword = env.DIGITALSAUDE_API_PASSWORD
  if (!appToken || !apiPassword) {
    console.error('DIGITALSAUDE_APP_TOKEN / DIGITALSAUDE_API_PASSWORD ausentes no .env')
    process.exit(1)
  }

  const [existing] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, SLUG))
    .limit(1)

  let organizationId: string

  if (existing) {
    organizationId = existing.id
    logger.info({ organizationId, slug: SLUG }, 'Organização da operadora já existe — atualizando')
  } else {
    // Dono técnico da organization no Better Auth (exigido por createOrganization);
    // por ser conta de plataforma, `resolveActiveMembership` já resolve
    // scope: 'platform' para ela antes de olhar para membership, então virar
    // membro daqui não muda nada no que ela já podia fazer.
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'superadmin'))
      .limit(1)
    if (!owner) {
      console.error('Nenhum usuário superadmin encontrado para ser o criador da organization')
      process.exit(1)
    }

    const org = await auth.api.createOrganization({
      body: { name: 'Annetec', slug: SLUG, userId: owner.id },
    })
    if (!org) throw new Error('createOrganization não retornou a organização')
    organizationId = org.id
    logger.info({ organizationId, slug: SLUG }, 'Organização da operadora criada')
  }

  await db
    .insert(tenantProfiles)
    .values({
      organizationId,
      legalName: 'ASSOCIAÇÃO NACIONAL PARA EDU. PROF. E TEC. DOS SERV. PUBL. MUN. EST. E',
      document: '38821517000114',
      email: 'douglas_trindade@yahoo.com.br',
      phone: '21965751938',
      address: {
        cep: '28941140',
        street: 'RUA EPAMINONDAS PEREIRA NUNES',
        number: '122',
        neighborhood: 'CENTRO',
        city: 'SÃO PEDRO DA ALDEIA',
        state: 'RJ',
      },
      branding: { primaryColor: '#DC2626', secondaryColor: '#1F2937' },
      status: 'active',
      kind: 'platform',
    })
    .onConflictDoUpdate({
      target: tenantProfiles.organizationId,
      set: { kind: 'platform', status: 'active', updatedAt: new Date() },
    })

  await db
    .insert(tenantIntegrations)
    .values({
      organizationId,
      provider: 'digitalsaude',
      baseUrl: env.DIGITALSAUDE_BASE_URL,
      appTokenEncrypted: encryptSecret(appToken),
      apiPasswordEncrypted: encryptSecret(apiPassword),
      enabled: true,
      lastCheckedAt: new Date(),
      lastCheckOk: true,
    })
    .onConflictDoUpdate({
      target: tenantIntegrations.organizationId,
      set: {
        baseUrl: env.DIGITALSAUDE_BASE_URL,
        appTokenEncrypted: encryptSecret(appToken),
        apiPasswordEncrypted: encryptSecret(apiPassword),
        enabled: true,
        lastCheckedAt: new Date(),
        lastCheckOk: true,
        updatedAt: new Date(),
      },
    })

  logger.info({ organizationId, slug: SLUG }, 'Operadora Annetec pronta, credenciais gravadas cifradas')
}

main()
  .catch(error => {
    logger.error({ err: error }, 'Falha ao criar operadora da plataforma')
    process.exit(1)
  })
  .finally(() => sql.end())
