import {
  ERROR_CODES,
  type CreateTenantUserInput,
  type TenantUser,
  type UpdateTenantUserInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { member, sellerProfiles, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'

/**
 * CRUD de usuários dentro de um inquilino.
 *
 * A pessoa (`user`) e o vínculo (`member.role`) são do Better Auth; só o
 * criamos por `auth.api.signUpEmail` (sem exigir chamador com papel de
 * plataforma — diferente de `tenantsService.create`, aqui quem chama é o
 * ADMIN DO PRÓPRIO INQUILINO, que não tem papel de plataforma nenhum) seguido
 * de `auth.api.addMember`. Se o e-mail já existe (a pessoa já tem conta em
 * outro inquilino, ou já era vendedora e virou também cliente), reaproveita a
 * conta e só cria o vínculo novo.
 */
export const usersService = {
  async list(params: {
    tenantId: string
    page: number
    perPage: number
    role?: 'admin' | 'seller' | 'client'
    search?: string
  }) {
    const filters: SQL[] = [eq(member.organizationId, params.tenantId)]
    if (params.role) filters.push(eq(member.role, params.role))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(ilike(user.name, term), ilike(user.email, term))
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const [rows, [totals]] = await Promise.all([
      db
        .select({ member, user })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(where)
        .orderBy(desc(member.createdAt))
        .limit(params.perPage)
        .offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(member).innerJoin(user, eq(user.id, member.userId)).where(where),
    ])

    return { items: rows.map(row => toDomain(row.member, row.user)), total: totals?.value ?? 0 }
  },

  async getById(tenantId: string, id: string): Promise<TenantUser> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')
    return toDomain(row.member, row.user)
  },

  async create(tenantId: string, input: CreateTenantUserInput): Promise<TenantUser> {
    const email = input.email.toLowerCase()

    const [existingMembership] = await db
      .select({ userId: member.userId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, tenantId), eq(user.email, email)))
      .limit(1)
    if (existingMembership) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe um usuário com este e-mail neste inquilino')
    }

    const authUser = await findOrCreateAuthUser(email, input.name, input.password)

    await auth.api.addMember({
      body: { userId: authUser.id, organizationId: tenantId, role: input.role },
    })

    if (input.role === 'seller') {
      await db
        .insert(sellerProfiles)
        .values({ userId: authUser.id, organizationId: tenantId })
        .onConflictDoNothing()
    }

    if (input.phone) {
      await db.update(user).set({ phone: input.phone }).where(eq(user.id, authUser.id))
    }

    if (!input.active) {
      await db
        .update(member)
        .set({ active: false })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, authUser.id)))
    }

    return this.getById(tenantId, authUser.id)
  },

  async update(tenantId: string, id: string, input: UpdateTenantUserInput): Promise<TenantUser> {
    const row = await findMembership(tenantId, id)
    if (!row) throw AppError.notFound('Usuário')

    if (input.name !== undefined || input.email !== undefined || input.phone !== undefined) {
      await db
        .update(user)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          updatedAt: new Date(),
        })
        .where(eq(user.id, id))
    }

    if (input.role !== undefined && input.role !== row.member.role) {
      // Atualização direta: é só o valor do papel, sem efeito colateral que o
      // endpoint `auth.api.updateMemberRole` resolveria por nós, e evita
      // depender de `ac`/`roles` customizados só para autorizar esta troca —
      // a autorização (só admin do inquilino chega aqui) já é feita pelo
      // middleware `requireTenantRole('admin')` da rota.
      await db
        .update(member)
        .set({ role: input.role })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
      if (input.role === 'seller') {
        await db.insert(sellerProfiles).values({ userId: id, organizationId: tenantId }).onConflictDoNothing()
      }
    }

    if (input.active !== undefined) {
      await db
        .update(member)
        .set({ active: input.active })
        .where(and(eq(member.organizationId, tenantId), eq(member.userId, id)))
    }

    if (input.password) {
      // Troca de senha por terceiro dentro do inquilino usa o fluxo de
      // "esqueci minha senha" (e-mail) — `admin.setUserPassword` é só para a
      // equipe Annetec (plataforma) resetar senha de qualquer conta.
      throw AppError.businessRule('Use o fluxo de redefinição de senha para alterar a senha de outro usuário')
    }

    return this.getById(tenantId, id)
  },

  /**
   * Remove o vínculo com o inquilino. A conta Better Auth em si não é
   * apagada — pode ter vínculo com outro inquilino, ou o histórico de vendas
   * e contratos aponta para o `userId` por chave estrangeira.
   */
  async deactivate(tenantId: string, id: string): Promise<TenantUser> {
    return this.update(tenantId, id, { active: false })
  },
}

