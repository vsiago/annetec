'use server'

import type {
  AuthSession,
  ClientPortalLoginInput,
  GoogleLoginConfig,
  GoogleLoginInput,
  LoginInput,
  LoginMethodInput,
  LoginMethodOutput,
  SessionUser,
} from '@annetec/contracts'
import { revalidatePath } from 'next/cache'
import { ApiError, api } from '@/lib/api/client'
// IP do navegador para o rate limit por IP do login (com o segredo interno: cada pessoa no seu balde).
import { clientIpHeaders } from '@/lib/api/client-ip'
import {
  beginImpersonation,
  clearSession,
  endImpersonation,
  getImpersonatorSession,
  getToken,
  saveSession,
} from '@/lib/api/session'
import { run, type ActionResult } from './_api-result'

/**
 * Server Actions de autenticação — a ponte entre os formulários do app e a
 * API Annetec (Better Auth por baixo).
 *
 * Mantêm o mesmo contrato `{ success, data | error }` que os mocks em
 * `lib/actions/*.ts` já usam, para que a troca do mock pela API real seja
 * trocar o import, não reescrever a tela.
 */

export async function loginAction(input: LoginInput): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

/**
 * Tela de login do inquilino, etapa 1: com o e-mail, a API diz se o próximo
 * passo é senha ou CPF (associado sem senha). Não abre sessão nenhuma.
 */
export async function loginMethodAction(input: LoginMethodInput): Promise<ActionResult<LoginMethodOutput>> {
  return run(async () =>
    api<LoginMethodOutput>('/api/v1/auth/login/method', {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
    }),
  )
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
      headers: await clientIpHeaders(),
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

/**
 * Login com Google: `idToken` é o `credential` que o Google Identity Services
 * entregou no navegador. A API valida o token e exige vínculo com o inquilino.
 */
export async function loginGoogleAction(input: GoogleLoginInput): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>('/api/v1/auth/login/google', {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
    })
    await saveSession(token, user)
    revalidatePath('/', 'layout')
    return user
  })
}

/** Se a API tem o login com Google configurado (decide se a tela mostra o botão). */
export async function googleLoginConfigAction(): Promise<ActionResult<GoogleLoginConfig>> {
  return run(async () => api<GoogleLoginConfig>('/api/v1/auth/login/google/config', { token: null }))
}

export async function logoutAction(): Promise<ActionResult<null>> {
  // Falha ao revogar no servidor não pode impedir o logout local.
  await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => null)
  // Saindo no meio de uma simulação: a sessão de superadmin guardada também
  // é encerrada no servidor — senão ficaria viva no cookie e no banco.
  const impersonador = await getImpersonatorSession()
  if (impersonador) {
    await api('/api/v1/auth/logout', { method: 'POST', token: impersonador.token }).catch(() => null)
  }
  await clearSession()
  revalidatePath('/', 'layout')
  return { success: true, data: null }
}

/**
 * Sessão atual. Sem cookie de token nem chama a API: a falha volta SEM
 * `unauthorized`, porque "nunca entrou" não é "sessão encerrada" — só um
 * token enviado e recusado (401) liga o aviso no login.
 */
export async function meAction(): Promise<ActionResult<SessionUser>> {
  if (!(await getToken())) return { success: false, error: 'Nenhuma sessão aberta.' }
  return run(() => api<SessionUser>('/api/v1/auth/me'))
}

/**
 * Relê `/auth/me` e regrava o cookie legível do `SessionUser` com o mesmo
 * token. Existe para o retrato da sessão não ficar velho depois de uma
 * mudança feita no servidor — p.ex. o associado que acabou de pagar a
 * assinatura e ainda carregava `needsSubscription: true` desde o login.
 */
export async function refreshSessionAction(): Promise<ActionResult<SessionUser>> {
  const token = await getToken()
  if (!token) return { success: false, error: 'Nenhuma sessão aberta.' }
  return run(async () => {
    const user = await api<SessionUser>('/api/v1/auth/me', { token })
    await saveSession(token, user)
    return user
  })
}

/**
 * Só apaga os cookies de sessão deste navegador, sem falar com a API. É o
 * passo de quem recebeu 401: a sessão já morreu no servidor (derrubada,
 * expirada, vínculo inativo), então chamar `/auth/logout` seria mais um 401.
 */
export async function clearLocalSessionAction(): Promise<void> {
  await clearSession()
}

/**
 * Superadmin entrando como uma conta real do inquilino (aba Acessos) — é
 * assim que `/{slug}/admin`, `/vendedor` e `/cliente` deixam de exigir a
 * senha daquela pessoa: viram uma sessão de inquilino de verdade, só que
 * aberta pela plataforma. `returnTo` é pra onde `stopImpersonatingAction`
 * volta depois.
 */
export async function impersonateTenantMemberAction(
  tenantId: string,
  userId: string,
  returnTo: string,
): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>(
      `/api/v1/platform/tenants/${tenantId}/usuarios/${userId}/entrar-como`,
      { method: 'POST' },
    )
    await beginImpersonation(token, user, returnTo)
    revalidatePath('/', 'layout')
    return user
  })
}

/**
 * Igual à de cima, mas deixando a API escolher a conta pelo papel — é o que
 * os atalhos "Portal do admin / vendedor / beneficiário" usam para entrar em
 * um clique, sem passar pela lista de contas.
 */
export async function impersonateTenantRoleAction(
  tenantId: string,
  papel: 'admin' | 'seller' | 'client',
  returnTo: string,
): Promise<ActionResult<SessionUser>> {
  return run(async () => {
    const { token, user } = await api<AuthSession>(
      `/api/v1/platform/tenants/${tenantId}/entrar-como/${papel}`,
      { method: 'POST' },
    )
    await beginImpersonation(token, user, returnTo)
    revalidatePath('/', 'layout')
    return user
  })
}

/** Sai da simulação e devolve a sessão de superadmin guardada por `impersonateTenantMemberAction`. */
export async function stopImpersonatingAction(): Promise<ActionResult<{ returnTo: string }>> {
  const impersonador = await getImpersonatorSession()
  if (!impersonador) {
    return { success: false, error: 'Nenhuma simulação ativa.' }
  }

  // Revoga a sessão simulada no servidor. Falha aqui não pode travar a volta
  // pro superadmin — na pior hipótese a sessão expira sozinha em 1h.
  await api('/api/v1/auth/logout', { method: 'POST' }).catch(() => null)

  return run(async () => {
    const user = await api<SessionUser>('/api/v1/auth/me', { token: impersonador.token })
    await saveSession(impersonador.token, user)
    await endImpersonation()
    revalidatePath('/', 'layout')
    return { returnTo: impersonador.returnTo }
  })
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
