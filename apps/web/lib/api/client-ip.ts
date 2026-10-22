import 'server-only'
import { headers } from 'next/headers'

/**
 * Repassa à API o IP do navegador (`x-forwarded-for`/`x-real-ip` que chegou
 * ao Next). Sem isso, toda chamada vinda de server action chegaria com o IP
 * do servidor do Next: o rate limit agruparia todo mundo num balde só e o
 * gateway (Asaas `remoteIp`) receberia o IP errado do pagador.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  const incoming = await headers()
  const forwardedFor = incoming.get('x-forwarded-for') ?? incoming.get('x-real-ip')
  return forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}
}
