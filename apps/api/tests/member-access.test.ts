import { describe, expect, it, vi } from 'vitest'
import { clubAccessStatusOf, needsSubscription } from '@/modules/club-billing/access.service'
import {
  admitLogin,
  cutMemberAccess,
  loginAccessDecision,
  MEMBER_REMOVED_REASON,
  type CuttableSubscription,
  type MemberAccessDeps,
  type MemberAccessRow,
} from '@/modules/users/member-access'

/**
 * Regras do vínculo com o clube (`member.access_status`) sem banco: a decisão
 * de login, a reativação do associado que volta e o corte de acesso
 * (excluir/bloquear) com gateway falso.
 */

const ORG = 'org-mapcard2'
const USER = 'u-associado'

interface FakeCharge {
  id: string
  subscriptionId: string
  status: 'pending' | 'paid' | 'canceled'
  gatewayChargeId: string | null
}

function fakeDeps(initial: MemberAccessRow | null, options: { otherMemberships?: number; sessions?: number } = {}) {
  const calls: string[] = []
  const state = {
    row: initial ? { ...initial } : null,
    subscriptions: [
      { id: 'sub-plus', organizationId: ORG, gatewayProvider: 'asaas' as const, status: 'active', cardToken: 'tok-1' },
      { id: 'sub-antiga', organizationId: ORG, gatewayProvider: 'asaas' as const, status: 'canceled', cardToken: null },
    ] as (CuttableSubscription & { status: string; cardToken: string | null })[],
    charges: [
      { id: 'ch-1', subscriptionId: 'sub-plus', status: 'pending', gatewayChargeId: 'pay_123' },
      { id: 'ch-0', subscriptionId: 'sub-plus', status: 'paid', gatewayChargeId: 'pay_100' },
    ] as FakeCharge[],
    /** Gateway falso: ids cancelados no "Asaas". */
    gatewayCanceled: [] as string[],
    sessions: options.sessions ?? 2,
    audits: [] as { action: string; metadata: Record<string, unknown> }[],
    welcomes: 0,
  }

  const deps: MemberAccessDeps = {
    countOtherMemberships: async () => options.otherMemberships ?? 0,
    revokeSessions: vi.fn(async (_userId, scope) => {
      calls.push(`revoke:${scope === 'all' ? 'all' : 'club'}`)
      const n = state.sessions
      state.sessions = 0
      return n
    }),
    find: async () => (state.row ? { ...state.row } : null),
    setStatus: vi.fn(async (_org, _user, status) => {
      calls.push(`status:${status}`)
      if (!state.row || state.row.accessStatus === status) return false
      state.row.accessStatus = status
      return true
    }),
    reopenAsClient: vi.fn(async () => {
      if (!state.row || state.row.accessStatus !== 'removed' || state.row.role !== 'client') return null
      state.row.accessStatus = 'active'
      state.row.onboardingRound += 1
      return state.row.onboardingRound
    }),
    liveSubscriptions: async () =>
      state.subscriptions.filter(sub => sub.status !== 'canceled').map(({ id, organizationId, gatewayProvider }) => ({
        id,
        organizationId,
        gatewayProvider,
      })),
    // Mesmo efeito de `cancelSubscription` do club-billing: cancela as
    // cobranças abertas no gateway e encerra a assinatura.
    cancelSubscription: vi.fn(async (sub, reason) => {
      calls.push(`cancel:${sub.id}:${reason}`)
      const row = state.subscriptions.find(item => item.id === sub.id)!
      if (row.status === 'canceled') return false
      for (const charge of state.charges.filter(c => c.subscriptionId === sub.id && c.status === 'pending')) {
        if (charge.gatewayChargeId) state.gatewayCanceled.push(charge.gatewayChargeId)
        charge.status = 'canceled'
      }
      row.status = 'canceled'
      return true
    }),
    forgetCard: vi.fn(async subscriptionId => {
      calls.push(`forget:${subscriptionId}`)
      state.subscriptions.find(item => item.id === subscriptionId)!.cardToken = null
    }),
    audit: vi.fn(async entry => {
      state.audits.push({ action: entry.action, metadata: entry.metadata })
    }),
    welcome: vi.fn(() => {
      state.welcomes += 1
    }),
  }
  return { deps, state, calls }
}

describe('loginAccessDecision', () => {
  it.each([
    ['client', 'active', 'allow'],
    ['admin', 'active', 'allow'],
    ['client', 'removed', 'reactivate'],
    ['client', 'blocked', 'refuse'],
    ['seller', 'removed', 'refuse'],
    ['admin', 'removed', 'refuse'],
    ['admin', 'blocked', 'refuse'],
  ] as const)('%s + %s → %s', (role, accessStatus, expected) => {
    expect(loginAccessDecision({ role, accessStatus })).toBe(expected)
  })
})

