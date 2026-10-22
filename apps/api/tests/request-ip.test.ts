import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { forwardedIp, requestIp } from '@/lib/rate-limit'

/** IP do cliente: cabeçalhos do proxy só valem com TRUST_PROXY; senão, o socket. */

function fakeContext(headers: Record<string, string>, socketIp = '172.18.0.5'): Context {
  return {
    req: { header: (name: string) => headers[name.toLowerCase()] },
    env: { incoming: { socket: { remoteAddress: socketIp } } },
  } as unknown as Context
}

describe('requestIp / forwardedIp', () => {
  it('proxy confiável: 1º salto do x-forwarded-for', () => {
    const c = fakeContext({ 'x-forwarded-for': '200.1.2.3, 172.18.0.4' })
    expect(forwardedIp(c, true)).toBe('200.1.2.3')
    expect(requestIp(c, true)).toBe('200.1.2.3')
  })

  it('proxy confiável sem x-forwarded-for: usa x-real-ip, depois o socket', () => {
    expect(requestIp(fakeContext({ 'x-real-ip': '200.9.9.9' }), true)).toBe('200.9.9.9')
    expect(requestIp(fakeContext({}), true)).toBe('172.18.0.5')
  })

  it('sem proxy confiável: ignora os cabeçalhos (forjáveis) e usa o socket', () => {
    const c = fakeContext({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '6.6.6.6' })
    expect(forwardedIp(c, false)).toBeNull()
    expect(requestIp(c, false)).toBe('172.18.0.5')
  })
})
