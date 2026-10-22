import { EMAIL_TEMPLATES } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * E-mail da plataforma: os 16 templates renderizam sem lançar; a senha
 * provisória nunca fica em claro no banco (lacrada no modo outbox, mascarada
 * com provedor real); `sendEmail` nunca lança. Banco FALSO (sem conexão).
 */

const state = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  failInsert: false,
}))

vi.mock('@/db/client', () => {
  const chain = (resolve: () => unknown) => {
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve()).then(ok, ko)
            } catch (error) {
              return Promise.reject(error).then(ok, ko)
            }
          }
        }
        return () => proxy
      },
    })
    return proxy
  }
  return {
    db: {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          return chain(() => {
            if (state.failInsert) throw new Error('banco fora')
            state.inserted.push(values)
            return [{ id: `email-${state.inserted.length}` }]
          })
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          state.updated.push(values)
          return chain(() => [])
        },
      }),
    },
  }
})

const { env } = await import('@/config/env')
const { sendEmail } = await import('@/lib/email')
const { renderEmail } = await import('@/lib/email/templates')
const { hasSealedSecrets, maskSecrets, sealSecrets, unsealSecrets, SECRET_MASK } = await import('@/lib/email/secrets')
const { toEmailDetail, toEmailListItem } = await import('@/lib/email/outbox')
const { hitRateLimit } = await import('@/lib/rate-limit')

const PASSWORD = 'Xk9pQ2mZ7tRb4LwN'

beforeEach(() => {
  state.inserted = []
  state.updated = []
  state.failInsert = false
  env.EMAIL_PROVIDER = 'outbox'
  vi.unstubAllGlobals()
})

describe('templates', () => {
  it('os 16 renderizam com dados vazios e com dados completos', () => {
    expect(EMAIL_TEMPLATES).toHaveLength(16)
    for (const template of EMAIL_TEMPLATES) {
      const empty = renderEmail(template, {})
      expect(empty.subject.length).toBeGreaterThan(3)
      expect(empty.text).toContain('ANNETEC')
      const full = renderEmail(template, {
        applicantName: 'Mariana Costa Lima',
        code: 'ANN-2609-ABCDE',
        trackingUrl: 'http://localhost:3000/contratar/x?chave=y',
        tenantName: 'Clube ASSERV',
        description: 'Plano Pro — 10/2026',
        amount: 1490.5,
        dueDate: '2026-10-10',
        payUrl: 'http://localhost:3000/fatura-annetec/x?chave=y',
        daysLate: 12,
        restrictsOn: '2026-10-20',
        suspendsOn: '2026-11-09',
        reason: 'Pedido do contratante',
        items: ['Documentos — Ata: sem registro'],
      })
      expect(full.html).toMatch(/^<!doctype html>/)
      expect(full.text).not.toContain('undefined')
    }
  })

  it('valores formatados e HTML escapado', () => {
    const approved = renderEmail('onboarding_approved', {
      applicantName: '<script>alert(1)</script>',
      code: 'ANN-2609-ABCDE',
      amount: 1490.5,
      dueDate: '2026-10-10',
      payUrl: 'javascript:alert(1)',
    })
    expect(approved.text).toContain('R$')
    expect(approved.text).toContain('10/10/2026')
    expect(approved.html).not.toContain('<script>')
    expect(approved.html).not.toContain('href="javascript:')
  })
})

