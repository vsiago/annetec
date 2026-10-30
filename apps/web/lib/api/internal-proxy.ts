/**
 * Repasse do IP do navegador para a API nas chamadas feitas PELO SERVIDOR da
 * web (server actions, route handlers, proxy). Sem isso, a API veria o IP do
 * container da web em toda chamada: um só balde de rate limit para todo mundo
 * e o IP errado no aceite do termo da conta gerenciada.
 *
 * Como a confiança é estabelecida:
 *  - a web só é alcançada pelo Caddy, que DESCARTA o `x-forwarded-for` vindo
 *    da internet e grava o IP real — o 1º salto que chega aqui é o navegador;
 *  - a web manda esse IP em `x-annetec-client-ip` junto com
 *    `x-annetec-proxy-secret` (= `INTERNAL_PROXY_SECRET`, o mesmo valor na API);
 *  - a API só usa o IP quando o segredo confere (tempo constante). Quem chama a
 *    API direto pela internet não tem o segredo: o cabeçalho é ignorado.
 *
 * O `x-forwarded-for` continua indo (compatibilidade com `TRUST_PROXY` quando o
 * segredo não está configurado, ex.: desenvolvimento).
 *
 * Módulo puro (sem `server-only` nem `next/headers`): também roda no `proxy.ts`.
 * O segredo vem de `process.env` e NUNCA pode ter prefixo `NEXT_PUBLIC_`.
 */

export const INTERNAL_CLIENT_IP_HEADER = 'x-annetec-client-ip'
export const INTERNAL_PROXY_SECRET_HEADER = 'x-annetec-proxy-secret'

type HeaderSource = { get(name: string): string | null }

/** 1º IP do `x-forwarded-for` (gravado pelo Caddy) ou o `x-real-ip`. */
export function browserIpOf(incoming: HeaderSource): string | null {
  const forwarded = incoming.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded.slice(0, 64)
  return incoming.get('x-real-ip')?.trim().slice(0, 64) || null
}

/** Cabeçalhos para a API a partir da requisição que chegou ao Next. */
export function forwardedClientHeaders(incoming: HeaderSource): Record<string, string> {
  const out: Record<string, string> = {}
  const forwardedFor = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip')
  if (forwardedFor) out['x-forwarded-for'] = forwardedFor
  const ip = browserIpOf(incoming)
  const secret = process.env.INTERNAL_PROXY_SECRET?.trim()
  if (ip && secret) {
    out[INTERNAL_CLIENT_IP_HEADER] = ip
    out[INTERNAL_PROXY_SECRET_HEADER] = secret
  }
  return out
}
