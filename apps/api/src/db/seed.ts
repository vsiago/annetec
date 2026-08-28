import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { db, sql } from './client'
import {
  account,
  benefits,
  leads,
  member,
  organization,
  partners,
  sellerProfiles,
  tenantPlans,
  tenantProfiles,
  user,
} from './schema'
import { logger } from '@/lib/logger'

/**
 * Seed de desenvolvimento — `pnpm db:seed`.
 *
 * Reproduz no Postgres exatamente as contas que hoje vivem em
 * `apps/web/lib/demo-credentials.ts`. Grava direto nas tabelas do Better Auth
 * (`user`, `account`, `organization`, `member`) em vez de passar por
 * `auth.api.*`: um seed roda fora de qualquer request HTTP, então não há
 * sessão de "quem está chamando" para as checagens de permissão dos plugins
 * `admin`/`organization` — e `hashPassword` é a MESMA função que o Better
 * Auth usa por baixo dos panos para conferir senha no login, então as contas
 * criadas aqui logam normalmente.
 *
 * É idempotente: rodar duas vezes não duplica nada.
 */
async function main() {
  logger.info('Semeando banco de desenvolvimento...')

  const [starter, pro] = await db
    .insert(tenantPlans)
    .values([
      {
        name: 'Starter',
        priceMonthly: '499.00',
        memberLimit: 1_000,
        features: ['Portal do associado', 'Rede credenciada', 'Suporte por e-mail'],
      },
      {
        name: 'Pro',
        priceMonthly: '1499.00',
        memberLimit: 10_000,
        features: [
          'Tudo do Starter',
          'CRM de vendas',
          'Relatórios avançados',
          'Integração Digital Saúde',
        ],
      },
    ])
    .onConflictDoNothing()
    .returning()

  const planId = pro?.id ?? starter?.id ?? (await firstPlanId())

  await createAuthUser({
    name: 'Super Admin Annetec',
    email: 'super@annetec.com.br',
    password: 'super123456',
    role: 'superadmin',
  })

  await seedTenant({
    slug: 'annetec',
    name: 'Annetec',
    legalName: 'Annetec Tecnologia em Benefícios LTDA',
    document: '11222333000181',
    email: 'contato@annetec.com.br',
    phone: '2133334444',
    planId,
    primaryColor: '#1e3a8a',
    secondaryColor: '#f97316',
    accounts: [
      { name: 'Carlos Administrador', email: 'admin@annetec.com.br', role: 'admin', password: 'admin123' },
      { name: 'Maria Vendedora', email: 'maria@annetec.com.br', role: 'seller', password: 'seller123' },
      { name: 'Ana Associada', email: 'ana@email.com', role: 'client', password: 'client123' },
    ],
  })

  await seedTenant({
    slug: 'mepcard',
    name: 'MepCard',
    legalName: 'MepCard Administradora de Benefícios LTDA',
    document: '44555666000199',
    email: 'contato@mepcard.com.br',
    phone: '2144445555',
    planId,
    primaryColor: '#0f766e',
    secondaryColor: '#facc15',
    accounts: [
      { name: 'Gustavo Administrador', email: 'admin@mepcard.com.br', role: 'admin', password: 'admin123' },
      { name: 'Juliana Vendedora', email: 'vendedor@mepcard.com.br', role: 'seller', password: 'seller123' },
      { name: 'Mariana Associada', email: 'cliente@mepcard.com.br', role: 'client', password: 'client123' },
    ],
  })

  logger.info('Seed concluído')
  await sql.end()
}

interface SeedTenantInput {
  slug: string
  name: string
  legalName: string
  document: string
  email: string
  phone: string
  planId: string
  primaryColor: string
  secondaryColor: string
  accounts: {
    name: string
    email: string
    role: 'admin' | 'seller' | 'client'
    password: string
  }[]
}

