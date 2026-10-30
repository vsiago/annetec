import 'server-only'
import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { forwardedClientHeaders } from './internal-proxy'

/**
 * Repassa à API o IP do navegador que chegou ao Next (ver `internal-proxy.ts`:
 * `x-forwarded-for` + `x-annetec-client-ip` com o segredo interno). Sem isso,
 * toda chamada vinda de server action chegaria com o IP do servidor do Next: o
 * rate limit agruparia todo mundo num balde só, o aceite do termo gravaria o IP
 * do container e o gateway (Asaas `remoteIp`) receberia o IP errado do pagador.
 *
 * Fora de uma requisição (build, tarefas) não há navegador: devolve `{}`. Os
 * sinais internos do Next (renderização dinâmica) são relançados.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  try {
    return forwardedClientHeaders(await headers())
  } catch (error) {
    unstable_rethrow(error)
    return {}
  }
}
