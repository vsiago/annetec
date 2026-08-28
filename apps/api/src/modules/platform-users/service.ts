import { ERROR_CODES, type CreatePlatformUserInput, type PlatformUser } from '@annetec/contracts'
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'

/**
 * Contas de equipe Annetec (`user.role` = 'superadmin' | 'platform_admin').
 * Mesma tabela `user` do Better Auth que os inquilinos usam — o filtro por
 * papel de plataforma é o que isola "quem é Annetec" de "quem é membro de
 * algum inquilino" (que fica com role 'user', o default).
 */
const PLATFORM_ROLES = ['superadmin', 'platform_admin'] as const

export const platformUsersService = {
  async list(params: { page: number; perPage: number; role?: 'superadmin' | 'platform_admin'; search?: string }) {
    const filters: SQL[] = [inArray(user.role, PLATFORM_ROLES)]
    if (params.role) filters.push(eq(user.role, params.role))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(ilike(user.name, term), ilike(user.email, term))
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(user)
        .where(where)
        .orderBy(desc(user.createdAt))
        .limit(params.perPage)
        .offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(user).where(where),
    ])

    return { items: rows.map(toDomain), total: totals?.value ?? 0 }
  },

  /**
   * Cria a conta headerless — a mesma "ação de sistema" usada em todo lugar
   * que a Annetec provisiona conta em nome de outra pessoa. A autorização
   * (só superadmin chega aqui) já foi feita por `requirePlatformRole` na rota;
   * não depende de sessão do Better Auth para isso.
   */
  async create(input: CreatePlatformUserInput): Promise<PlatformUser> {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()))
      .limit(1)
    if (existing) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe uma conta com este e-mail')
    }

    const created = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email.toLowerCase(),
        password: input.password,
        role: input.role,
        data: input.phone ? { phone: input.phone } : undefined,
      },
    })

    const [row] = await db.select().from(user).where(eq(user.id, created.user.id)).limit(1)
    if (!row) throw AppError.businessRule('Falha ao carregar a conta recém-criada')
    return toDomain(row)
  },
}

type UserRow = typeof user.$inferSelect

function toDomain(row: UserRow): PlatformUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role as PlatformUser['role'],
    avatarUrl: row.image,
    createdAt: row.createdAt.toISOString(),
  }
}
