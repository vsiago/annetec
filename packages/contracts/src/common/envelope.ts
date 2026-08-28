import { z } from 'zod'
import { apiError } from './errors'

/**
 * Envelope único de resposta. Toda rota da API responde neste formato,
 * inclusive as que apenas repassam dados da Digital Saúde — assim o frontend
 * tem um único `unwrap` para tudo.
 */
export const pageMeta = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})
export type PageMeta = z.infer<typeof pageMeta>

export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    meta: pageMeta.optional(),
  })
}

export const errorEnvelope = z.object({
  success: z.literal(false),
  error: apiError,
})
export type ErrorEnvelope = z.infer<typeof errorEnvelope>

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.union([successEnvelope(data), errorEnvelope])
}

export type SuccessEnvelope<T> = { success: true; data: T; meta?: PageMeta }
export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope
