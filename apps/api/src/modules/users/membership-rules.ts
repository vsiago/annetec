import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubSubscriptions, member, sales, session, user } from '@/db/schema'
import { AppError } from '@/http/errors'

/**
 * Regras de acesso ao clube que valem para QUALQUER caminho que desliga
 * alguém — a aba Acessos da plataforma (`/platform/tenants/:id/usuarios`) e
 * a tela de usuários do próprio admin do clube (`/t/:slug/usuarios`):
 *
 *  - o clube nunca fica sem responsável: o último admin ativo (conta comum,
 *    não da equipe da plataforma) não pode ser desativado, rebaixado nem
 *    removido;
 *  - desligar alguém derruba as sessões dele ligadas ao clube na hora (ou
 *    todas, quando este era o único vínculo da pessoa) — senão o acesso
 *    "desativado" continuaria aberto até a sessão expirar;
 *  - excluir a conta só quando nada depende dela (ver `decideRemoval`).
 *
 * Sem dependência de outros services de propósito: tanto o service de
 * usuários do clube quanto o de membros da plataforma importam daqui.
 */

export const LAST_RESPONSIBLE_MESSAGE = 'O clube precisa de pelo menos um responsável ativo'

export interface MembershipTarget {
  userId: string
  email: string
  name: string
  /** `user.role`: 'user' para quem não é da equipe da plataforma. */
  platformRole: string
  tenantRole: 'admin' | 'seller' | 'client'
  active: boolean
}

/** Histórico que impede (ou tornaria destrutiva) a exclusão da conta. */
export interface ProtectedHistory {
  /** Vendas como vendedor NESTE clube. */
  salesHere: number
  /** Vendas como vendedor em qualquer clube (`sales.seller_id` é RESTRICT). */
  salesAnywhere: number
  /** Assinaturas de clube da pessoa (a exclusão da conta apagaria em cascata). */
  clubSubscriptions: number
}

export interface MembershipRulesDeps {
  /** Admins ativos do clube, contas comuns, sem contar `userId`. */
  countOtherActiveResponsibles: (tenantId: string, userId: string) => Promise<number>
  /** Vínculos da pessoa com OUTROS clubes. */
  countOtherMemberships: (tenantId: string, userId: string) => Promise<number>
  /** Apaga sessões: só as ligadas ao clube, ou todas. Devolve quantas. */
  revokeSessions: (userId: string, scope: { tenantId: string } | 'all') => Promise<number>
}

/** Conta como "responsável" para a regra do último admin. */
export function isCountedResponsible(target: Pick<MembershipTarget, 'tenantRole' | 'active' | 'platformRole'>) {
  return target.tenantRole === 'admin' && target.active && target.platformRole === 'user'
}

/**
 * Lança 422 se tirar `target` do papel de responsável ativo deixaria o clube
 * sem nenhum. Chamar ANTES de desativar, rebaixar ou remover.
 */
export async function assertKeepsResponsible(
  deps: Pick<MembershipRulesDeps, 'countOtherActiveResponsibles'>,
  tenantId: string,
  target: MembershipTarget,
  actorUserId?: string | null,
): Promise<void> {
  if (!isCountedResponsible(target)) return
  const others = await deps.countOtherActiveResponsibles(tenantId, target.userId)
  if (others > 0) return
  throw AppError.businessRule(
    actorUserId && actorUserId === target.userId
      ? `${LAST_RESPONSIBLE_MESSAGE}. Você é o único responsável ativo: adicione outro antes de sair.`
      : `${LAST_RESPONSIBLE_MESSAGE}. Adicione ou reative outro responsável antes.`,
  )
}

/**
 * Encerra as sessões de quem perdeu o acesso ao clube. Se este era o único
 * vínculo de uma conta comum, derruba todas (não sobra lugar legítimo para
 * ela estar logada); senão só as que estão com o clube ativo — a pessoa
 * continua logada nos outros clubes. Conta da equipe da plataforma nunca
 * perde a sessão de plataforma por aqui.
 */
