import { NextResponse, type NextRequest } from 'next/server'
import { BRAND_LOGO_MAX_BYTES, KYB_MAX_FILE_BYTES } from '@annetec/contracts'

/**
 * Proxy do upload da contratação: browser → aqui → API.
 *
 * Existe porque o upload precisa de barra de progresso (XHR, que server
 * action não dá) e porque server action tem teto de corpo de 1 MB — documento
 * vai até 4 MB. `?tipo=documento` → `POST …/propostas/:id/documentos`
 * (multipart `file` + `kind` + `personId`); `?tipo=logo` → `POST …/logo`.
 * A chave da proposta vem em `?chave=` e segue para a API, que decide.
 *
 * A resposta da API (envelope `{ success, data | error }`) volta intacta,
 * com o mesmo status — a tela mostra a mensagem específica (413, 422…).
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

/** Folga do multipart (cabeçalhos das partes e campos de texto). */
const MULTIPART_OVERHEAD = 64 * 1024

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const tipo = request.nextUrl.searchParams.get('tipo')
  const chave = request.nextUrl.searchParams.get('chave') ?? ''

  if (tipo !== 'documento' && tipo !== 'logo') {
    return failure(400, 'BAD_REQUEST', 'Tipo de envio inválido.')
  }

  const limit = tipo === 'logo' ? BRAND_LOGO_MAX_BYTES : KYB_MAX_FILE_BYTES
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limit + MULTIPART_OVERHEAD) {
    return failure(
      413,
      'PAYLOAD_TOO_LARGE',
      tipo === 'logo' ? 'O logo pode ter no máximo 1 MB.' : 'O arquivo pode ter no máximo 4 MB.',
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return failure(400, 'BAD_REQUEST', 'Não foi possível ler o arquivo enviado.')
  }

  const target = new URL(
    `${API_BASE_URL}/api/v1/public/contratacao/propostas/${encodeURIComponent(id)}/${tipo === 'logo' ? 'logo' : 'documentos'}`,
  )
  target.searchParams.set('chave', chave)

  const forwardedFor = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip')
  const userAgent = request.headers.get('user-agent')

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      body: form,
      headers: {
        accept: 'application/json',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
      cache: 'no-store',
    })
  } catch (error) {
    console.error('[contratar/upload] API indisponível:', error)
    return failure(502, 'UPSTREAM_UNAVAILABLE', 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.')
  }

  const text = await upstream.text()
  if (!text) {
    return failure(upstream.status || 502, 'INTERNAL_ERROR', 'A API não respondeu em formato válido.')
  }
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  })
}
