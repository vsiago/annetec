import type { PageMeta } from '@annetec/contracts'
import type { Context } from 'hono'

/**
 * Únicos atalhos de resposta de sucesso da API. Usar `c.json` cru em um
 * controller é considerado erro de revisão — quebra o envelope padrão.
 */
export function ok<T>(c: Context, data: T, meta?: PageMeta) {
  return c.json({ success: true as const, data, ...(meta ? { meta } : {}) }, 200)
}

export function created<T>(c: Context, data: T) {
  return c.json({ success: true as const, data }, 201)
}

export function noContent(c: Context) {
  return c.json({ success: true as const, data: null }, 200)
}

export function paginate<T>(items: T[], page: number, perPage: number, total: number) {
  const meta: PageMeta = {
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  }
  return { items, meta }
}
