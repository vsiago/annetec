import 'server-only'
import { NextResponse } from 'next/server'
import { MANAGED_DOCUMENT_MAX_FILE_BYTES } from '@annetec/contracts'
import { forwardedClientHeaders } from '@/lib/api/internal-proxy'
import { isSafeBrandSegment } from '@/lib/api/brand-proxy'
import { getToken } from '@/lib/api/session'

/**
 * Envio de documento da conta gerenciada, pelo admin do clube:
 * `POST /api/clube/<slug>/recebimento/documentos/<groupId>` →
 * `POST /api/v1/t/<slug>/faturamento/configuracoes/recebimento/gerenciada/documentos/<groupId>`.
 * O token vive em cookie httpOnly: é aqui que vira `Authorization: Bearer`.
 * A resposta da API (envelope) volta intacta.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
const MULTIPART_OVERHEAD = 64 * 1024

type Context = { params: Promise<{ tenant: string; groupId: string }> }

function failure(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST(request: Request, { params }: Context) {
  const { tenant, groupId } = await params
  if (!isSafeBrandSegment('slug', tenant)) return failure(404, 'NOT_FOUND', 'Clube não encontrado.')
  if (!groupId || groupId.length > 200 || /[\\/?#%]|\.\./.test(groupId) || groupId.trim() !== groupId) {
    return failure(400, 'BAD_REQUEST', 'Documento inválido.')
  }

  const token = await getToken()
  if (!token) return failure(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre de novo para continuar.')

  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > MANAGED_DOCUMENT_MAX_FILE_BYTES + MULTIPART_OVERHEAD) {
    return failure(413, 'PAYLOAD_TOO_LARGE', 'O arquivo passa de 10 MB.')
  }

  let body: FormData
  try {
    body = await request.formData()
  } catch {
    return failure(400, 'BAD_REQUEST', 'Não foi possível ler o arquivo enviado.')
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${API_BASE_URL}/api/v1/t/${tenant}/faturamento/configuracoes/recebimento/gerenciada/documentos/${encodeURIComponent(groupId)}`,
      {
        method: 'POST',
        body,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...forwardedClientHeaders(request.headers),
        },
        cache: 'no-store',
      },
    )
  } catch (error) {
    console.error('[recebimento/documentos] API indisponível:', error)
    return failure(502, 'UPSTREAM_UNAVAILABLE', 'O servidor não respondeu. Tente novamente em instantes.')
  }

  const text = await upstream.text()
  if (!text) return failure(upstream.status || 502, 'INTERNAL_ERROR', 'O servidor não respondeu em formato válido.')

  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}
