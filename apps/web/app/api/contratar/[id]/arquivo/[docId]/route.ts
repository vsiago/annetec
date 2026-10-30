import type { NextRequest } from 'next/server'
import { forwardedClientHeaders } from '@/lib/api/internal-proxy'

/**
 * Proxy de leitura de um documento da proposta (`GET …/documentos/:docId/arquivo`),
 * para o candidato conferir o que enviou. Abre em outra aba, `inline`.
 * A chave da proposta vem em `?chave=` e a API decide (chave errada = 404).
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

function plain(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await context.params
  const chave = request.nextUrl.searchParams.get('chave') ?? ''

  const target = new URL(
    `${API_BASE_URL}/api/v1/public/contratacao/propostas/${encodeURIComponent(id)}/documentos/${encodeURIComponent(docId)}/arquivo`,
  )
  target.searchParams.set('chave', chave)

  let upstream: Response
  try {
    upstream = await fetch(target, { cache: 'no-store', headers: forwardedClientHeaders(request.headers) })
  } catch (error) {
    console.error('[contratar/arquivo] API indisponível:', error)
    return plain(502, 'A API não respondeu. Tente novamente em instantes.')
  }

  if (!upstream.ok || !upstream.body) {
    const payload = (await upstream.json().catch(() => null)) as { error?: { message?: string } } | null
    return plain(upstream.status || 502, payload?.error?.message ?? 'Arquivo indisponível.')
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': upstream.headers.get('content-disposition') ?? 'inline',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
