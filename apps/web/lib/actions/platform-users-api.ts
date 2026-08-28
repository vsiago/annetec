'use server'

import type { CreatePlatformUserInput, PlatformUser } from '@annetec/contracts'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { PlatformUser as LegacyPlatformUser } from '@/lib/types'

/**
 * Contas de equipe Annetec — fala direto com `/api/v1/platform/users`
 * (Better Auth por baixo). Sem mock, sem localStorage: toda leitura e
 * escrita aqui é contra o Postgres de verdade.
 *
 * O retorno é remapeado para o formato de `lib/types.ts` (`avatar`,
 * `createdAt: Date`) só para o resto do app — construído em cima do mock —
 * não precisar mudar nada além de trocar de onde os dados vêm.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

function toLegacyShape(user: PlatformUser): LegacyPlatformUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? undefined,
    avatar: user.avatarUrl ?? undefined,
    createdAt: new Date(user.createdAt),
  }
}

export async function listPlatformUsersAction(): Promise<ActionResult<LegacyPlatformUser[]>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformUser[]>('/api/v1/platform/users', {
      query: { perPage: 100 },
    })
    return data.map(toLegacyShape)
  })
}

export async function createPlatformUserAction(
  input: CreatePlatformUserInput,
): Promise<ActionResult<LegacyPlatformUser>> {
  return run(async () => {
    const user = await apiFetch<PlatformUser>('/api/v1/platform/users', {
      method: 'POST',
      body: input,
    }).then(r => r.data)
    return toLegacyShape(user)
  })
}

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
