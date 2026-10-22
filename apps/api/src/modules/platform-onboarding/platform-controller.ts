import {
  approveOnboardingInput,
  cancelOnboardingInput,
  listOnboardingProposalsQuery,
  listPlatformEmailsQuery,
  onboardingNoteInput,
  provisionOnboardingInput,
  rejectOnboardingInput,
  requestOnboardingInfoInput,
  reviewKybDocumentInput,
  updateComplianceChecklistInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { getOutboxEmail, listOutboxEmails } from '@/lib/email/outbox'
import { secretRevealAllowed } from '@/lib/email/secrets'
import {
  addNote,
  approveProposal,
  claimProposal,
  getProposalDetail,
  issueActivationCharge,
  listProposals,
  queueSummary,
  rejectProposal,
  requestInfo,
  rerunPrechecks,
  reviewDocument,
  updateChecklist,
} from './compliance.service'
import { actorOf, isUuid, routeId, sendStoredFile } from './http'
import { provisionTenantFromProposal } from './provisioning.service'
import { cancelProposal, documentFile } from './service'

/**
 * Console de compliance — `/api/v1/platform/onboarding` (equipe ANNETEC;
 * provisionar = superadmin). Toda ação devolve o detalhe atualizado.
 */
export const onboardingPlatformController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/propostas', query(listOnboardingProposalsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listProposals(q, actorOf(c))
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/propostas/resumo', async c => ok(c, await queueSummary()))

  .get('/propostas/:id', async c => ok(c, await getProposalDetail(routeId(c))))

  .post('/propostas/:id/assumir', async c => {
    const id = routeId(c)
    await claimProposal(id, actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/prechecagens', async c => {
    const id = routeId(c)
    await rerunPrechecks(id, actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/cobranca-ativacao', async c => {
    const id = routeId(c)
    await issueActivationCharge(id, actorOf(c), { throwOnError: true })
    return ok(c, await getProposalDetail(id))
  })

  .patch('/propostas/:id/checklist', json(updateComplianceChecklistInput), async c => {
    const id = routeId(c)
    await updateChecklist(id, c.req.valid('json'), actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/documentos/:docId/revisao', json(reviewKybDocumentInput), async c => {
    const id = routeId(c)
    await reviewDocument(id, routeId(c, 'docId'), c.req.valid('json'), actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .get('/propostas/:id/documentos/:docId/arquivo', async c =>
    sendStoredFile(c, await documentFile(routeId(c), routeId(c, 'docId')), 'private'),
  )

  .post('/propostas/:id/pendencias', json(requestOnboardingInfoInput), async c => {
    const id = routeId(c)
    await requestInfo(id, c.req.valid('json'), actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/aprovar', json(approveOnboardingInput), async c => {
    const id = routeId(c)
    const input = c.req.valid('json')
    await approveProposal(id, input, actorOf(c))
    await recordAudit(c, {
      action: 'onboarding.approved',
      resource: 'onboarding_proposal',
      resourceId: id,
      metadata: { override: input.override, overrideReason: input.overrideReason ?? null },
      organizationId: null,
    })
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/reprovar', json(rejectOnboardingInput), async c => {
    const id = routeId(c)
    await rejectProposal(id, c.req.valid('json'), actorOf(c))
    await recordAudit(c, { action: 'onboarding.rejected', resource: 'onboarding_proposal', resourceId: id, organizationId: null })
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/cancelar', json(cancelOnboardingInput), async c => {
    const id = routeId(c)
    await cancelProposal(id, c.req.valid('json').reason, actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/notas', json(onboardingNoteInput), async c => {
    const id = routeId(c)
    await addNote(id, c.req.valid('json'), actorOf(c))
    return ok(c, await getProposalDetail(id))
  })

  .post('/propostas/:id/provisionar', requirePlatformRole('superadmin'), json(provisionOnboardingInput), async c => {
    const id = routeId(c)
    const input = c.req.valid('json')
    const result = await provisionTenantFromProposal(id, {
      actorUserId: actorOf(c).userId,
      waiveActivation: input.waiveActivation,
      reason: input.reason,
    })
    return ok(c, result)
  })

/** Caixa de saída — `/api/v1/platform/emails` (equipe ANNETEC). */
export const platformEmailsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', query(listPlatformEmailsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listOutboxEmails(q)
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/:id', async c => {
    const id = c.req.param('id')
    // Senha provisória lacrada só aparece para superadmin e fora de produção.
    const revealSecrets = secretRevealAllowed && c.get('auth')?.membership.platformRole === 'superadmin'
    const email = isUuid(id) ? await getOutboxEmail(id, { revealSecrets }) : null
    if (!email) throw AppError.notFound('E-mail')
    return ok(c, email)
  })
