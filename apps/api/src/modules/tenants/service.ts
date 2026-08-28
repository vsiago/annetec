import {
  ERROR_CODES,
  type CreateTenantInput,
  type Tenant,
  type TenantIntegration,
  type TenantIntegrationPublic,
  type UpdateTenantInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { organization, tenantIntegrations, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { createDigitalSaudeClient } from '@/integrations/digitalsaude/client'
import { invalidateDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import { encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * Ciclo de vida do inquilino — o fluxo que o superadmin percorre em
 * `/admin/inquilinos`: criar, configurar integração, usar, suspender.
 *
 * Um inquilino é uma `organization` do Better Auth (identidade, slug, quem
 * pertence a ele) mais uma linha em `tenant_profiles` (CNPJ, endereço, marca,
 * plano, status — o que o Better Auth não sabe). `create` grava as duas
 * coisas e já nasce com um admin: `auth.api.createOrganization` com
 * `creatorRole: 'admin'` (configurado em lib/auth.ts) cuida do vínculo.
 */
export const tenantsService = {
  async list(params: { page: number; perPage: number; status?: string; search?: string }) {
    const filters: SQL[] = []
    if (params.status) filters.push(eq(tenantProfiles.status, params.status as 'active'))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(
        ilike(organization.name, term),
        ilike(organization.slug, term),
        ilike(tenantProfiles.document, term),
      )
      if (match) filters.push(match)
    }
    const where = filters.length > 0 ? and(...filters) : undefined

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(organization)
        .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
        .where(where)
        .orderBy(desc(tenantProfiles.createdAt))
        .limit(params.perPage)
        .offset((params.page - 1) * params.perPage),
      db
        .select({ value: count() })
        .from(organization)
        .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
        .where(where),
    ])

    return { items: rows.map(row => toDomain(row.organization, row.tenant_profiles)), total: totals?.value ?? 0 }
  },

  async getById(id: string): Promise<Tenant> {
    const row = await findByOrgId(id)
    if (!row) throw AppError.notFound('Inquilino')
    return toDomain(row.organization, row.tenant_profiles)
  },

  async getBySlug(slug: string): Promise<Tenant> {
    const [row] = await db
      .select()
      .from(organization)
      .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
      .where(eq(organization.slug, slug.toLowerCase()))
      .limit(1)
    if (!row) throw AppError.notFound('Inquilino')
    return toDomain(row.organization, row.tenant_profiles)
  },

  /**
   * Mesmos dados de `getBySlug`, mas para a rota pública (sem sessão) que
   * resolve a página institucional `/[tenant]` e o login com a marca do
   * clube antes de qualquer login existir. Um inquilino cancelado não deve
   * resolver aqui — mesma regra de `resolveTenant` para as rotas
   * autenticadas.
   */
  async getPublicBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.getBySlug(slug)
    if (tenant.status === 'cancelled') {
      throw AppError.forbidden('Este inquilino está cancelado')
    }
    return tenant
  },

  /**
   * Cria o inquilino e seu admin. `headers` é a sessão do superadmin que
   * chamou. `auth.api.createUser`/`createOrganization` são chamados sem
   * `headers`: sem sessão no contexto, o Better Auth trata como ação de
   * sistema e pula a checagem de permissão — o mesmo padrão usado em todo
   * lugar que a Annetec provisiona conta em nome de outra pessoa (a
   * autorização de quem pode chegar até aqui já foi feita por
   * `requirePlatformRole` na rota).
   */
  async create(input: CreateTenantInput): Promise<{ tenant: Tenant; ownerPassword: string }> {
    const [existingOrg] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, input.slug))
      .limit(1)
    if (existingOrg) throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe inquilino com este slug')

    const [existingDocument] = await db
      .select({ organizationId: tenantProfiles.organizationId })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.document, input.document))
      .limit(1)
    if (existingDocument) throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe inquilino com este CNPJ')

    // Senha provisória entregue ao admin no fim do wizard; ele troca no
    // primeiro acesso (POST /api/v1/auth/password).
    const ownerPassword = generateProvisionalPassword()

    const created = await auth.api.createUser({
      body: { email: input.ownerEmail.toLowerCase(), name: input.ownerName, password: ownerPassword },
    })

    const org = await auth.api.createOrganization({
      body: { name: input.name, slug: input.slug, userId: created.user.id },
    })
    if (!org) throw AppError.businessRule('Não foi possível criar o inquilino')

    await db.insert(tenantProfiles).values({
      organizationId: org.id,
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      address: input.address,
      branding: input.branding,
      planId: input.planId,
      status: input.status,
      trialEndsAt: input.status === 'trial' ? new Date(Date.now() + 30 * 86_400_000) : null,
    })

    if (input.integration) {
      await db.insert(tenantIntegrations).values(toIntegrationRow(org.id, input.integration))
    }

    logger.info({ organizationId: org.id, slug: org.slug }, 'Inquilino criado')
    return { tenant: await this.getBySlug(org.slug), ownerPassword }
  },

  async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const row = await findByOrgId(id)
    if (!row) throw AppError.notFound('Inquilino')

    if (input.name !== undefined) {
      // Atualização direta, não `auth.api.updateOrganization`: aquele
      // endpoint autoriza pelo vínculo de MEMBRO do chamador na organization,
      // e a equipe Annetec (quem chama esta rota) nunca é membro de nenhum
      // inquilino — de propósito, ver requirePlatformRole.
      await db.update(organization).set({ name: input.name }).where(eq(organization.id, id))
    }

    await db
      .update(tenantProfiles)
      .set({
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.branding !== undefined ? { branding: input.branding } : {}),
        ...(input.planId !== undefined ? { planId: input.planId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenantProfiles.organizationId, id))

    return this.getById(id)
  },

  /**
   * Cancelamento é lógico. Apagar a `organization` derrubaria em cascata
   * usuários, contratos e histórico de vendas — informação que a
   * administradora ainda precisa acessar depois do encerramento do contrato.
   */
  async cancel(id: string): Promise<Tenant> {
    await db
      .update(tenantProfiles)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tenantProfiles.organizationId, id))
    return this.getById(id)
  },

  async getIntegration(tenantId: string): Promise<TenantIntegrationPublic | null> {
    const [row] = await db
      .select()
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.organizationId, tenantId))
      .limit(1)
    if (!row) return null

    return {
      provider: 'digitalsaude',
      baseUrl: row.baseUrl,
      defaultGrupoCodigo: row.defaultGrupoCodigo ?? undefined,
      defaultFilialCodigo: row.defaultFilialCodigo ?? undefined,
      defaultConvenioCodigo: row.defaultConvenioCodigo ?? undefined,
      enabled: row.enabled,
      configured: true,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
    }
  },

  /**
   * Grava as credenciais e valida contra o ERP na mesma operação. Credencial
   * errada é rejeitada na hora, em vez de aparecer como erro no primeiro
   * associado que tentar entrar.
   */
  async saveIntegration(
    tenantId: string,
    input: TenantIntegration,
  ): Promise<TenantIntegrationPublic> {
    const probe = createDigitalSaudeClient({
      baseUrl: input.baseUrl,
      appToken: input.appToken,
      apiPassword: input.apiPassword,
      label: tenantId,
    })
    const ok = await probe.healthCheck()
    if (!ok) {
      throw new AppError(
        ERROR_CODES.UPSTREAM_UNAUTHORIZED,
        'A Digital Saúde recusou estas credenciais. Confira token e senhaApi.',
      )
    }

    const row = toIntegrationRow(tenantId, input)
    await db
      .insert(tenantIntegrations)
      .values({ ...row, lastCheckedAt: new Date(), lastCheckOk: true })
      .onConflictDoUpdate({
        target: tenantIntegrations.organizationId,
        set: { ...row, lastCheckedAt: new Date(), lastCheckOk: true, updatedAt: new Date() },
      })

    invalidateDigitalSaudeClient(tenantId)
    const saved = await this.getIntegration(tenantId)
    return saved!
  },

  async testIntegration(tenantId: string): Promise<boolean> {
    const { getDigitalSaudeClient } = await import('@/integrations/digitalsaude/provider')
    const client = await getDigitalSaudeClient(tenantId)
    const ok = await client.healthCheck()
    await db
      .update(tenantIntegrations)
      .set({ lastCheckedAt: new Date(), lastCheckOk: ok })
      .where(eq(tenantIntegrations.organizationId, tenantId))
    return ok
  },
}

function findByOrgId(id: string) {
  return db
    .select()
    .from(organization)
    .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, id))
    .limit(1)
    .then(rows => rows[0])
}

function toIntegrationRow(organizationId: string, input: TenantIntegration) {
  return {
    organizationId,
    provider: input.provider,
    baseUrl: input.baseUrl,
    appTokenEncrypted: encryptSecret(input.appToken),
    apiPasswordEncrypted: encryptSecret(input.apiPassword),
    defaultGrupoCodigo: input.defaultGrupoCodigo ?? null,
    defaultFilialCodigo: input.defaultFilialCodigo ?? null,
    defaultConvenioCodigo: input.defaultConvenioCodigo ?? null,
    enabled: input.enabled,
  }
}

function generateProvisionalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

type OrgRow = typeof organization.$inferSelect
type ProfileRow = typeof tenantProfiles.$inferSelect

function toDomain(org: OrgRow, profile: ProfileRow): Tenant {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    legalName: profile.legalName,
    document: profile.document,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    branding: profile.branding,
    planId: profile.planId!,
    status: profile.status,
    createdAt: profile.createdAt.toISOString(),
    trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
  }
}
