import { ERROR_CODES, type ClientPortalLoginInput, type LoginInput, type RegisterInput } from '@annetec/contracts'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { clientProfiles, member, organization, tenantIntegrations, user } from '@/db/schema'
import { logger } from '@/lib/logger'

/**
 * Orquestração fina sobre `auth.api.*`. Nenhuma regra de senha, hash ou
 * cookie mora aqui — isso é o Better Auth.
 *
 * Nenhum login pede o slug do inquilino: o e-mail já é a chave — uma conta
 * Better Auth só tem um e-mail, então a partir dele descobrimos sozinhos se é
 * plataforma, e se for de inquilino, em qual (ou quais) organization a pessoa
 * tem vínculo. `tenantSlug` continua aceito como parâmetro OPCIONAL — dá pra
 * forçar um inquilino específico (uso programático/suporte), mas a tela de
 * login nunca precisa pedir isso.
 *
 * Todo método devolve `{ token, session }`, onde `session` é exatamente o que
 * `auth.api.getSession` devolve — já com `membership` resolvido pelo plugin
 * `customSession` — para o controller nunca precisar remontar nada.
 */
export const authService = {
  async login(input: LoginInput) {
    const result = await auth.api.signInEmail({ body: { email: input.email, password: input.password } })
    const bareSession = await getSessionByToken(result.token)

    // Conta de plataforma: papel já vem no próprio usuário, sem organization
    // nenhuma envolvida — nada mais a resolver.
    if (bareSession.membership.scope === 'platform') {
      return { token: result.token, session: bareSession }
    }

    const organizationId = input.tenantSlug
      ? await resolveOrganizationBySlug(input.tenantSlug)
      : await resolveTenantOrganization(result.user.id, ['admin', 'seller'])

    if (!organizationId) {
      // Mesma mensagem de credenciais inválidas: não revela se a conta existe
      // sem vínculo de admin/vendedor em nenhum lugar.
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos')
    }

    await setActiveOrganization(result.token, organizationId)
    const session = await getSessionByToken(result.token)
    return { token: result.token, session }
  },

  /**
   * Login do portal do associado por CPF + e-mail. Sem tenantSlug, a Digital
   * Saúde é quem responde a pergunta "esse CPF+e-mail existe onde?": se a
   * pessoa já é nossa conhecida, usamos o inquilino do vínculo dela (rápido,
   * sem sair pra rede); senão, tentamos cada inquilino com integração ativa
   * até um responder com um contrato de verdade.
   */
  async loginClientPortal(input: ClientPortalLoginInput) {
    if (input.tenantSlug) {
      const { token, session } = await signInClientPortal(input.tenantSlug, input.cpf, input.email)
      return { token, session }
    }

    const knownSlug = await resolveClientTenantSlug(input.email)
    const candidates = await listEnabledTenantSlugs()
    const orderedSlugs = knownSlug ? [knownSlug, ...candidates.filter(slug => slug !== knownSlug)] : candidates

    for (const slug of orderedSlugs) {
      try {
        return await signInClientPortal(slug, input.cpf, input.email)
      } catch (error) {
        logger.debug({ tenantSlug: slug, err: error }, 'Login do portal não bateu neste inquilino, tentando o próximo')
      }
    }

    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Não encontramos contrato com este CPF e e-mail')
  },

  async register(input: RegisterInput) {
    const organizationId = await resolveOrganizationBySlug(input.tenantSlug)
    if (!organizationId) throw AppError.notFound('Inquilino')

    const signUp = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password },
    })
    if (!signUp.token) {
      throw AppError.businessRule('Não foi possível criar a sessão após o cadastro')
    }

    await auth.api.addMember({
      body: { userId: signUp.user.id, organizationId, role: 'client' },
    })
    await db.insert(clientProfiles).values({
      userId: signUp.user.id,
      organizationId,
      cpf: input.cpf,
    })

    await setActiveOrganization(signUp.token, organizationId)
    const session = await getSessionByToken(signUp.token)
    return { token: signUp.token, session }
  },

  /** Renova a sessão a partir do próprio token — o Better Auth cuida do rolling expiry. */
  async me(token: string) {
    return getSessionByToken(token)
  },

  async logout(token: string): Promise<void> {
    await auth.api.signOut({ headers: bearerHeaders(token) })
  },
}

async function signInClientPortal(tenantSlug: string, cpf: string, email: string) {
  const result = await auth.api.signInClientPortal({ body: { tenantSlug, cpf, email } })
  const session = await getSessionByToken(result.token)
  return { token: result.token, session }
}

/** Todos os slugs de inquilino com a integração Digital Saúde ativa, mais recentes primeiro. */
async function listEnabledTenantSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .innerJoin(tenantIntegrations, eq(tenantIntegrations.organizationId, organization.id))
    .where(eq(tenantIntegrations.enabled, true))
  return rows.map(row => row.slug)
}

/** Se o e-mail já é de um associado conhecido, o slug do inquilino do vínculo dele. */
async function resolveClientTenantSlug(email: string): Promise<string | null> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).limit(1)
  if (!existing) return null

  const [membership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, existing.id), eq(member.role, 'client')))
    .orderBy(desc(member.createdAt))
    .limit(1)
  if (!membership) return null

  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, membership.organizationId))
    .limit(1)
  return org?.slug ?? null
}

/**
 * Em qual organization esta pessoa tem um dos papéis pedidos. Com mais de um
 * vínculo (raro — mesma conta é admin/vendedor em mais de um inquilino),
 * prioriza 'admin' sobre 'seller' e, empatado, o vínculo mais recente.
 */
async function resolveTenantOrganization(userId: string, roles: ('admin' | 'seller')[]): Promise<string | null> {
  const rows = await db
    .select({ organizationId: member.organizationId, role: member.role, createdAt: member.createdAt })
    .from(member)
    .where(and(eq(member.userId, userId), inArray(member.role, roles)))

  if (rows.length === 0) return null

  const rolePriority: Record<string, number> = { admin: 0, seller: 1 }
  rows.sort((a, b) => {
    const byRole = (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9)
    if (byRole !== 0) return byRole
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  return rows[0]!.organizationId
}

async function resolveOrganizationBySlug(tenantSlug: string): Promise<string | null> {
  const [tenant] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, tenantSlug.toLowerCase()))
    .limit(1)
  return tenant?.id ?? null
}

async function setActiveOrganization(token: string, organizationId: string) {
  await auth.api.setActiveOrganization({ headers: bearerHeaders(token), body: { organizationId } })
}

async function getSessionByToken(token: string) {
  const session = await auth.api.getSession({ headers: bearerHeaders(token) })
  if (!session) throw AppError.unauthenticated()
  return session
}

function bearerHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` })
}
