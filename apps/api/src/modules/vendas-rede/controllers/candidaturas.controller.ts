import { aprovarCandidaturaInput, listarCandidaturasQuery, recusarCandidaturaInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { sendStoredFile } from '@/modules/platform-onboarding/http'
import { candidaturaRouteId } from '../candidaturas-access-key'
import {
  aprovarCandidatura,
  arquivoDoDocumentoDaGestao,
  contarPendentes,
  detalharCandidatura,
  listarCandidaturas,
  recusarCandidatura,
} from '../candidaturas.service'
import { requireEscrita, requirePapel, vendasOf } from '../context'

/**
 * Gestão das candidaturas ("Seja um parceiro comercial"), só para o master do
 * escopo (equipe ANNETEC na plataforma; admin do clube no tenant):
 * `/rede/candidaturas` dentro de `/api/v1/vendas` e `/api/v1/t/:tenantSlug/vendas`.
 */
export const candidaturasController = new Hono<AppEnv>()
  .get('/rede/candidaturas', requirePapel('master'), query(listarCandidaturasQuery), async c =>
    ok(c, await listarCandidaturas(vendasOf(c), c.req.valid('query'))),
  )

  .get('/rede/candidaturas/resumo', requirePapel('master'), async c => ok(c, { pendentes: await contarPendentes(vendasOf(c)) }))

  .get('/rede/candidaturas/:id', requirePapel('master'), async c => ok(c, await detalharCandidatura(vendasOf(c), candidaturaRouteId(c))))

  .get('/rede/candidaturas/:id/documentos/:docId/arquivo', requirePapel('master'), async c =>
    sendStoredFile(c, await arquivoDoDocumentoDaGestao(vendasOf(c), candidaturaRouteId(c), candidaturaRouteId(c, 'docId')), 'private'),
  )

  .post('/rede/candidaturas/:id/aprovar', requirePapel('master'), requireEscrita, json(aprovarCandidaturaInput), async c => {
    const ctx = vendasOf(c)
    const id = candidaturaRouteId(c)
    const resultado = await aprovarCandidatura(ctx, id, c.req.valid('json'))
    await recordAudit(c, {
      action: 'vendas.candidatura_aprovada',
      resource: 'vendas_candidatura',
      resourceId: id,
      organizationId: ctx.tenantId,
      metadata: {
        scope: ctx.scope,
        atuacao: resultado.candidatura.atuacao,
        agenteId: resultado.agenteId,
        corretoraId: resultado.corretoraId,
        contaNova: resultado.convite.contaNova,
        convite: resultado.convite.status,
      },
    })
    return ok(c, { candidatura: resultado.candidatura, convite: resultado.convite })
  })

  .post('/rede/candidaturas/:id/recusar', requirePapel('master'), requireEscrita, json(recusarCandidaturaInput), async c => {
    const ctx = vendasOf(c)
    const id = candidaturaRouteId(c)
    const candidatura = await recusarCandidatura(ctx, id, c.req.valid('json'))
    await recordAudit(c, {
      action: 'vendas.candidatura_recusada',
      resource: 'vendas_candidatura',
      resourceId: id,
      organizationId: ctx.tenantId,
      metadata: { scope: ctx.scope, atuacao: candidatura.atuacao },
    })
    return ok(c, { candidatura })
  })
