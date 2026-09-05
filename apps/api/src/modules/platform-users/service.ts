import {
  ERROR_CODES,
  type CreatePlatformUserInput,
  type PlatformUser,
  type UpdatePlatformUserInput,
} from '@annetec/contracts'
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

  async getById(id: string): Promise<PlatformUser> {
    const [row] = await db
      .select()
      .from(user)
      .where(and(eq(user.id, id), inArray(user.role, PLATFORM_ROLES)))
      .limit(1)
    if (!row) throw AppError.notFound('Usuário da plataforma')
    return toDomain(row)
  },

  /**
   * Edita nome, telefone, papel e ativação.
   *
   * Desativar usa `user.banned` do plugin `admin` do Better Auth em vez de uma
   * coluna nossa: é o campo que o próprio Better Auth consulta no login, então
   * a conta desativada para de entrar de fato, e não só na nossa listagem.
   * Apagar não é opção — a conta assina o histórico da trilha de auditoria.
   *
   * `actorId` impede dois pés no próprio pé: ninguém se autodesativa nem se
   * autorrebaixa, o que deixaria a plataforma sem superadmin.
   */
  async update(id: string, input: UpdatePlatformUserInput, actorId?: string): Promise<PlatformUser> {
    const alvo = await this.getById(id)

    if (actorId === id) {
      if (input.active === false) {
        throw AppError.businessRule('Você não pode desativar a própria conta')
      }
      if (input.role && input.role !== alvo.role) {
        throw AppError.businessRule('Você não pode alterar o próprio papel')
      }
    }

    // Rebaixar ou desativar o último superadmin trancaria todo mundo para fora.
    const perdendoSuperadmin =
      alvo.role === 'superadmin' &&
      ((input.role !== undefined && input.role !== 'superadmin') || input.active === false)

    if (perdendoSuperadmin) {
      const [ativos] = await db
        .select({ value: count() })
        .from(user)
        .where(and(eq(user.role, 'superadmin'), eq(user.banned, false)))
      if ((ativos?.value ?? 0) <= 1) {
        throw AppError.businessRule('A plataforma precisa de pelo menos um superadmin ativo')
      }
    }

    await db
      .update(user)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined
          ? {
              banned: !input.active,
              banReason: input.active ? null : 'Desativado pela equipe Annetec',
              banExpires: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))

    return this.getById(id)
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
    active: row.banned !== true,
    createdAt: row.createdAt.toISOString(),
  }
}
