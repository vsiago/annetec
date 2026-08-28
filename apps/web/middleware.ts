import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

/**
 * Rastreabilidade — uma linha por navegação, enviada pra API real (não é
 * mock). Roda em toda página (ver `config.matcher`), sem bloquear a
 * navegação: a chamada à API vai por `event.waitUntil`, e qualquer falha ali
 * é só perdida — nunca derruba a página.
 *
 * `annetec.visitor_id` identifica o navegador antes de qualquer login (ex.:
 * alguém batendo na home de um inquilino antes de entrar) — sem ele, só
 * daria pra contar quem já está autenticado. `annetec.token`, quando
 * presente, é repassado como Bearer pra API já saber quem é a pessoa sem
 * round-trip extra.
 */
const VISITOR_COOKIE = 'annetec.visitor_id'
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365 // 1 ano
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const response = NextResponse.next()

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value
  if (!visitorId) {
    visitorId = crypto.randomUUID()
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      maxAge: VISITOR_MAX_AGE,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  const token = request.cookies.get('annetec.token')?.value

  event.waitUntil(
    fetch(`${API_BASE_URL}/api/v1/activity/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        kind: 'page_view',
        path: request.nextUrl.pathname,
        visitorId,
      }),
    }).catch(() => {
      // Rastreabilidade não pode nunca atrapalhar a navegação real.
    }),
  )

  return response
}

export const config = {
  matcher: [
    // Toda navegação de página, menos assets internos do Next e arquivos estáticos.
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
}