async function seedTenant(input: SeedTenantInput) {
  const existingOrg = await db.query.organization.findFirst({ where: eq(organization.slug, input.slug) })

  const org =
    existingOrg ??
    (
      await db
        .insert(organization)
        .values({
          id: crypto.randomUUID(),
          slug: input.slug,
          name: input.name,
          createdAt: new Date(),
        })
        .returning()
    )[0]!

  await db
    .insert(tenantProfiles)
    .values({
      organizationId: org.id,
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      address: {
        cep: '20040020',
        street: 'Av. Rio Branco',
        number: '100',
        neighborhood: 'Centro',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
      branding: {
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
      },
      planId: input.planId,
      status: 'active',
    })
    .onConflictDoNothing()

  for (const account of input.accounts) {
    const authUser = await createAuthUser({
      name: account.name,
      email: account.email,
      password: account.password,
    })

    const [existingMembership] = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, authUser.id))
      .limit(1)

    if (!existingMembership) {
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: org.id,
        userId: authUser.id,
        role: account.role,
      })
    }

    if (account.role === 'seller') {
      await db
        .insert(sellerProfiles)
        .values({
          userId: authUser.id,
          organizationId: org.id,
          region: 'Rio de Janeiro',
          commissionRate: '0.1000',
        })
        .onConflictDoNothing()

      await db
        .insert(leads)
        .values([
          {
            organizationId: org.id,
            name: 'Contato do site',
            email: `lead1@${input.slug}.com.br`,
            phone: '21988887777',
            source: 'site',
            status: 'new',
            estimatedValue: '189.90',
            sellerId: authUser.id,
          },
          {
            organizationId: org.id,
            name: 'Indicação de associado',
            email: `lead2@${input.slug}.com.br`,
            phone: '21977776666',
            source: 'indicacao',
            status: 'qualified',
            estimatedValue: '349.90',
            sellerId: authUser.id,
          },
        ])
        .onConflictDoNothing()
    }
  }

  await db
    .insert(partners)
    .values([
      {
        organizationId: org.id,
        name: 'Clínica Vida Plena',
        category: 'health',
        discountPercent: '30.00',
        address: 'Rua das Laranjeiras, 250',
        phone: '2133221100',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
      {
        organizationId: org.id,
        name: 'Drogaria Central',
        category: 'pharmacy',
        discountPercent: '15.00',
        address: 'Av. Brasil, 1200',
        phone: '2133221101',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
    ])
    .onConflictDoNothing()

  await db
    .insert(benefits)
    .values([
      {
        organizationId: org.id,
        name: 'Telemedicina 24h',
        description: 'Atendimento médico por vídeo, sem custo adicional.',
        category: 'health',
        provider: 'Digital Saúde',
        locations: ['Nacional'],
      },
      {
        organizationId: org.id,
        name: 'Desconto em farmácias',
        description: 'Até 30% em medicamentos da rede conveniada.',
        category: 'pharmacy',
        discountPercent: '30.00',
        locations: ['RJ', 'SP'],
      },
    ])
    .onConflictDoNothing()

  logger.info({ slug: org.slug }, 'Inquilino semeado')
}

/** Grava `user` + `account` (provider `credential`) direto, fora de qualquer request. */
async function createAuthUser(input: {
  name: string
  email: string
  password: string
  role?: 'superadmin' | 'platform_admin'
}) {
  const email = input.email.toLowerCase()
  const existing = await db.query.user.findFirst({ where: eq(user.email, email) })
  if (existing) return existing

  const id = crypto.randomUUID()
  const [created] = await db
    .insert(user)
    .values({
      id,
      name: input.name,
      email,
      emailVerified: true,
      role: input.role ?? 'user',
    })
    .returning()

  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    // Precisa ser exatamente o que `createLocalAccountIssuer('credential')`
    // do Better Auth produz — é isso que `signInEmail` confere no login,
    // não só `providerId`.
    issuer: 'local:credential',
    password: await hashPassword(input.password),
  })

  return created!
}

async function firstPlanId(): Promise<string> {
  const [plan] = await db.select({ id: tenantPlans.id }).from(tenantPlans).limit(1)
  if (!plan) throw new Error('Nenhum plano de inquilino disponível para o seed')
  return plan.id
}

main().catch(async error => {
  logger.error({ err: error }, 'Falha no seed')
  await sql.end()
  process.exit(1)
})
