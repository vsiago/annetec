'use server'

import type {
  CreatePlatformUserInput,
  PlatformUser,
  UpdatePlatformUserInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import type { PlatformUser as LegacyPlatformUser } from '@/lib/types'
import { run, type ActionResult } from './_api-result'

/**
 * Contas de equipe Annetec — fala direto com `/api/v1/platform/users`
 * (Better Auth por baixo). Sem mock, sem localStorage: toda leitura e
 * escrita aqui é contra o Postgres de verdade.
 *
 * O retorno é remapeado para o formato de `lib/types.ts` (`avatar`,
 * `createdAt: Date`) só para o resto do app — construído em cima do mock —
 * não precisar mudar nada além de trocar de onde os dados vêm.
 */

function toLegacyShape(user: PlatformUser): LegacyPlatformUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? undefined,
    avatar: user.avatarUrl ?? undefined,
    active: user.active,
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

/**
 * Edita nome, telefone, papel e ativação. A API barra os dois tiros no pé —
 * autodesativação e ficar sem nenhum superadmin ativo — devolvendo 422 com a
 * explicação, que a tela mostra como está.
 */
export async function updatePlatformUserAction(
  id: string,
  patch: UpdatePlatformUserInput,
): Promise<ActionResult<LegacyPlatformUser>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformUser>(`/api/v1/platform/users/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    return toLegacyShape(data)
  })
}
