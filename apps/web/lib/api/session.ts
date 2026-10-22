import 'server-only'
import { cookies } from 'next/headers'
import type { SessionUser } from '@annetec/contracts'

/**
 * Sessão do lado do servidor.
 *
 * Um único token sai de cada login (o session token do Better Auth). Fica em
 * cookie httpOnly do domínio do próprio Next.js — o browser nunca o lê por
 * JavaScript — e é reenviado à API Annetec como `Authorization: Bearer
 * <token>` (ver lib/api/client.ts). Não há refresh separado: o Better Auth
 * renova a mesma sessão por rolling expiry a cada chamada.
 *
 * O `SessionUser` vai num segundo cookie, legível, só para a UI decidir
 * layout e menu sem round-trip. Ele NÃO é fonte de autorização — toda decisão
 * de permissão é tomada pela API a partir da sessão.
 */
const TOKEN_COOKIE = 'annetec.token'
const USER_COOKIE = 'annetec.user'
/** Token de superadmin guardado enquanto uma impersonação está ativa — ver `beginImpersonation`. */
const IMPERSONATOR_COOKIE = 'annetec.impersonator'

const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 dias — mesmo teto de apps/api/src/lib/auth.ts
const secure = process.env.NODE_ENV === 'production'

export async function getToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(TOKEN_COOKIE)?.value ?? null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const raw = store.get(USER_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export async function saveSession(token: string, user: SessionUser): Promise<void> {
  const store = await cookies()

  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  store.set(USER_COOKIE, JSON.stringify(user), {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

/**
 * Apaga a sessão deste navegador — inclusive o token de superadmin guardado
 * por uma simulação: sair (ou cair por 401) no meio de uma impersonação não
 * pode deixar a sessão de superadmin esquecida num cookie.
 */
export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(TOKEN_COOKIE)
  store.delete(USER_COOKIE)
  store.delete(IMPERSONATOR_COOKIE)
}

/**
 * Guarda o token de superadmin ATUAL (antes de ser sobrescrito) e o caminho
 * pra onde voltar, depois troca a sessão ativa pela sessão impersonada.
 *
 * Existe porque só há um cookie de sessão global (`TOKEN_COOKIE`) — entrar
 * como outra pessoa sobrescreveria a sessão de superadmin sem deixar como
 * voltar. `stopImpersonation`/`endImpersonation` desfaz isto. Não usa o
 * `stopImpersonating` do próprio Better Auth: ele depende de um cookie
 * assinado que só existe do lado do Better Auth, que este app nunca repassa
 * (ver o comentário em `tenantsService.impersonateMember`, na API).
 */
export async function beginImpersonation(
  newToken: string,
  newUser: SessionUser,
  returnTo: string,
): Promise<void> {
  const store = await cookies()
  const currentToken = store.get(TOKEN_COOKIE)?.value

  if (currentToken) {
    store.set(IMPERSONATOR_COOKIE, JSON.stringify({ token: currentToken, returnTo }), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }

  await saveSession(newToken, newUser)
}

/** Lê o token de superadmin guardado por `beginImpersonation`, se houver uma simulação ativa. */
export async function getImpersonatorSession(): Promise<{ token: string; returnTo: string } | null> {
  const store = await cookies()
  const raw = store.get(IMPERSONATOR_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as { token: string; returnTo: string }
  } catch {
    return null
  }
}

/** Encerra a simulação — chamado depois que a sessão de superadmin já foi restaurada. */
export async function endImpersonation(): Promise<void> {
  const store = await cookies()
  store.delete(IMPERSONATOR_COOKIE)
}
