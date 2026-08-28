import { ERROR_CODES, ERROR_STATUS, type ErrorCode, type FieldIssue } from '@annetec/contracts'
import { APIError as BetterAuthError } from 'better-auth/api'
import type { Context, ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { isProduction } from '@/config/env'
import { logger } from '@/lib/logger'

/**
 * Erro de aplicação. Toda falha esperada é lançada como `AppError`; o handler
 * abaixo é o único lugar que converte erro em resposta HTTP, garantindo que o
 * envelope `{ success: false, error }` seja idêntico em toda a API.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly issues?: FieldIssue[]
  override readonly cause?: unknown

  constructor(
    code: ErrorCode,
    message: string,
    options: { issues?: FieldIssue[]; status?: number; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = options.status ?? ERROR_STATUS[code]
    this.issues = options.issues
    this.cause = options.cause
  }

  static notFound(resource: string) {
    return new AppError(ERROR_CODES.NOT_FOUND, `${resource} não encontrado`)
  }

  static unauthenticated(message = 'Autenticação necessária') {
    return new AppError(ERROR_CODES.UNAUTHENTICATED, message)
  }

  static forbidden(message = 'Você não tem permissão para esta operação') {
    return new AppError(ERROR_CODES.FORBIDDEN, message)
  }

  static conflict(message: string) {
    return new AppError(ERROR_CODES.CONFLICT, message)
  }

  static businessRule(message: string) {
    return new AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message)
  }

  static validation(issues: FieldIssue[], message = 'Dados inválidos') {
    return new AppError(ERROR_CODES.VALIDATION_ERROR, message, { issues })
  }
}

export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map(issue => ({
    path: issue.path.join('.') || '(raiz)',
    message: issue.message,
  }))
}

/** Handler global. Registrado com `app.onError` em src/app.ts. */
export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId')

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ requestId, code: err.code, err: err.cause ?? err }, err.message)
    }
    return respondWithError(c, err.status, err.code, err.message, err.issues, requestId)
  }

  if (err instanceof ZodError) {
    return respondWithError(
      c,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Dados inválidos',
      zodIssues(err),
      requestId,
    )
  }

  if (err instanceof HTTPException) {
    const code = err.status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.MALFORMED_REQUEST
    return respondWithError(c, err.status, code, err.message, undefined, requestId)
  }

  // Erro do Better Auth (credenciais inválidas, sessão expirada, e-mail já
  // cadastrado, etc.) — traduzido para o mesmo envelope de toda a API.
  if (err instanceof BetterAuthError) {
    return respondWithError(
      c,
      err.statusCode,
      betterAuthErrorCode(err.statusCode),
      err.body?.message ?? err.message,
      undefined,
      requestId,
    )
  }

  logger.error({ requestId, err }, 'Erro não tratado')
  return respondWithError(
    c,
    500,
    ERROR_CODES.INTERNAL_ERROR,
    isProduction ? 'Erro interno do servidor' : String(err),
    undefined,
    requestId,
  )
}

function betterAuthErrorCode(status: number): ErrorCode {
  if (status === 401) return ERROR_CODES.INVALID_CREDENTIALS
  if (status === 403) return ERROR_CODES.FORBIDDEN
  if (status === 404) return ERROR_CODES.NOT_FOUND
  if (status === 409) return ERROR_CODES.ALREADY_EXISTS
  if (status === 429) return ERROR_CODES.RATE_LIMITED
  if (status >= 400 && status < 500) return ERROR_CODES.VALIDATION_ERROR
  return ERROR_CODES.INTERNAL_ERROR
}

function respondWithError(
  c: Context,
  status: number,
  code: ErrorCode,
  message: string,
  issues: FieldIssue[] | undefined,
  requestId: string | undefined,
) {
  return c.json(
    { success: false as const, error: { code, message, ...(issues ? { issues } : {}), requestId } },
    status as 400,
  )
}
