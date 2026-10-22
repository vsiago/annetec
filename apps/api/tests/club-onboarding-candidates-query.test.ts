import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

/**
 * Regressão: `listOnboardingCandidates` passava um `Date` dentro de sql cru
 * (sem encoder de coluna), que o postgres.js não serializa e derrubava a régua
 * a cada rodada. Captura o WHERE e garante que nenhum parâmetro é Date.
 */
const captured: { where?: unknown } = {}

vi.mock('@/db/client', () => {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = (condition: unknown) => {
    captured.where = condition
    return Promise.resolve([])
  }
  return { db: chain }
})

describe('listOnboardingCandidates (consulta)', () => {
  it('não envia Date cru como parâmetro SQL', async () => {
    const { listOnboardingCandidates } = await import('@/modules/club-billing/onboarding.service')
    await listOnboardingCandidates('org-1', new Date('2026-10-09T12:00:00Z'))
    const built = new PgDialect().sqlToQuery(captured.where as never)
    expect(built.params.some(param => param instanceof Date)).toBe(false)
    expect(built.params.some(param => typeof param === 'string' && param.endsWith('Z') && param.includes('T'))).toBe(true)
  })
})
