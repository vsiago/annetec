import { describe, expect, it, vi } from 'vitest'

/**
 * Desligamento (SIGTERM) no meio da rodada de cobrança: a rodada não começa
 * item novo — o cartão que já foi ao gateway termina e grava, os seguintes
 * ficam para o próximo processo (em vez de seguir até o SIGKILL, que pode cair
 * entre a resposta do gateway e a gravação). Clube e plataforma; banco falso.
 */

const state = vi.hoisted(() => ({
  clubCards: [] as Record<string, unknown>[],
  platformCards: [] as Record<string, unknown>[],
  clubSubmitted: [] as string[],
  platformSubmitted: [] as string[],
  stopDuringClub: null as null | (() => Promise<boolean>),
  stopDuringPlatform: null as null | (() => Promise<boolean>),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }
  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
            Promise.resolve(resolve(ops)).then(onFulfilled, onRejected)
        }
        return (...args: unknown[]) => {
          ops.push({ name: String(prop), args })
          return proxy
        }
      },
    })
    return proxy
  }
  const from = (ops: Op[]) => ops.find(op => op.name === 'from')?.args[0]
  const db: Record<string, unknown> = {
    select: (fields?: Record<string, unknown>) =>
      chain(ops => {
        // Só a consulta do passo "cartão" (`select({ charge })`) devolve linhas.
        if (!fields || !('charge' in fields) || 'sub' in fields) return []
        if (from(ops) === schema.clubCharges) return state.clubCards.map(charge => ({ charge }))
        if (from(ops) === schema.platformCharges) return state.platformCards.map(charge => ({ charge }))
        return []
      }),
    insert: () => chain(() => []),
    update: () => chain(() => []),
    delete: () => chain(() => []),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return { db, sql: { end: async () => undefined } }
})

vi.mock('@/modules/club-billing/charges.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/club-billing/charges.service')>()),
  withChargeLock: async (_id: string, work: () => Promise<unknown>) => work(),
  submitChargeToGateway: async (id: string) => {
    state.clubSubmitted.push(id)
    // SIGTERM chega enquanto o 1º cartão está no gateway.
    if (state.stopDuringClub) await state.stopDuringClub()
    return { id, status: 'paid' }
  },
}))

vi.mock('@/modules/platform-billing/charges.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-billing/charges.service')>()),
  withPlatformChargeLock: async (_id: string, work: () => Promise<unknown>) => work(),
  submitPlatformChargeToGateway: async (id: string) => {
    state.platformSubmitted.push(id)
    if (state.stopDuringPlatform) await state.stopDuringPlatform()
    return { id, status: 'paid' }
  },
}))

const club = await import('@/modules/club-billing/automation.service')
const platform = await import('@/modules/platform-billing/automation.service')

const NOW = new Date('2026-10-20T15:00:00Z')

function cardCharge(id: string) {
  return {
    id,
    method: 'credit_card',
    status: 'pending',
    dueDate: '2026-10-10',
    attempts: 0,
    lastAttemptAt: null,
    gatewayChargeId: null,
  }
}

describe('automação: SIGTERM no meio do passo do cartão', () => {
  it('clube: o cartão em curso termina; os seguintes não vão ao gateway', async () => {
    state.clubCards = [cardCharge('c-1'), cardCharge('c-2'), cardCharge('c-3')]
    state.stopDuringClub = () => club.stopBillingAutomation(0)
    const report = await club.runForTenant('org-1', NOW)
    expect(state.clubSubmitted).toEqual(['c-1'])
    expect(report.cardCharged).toBe(1)
  })

  it('plataforma: o cartão em curso termina; os seguintes não vão ao gateway', async () => {
    state.platformCards = [cardCharge('p-1'), cardCharge('p-2')]
    let stopped: Promise<boolean> | null = null
    // A plataforma espera a rodada em curso: não dá para aguardar aqui dentro (seria a própria rodada).
    state.stopDuringPlatform = async () => {
      stopped ??= platform.stopPlatformBillingAutomation(5_000)
      return true
    }
    const report = await platform.runPlatformAutomation(NOW)
    expect(state.platformSubmitted).toEqual(['p-1'])
    expect(report.cardCharged).toBe(1)
    expect(await stopped).toBe(true)
  })
})
