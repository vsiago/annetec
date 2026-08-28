import { z } from 'zod'

/** Query de paginação padrão. Aceita `?page=2&perPage=50&sort=-createdAt`. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(200).default(20),
  sort: z.string().optional(),
  q: z.string().trim().min(1).optional(),
})
export type PaginationQuery = z.infer<typeof paginationQuery>
