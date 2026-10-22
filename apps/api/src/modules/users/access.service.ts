import type { EmailStatus, EmailTemplate } from '@annetec/contracts'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { env, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { account, member, organization, session, tenantProfiles, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { sendEmail, type SendEmailInput } from '@/lib/email'
import { parseAddress } from '@/lib/email/providers'
import type { ClubEmailTemplate } from '@/lib/email/templates'
import { logger } from '@/lib/logger'

/**
 * Acesso de quem o ADMIN DO CLUBE cadastra (admin/vendedor): senha provisória
 * gerada AQUI, no servidor, e entregue só por e-mail ao próprio usuário — com
 * a marca do clube (white label, nunca a da plataforma). A tela de quem
 * cadastrou nunca vê nem escolhe a senha.
 *
 * O associado (`client`) não recebe senha: ele entra pelo portal com CPF +
 * e-mail (ou Google). A conta dele nasce com uma senha aleatória que nunca
 * sai do servidor — na prática, "sem senha".
 */

export const TENANT_ROLE_LABELS: Record<'admin' | 'seller' | 'client', string> = {
  admin: 'Administrador',
  seller: 'Vendedor',
  client: 'Associado',
}

/** Senha provisória forte: 16 caracteres sem ambíguos (~92 bits), sem viés de módulo. */
export function generateProvisionalPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  // Maior múltiplo do alfabeto que cabe num byte: bytes acima dele são descartados.
  const limit = 256 - (256 % alphabet.length)
  const out: string[] = []
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= limit) continue
      out.push(alphabet[byte % alphabet.length]!)
      if (out.length === length) break
    }
  }
  return out.join('')
}

export interface ClubBrand {
  name: string
  slug: string
  primaryColor: string | null
  logoUrl: string | null
}

export async function loadClubBrand(tenantId: string): Promise<ClubBrand | null> {
  const [row] = await db
    .select({ name: organization.name, slug: organization.slug, logo: organization.logo, branding: tenantProfiles.branding })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, tenantId))
    .limit(1)
  if (!row) return null
  return {
    name: row.name,
    slug: row.slug,
    primaryColor: row.branding?.primaryColor ?? null,
    logoUrl: row.branding?.logoUrl ?? row.logo ?? null,
  }
}

/** Monta o envio de um e-mail de acesso com a marca do clube. Puro. */
export function buildStaffAccessEmail(params: {
  template: Extract<ClubEmailTemplate, 'club_staff_invite' | 'club_staff_password_reset'>
  tenantId: string
  club: ClubBrand | null
  to: { userId: string; email: string; name: string }
  role: 'admin' | 'seller' | 'client'
  password: string | null
  senderEmail: string
  baseUrl: string
}): SendEmailInput {
  const { club, to, password } = params
  return {
    // Chave fora do enum da plataforma (ver `CLUB_EMAIL_TEMPLATES`); a coluna é texto.
    template: params.template as unknown as EmailTemplate,
    to: { email: to.email, name: to.name },
    data: {
      clubName: club?.name ?? 'Seu clube',
      brandColor: club?.primaryColor ?? null,
      logoUrl: club?.logoUrl ?? null,
      senderEmail: params.senderEmail,
      holderName: to.name,
      roleLabel: TENANT_ROLE_LABELS[params.role],
      loginUrl: club ? `${params.baseUrl}/${club.slug}/login` : null,
      loginEmail: to.email,
      password,
    },
    // Senha nunca em claro na caixa de saída (lacrada no modo outbox, `••••••` com provedor).
    secrets: password ? [password] : [],
    organizationId: params.tenantId,
    relatedType: 'tenant_user',
    relatedId: to.userId,
  }
}

type SendResult = { id: string | null; status: EmailStatus }

/** Convite de acesso para admin/vendedor recém-cadastrado. Nunca lança. */
export async function sendStaffInvite(params: {
  tenantId: string
  userId: string
  email: string
  name: string
  role: 'admin' | 'seller'
  /** `null` = conta já existia (a pessoa usa a senha que já tem). */
  password: string | null
}): Promise<SendResult> {
  try {
    const club = await loadClubBrand(params.tenantId)
    return await sendEmail(
      buildStaffAccessEmail({
        template: 'club_staff_invite',
        tenantId: params.tenantId,
        club,
        to: { userId: params.userId, email: params.email, name: params.name },
        role: params.role,
        password: params.password,
        senderEmail: parseAddress(env.EMAIL_FROM).email,
        baseUrl: webBaseUrl,
      }),
    )
  } catch (error) {
    logger.error({ err: error, tenantId: params.tenantId, userId: params.userId }, 'Falha ao enviar convite de acesso')
    return { id: null, status: 'failed' }
  }
}