describe('admitLogin', () => {
  it('vínculo ativo entra sem efeito colateral', async () => {
    const { deps, state } = fakeDeps({ role: 'client', accessStatus: 'active', onboardingRound: 1 })
    await expect(admitLogin(ORG, USER, 'google', deps)).resolves.toBe('allow')
    expect(deps.reopenAsClient).not.toHaveBeenCalled()
    expect(state.audits).toEqual([])
  })

  it('bloqueado é recusado com ACCESS_UNAVAILABLE e a mensagem genérica', async () => {
    const { deps } = fakeDeps({ role: 'client', accessStatus: 'blocked', onboardingRound: 1 })
    await expect(admitLogin(ORG, USER, 'portal', deps)).rejects.toMatchObject({
      code: 'ACCESS_UNAVAILABLE',
      message: 'Acesso indisponível. Fale com o clube.',
      status: 403,
    })
    expect(deps.reopenAsClient).not.toHaveBeenCalled()
  })

  it('equipe desligada é recusada', async () => {
    const { deps } = fakeDeps({ role: 'seller', accessStatus: 'removed', onboardingRound: 1 })
    await expect(admitLogin(ORG, USER, 'password', deps)).rejects.toMatchObject({ code: 'ACCESS_UNAVAILABLE' })
  })

  it('associado excluído volta: reativa, audita client.returned e reinicia a régua (uma vez por retorno)', async () => {
    const { deps, state } = fakeDeps({ role: 'client', accessStatus: 'removed', onboardingRound: 1 })

    await expect(admitLogin(ORG, USER, 'google', deps)).resolves.toBe('reactivated')
    expect(state.row).toMatchObject({ accessStatus: 'active', onboardingRound: 2 })
    expect(state.audits).toEqual([
      { action: 'client.returned', metadata: { via: 'google', rodadaOnboarding: 2, assinaturaExigida: true } },
    ])
    expect(state.welcomes).toBe(1)

    // Segundo login logo depois: já ativo, nada de nova rodada nem e-mail.
    await expect(admitLogin(ORG, USER, 'google', deps)).resolves.toBe('allow')
    expect(state.row?.onboardingRound).toBe(2)
    expect(state.welcomes).toBe(1)
  })

  it('quem voltou só com assinaturas canceladas precisa assinar de novo (needsSubscription)', () => {
    const status = clubAccessStatusOf({ subscriptionStatuses: ['canceled'], hasUpstreamContract: false })
    expect(status).toBe('none')
    expect(needsSubscription(status)).toBe(true)
  })
})

describe('cutMemberAccess (excluir / bloquear)', () => {
  it('excluir: cancela a assinatura viva no gateway, esquece o cartão, marca removed e revoga as sessões (contagem real)', async () => {
    const { deps, state, calls } = fakeDeps({ role: 'client', accessStatus: 'active', onboardingRound: 1 }, { sessions: 3 })

    const result = await cutMemberAccess(ORG, { userId: USER, platformRole: 'user' }, 'removed', {
      actorUserId: 'u-admin',
      reason: MEMBER_REMOVED_REASON,
    }, deps)

    expect(result).toEqual({ canceledSubscriptions: 1, revokedSessions: 3, previousStatus: 'active' })
    expect(state.gatewayCanceled).toEqual(['pay_123'])
    expect(state.subscriptions.find(s => s.id === 'sub-plus')).toMatchObject({ status: 'canceled', cardToken: null })
    expect(state.charges.find(c => c.id === 'ch-0')?.status).toBe('paid')
    expect(state.row?.accessStatus).toBe('removed')
    // Ordem segura: assinatura antes do vínculo, sessões por último; único
    // vínculo da conta → todas as sessões.
    expect(calls).toEqual([
      'cancel:sub-plus:Associado excluído pelo clube',
      'forget:sub-plus',
      'status:removed',
      'revoke:all',
    ])
  })

  it('repetir a exclusão é idempotente (nada vivo para cancelar, zero sessões)', async () => {
    const { deps } = fakeDeps({ role: 'client', accessStatus: 'active', onboardingRound: 1 })
    await cutMemberAccess(ORG, { userId: USER, platformRole: 'user' }, 'removed', { actorUserId: null, reason: 'x' }, deps)
    const again = await cutMemberAccess(ORG, { userId: USER, platformRole: 'user' }, 'removed', { actorUserId: null, reason: 'x' }, deps)
    expect(again).toEqual({ canceledSubscriptions: 0, revokedSessions: 0, previousStatus: 'removed' })
  })

  it('bloquear: mesmo corte, vínculo blocked; com outro clube só derruba as sessões deste', async () => {
    const { deps, state, calls } = fakeDeps(
      { role: 'client', accessStatus: 'removed', onboardingRound: 1 },
      { otherMemberships: 1, sessions: 1 },
    )

    const result = await cutMemberAccess(ORG, { userId: USER, platformRole: 'user' }, 'blocked', {
      actorUserId: 'u-admin',
      reason: 'Associado bloqueado pelo clube',
    }, deps)

    expect(result).toEqual({ canceledSubscriptions: 1, revokedSessions: 1, previousStatus: 'removed' })
    expect(state.row?.accessStatus).toBe('blocked')
    expect(calls.at(-1)).toBe('revoke:club')
  })

  it('vínculo inexistente → 404', async () => {
    const { deps } = fakeDeps(null)
    await expect(
      cutMemberAccess(ORG, { userId: USER, platformRole: 'user' }, 'removed', { actorUserId: null, reason: 'x' }, deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
