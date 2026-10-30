import type { Context } from 'hono'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

/**
 * IP do cliente: cabeçalhos do proxy só valem com TRUST_PROXY; o IP repassado
 * pela web (`x-annetec-client-ip`) só vale com o segredo interno
 * (`INTERNAL_PROXY_SECRET`, comparado em tempo constante); senão, o socket.
 */

const SECRET = vi.hoisted(() => {
  const value = 'segredo-interno-web-api-de-teste-com-mais-de-32-caracteres'
  process.env.INTERNAL_PROXY_SECRET = value
  return value
})

const { forwardedIp, internalClientIp, rateLimit, requestIp, sameSecret, DEV_LIMIT_MULTIPLIER } = await import('@/lib/rate-limit')
const { errorHandler } = await import('@/http/errors')

function fakeContext(headers: Record<string, string>, socketIp = '172.18.0.5'): Context {
  return {
    req: { header: (name: string) => headers[name.toLowerCase()] },
    env: { incoming: { socket: { remoteAddress: socketIp } } },
  } as unknown as Context
}

/** Chamada da web confiável: IP do navegador + segredo interno. */
function fromWeb(ip: string, secret = SECRET): Record<string, string> {
  return { 'x-annetec-client-ip': ip, 'x-annetec-proxy-secret': secret }
}

describe('requestIp / forwardedIp', () => {
  it('proxy confiável: 1º salto do x-forwarded-for', () => {
    const c = fakeContext({ 'x-forwarded-for': '200.1.2.3, 172.18.0.4' })
    expect(forwardedIp(c, true, null)).toBe('200.1.2.3')
    expect(requestIp(c, true, null)).toBe('200.1.2.3')
  })

  it('proxy confiável sem x-forwarded-for: usa x-real-ip, depois o socket', () => {
    expect(requestIp(fakeContext({ 'x-real-ip': '200.9.9.9' }), true, null)).toBe('200.9.9.9')
    expect(requestIp(fakeContext({}), true, null)).toBe('172.18.0.5')
  })

  it('sem proxy confiável: ignora os cabeçalhos (forjáveis) e usa o socket', () => {
    const c = fakeContext({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '6.6.6.6' })
    expect(forwardedIp(c, false, null)).toBeNull()
    expect(requestIp(c, false, null)).toBe('172.18.0.5')
  })
})

