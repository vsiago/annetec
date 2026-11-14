import {
  CANDIDATURA_MAX_FILE_BYTES,
  ERROR_CODES,
  candidaturaDadosInput,
  enviarCandidaturaInput,
  iniciarCandidaturaInput,
  recuperarAcessoCandidaturaInput,
  uploadCandidaturaDocumentoFields,
  type EscopoVendas,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { AppError, zodIssues } from '@/http/errors'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { rateLimit } from '@/lib/rate-limit'
import { readMultipart, requestMeta, sendStoredFile, uploadBodyLimit } from '@/modules/platform-onboarding/http'
import { tenantsService } from '@/modules/tenants/service'
import { candidaturaKeyGuard, candidaturaRouteId } from '../candidaturas-access-key'
import {
  arquivoDoDocumento,
  consultarCodigoIndicacao,
  enviarCandidatura,
  iniciarCandidatura,
  obterCandidaturaPublica,
  recuperarAcessoCandidatura,
  removerDocumentoCandidatura,
  respostaFalsaDeCandidatura,
  salvarDadosCandidatura,
  uploadDocumentoCandidatura,
  type EscopoCandidatura,
} from '../candidaturas.service'

/**
 * "Seja um parceiro comercial": rotas PÚBLICAS (sem login) das candidaturas.
 * Uma fábrica por escopo:
 *
 *   platform  /api/v1/public/vendas/candidaturas
 *   tenant    /api/v1/t/:tenantSlug/public/vendas/candidaturas  (clube resolvido pelo slug; 404 se não existe)
 *
 * O candidato não tem conta: tudo depois de `POST /` exige `?chave=` (HMAC do id),
 * senão 404. Honeypot `website` preenchido responde 201 sem gravar nada.
 */

const INICIAR_BODY_MAX = 16 * 1024
const JSON_BODY_MAX = 32 * 1024

const limiteJson = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Conteúdo grande demais para este pedido', { status: 413 })
    },
  })

export function candidaturasPublicController(scope: EscopoVendas) {
  async function escopoDe(c: Context<AppEnv>): Promise<EscopoCandidatura> {
    if (scope === 'platform') return { scope, tenantId: null, tenantSlug: null }
    const slug = c.req.param('tenantSlug')
    if (!slug) throw AppError.notFound('Inquilino')
    const tenant = await tenantsService.getPublicBySlug(slug)
    return { scope, tenantId: tenant.id, tenantSlug: tenant.slug }
  }
  const limite = (nome: string, limit: number) => rateLimit({ key: `vendas:candidaturas:${scope}:${nome}`, limit, windowMs: 60 * 60_000 })

  return new Hono<AppEnv>()
    .post('/', limite('iniciar', 5), limiteJson(INICIAR_BODY_MAX), async c => {
      let corpo: unknown
      try {
        corpo = await c.req.json()
      } catch {
        throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Corpo da requisição inválido')
      }
      const escopo = await escopoDe(c)
      const website = (corpo as { website?: unknown } | null)?.website
      if (typeof website === 'string' && website.trim() !== '') return created(c, respostaFalsaDeCandidatura(escopo))
      const parsed = iniciarCandidaturaInput.safeParse(corpo)
      if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
      return created(c, await iniciarCandidatura(escopo, parsed.data, requestMeta(c)))
    })

    .post('/recuperar-acesso', limite('recuperar', 5), limiteJson(JSON_BODY_MAX), json(recuperarAcessoCandidaturaInput), async c => {
      await recuperarAcessoCandidatura(await escopoDe(c), c.req.valid('json').email)
      return ok(c, { enviado: true as const })
    })

    .get('/codigo/:codigo', limite('codigo', 120), async c => ok(c, await consultarCodigoIndicacao(await escopoDe(c), c.req.param('codigo'))))

    .get('/:id', candidaturaKeyGuard, async c => ok(c, await obterCandidaturaPublica(await escopoDe(c), candidaturaRouteId(c))))

    .put('/:id/dados', candidaturaKeyGuard, limiteJson(JSON_BODY_MAX), json(candidaturaDadosInput), async c =>
      ok(c, await salvarDadosCandidatura(await escopoDe(c), candidaturaRouteId(c), c.req.valid('json'))),
    )

    .post('/:id/documentos', limite('upload', 30), candidaturaKeyGuard, uploadBodyLimit(CANDIDATURA_MAX_FILE_BYTES), async c => {
      const { file, fields } = await readMultipart(c)
      const parsed = uploadCandidaturaDocumentoFields.safeParse(fields)
      if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
      return created(c, await uploadDocumentoCandidatura(await escopoDe(c), candidaturaRouteId(c), file, parsed.data))
    })

    .delete('/:id/documentos/:docId', candidaturaKeyGuard, async c =>
      ok(c, await removerDocumentoCandidatura(await escopoDe(c), candidaturaRouteId(c), candidaturaRouteId(c, 'docId'))),
    )

    .get('/:id/documentos/:docId/arquivo', candidaturaKeyGuard, async c =>
      sendStoredFile(c, await arquivoDoDocumento(await escopoDe(c), candidaturaRouteId(c), candidaturaRouteId(c, 'docId')), 'private'),
    )

    .post('/:id/enviar', candidaturaKeyGuard, limiteJson(JSON_BODY_MAX), json(enviarCandidaturaInput), async c =>
      ok(c, await enviarCandidatura(await escopoDe(c), candidaturaRouteId(c), c.req.valid('json'), requestMeta(c))),
    )
}
