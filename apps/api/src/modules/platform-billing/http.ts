import type { Context } from 'hono'
import { z, type ZodTypeAny } from 'zod'
import { AppError, zodIssues } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/** Corpo JSON opcional: vazio vale `{}` (ações cujo input é todo opcional). */
export async function optionalJson<T extends ZodTypeAny>(c: Context<AppEnv>, schema: T): Promise<z.output<T>> {
  const text = await c.req.text()
  let raw: unknown = {}
  if (text.trim()) {
    try {
      raw = JSON.parse(text)
    } catch {
      throw AppError.validation([{ path: '(raiz)', message: 'JSON inválido' }])
    }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
  return parsed.data
}

export function actorOf(c: Context<AppEnv>): string | null {
  return c.get('auth')?.user.id ?? null
}

export const idParam = z.object({ id: z.string().uuid() })
/** `q` com teto de tamanho (o `paginationQuery` do contracts não limita). */
export const qLimit = { q: z.string().trim().min(1).max(100).optional() }
