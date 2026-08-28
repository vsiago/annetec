import { zValidator } from '@hono/zod-validator'
import type { ZodSchema } from 'zod'
import { AppError, zodIssues } from './errors'

/**
 * Wrapper do `zValidator` que faz toda falha de validação sair como
 * `VALIDATION_ERROR` no envelope padrão, em vez do 400 cru do Hono.
 */
export function validate<T extends ZodSchema>(target: 'json' | 'query' | 'param' | 'header', schema: T) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.validation(zodIssues(result.error))
    }
    return undefined
  })
}

export const json = <T extends ZodSchema>(schema: T) => validate('json', schema)
export const query = <T extends ZodSchema>(schema: T) => validate('query', schema)
export const param = <T extends ZodSchema>(schema: T) => validate('param', schema)
