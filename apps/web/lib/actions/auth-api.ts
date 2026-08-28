'use server'

import type {
  AuthSession,
  ClientPortalLoginInput,
  LoginInput,
  RegisterInput,
  SessionUser,
} from '@annetec/contracts'
import { revalidatePath } from 'next/cache'
import { ApiError, api } from '@/lib/api/client'
import { clearSession, getToken, saveSession } from '@/lib/api/session'

/**
 * Server Actions de autenticação — a ponte entre os formulários do app e a
 * API Annetec (Better Auth por baixo).
 *
 * Mantêm o mesmo contrato `{ success, data | error }` que os mocks em
 * `lib/actions/*.ts` já usam, para que a troca do mock pela API real seja
 * trocar o import, não reescrever a tela.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export async function loginAction(input: LoginInput): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
      token: null,
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

/** Primeiro acesso do associado: CPF + e-mail conferidos na Digital Saúde. */
export async function loginClientPortalAction(
  input: ClientPortalLoginInput,
): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>('/api/v1/auth/login/portal', {
      method: 'POST',
      body: input,
      token: null,
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

export async function registerAction(input: RegisterInput): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
      token: null,
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

export async function logoutAction(): Promise<ActionResult<null>> {
  // Falha ao revogar no servidor não pode impedir o logout local.
  await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => null)
  await clearSession()
  revalidatePath('/', 'layout')
  return { success: true, data: null }
}

export async function meAction(): Promise<ActionResult<SessionUser>> {
  return run(() => api<SessionUser>('/api/v1/auth/me'))
}

/** Usado pelo middleware/layout para checar sessão sem redisparar erro para a tela. */
export async function hasValidSessionAction(): Promise<boolean> {
  const token = await getToken()
  if (!token) return false
  try {
    await api('/api/v1/auth/me')
    return true
  } catch {
    return false
  }
}

/** Converte `ApiError` na mensagem que a tela exibe, sem vazar stack. */
async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }
    return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
