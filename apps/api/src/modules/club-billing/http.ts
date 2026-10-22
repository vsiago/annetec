import { ERROR_CODES } from '@annetec/contracts'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/** Limite de corpo das rotas do clube (checkout tem até 20 dependentes; webhook do Asaas é pequeno). */
export function limitBody(maxKb: number) {
  return bodyLimit({
    maxSize: maxKb * 1024,
    onError: () => {
      throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Conteúdo grande demais', { status: 413 })
    },
  })
}

/** IP do cliente para o antifraude do gateway (1º salto do `x-forwarded-for`). */
export function remoteIpOf(c: Context<AppEnv>): string | undefined {
  const forwarded = c.req.header('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : c.req.header('x-real-ip')
  return ip && ip.length <= 64 ? ip : undefined
}