export async function revokeClubSessions(
  deps: Pick<MembershipRulesDeps, 'countOtherMemberships' | 'revokeSessions'>,
  tenantId: string,
  target: Pick<MembershipTarget, 'userId' | 'platformRole'>,
): Promise<number> {
  const others = await deps.countOtherMemberships(tenantId, target.userId)
  const all = target.platformRole === 'user' && others === 0
  return deps.revokeSessions(target.userId, all ? 'all' : { tenantId })
}

export type RemovalDecision =
  | { removal: 'delete_account'; reason: null }
  | { removal: 'remove_membership'; reason: null }
  | { removal: 'blocked'; reason: string }

/**
 * O que "Remover do clube" faria com esta pessoa. Puro — usado na listagem
 * (para a tela explicar antes do clique) e na própria remoção.
 *
 *  - venda como vendedor NESTE clube bloqueia sempre: tirar o vínculo
 *    deixaria vendas e comissões do clube apontando para alguém de fora;
 *  - se a conta seria excluída (único vínculo, conta comum), bloqueia
 *    também qualquer venda como vendedor (`sales.seller_id` é RESTRICT) e
 *    assinatura de clube (cascata apagaria histórico financeiro).
 */
export function decideRemoval(params: {
  platformRole: string
  otherMemberships: number
  history: ProtectedHistory
}): RemovalDecision {
  const { history } = params
  const deletesAccount = params.platformRole === 'user' && params.otherMemberships === 0

  if (history.salesHere > 0) {
    return {
      removal: 'blocked',
      reason: `tem ${history.salesHere} venda(s) registrada(s) como vendedor neste clube`,
    }
  }
  if (deletesAccount && history.salesAnywhere > 0) {
    return {
      removal: 'blocked',
      reason: `tem ${history.salesAnywhere} venda(s) registrada(s) como vendedor e a conta não pode ser excluída`,
    }
  }
  if (deletesAccount && history.clubSubscriptions > 0) {
    return {
      removal: 'blocked',
      reason: 'tem assinatura de clube registrada (histórico financeiro que a exclusão apagaria)',
    }
  }
  return deletesAccount
    ? { removal: 'delete_account', reason: null }
    : { removal: 'remove_membership', reason: null }
}

// ---------------------------------------------------------------------------
// Implementação com banco
// ---------------------------------------------------------------------------

export const membershipRulesDb: MembershipRulesDeps & {
  loadHistory: (tenantId: string, userId: string) => Promise<ProtectedHistory>
} = {
  countOtherActiveResponsibles: async (tenantId, userId) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, tenantId),
          eq(member.role, 'admin'),
          eq(member.active, true),
          eq(user.role, 'user'),
          ne(member.userId, userId),
        ),
      )
    return Number(row?.n ?? 0)
  },

  countOtherMemberships: async (tenantId, userId) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(member)
      .where(and(eq(member.userId, userId), ne(member.organizationId, tenantId)))
    return Number(row?.n ?? 0)
  },

  revokeSessions: async (userId, scope) => {
    const where =
      scope === 'all'
        ? eq(session.userId, userId)
        : and(eq(session.userId, userId), eq(session.activeOrganizationId, scope.tenantId))
    const removed = await db.delete(session).where(where).returning({ id: session.id })
    return removed.length
  },

  loadHistory: async (tenantId, userId) => {
    const [here, anywhere, subs] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(sales)
        .where(and(eq(sales.sellerId, userId), eq(sales.organizationId, tenantId))),
      db.select({ n: sql<number>`count(*)::int` }).from(sales).where(eq(sales.sellerId, userId)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(clubSubscriptions)
        .where(eq(clubSubscriptions.userId, userId)),
    ])
    return {
      salesHere: Number(here[0]?.n ?? 0),
      salesAnywhere: Number(anywhere[0]?.n ?? 0),
      clubSubscriptions: Number(subs[0]?.n ?? 0),
    }
  },
}
