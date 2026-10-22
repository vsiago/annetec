import type {
  AddTenantResponsibleInput,
  EmailStatus,
  SetTenantMemberAccessResult,
  TenantMemberList,
  TenantMemberSummary,
} from '@annetec/contracts'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubSubscriptions, member, organization, sales, session, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { generateProvisionalPassword, sendStaffInvite } from '@/modules/users/access.service'
import {
  assertKeepsResponsible,
  decideRemoval,
  isCountedResponsible,
  membershipRulesDb,
  revokeClubSessions,
  type MembershipRulesDeps,
  type MembershipTarget,
  type ProtectedHistory,
} from '@/modules/users/membership-rules'
import { ultimaSessaoPorUsuario, ultimoAcesso, ultimoLoginPorUsuario } from '@/modules/users/service'

/**
 * Gestão dos acessos de um clube pela equipe da plataforma — a aba Acessos
 * de `/admin/inquilinos/:id`: quem são os responsáveis (admins), adicionar
 * um novo, desativar/reativar e remover qualquer conta do clube.
 *
 * As regras (último responsável, sessões, quando a conta pode ser excluída)
 * moram em `users/membership-rules.ts` e valem igual para o admin do clube.
 * Aqui só a orquestração; tudo que toca o banco passa por `MembersDeps` para
 * os testes rodarem sem banco.
 */

export interface MembersDeps extends MembershipRulesDeps {
  tenantExists: (tenantId: string) => Promise<boolean>
  findMember: (tenantId: string, userId: string) => Promise<MembershipTarget | null>
  findUserByEmail: (email: string) => Promise<{ id: string; name: string; email: string; platformRole: string } | null>
  createUser: (email: string, name: string, password: string) => Promise<{ id: string }>
  addAdminMembership: (tenantId: string, userId: string) => Promise<void>
  setMembership: (tenantId: string, userId: string, patch: { role?: 'admin'; active?: boolean }) => Promise<void>
  deleteMembership: (tenantId: string, userId: string) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  loadHistory: (tenantId: string, userId: string) => Promise<ProtectedHistory>
  sendInvite: (params: {
    tenantId: string
    userId: string
    email: string
    name: string
    password: string | null
  }) => Promise<{ status: EmailStatus }>
  generatePassword: () => string
}

export const membersDb: MembersDeps = {
  ...membershipRulesDb,
  tenantExists: async tenantId => {
    const [row] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, tenantId)).limit(1)
    return Boolean(row)
  },
  findMember: async (tenantId, userId) => {
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
    return row ? { ...row, tenantRole: row.tenantRole as MembershipTarget['tenantRole'] } : null
  },
  findUserByEmail: async email => {
    const [row] = await db
      .select({ id: user.id, name: user.name, email: user.email, platformRole: user.role })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    return row ?? null
  },
  createUser: async (email, name, password) => {
    const signUp = await auth.api.signUpEmail({ body: { email, name, password } })
    // O cadastro já abre uma sessão (auto sign-in) cujo token ninguém recebe
    // — chamada server-to-server. Não deixa sessão órfã para trás.
    await db.delete(session).where(eq(session.userId, signUp.user.id))
    return { id: signUp.user.id }
  },
  addAdminMembership: async (tenantId, userId) => {
    await auth.api.addMember({ body: { userId, organizationId: tenantId, role: 'admin' } })
  },
  setMembership: async (tenantId, userId, patch) => {
    // `active` é coluna gerada: o que se grava é `access_status`. Desativar
    // pela plataforma = `removed` (associado pode voltar pelo site; equipe
    // só reativada); reativar limpa também um bloqueio.
    await db
      .update(member)
      .set({
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.active !== undefined
          ? { accessStatus: patch.active ? ('active' as const) : ('removed' as const), accessChangedAt: new Date() }
          : {}),
      })
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
  },
  deleteMembership: async (tenantId, userId) => {
    await db.delete(member).where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
  },
  deleteUser: async userId => {
    // Cascata do banco: session, account, member, perfis. `sales.seller_id`
    // (RESTRICT) e assinaturas já foram conferidos por `decideRemoval`.
    await db.delete(user).where(eq(user.id, userId))
  },
  sendInvite: params => sendStaffInvite({ ...params, role: 'admin' }),
  generatePassword: () => generateProvisionalPassword(),
}