describe('segredos no corpo gravado', () => {
  it('lacra, revela só no detalhe e mascara nas listas', () => {
    const sealed = sealSecrets(`Senha: ${PASSWORD}`, [PASSWORD])
    expect(sealed).not.toContain(PASSWORD)
    expect(hasSealedSecrets(sealed)).toBe(true)
    expect(unsealSecrets(sealed, 'reveal')).toBe(`Senha: ${PASSWORD}`)
    expect(unsealSecrets(sealed, 'mask')).toBe(`Senha: ${SECRET_MASK}`)
    expect(maskSecrets(`a ${PASSWORD} b ${PASSWORD}`, [PASSWORD])).toBe(`a ${SECRET_MASK} b ${SECRET_MASK}`)
  })

  it('sendEmail (outbox): grava "simulated" sem a senha em claro; o detalhe revela', async () => {
    const result = await sendEmail({
      template: 'tenant_welcome',
      to: { email: 'Admin@Asserv.org.br', name: 'Mariana' },
      data: { adminName: 'Mariana', clubName: 'Clube ASSERV', loginUrl: 'http://localhost:3000/login', adminEmail: 'admin@asserv.org.br', password: PASSWORD },
      secrets: [PASSWORD],
      proposalId: '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f',
    })
    expect(result).toEqual({ id: 'email-1', status: 'simulated' })
    const row = state.inserted[0]!
    expect(row.toEmail).toBe('admin@asserv.org.br')
    expect(row.provider).toBe('outbox')
    expect(JSON.stringify(row)).not.toContain(PASSWORD)

    const now = new Date()
    const full = {
      id: 'e1',
      template: 'tenant_welcome',
      toEmail: 'admin@asserv.org.br',
      toName: 'Mariana',
      subject: String(row.subject),
      bodyText: String(row.bodyText),
      bodyHtml: String(row.bodyHtml),
      provider: 'outbox' as const,
      status: 'simulated' as const,
      providerMessageId: null,
      error: null,
      organizationId: null,
      proposalId: null,
      relatedType: null,
      relatedId: null,
      sentAt: now,
      createdAt: now,
    }
    // Revelar é opt-in (o controller só pede para superadmin fora de produção).
    expect(toEmailDetail(full, { revealSecrets: true }).bodyText).toContain(PASSWORD)
    expect(toEmailDetail(full, { revealSecrets: true }).bodyHtml).toContain(PASSWORD)
    expect(toEmailDetail(full).bodyText).not.toContain(PASSWORD)
    expect(toEmailDetail(full).bodyText).toContain(SECRET_MASK)
    expect(toEmailListItem(full).preview).not.toContain(PASSWORD)
  })

  it('provedor real: corpo gravado mascarado, envio por fetch, status "sent"', async () => {
    env.EMAIL_PROVIDER = 'resend'
    env.RESEND_API_KEY = 're_teste'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendEmail({
      template: 'tenant_welcome',
      to: { email: 'admin@asserv.org.br' },
      data: { password: PASSWORD },
      secrets: [PASSWORD],
    })
    expect(result.status).toBe('sent')
    expect(String(state.inserted[0]?.bodyText)).toContain(SECRET_MASK)
    expect(JSON.stringify(state.inserted[0])).not.toContain(PASSWORD)
    // O destinatário recebe a senha; o banco não.
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(PASSWORD)
    expect(state.updated[0]).toMatchObject({ status: 'sent', providerMessageId: 'msg-1' })
  })

  it('nunca lança: banco fora = { id: null, status: "failed" }', async () => {
    state.failInsert = true
    await expect(sendEmail({ template: 'onboarding_started', to: { email: 'x@y.com' }, data: {} })).resolves.toEqual({
      id: null,
      status: 'failed',
    })
  })
})

describe('limite por IP', () => {
  it('janela fixa: bloqueia acima do limite e libera na janela seguinte', () => {
    const store = new Map()
    const t0 = 1_000_000
    expect(hitRateLimit(store, 'k', 2, 60_000, t0).allowed).toBe(true)
    expect(hitRateLimit(store, 'k', 2, 60_000, t0 + 1).allowed).toBe(true)
    const blocked = hitRateLimit(store, 'k', 2, 60_000, t0 + 2)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(60)
    expect(hitRateLimit(store, 'k', 2, 60_000, t0 + 60_001).allowed).toBe(true)
    expect(hitRateLimit(store, 'outro', 2, 60_000, t0 + 2).allowed).toBe(true)
  })
})
