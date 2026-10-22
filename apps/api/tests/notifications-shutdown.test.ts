import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { describe, expect, it, vi } from 'vitest'

/**
 * Encerramento do processo com um stream SSE de notificações aberto: o
 * `abortNotificationStreams` (chamado no início do `shutdown` do `index.ts`)
 * fecha a resposta na hora e o `closeHttpServer` (que também derruba a
 * conexão keep-alive que ficou ociosa depois) termina em bem menos que os
 * 25 s do `maxMs` — sem isso o encerramento gracioso estourava o prazo.
 * Servidor HTTP de verdade (porta efêmera), banco falso.
 */

vi.mock('@/db/client', () => ({ db: {}, sql: {} }))

const service = await import('@/modules/notifications/service')
const { closeHttpServer } = await import('@/lib/http-shutdown')

describe('SSE x encerramento', () => {
  it('stream aberto não segura o fechamento do servidor', async () => {
    const scope = { audience: 'tenant' as const, organizationId: 'org-A', userId: 'u' }
    const store = {
      now: async () => new Date(),
      latest: async () => [],
      unreadCount: async () => 0,
      markRead: async () => 0,
      createdAfter: async () => [],
    }
    const app = new Hono().get('/stream', c =>
      streamSSE(c, stream => service.runNotificationStream(stream, scope, new Date(), { store }).then(() => undefined)),
    )
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as Server
    await new Promise(resolve => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/stream`)
    const reader = response.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('event: ready')

    const startedAt = Date.now()
    service.abortNotificationStreams()
    const closed = closeHttpServer(server)

    // O cliente recebe o `cursor` final e o fim da resposta.
    let body = ''
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      body += new TextDecoder().decode(chunk.value)
    }
    expect(body).toContain('event: cursor')
    await closed
    expect(Date.now() - startedAt).toBeLessThan(3_000)
  }, 10_000)
})
