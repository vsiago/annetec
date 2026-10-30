import { referralCodeFromName } from '@annetec/contracts'
import { and, eq, like, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformSellers, user, type PlatformSellerRow } from '@/db/schema'
import { AppError } from '@/http/errors'

/**
 * Perfil de vendedor (folha: só banco e contracts — importado por
 * `platform-users`, pelo script `create-platform-admin` e pela contratação
 * pública sem criar ciclo de import).
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

/** Código livre a partir de `base` (`joao-silva`, `joao-silva-2`, …). */
export async function availableReferralCode(base: string, executor: Executor = db): Promise<string> {
  const rows = await executor
    .select({ code: platformSellers.referralCode })
    .from(platformSellers)
    .where(or(eq(platformSellers.referralCode, base), like(platformSellers.referralCode, `${base}-%`)))
  const taken = new Set(rows.map(row => row.code))
  if (!taken.has(base)) return base
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function referralCodeTaken(code: string, exceptUserId?: string, executor: Executor = db): Promise<boolean> {
  const [row] = await executor
    .select({ userId: platformSellers.userId })
    .from(platformSellers)
    .where(eq(platformSellers.referralCode, code))
    .limit(1)
  return Boolean(row && row.userId !== exceptUserId)
}

/**
 * Garante o perfil da conta `platform_seller` (idempotente). Código informado
 * já ocupado por outro vendedor = 409; ausente = gerado do nome.
 */
export async function ensureSellerProfile(
  input: { userId: string; name: string; referralCode?: string | null; monthlyGoal?: number | null; createdByUserId?: string | null },
  executor: Executor = db,
): Promise<PlatformSellerRow> {
  const [existing] = await executor.select().from(platformSellers).where(eq(platformSellers.userId, input.userId)).limit(1)
  if (existing) return existing
  if (input.referralCode && (await referralCodeTaken(input.referralCode, input.userId, executor))) {
    throw AppError.conflict('Este código de indicação já é de outro vendedor')
  }
  const code = input.referralCode ?? (await availableReferralCode(referralCodeFromName(input.name), executor))
  const [created] = await executor
    .insert(platformSellers)
    .values({
      userId: input.userId,
      referralCode: code,
      monthlyGoal: input.monthlyGoal ?? null,
      createdByUserId: input.createdByUserId ?? null,
    })
    .onConflictDoNothing()
    .returning()
  if (created) return created
  const [row] = await executor.select().from(platformSellers).where(eq(platformSellers.userId, input.userId)).limit(1)
  if (!row) throw AppError.conflict('Não foi possível reservar o código de indicação: tente outro')
  return row
}

export interface ActiveSellerRef {
  userId: string
  name: string
  referralCode: string
}

/**
 * Vendedor que pode receber atribuição agora: perfil ativo, conta
 * `platform_seller` e não desativada. `null` para qualquer outro caso.
 */
export async function findActiveSellerByCode(code: string): Promise<ActiveSellerRef | null> {
  const normalized = code.trim().toLowerCase()
  if (!normalized) return null
  const [row] = await db
    .select({ userId: platformSellers.userId, name: user.name, referralCode: platformSellers.referralCode, banned: user.banned })
    .from(platformSellers)
    .innerJoin(user, eq(user.id, platformSellers.userId))
    .where(and(eq(platformSellers.referralCode, normalized), eq(platformSellers.active, true), eq(user.role, 'platform_seller')))
    .limit(1)
  if (!row || row.banned === true) return null
  return { userId: row.userId, name: row.name, referralCode: row.referralCode }
}

/** Mesmo critério de `findActiveSellerByCode`, pelo id da conta. */
export async function findActiveSellerById(userId: string): Promise<ActiveSellerRef | null> {
  const [row] = await db
    .select({ userId: platformSellers.userId, name: user.name, referralCode: platformSellers.referralCode, banned: user.banned })
    .from(platformSellers)
    .innerJoin(user, eq(user.id, platformSellers.userId))
    .where(and(eq(platformSellers.userId, userId), eq(platformSellers.active, true), eq(user.role, 'platform_seller')))
    .limit(1)
  if (!row || row.banned === true) return null
  return { userId: row.userId, name: row.name, referralCode: row.referralCode }
}
