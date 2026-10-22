import {
  BRAND_LOGO_MAX_BYTES,
  cancelOnboardingInput,
  ERROR_CODES,
  KYB_MAX_FILE_BYTES,
  onboardingBrandInput,
  onboardingCompanyInput,
  onboardingContractAcceptanceInput,
  onboardingPaymentInput,
  onboardingPeopleInput,
  onboardingPlanInput,
  recoverOnboardingAccessInput,
  startOnboardingInput,
  uploadKybDocumentFields,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { platformDemoToolsEnabled } from '@/config/env'
import { z } from 'zod'
import { AppError, zodIssues } from '@/http/errors'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { lookupCnpj } from '@/integrations/cnpj'
import { rateLimit } from '@/lib/rate-limit'
import { findFile } from '@/lib/storage'
import {
  allowCrossOriginEmbed,
  isUuid,
  proposalKeyGuard,
  readMultipart,
  requestMeta,
  routeId,
  sendStoredFile,
  uploadBodyLimit,
} from './http'
import { listPublicPlanOffers } from './plans'
import {
  acceptContract,
  cancelProposal,
  checkSlugAvailability,
  documentFile,
  getApplicantView,
  recoverAccess,
  removeDocument,
  restoreMaskedCpfs,
  saveBrand,
  saveCompany,
  savePayment,
  savePeople,
  savePlan,
  startProposal,
  submitProposal,
  uploadDocument,
  uploadLogo,
} from './service'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const slugQuery = z.object({
  slug: z.string().trim().min(1).max(80),
  /** Proposta que pergunta (o slug dela mesma não conta como ocupado). */
  proposta: z.string().uuid().optional(),
})

/**
 * Contratação pública — `/api/v1/public/contratacao` (blueprint da plataforma
 * §0.3, auth P/K). As rotas `/propostas/:id/*` exigem `?chave=` (HMAC da
 * proposta); chave errada = 404. Toda escrita devolve a visão atualizada.
 */
export const onboardingPublicController = new Hono<AppEnv>()
  .get('/planos', async c => ok(c, await listPublicPlanOffers()))

  .get('/cnpj/:cnpj', rateLimit({ key: 'contratacao:cnpj', limit: 30, windowMs: MINUTE }), async c =>
    ok(c, { ...(await lookupCnpj(c.req.param('cnpj'))), demoToolsEnabled: platformDemoToolsEnabled }),
  )

  .get('/slug-disponivel', rateLimit({ key: 'contratacao:slug', limit: 60, windowMs: MINUTE }), query(slugQuery), async c => {
    const { slug, proposta } = c.req.valid('query')
    return ok(c, await checkSlugAvailability(slug, proposta ?? null))
  })

  .post('/propostas', rateLimit({ key: 'contratacao:propostas', limit: 5, windowMs: HOUR }), json(startOnboardingInput), async c =>
    created(c, await startProposal(c.req.valid('json'), requestMeta(c))),
  )

  .post(
    '/propostas/recuperar-acesso',
    rateLimit({ key: 'contratacao:recuperar', limit: 10, windowMs: HOUR }),
    json(recoverOnboardingAccessInput),
    async c => ok(c, await recoverAccess(c.req.valid('json'))),
  )

  .get('/propostas/:id', proposalKeyGuard, async c => ok(c, await getApplicantView(routeId(c), { sync: true })))

  .put('/propostas/:id/plano', proposalKeyGuard, json(onboardingPlanInput), async c => {
    const id = routeId(c)
    await savePlan(id, c.req.valid('json'))
    return ok(c, await getApplicantView(id))
  })

  .put('/propostas/:id/empresa', proposalKeyGuard, json(onboardingCompanyInput), async c => {
    const id = routeId(c)
    await saveCompany(id, c.req.valid('json'))
    return ok(c, await getApplicantView(id))
  })

  // Sem `json(...)`: o CPF mascarado de pessoa já gravada é restaurado ANTES do zod.
  .put('/propostas/:id/pessoas', proposalKeyGuard, async c => {
    const id = routeId(c)
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      throw new AppError(ERROR_CODES.MALFORMED_REQUEST, 'Corpo JSON inválido')
    }
    const parsed = onboardingPeopleInput.safeParse(await restoreMaskedCpfs(id, raw))
    if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
    await savePeople(id, parsed.data)
    return ok(c, await getApplicantView(id))
  })

  .put('/propostas/:id/marca', proposalKeyGuard, json(onboardingBrandInput), async c => {
    const id = routeId(c)
    await saveBrand(id, c.req.valid('json'))
    return ok(c, await getApplicantView(id))
  })

  .put('/propostas/:id/pagamento', proposalKeyGuard, json(onboardingPaymentInput), async c => {
    const id = routeId(c)
    await savePayment(id, c.req.valid('json'))
    return ok(c, await getApplicantView(id))
  })

  .post('/propostas/:id/documentos', proposalKeyGuard, uploadBodyLimit(KYB_MAX_FILE_BYTES), async c => {
    const id = routeId(c)
    const { file, fields } = await readMultipart(c)
    const parsed = uploadKybDocumentFields.safeParse(fields)
    if (!parsed.success) throw AppError.validation(zodIssues(parsed.error))
    await uploadDocument(id, file, parsed.data)
    return created(c, await getApplicantView(id))
  })

  .delete('/propostas/:id/documentos/:docId', proposalKeyGuard, async c => {
    const id = routeId(c)
    await removeDocument(id, routeId(c, 'docId'))
    return ok(c, await getApplicantView(id))
  })

  .get('/propostas/:id/documentos/:docId/arquivo', proposalKeyGuard, async c =>
    sendStoredFile(c, await documentFile(routeId(c), routeId(c, 'docId')), 'private'),
  )

  .post('/propostas/:id/logo', proposalKeyGuard, uploadBodyLimit(BRAND_LOGO_MAX_BYTES), async c => {
    const { file } = await readMultipart(c)
    return created(c, await uploadLogo(routeId(c), file))
  })

  .post('/propostas/:id/aceite', proposalKeyGuard, json(onboardingContractAcceptanceInput), async c => {
    const id = routeId(c)
    await acceptContract(id, c.req.valid('json'), requestMeta(c))
    return ok(c, await getApplicantView(id))
  })

  .post('/propostas/:id/enviar', proposalKeyGuard, async c => {
    const id = routeId(c)
    await submitProposal(id)
    return ok(c, await getApplicantView(id))
  })

  .post('/propostas/:id/cancelar', proposalKeyGuard, json(cancelOnboardingInput), async c => {
    const id = routeId(c)
    await cancelProposal(id, c.req.valid('json').reason, null)
    return ok(c, await getApplicantView(id))
  })

/**
 * Arquivos PÚBLICOS (logo do clube) — `/api/v1/public/arquivos/:fileId`.
 * Só `visibility = public`; privado ou excluído = 404. Cache de 1 dia.
 */
export const publicFilesController = new Hono<AppEnv>().get('/:fileId', allowCrossOriginEmbed, async c => {
  const fileId = c.req.param('fileId')
  const file = isUuid(fileId) ? await findFile(fileId) : null
  if (!file || file.visibility !== 'public' || file.deletedAt) throw AppError.notFound('Arquivo')
  return sendStoredFile(c, file, 'public')
})
