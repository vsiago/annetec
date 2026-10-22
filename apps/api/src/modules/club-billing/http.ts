import { ERROR_CODES } from '@annetec/contracts'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'
import { forwardedIp } from '@/lib/rate-limit'

/** Limite de corpo das rotas do clube (checkout tem até 20 dependentes; webhook do Asaas é pequeno). */
export function limitBody(maxKb: number) {
  return bodyLimit({
    maxSize: maxKb * 1024,
    onError: () => {
      throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Conteúdo grande demais', { status: 413 })
    },
  })
}

/**
 * IP do cliente para o antifraude do gateway (1º salto do `x-forwarded-for`,
 * só atrás de proxy confiável — `TRUST_PROXY`). Sem cabeçalho confiável não
 * manda nada: o IP do socket seria o do servidor do Next, não o do pagador.
 */
export function remoteIpOf(c: Context<AppEnv>): string | undefined {
  const ip = forwardedIp(c)
  return ip && ip.length <= 64 ? ip : undefined
}
