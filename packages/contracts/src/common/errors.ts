import { z } from 'zod'

/**
 * Catálogo único de erros da API Annetec. Todo erro que sai da API carrega um
 * destes códigos — o frontend pode decidir o que fazer (redirecionar, exibir
 * toast, marcar campo) sem depender da mensagem em português.
 */
export const ERROR_CODES = {
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',
  // 401 / 403
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  // 404 / 409
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  // 422
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  // 429
  RATE_LIMITED: 'RATE_LIMITED',
  // 5xx
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Integração Digital Saúde
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UPSTREAM_UNAUTHORIZED: 'UPSTREAM_UNAUTHORIZED',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  UPSTREAM_CONTRACT_MISMATCH: 'UPSTREAM_CONTRACT_MISMATCH',
  INTEGRATION_NOT_CONFIGURED: 'INTEGRATION_NOT_CONFIGURED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const errorCode = z.enum(
  Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]],
)

/** Status HTTP padrão de cada código, usado pelo error handler da API. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  MALFORMED_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  TENANT_MISMATCH: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNAUTHORIZED: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_CONTRACT_MISMATCH: 502,
  INTEGRATION_NOT_CONFIGURED: 503,
}

/** Detalhe por campo, preenchido a partir de um ZodError. */
export const fieldIssue = z.object({
  path: z.string(),
  message: z.string(),
})
export type FieldIssue = z.infer<typeof fieldIssue>

export const apiError = z.object({
  code: errorCode,
  message: z.string(),
  issues: z.array(fieldIssue).optional(),
  requestId: z.string().optional(),
})
export type ApiError = z.infer<typeof apiError>
