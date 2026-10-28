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
  /**
   * Associado sem assinatura viva tentando usar o que depende dela
   * (carteirinha, benefícios, dependentes). O portal manda para o onboarding.
   */
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  /**
   * Vínculo com o clube bloqueado (ou de equipe desativado): o login é
   * recusado com mensagem genérica, sem dizer o motivo.
   */
  ACCESS_UNAVAILABLE: 'ACCESS_UNAVAILABLE',
  // 404 / 409
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  /**
   * Clube sem conta Asaas própria conectada (Faturamento → Configurações →
   * Recebimento): adesão, pagamento e cobrança ficam bloqueados — nunca caem
   * na conta da ANNETEC.
   */
  RECEBIMENTO_NAO_CONFIGURADO: 'RECEBIMENTO_NAO_CONFIGURADO',
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
  /** Token do inquilino estourou o limite de chamadas da Digital Saúde. */
  UPSTREAM_RATE_LIMITED: 'UPSTREAM_RATE_LIMITED',
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
  SUBSCRIPTION_REQUIRED: 403,
  ACCESS_UNAVAILABLE: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,
  RECEBIMENTO_NAO_CONFIGURADO: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNAUTHORIZED: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_CONTRACT_MISMATCH: 502,
  UPSTREAM_RATE_LIMITED: 429,
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
