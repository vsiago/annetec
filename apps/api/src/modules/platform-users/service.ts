import {
  ERROR_CODES,
  platformRole,
  type CreatePlatformUserInput,
  type PlatformRole,
  type PlatformUser,
  type UpdatePlatformUserInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { session, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { ensureSellerProfile, referralCodeTaken } from '@/modules/platform-sales/seller-profile'

/**
 * Contas de plataforma Annetec (`user.role` = 'superadmin' | 'platform_admin'
 * | 'platform_seller'). Mesma tabela `user` do Better Auth que os inquilinos
 * usam — o filtro por papel de plataforma é o que isola "quem é Annetec" de
 * "quem é membro de algum inquilino" (que fica com role 'user', o default).
 *
 * Conta `platform_seller` (vendedor) sempre tem perfil de vendedor
 * (`platform_sellers`, código de indicação): criado junto da conta ou quando
 * o papel passa a ser de vendedor.
 */
const PLATFORM_ROLES = platformRole.options

/** Perfil de vendedor criado junto da conta `platform_seller`. */
export interface SellerProfileOptions {
  referralCode?: string | null
  monthlyGoal?: number | null
  createdByUserId?: string | null
}

export interface PlatformUserSessionDeps {
  /** Apaga todas as sessões da conta (inclusive impersonações abertas por ela). Devolve quantas. */
  revokeAllSessions: (userId: string) => Promise<number>
}

export const platformUserSessionsDb: PlatformUserSessionDeps = {
  revokeAllSessions: async userId => {
    const removed = await db
      .delete(session)
      .where(or(eq(session.userId, userId), eq(session.impersonatedBy, userId)))
      .returning({ id: session.id })
    return removed.length
  },
}

export const platformUsersService = {
  async list(params: { page: number; perPage: number; role?: PlatformRole; search?: string }) {
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
  async create(input: CreatePlatformUserInput, seller: SellerProfileOptions = {}): Promise<PlatformUser> {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()))
      .limit(1)
    if (existing) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, 'Já existe uma conta com este e-mail')
    }
    // Código pedido já ocupado: recusa ANTES de criar a conta (sem conta órfã).
    if (input.role === 'platform_seller' && seller.referralCode && (await referralCodeTaken(seller.referralCode))) {
      throw AppError.conflict('Este código de indicação já é de outro vendedor')
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
    if (input.role === 'platform_seller') {
      await ensureSellerProfile({
        userId: row.id,
        name: row.name,
        referralCode: seller.referralCode ?? null,
        monthlyGoal: seller.monthlyGoal ?? null,
        createdByUserId: seller.createdByUserId ?? null,
      })
    }
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
  async update(
    id: string,
    input: UpdatePlatformUserInput,
    actorId?: string,
    deps: PlatformUserSessionDeps = platformUserSessionsDb,
  ): Promise<PlatformUser> {
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

    // Desativou ou trocou o papel: as sessões abertas caem na hora — senão a
    // conta desligada (ou o superadmin rebaixado) seguiria com o acesso antigo
    // até a sessão expirar (30 dias).
    const desativou = input.active === false && alvo.active
    const trocouPapel = input.role !== undefined && input.role !== alvo.role
    // Virou vendedor: ganha o perfil (código gerado do nome) se ainda não tinha.
    if (trocouPapel && input.role === 'platform_seller') {
      await ensureSellerProfile({ userId: id, name: input.name ?? alvo.name, createdByUserId: actorId ?? null })
    }
    if (desativou || trocouPapel) {
      const revogadas = await deps.revokeAllSessions(id)
      logger.info({ userId: id, desativou, trocouPapel, sessoesRevogadas: revogadas }, 'Sessões da conta de plataforma revogadas')
    }

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