export type RemoveOutcome =
  | { outcome: 'removed'; userId: string; email: string; accountDeleted: boolean; revokedSessions: number }
  | { outcome: 'blocked'; userId: string; email: string; reason: string; revokedSessions: number }

export const tenantMembersService = {
  /**
   * Contas do clube, com último acesso e o que "Remover" faria com cada uma.
   * `activeAdmins` conta só contas comuns — é o número que a regra do último
   * responsável protege.
   */
  async list(tenantId: string): Promise<TenantMemberList> {
    const login = ultimoLoginPorUsuario(tenantId)
    const sessao = ultimaSessaoPorUsuario(tenantId)

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        platformRole: user.role,
        role: member.role,
        active: member.active,
        createdAt: member.createdAt,
        loginEm: login.at,
        loginUserAgent: login.userAgent,
        sessaoEm: sessao.at,
        sessaoUserAgent: sessao.userAgent,
        otherMemberships: sql<number>`(select count(*)::int from member m2 where m2.user_id = ${member.userId} and m2.organization_id <> ${tenantId})`,
        salesHere: sql<number>`(select count(*)::int from ${sales} s where s.seller_id = ${member.userId} and s.organization_id = ${tenantId})`,
        salesAnywhere: sql<number>`(select count(*)::int from ${sales} s where s.seller_id = ${member.userId})`,
        clubSubscriptions: sql<number>`(select count(*)::int from ${clubSubscriptions} cs where cs.user_id = ${member.userId})`,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(login, eq(login.userId, member.userId))
      .leftJoin(sessao, eq(sessao.userId, member.userId))
      .where(eq(member.organizationId, tenantId))
      .orderBy(asc(member.createdAt))

    const items: TenantMemberSummary[] = rows.map(row => {
      const otherMemberships = Number(row.otherMemberships ?? 0)
      const decision = decideRemoval({
        platformRole: row.platformRole,
        otherMemberships,
        history: {
          salesHere: Number(row.salesHere ?? 0),
          salesAnywhere: Number(row.salesAnywhere ?? 0),
          clubSubscriptions: Number(row.clubSubscriptions ?? 0),
        },
      })
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? null,
        role: row.role as TenantMemberSummary['role'],
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        lastLoginAt: ultimoAcesso(row)?.at.toISOString() ?? null,
        platformStaff: row.platformRole !== 'user',
        otherMemberships,
        removal: decision.removal,
        removalBlockedReason: decision.reason,
      }
    })

    const activeAdmins = rows.filter(row =>
      isCountedResponsible({
        tenantRole: row.role as MembershipTarget['tenantRole'],
        active: row.active,
        platformRole: row.platformRole,
      }),
    ).length

    return { items, activeAdmins }
  },

  async getSummary(tenantId: string, userId: string): Promise<TenantMemberSummary> {
    const { items } = await this.list(tenantId)
    const found = items.find(item => item.id === userId)
    if (!found) throw AppError.notFound('Usuário deste inquilino')
    return found
  },

  /**
   * Adiciona um responsável (admin) ao clube.
   *  - e-mail novo: cria a conta com senha provisória gerada aqui, que só
   *    sai no convite `club_staff_invite` (marca do clube);
   *  - conta comum já existente: reaproveita, o convite vai sem senha;
   *  - já é membro deste clube com outro papel ou desativado: vira admin
   *    ativo; já é admin ativo: 409;
   *  - conta da equipe da plataforma: 403 (não mistura os escopos).
   */
  async addResponsible(
    tenantId: string,
    input: AddTenantResponsibleInput,
    deps: MembersDeps = membersDb,
  ): Promise<{ userId: string; email: string; accountCreated: boolean; emailStatus: EmailStatus; previousRole: string | null }> {
    if (!(await deps.tenantExists(tenantId))) throw AppError.notFound('Inquilino')
    const email = input.email.trim().toLowerCase()

    const existing = await deps.findUserByEmail(email)
    if (existing && existing.platformRole !== 'user') {
      throw AppError.forbidden(
        'Este e-mail pertence a uma conta da equipe da plataforma e não pode ser responsável por um clube',
      )
    }

    let userId: string
    let password: string | null = null
    let previousRole: string | null = null
    let name = input.name

    if (existing) {
      userId = existing.id
      name = existing.name || input.name
      const membership = await deps.findMember(tenantId, userId)
      if (membership) {
        if (membership.tenantRole === 'admin' && membership.active) {
          throw AppError.conflict('Esta pessoa já é responsável ativa deste clube')
        }
        previousRole = `${membership.tenantRole}${membership.active ? '' : ':inativo'}`
        await deps.setMembership(tenantId, userId, { role: 'admin', active: true })
      } else {
        await deps.addAdminMembership(tenantId, userId)
      }
    } else {
      password = deps.generatePassword()
      const created = await deps.createUser(email, input.name, password)
      userId = created.id
      await deps.addAdminMembership(tenantId, userId)
    }

    const sent = await deps.sendInvite({ tenantId, userId, email, name, password })
    logger.info({ tenantId, userId, contaNova: password !== null }, 'Responsável adicionado pela plataforma')
    return { userId, email, accountCreated: password !== null, emailStatus: sent.status, previousRole }
  },

  /** Ativa/desativa o vínculo. Desativar derruba as sessões ligadas ao clube. */
  async setAccess(
    tenantId: string,
    userId: string,
    active: boolean,
    actorUserId: string | null,
    deps: MembersDeps = membersDb,
  ): Promise<SetTenantMemberAccessResult & { email: string; role: string }> {
    const target = await deps.findMember(tenantId, userId)
    if (!target) throw AppError.notFound('Usuário deste inquilino')

    if (active) {
      if (!target.active) await deps.setMembership(tenantId, userId, { active: true })
      return { userId, active: true, revokedSessions: 0, email: target.email, role: target.tenantRole }
    }

    await assertKeepsResponsible(deps, tenantId, target, actorUserId)
    if (target.active) await deps.setMembership(tenantId, userId, { active: false })
    const revokedSessions = await revokeClubSessions(deps, tenantId, target)
    return { userId, active: false, revokedSessions, email: target.email, role: target.tenantRole }
  },

  /**
   * Remove a pessoa do clube. Se era o único vínculo de uma conta comum, a
   * conta inteira é excluída (cascata). Quando há histórico que a remoção
   * quebraria (ver `decideRemoval`), só desativa o acesso e devolve
   * `outcome: 'blocked'` com o motivo — o controller audita e responde 422.
   */
  async remove(
    tenantId: string,
    userId: string,
    actorUserId: string | null,
    deps: MembersDeps = membersDb,
  ): Promise<RemoveOutcome> {
    const target = await deps.findMember(tenantId, userId)
    if (!target) throw AppError.notFound('Usuário deste inquilino')

    await assertKeepsResponsible(deps, tenantId, target, actorUserId)

    const otherMemberships = await deps.countOtherMemberships(tenantId, userId)
    const history = await deps.loadHistory(tenantId, userId)
    const decision = decideRemoval({ platformRole: target.platformRole, otherMemberships, history })

    if (decision.removal === 'blocked') {
      if (target.active) await deps.setMembership(tenantId, userId, { active: false })
      const revokedSessions = await revokeClubSessions(deps, tenantId, target)
      return { outcome: 'blocked', userId, email: target.email, reason: decision.reason, revokedSessions }
    }

    if (decision.removal === 'delete_account') {
      // Conta some inteira: todas as sessões vão junto (contadas antes).
      const revokedSessions = await deps.revokeSessions(userId, 'all')
      await deps.deleteUser(userId)
      return { outcome: 'removed', userId, email: target.email, accountDeleted: true, revokedSessions }
    }

    const revokedSessions = await deps.revokeSessions(userId, { tenantId })
    await deps.deleteMembership(tenantId, userId)
    return { outcome: 'removed', userId, email: target.email, accountDeleted: false, revokedSessions }
  },
}
