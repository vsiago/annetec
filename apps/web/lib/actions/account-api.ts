'use server'

import type { ChangePasswordInput } from '@annetec/contracts'
import { ApiError, api } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Conta da própria pessoa logada (qualquer papel) — fala com
 * `/api/v1/auth/*`, que autoriza pela sessão e não pelo papel no inquilino.
 *
 * Fica fora de `auth-api.ts` porque aquele arquivo cuida de login/sessão; aqui
 * é o "minha conta" usado pelo `ProfileForm` de vendedor e associado.
 */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult<null>> {
  return run(async () => {
    try {
      await api<null>('/api/v1/auth/password', { method: 'POST', body: input })
    } catch (error) {
      // A rota responde 204 sem corpo, que o cliente HTTP lê como "formato
      // inválido". 204 aqui é sucesso.
      if (!(error instanceof ApiError && error.status === 204)) throw error
    }
    return null
  })
}