// ---------------------------------------------------------------------------
// Redefinição de senha pelo admin do clube
// ---------------------------------------------------------------------------

export interface ResetTarget {
  userId: string
  email: string
  name: string
  /** `user.role`: 'user' para todo mundo que não é da equipe da plataforma. */
  platformRole: string
  tenantRole: 'admin' | 'seller' | 'client'
  active: boolean
}

export interface PasswordResetDeps {
  /** Vínculo do usuário COM ESTE clube; `null` se ele não é membro daqui. */
  findTarget: (tenantId: string, userId: string) => Promise<ResetTarget | null>
  setPassword: (userId: string, password: string) => Promise<void>
  revokeSessions: (userId: string) => Promise<void>
  loadClub: (tenantId: string) => Promise<ClubBrand | null>
  send: (input: SendEmailInput) => Promise<SendResult>
  generatePassword: () => string
  senderEmail: () => string
  baseUrl: string
}

const defaultResetDeps: PasswordResetDeps = {
  findTarget: async (tenantId, userId) => {
    const [row] = await db
      .select({
        userId: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.role,
        tenantRole: member.role,
        active: member.active,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
      .limit(1)
    return row ? { ...row, tenantRole: row.tenantRole as ResetTarget['tenantRole'] } : null
  },
  setPassword: async (userId, password) => {
    const hash = await hashPassword(password)
    const updated = await db
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .returning({ id: account.id })
    if (updated.length === 0) {
      // Conta sem login por senha (ex.: só Google): ganha uma credencial agora.
      await db.insert(account).values({
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: 'credential',
        issuer: 'local:credential',
        password: hash,
      })
    }
  },
  revokeSessions: async userId => {
    await db.delete(session).where(eq(session.userId, userId))
  },
  loadClub: loadClubBrand,
  send: sendEmail,
  generatePassword: () => generateProvisionalPassword(),
  senderEmail: () => parseAddress(env.EMAIL_FROM).email,
  baseUrl: webBaseUrl,
}

/**
 * Gera uma senha provisória para um usuário DESTE clube e a envia por e-mail
 * (marca do clube). A senha não volta na resposta — quem redefiniu não a vê.
 *
 * Recusas:
 *  - usuário sem vínculo com o clube (de outro clube, ou id chutado) → 404,
 *    sem dizer se a conta existe em outro lugar;
 *  - conta da equipe da plataforma (`user.role` ≠ 'user') → 403: o clube não
 *    mexe em credencial de quem administra a plataforma;
 *  - vínculo desativado neste clube → regra de negócio (reative antes).
 *
 * As sessões abertas do usuário são encerradas (a senha antiga pode ter
 * vazado), exceto quando o admin redefine a própria senha.
 */
export async function resetTenantUserPassword(
  tenantId: string,
  userId: string,
  actorUserId: string | null,
  overrides: Partial<PasswordResetDeps> = {},
): Promise<{ email: string; emailStatus: EmailStatus; role: ResetTarget['tenantRole'] }> {
  const deps = { ...defaultResetDeps, ...overrides }
  const target = await deps.findTarget(tenantId, userId)
  if (!target) throw AppError.notFound('Usuário deste clube')
  if (target.platformRole !== 'user') {
    throw AppError.forbidden('Conta da equipe da plataforma: a senha não pode ser redefinida pelo clube')
  }
  if (!target.active) {
    throw AppError.businessRule('Usuário desativado neste clube. Reative o acesso antes de redefinir a senha.')
  }

  const password = deps.generatePassword()
  await deps.setPassword(target.userId, password)
  if (actorUserId !== target.userId) await deps.revokeSessions(target.userId)

  const club = await deps.loadClub(tenantId).catch(() => null)
  const result = await deps.send(
    buildStaffAccessEmail({
      template: 'club_staff_password_reset',
      tenantId,
      club,
      to: { userId: target.userId, email: target.email, name: target.name },
      role: target.tenantRole,
      password,
      senderEmail: deps.senderEmail(),
      baseUrl: deps.baseUrl,
    }),
  )

  logger.info({ tenantId, userId: target.userId, emailStatus: result.status }, 'Senha redefinida pelo admin do clube')
  return { email: target.email, emailStatus: result.status, role: target.tenantRole }
}
