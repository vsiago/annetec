import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { db, sql } from './client'
import { account, member, organization, tenantProfiles, user } from './schema'
import { logger } from '@/lib/logger'

/**
 * Cria (ou repara) o admin (dono) de um inquilino direto no banco.
 *
 * Grava exatamente o que o seed grava para um admin de inquilino: `user`
 * (`emailVerified: true`, `role: 'user'` — papel de plataforma comum),
 * `account` com provider `credential` + `issuer: 'local:credential'` e senha
 * com o `hashPassword` do próprio Better Auth, e `member` com `role: 'admin'`
 * na organization do slug.
 *
 * Idempotente: se o e-mail já existe, redefine a senha (cria a linha de
 * `account` credential se faltar), desbane, marca o e-mail como verificado e
 * garante o vínculo `member` admin ativo nesse inquilino.
 *
 *   pnpm --filter @annetec/api tenant:create-admin \
 *     <tenantSlug> "Nome da Pessoa" email@dominio.com.br 'SenhaForte123!'
 */
async function main() {
  const [tenantSlug, name, rawEmail, password] = process.argv.slice(2)

  if (!tenantSlug || !name || !rawEmail || !password) {
    console.error('Uso: create-tenant-admin.ts <tenantSlug> "<nome>" <email> <senha>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Senha muito curta — use pelo menos 8 caracteres')
    process.exit(1)
  }

  const email = rawEmail.toLowerCase()

  try {
    const org = await db.query.organization.findFirst({ where: eq(organization.slug, tenantSlug) })
    if (!org) {
      throw new Error(`Inquilino "${tenantSlug}" não encontrado — confira o slug (tabela organization)`)
    }

    const profile = await db.query.tenantProfiles.findFirst({
      where: eq(tenantProfiles.organizationId, org.id),
    })
    if (profile?.status === 'cancelled') {
      logger.warn({ tenantSlug }, 'Inquilino está cancelado — o login do admin será recusado')
    }

    const passwordHash = await hashPassword(password)
    const existing = await db.query.user.findFirst({ where: eq(user.email, email) })

    let userId: string
    if (existing) {
      userId = existing.id
      await db
        .update(user)
        .set({ emailVerified: true, banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
        .where(eq(user.id, userId))

      const [credential] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
        .limit(1)

      if (credential) {
        await db
          .update(account)
          .set({ password: passwordHash, issuer: 'local:credential', updatedAt: new Date() })
          .where(eq(account.id, credential.id))
      } else {
        await insertCredential(userId, passwordHash)
      }
      logger.info({ userId, email }, 'Usuário já existia — senha redefinida')
    } else {
      userId = crypto.randomUUID()
      await db.insert(user).values({ id: userId, name, email, emailVerified: true, role: 'user' })
      await insertCredential(userId, passwordHash)
      logger.info({ userId, email }, 'Usuário criado')
    }

    const [membership] = await db
      .select({ id: member.id, role: member.role, active: member.active })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, org.id)))
      .limit(1)

    if (membership) {
      if (membership.role !== 'admin' || !membership.active) {
        await db
          .update(member)
          .set({ role: 'admin', accessStatus: 'active', accessChangedAt: new Date() })
          .where(eq(member.id, membership.id))
      }
    } else {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: org.id,
        userId,
        role: 'admin',
      })
    }

    logger.info({ userId, email, tenantSlug, organizationId: org.id }, 'Admin do inquilino pronto')
  } finally {
    await sql.end()
  }
}

/** Mesma linha de `account` que o seed grava (ver `createAuthUser` em seed.ts). */
async function insertCredential(userId: string, passwordHash: string) {
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId,
    accountId: userId,
    providerId: 'credential',
    // Precisa ser exatamente o que `createLocalAccountIssuer('credential')`
    // do Better Auth produz — é isso que `signInEmail` confere no login.
    issuer: 'local:credential',
    password: passwordHash,
  })
}

main().catch(error => {
  logger.error({ err: error }, 'Falha ao criar admin do inquilino')
  process.exit(1)
})