describe('IP repassado pela web (INTERNAL_PROXY_SECRET)', () => {
  it('web confiável: usa o IP do navegador, não o do container da web', () => {
    // Server action do Next: socket = container da web, sem x-forwarded-for.
    const c = fakeContext(fromWeb('189.40.10.20'), '::ffff:172.18.0.4')
    expect(internalClientIp(c, SECRET)).toBe('189.40.10.20')
    expect(requestIp(c, true, SECRET)).toBe('189.40.10.20')
    // Vale mesmo com TRUST_PROXY desligado (a prova é o segredo, não a rede).
    expect(requestIp(c, false, SECRET)).toBe('189.40.10.20')
  })

  it('o IP da web tem precedência sobre o x-forwarded-for e aceita IPv6', () => {
    const c = fakeContext({ ...fromWeb('2804:14c:1:2::10'), 'x-forwarded-for': '10.0.0.9' })
    expect(requestIp(c, true, SECRET)).toBe('2804:14c:1:2::10')
  })

  it('usa o segredo do ambiente por padrão', () => {
    expect(requestIp(fakeContext(fromWeb('189.40.10.21')))).toBe('189.40.10.21')
  })

  it('cabeçalho forjado SEM o segredo é ignorado (chamada direta à API pela internet)', () => {
    // Via Caddy: o x-forwarded-for é o IP real (sobrescrito pelo Caddy) — comportamento de antes.
    const viaCaddy = fakeContext({ 'x-annetec-client-ip': '1.1.1.1', 'x-forwarded-for': '200.50.60.70' })
    expect(internalClientIp(viaCaddy, SECRET)).toBeNull()
    expect(requestIp(viaCaddy, true, SECRET)).toBe('200.50.60.70')
    // Sem proxy confiável: socket.
    expect(requestIp(fakeContext({ 'x-annetec-client-ip': '1.1.1.1' }), false, SECRET)).toBe('172.18.0.5')
  })

  it('segredo errado (ou de outro tamanho) é ignorado', () => {
    for (const wrong of [`${SECRET.slice(0, -1)}x`, 'curto', `${SECRET}-a-mais`, '']) {
      const c = fakeContext({ ...fromWeb('1.1.1.1', wrong), 'x-forwarded-for': '200.50.60.70' })
      expect(internalClientIp(c, SECRET)).toBeNull()
      expect(requestIp(c, true, SECRET)).toBe('200.50.60.70')
    }
  })

  it('sem INTERNAL_PROXY_SECRET configurado, nenhum valor de cabeçalho é aceito', () => {
    const c = fakeContext(fromWeb('1.1.1.1', ''))
    expect(internalClientIp(c, null)).toBeNull()
    expect(internalClientIp(c, undefined)).toBeNull()
    expect(requestIp(c, false, null)).toBe('172.18.0.5')
  })

  it('valor que não é IP é descartado mesmo com o segredo certo', () => {
    for (const bad of ['', 'not-an-ip', '999.1.1.1', `1.1.1.1${'0'.repeat(80)}`]) {
      expect(internalClientIp(fakeContext(fromWeb(bad)), SECRET)).toBeNull()
    }
    expect(internalClientIp(fakeContext(fromWeb(' 189.40.10.20 , 10.0.0.1')), SECRET)).toBe('189.40.10.20')
  })

  it('sameSecret compara pelo conteúdo, nunca por prefixo', () => {
    expect(sameSecret(SECRET, SECRET)).toBe(true)
    expect(sameSecret(SECRET.slice(0, 10), SECRET)).toBe(false)
    expect(sameSecret('', SECRET)).toBe(false)
  })
})

describe('rate limit por IP com chamadas vindas da web', () => {
  function app() {
    const hono = new Hono()
    hono.onError(errorHandler)
    // Fora de produção o limite é multiplicado: 1 × DEV_LIMIT_MULTIPLIER por janela.
    hono.post('/login', rateLimit({ key: `teste:login:${Math.random()}`, limit: 1, windowMs: 60_000 }), c => c.json({ ok: true }))
    return hono
  }
  const allowed = DEV_LIMIT_MULTIPLIER

  async function burst(hono: Hono, headers: Record<string, string>, times: number): Promise<number[]> {
    const statuses: number[] = []
    for (let i = 0; i < times; i += 1) statuses.push((await hono.request('/login', { method: 'POST', headers })).status)
    return statuses
  }

  it('usuários diferentes atrás da web têm baldes separados', async () => {
    const hono = app()
    const first = await burst(hono, fromWeb('189.40.10.1'), allowed + 1)
    expect(first.slice(0, allowed).every(status => status === 200)).toBe(true)
    expect(first[allowed]).toBe(429)
    // Outro navegador, mesma web (mesmo container): ainda pode entrar.
    expect((await burst(hono, fromWeb('189.40.10.2'), 1))[0]).toBe(200)
  })

  it('sem o segredo, o IP do cabeçalho não separa ninguém (não dá para fugir do limite trocando o cabeçalho)', async () => {
    const hono = app()
    const forged = (n: number) => ({ 'x-annetec-client-ip': `6.6.6.${n}`, 'x-annetec-proxy-secret': 'chute' })
    for (let i = 0; i < allowed; i += 1) {
      expect((await hono.request('/login', { method: 'POST', headers: forged(i) })).status).toBe(200)
    }
    expect((await hono.request('/login', { method: 'POST', headers: forged(99) })).status).toBe(429)
  })
})
