import { ERROR_CODES } from '@annetec/contracts'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'
import { requestIp } from '@/lib/rate-limit'
import { contentDisposition, readFileContent, StorageError, type PlatformFileRow } from '@/lib/storage'
import { isValidOnboardingAccessKey } from './access-key'
import type { Actor } from './repository'
import type { RequestMeta } from './service'

/** Utilidades HTTP do módulo de contratação (chave, upload, binário, ator). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | undefined | null): value is string {
  return Boolean(value && UUID.test(value))
}

/** `:id` + `?chave=` válidos; senão 404 como se a proposta não existisse. */
export const proposalKeyGuard = createMiddleware<AppEnv>(async (c, next) => {
  const id = c.req.param('id')
  if (!isUuid(id) || !isValidOnboardingAccessKey(id, c.req.query('chave'))) throw AppError.notFound('Proposta')
  await next()
})

/** Id da rota já conferido (uuid). */
export function routeId(c: Context<AppEnv>, name = 'id'): string {
  const value = c.req.param(name)
  if (!isUuid(value)) throw AppError.notFound(name === 'docId' ? 'Documento' : 'Proposta')
  return value
}

/** Corpo multipart até o limite do arquivo + folga do envelope; acima → 413. */
export function uploadBodyLimit(maxFileBytes: number) {
  const limitMb = Math.round(maxFileBytes / (1024 * 1024))
  return bodyLimit({
    maxSize: maxFileBytes + 256 * 1024,
    onError: () => {
      const message = `O arquivo passa do limite de ${limitMb} MB.`
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, message, { status: 413, issues: [{ path: 'file', message }] })
    },
  })
}

/** Lê o multipart e devolve o arquivo (`file`) + os demais campos como texto. */
export async function readMultipart(c: Context<AppEnv>): Promise<{ file: File; fields: Record<string, string> }> {
  let body: Record<string, string | File | (string | File)[]>
  try {
    body = await c.req.parseBody({ all: false })
  } catch {
    throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Envie o arquivo como multipart/form-data (campo "file").')
  }
  const file = body.file
  if (!(file instanceof File)) throw AppError.validation([{ path: 'file', message: 'Selecione o arquivo' }])
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) if (typeof value === 'string') fields[key] = value
  return { file, fields }
}

/**
 * Logo/ícone público: URL com UUID — um envio novo gera URL nova, então pode
 * ficar em cache para sempre. Demais arquivos públicos: 1 dia.
 */
function cacheControl(file: PlatformFileRow, cache: 'private' | 'public'): string {
  if (cache !== 'public') return 'private, no-store'
  return file.purpose === 'brand_logo' ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'
}

/** Binário do Storage com cabeçalhos seguros. */
export async function sendStoredFile(c: Context<AppEnv>, file: PlatformFileRow, cache: 'private' | 'public') {
  let content: Buffer
  try {
    content = await readFileContent(file)
  } catch (error) {
    if (error instanceof StorageError) throw AppError.notFound('Arquivo')
    throw error
  }
  return c.body(new Uint8Array(content), 200, {
    'Content-Type': file.mimeType,
    'Content-Length': String(content.length),
    'Content-Disposition': contentDisposition('inline', file.fileName),
    'Cache-Control': cacheControl(file, cache),
    'X-Content-Type-Options': 'nosniff',
  })
}

const CORP = 'cross-origin-resource-policy'
const PINNED = Symbol('corp-pinned')

/** Fixa `Cross-Origin-Resource-Policy: cross-origin` neste objeto de cabeçalhos (sets posteriores são ignorados). */
function pinCrossOriginResource(headers: Headers) {
  if ((headers as unknown as Record<symbol, boolean>)[PINNED]) return
  headers.set(CORP, 'cross-origin')
  const originalSet = headers.set.bind(headers)
  Object.defineProperty(headers, 'set', {
    configurable: true,
    value: (name: string, value: string) => {
      if (name.toLowerCase() !== CORP) originalSet(name, value)
    },
  })
  Object.defineProperty(headers, PINNED, { value: true })
}

/**
 * O `secureHeaders` global (app.ts) grava `Cross-Origin-Resource-Policy:
 * same-origin` DEPOIS de todo handler — e o `cors` recria a resposta no
 * caminho de volta —, o que impede a web (outra origem) de embutir o logo
 * público em `<img>`. Sem mexer no app.ts: este middleware sombreia o
 * acessor `res` DESTE contexto para que toda leitura da resposta final saia
 * com `cross-origin` fixado. Só é usado na rota de arquivos públicos.
 */
export const allowCrossOriginEmbed = createMiddleware<AppEnv>(async (c, next) => {
  await next()
  let proto: object | null = Object.getPrototypeOf(c)
  let descriptor: PropertyDescriptor | undefined
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'res')
    proto = Object.getPrototypeOf(proto)
  }
  const { get, set } = descriptor ?? {}
  if (!get || !set) return
  Object.defineProperty(c, 'res', {
    configurable: true,
    get() {
      const response = get.call(c) as Response
      pinCrossOriginResource(response.headers)
      return response
    },
    set(value: Response) {
      set.call(c, value)
    },
  })
})

export function actorOf(c: Context<AppEnv>): Actor {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { userId: session.user.id, name: session.user.name }
}

export function requestMeta(c: Context<AppEnv>): RequestMeta {
  const ip = requestIp(c)
  return { ip: ip && ip.length <= 64 ? ip : null, userAgent: c.req.header('user-agent') ?? null }
}