/** Vínculo entre vendedor Annetec e `Produtor` da Digital Saúde. */
export const sellersService = {
  async upstreamProdutorCodigo(tenantId: string, sellerId: string): Promise<string | null> {
    const [row] = await db
      .select({ codigo: sellerProfiles.upstreamProdutorCodigo })
      .from(sellerProfiles)
      .where(and(eq(sellerProfiles.userId, sellerId), eq(sellerProfiles.organizationId, tenantId)))
      .limit(1)
    return row?.codigo ?? null
  },

  async upstreamProdutorCredentials(tenantId: string, sellerId: string) {
    const [row] = await db
      .select({
        login: sellerProfiles.upstreamProdutorLogin,
        password: sellerProfiles.upstreamProdutorPasswordEncrypted,
      })
      .from(sellerProfiles)
      .where(and(eq(sellerProfiles.userId, sellerId), eq(sellerProfiles.organizationId, tenantId)))
      .limit(1)

    if (!row?.login || !row.password) return null
    return { login: row.login, password: decryptSecret(row.password) }
  },

  /**
   * Vincula o vendedor a um produtor existente no ERP, conferindo o código
   * antes de gravar — assim um código digitado errado falha na configuração e
   * não na hora de fechar uma venda.
   */
  async linkProdutor(
    tenantId: string,
    sellerId: string,
    input: { codigo: string; login?: string; password?: string },
  ) {
    const client = await getDigitalSaudeClient(tenantId)
    const produtor = await client.one('produtorPorCodigo', { codigoProdutor: input.codigo })
    if (!produtor) throw AppError.notFound('Produtor na Digital Saúde')

    await db
      .insert(sellerProfiles)
      .values({
        userId: sellerId,
        organizationId: tenantId,
        upstreamProdutorCodigo: input.codigo,
        upstreamProdutorLogin: input.login ?? null,
        upstreamProdutorPasswordEncrypted: input.password ? encryptSecret(input.password) : null,
      })
      .onConflictDoUpdate({
        target: [sellerProfiles.userId, sellerProfiles.organizationId],
        set: {
          upstreamProdutorCodigo: input.codigo,
          ...(input.login !== undefined ? { upstreamProdutorLogin: input.login } : {}),
          ...(input.password !== undefined
            ? { upstreamProdutorPasswordEncrypted: encryptSecret(input.password) }
            : {}),
        },
      })

    return { codigo: input.codigo, nome: produtor.nome ?? null }
  },

  /** Cria o produtor no ERP e já vincula ao vendedor. */
  async createProdutor(
    tenantId: string,
    sellerId: string,
    input: { nome: string; email: string; numeroDocumento?: string; grupoProdutorCodigo: string },
  ) {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('produtorIncluir', {
      nome: input.nome,
      email: input.email,
      numeroDocumento: input.numeroDocumento,
      grupoProdutor: { codigo: input.grupoProdutorCodigo },
    })

    const codigo = result[0]?.codigo
    if (!codigo) throw AppError.businessRule('A Digital Saúde não retornou o código do produtor')

    await this.linkProdutor(tenantId, sellerId, { codigo })
    return { codigo, nome: result[0]?.nome ?? input.nome }
  },
}

/** Reaproveita a conta se o e-mail já existir; senão cria uma nova. */
async function findOrCreateAuthUser(email: string, name: string, password?: string) {
  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing) return existing

  const signUp = await auth.api.signUpEmail({
    body: { email, name, password: password ?? generateProvisionalPassword() },
  })
  return signUp.user
}

function findMembership(tenantId: string, userId: string) {
  return db
    .select({ member, user })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
    .limit(1)
    .then(rows => rows[0])
}

function generateProvisionalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

type MemberRow = typeof member.$inferSelect
type UserRow = typeof user.$inferSelect

function toDomain(memberRow: MemberRow, userRow: UserRow): TenantUser {
  return {
    id: userRow.id,
    tenantId: memberRow.organizationId,
    name: userRow.name,
    email: userRow.email,
    role: memberRow.role as TenantUser['role'],
    phone: userRow.phone ?? null,
    avatarUrl: userRow.image,
    active: memberRow.active,
    createdAt: memberRow.createdAt.toISOString(),
  }
}
