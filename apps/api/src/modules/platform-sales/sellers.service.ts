import type { CreateSellerInput, PlatformSeller, UpdateSellerInput } from '@annetec/contracts'
import { asc, eq } from 'drizzle-orm'
import { webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { platformSellers, user, type PlatformSellerRow } from '@/db/schema'
import { AppError } from '@/http/errors'
import { platformUsersService } from '@/modules/platform-users/service'
import { referralCodeTaken } from './seller-profile'

/**
 * Vendedores ANNETEC: perfil (código de indicação, ativo, meta) sobre a conta
 * `platform_seller`. Conta (nome, senha, desligar o acesso) é gerida em
 * Equipe (`/platform/users`); aqui, o perfil comercial. Escrita só superadmin.
 */

export function referralUrlOf(code: string): string {
  return `${webBaseUrl}/contratar?ref=${encodeURIComponent(code)}`
}

type UserPart = Pick<typeof user.$inferSelect, 'name' | 'email' | 'phone' | 'banned'>

export function toPlatformSeller(profile: PlatformSellerRow, account: UserPart): PlatformSeller {
  return {
    userId: profile.userId,
    name: account.name,
    email: account.email,
    phone: account.phone ?? null,
    referralCode: profile.referralCode,
    active: profile.active,
    accountActive: account.banned !== true,
    monthlyGoal: profile.monthlyGoal ?? null,
    referralUrl: referralUrlOf(profile.referralCode),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  }
}

function sellerQuery() {
  return db
    .select({ profile: platformSellers, name: user.name, email: user.email, phone: user.phone, banned: user.banned, role: user.role })
    .from(platformSellers)
    .innerJoin(user, eq(user.id, platformSellers.userId))
}

/** Perfis cuja conta AINDA é `platform_seller` (promovido a equipe sai da lista). */
export async function listSellers(): Promise<PlatformSeller[]> {
  const rows = await sellerQuery().where(eq(user.role, 'platform_seller')).orderBy(asc(user.name))
  return rows.map(row => toPlatformSeller(row.profile, row))
}

export async function findSellerRow(userId: string) {
  const [row] = await sellerQuery().where(eq(platformSellers.userId, userId)).limit(1)
  if (!row || row.role !== 'platform_seller') return null
  return row
}

export async function getSeller(userId: string): Promise<PlatformSeller> {
  const row = await findSellerRow(userId)
  if (!row) throw AppError.notFound('Vendedor')
  return toPlatformSeller(row.profile, row)
}

/**
 * Perfil do vendedor da SESSÃO. `forWrite`: perfil inativo só consulta
 * (prospects novos, links e pedidos de desconto ficam bloqueados).
 */
export async function requireSellerProfile(userId: string, options: { forWrite?: boolean } = {}): Promise<PlatformSeller> {
  const row = await findSellerRow(userId)
  if (!row) throw AppError.forbidden('Conta sem perfil de vendedor: peça ao superadmin para cadastrar o seu perfil')
  if (options.forWrite && !row.profile.active) {
    throw AppError.forbidden('Seu cadastro de vendedor está inativo: você pode consultar o histórico, mas não registrar novas vendas')
  }
  return toPlatformSeller(row.profile, row)
}

export async function createSeller(input: CreateSellerInput, actorUserId: string): Promise<PlatformSeller> {
  const account = await platformUsersService.create(
    { name: input.name, email: input.email, phone: input.phone, password: input.password, role: 'platform_seller' },
    { referralCode: input.referralCode ?? null, monthlyGoal: input.monthlyGoal ?? null, createdByUserId: actorUserId },
  )
  return getSeller(account.id)
}

export async function updateSeller(userId: string, input: UpdateSellerInput): Promise<{ before: PlatformSeller; after: PlatformSeller }> {
  const before = await getSeller(userId)
  if (input.referralCode && input.referralCode !== before.referralCode && (await referralCodeTaken(input.referralCode, userId))) {
    throw AppError.conflict('Este código de indicação já é de outro vendedor')
  }
  await db
    .update(platformSellers)
    .set({
      ...(input.referralCode !== undefined ? { referralCode: input.referralCode } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.monthlyGoal !== undefined ? { monthlyGoal: input.monthlyGoal } : {}),
      updatedAt: new Date(),
    })
    .where(eq(platformSellers.userId, userId))
  return { before, after: await getSeller(userId) }
}
