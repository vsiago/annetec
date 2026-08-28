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

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(TOKEN_COOKIE)
  store.delete(USER_COOKIE)
}
