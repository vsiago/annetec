import {
  createTenantUserInput,
  memberAccessStatus,
  paginationQuery,
  tenantRole,
  updateTenantUserInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { recordAudit } from '@/lib/audit'
import { notifyClientSignup } from '@/lib/notifications'
import { runInBackground } from '@/lib/background'
import { logger } from '@/lib/logger'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { sendOnboardingWelcome } from '@/modules/club-billing/onboarding.service'
import { resetTenantUserPassword, sendStaffInvite } from './access.service'
import { sellersService, usersService } from './service'

const idParam = z.object({ id: z.string().uuid() })
const listQuery = paginationQuery.extend({ role: tenantRole.optional(), accessStatus: memberAccessStatus.optional() })

/** Usuários do inquilino. Montado em `/api/v1/t/:tenantSlug/usuarios`. */
export const usersController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin'))

  .get('/', query(listQuery), async c => {
    const { page, perPage, role, accessStatus, q } = c.req.valid('query')
    const { items, total } = await usersService.list({
      tenantId: tenantOf(c).id,
      page,
      perPage,
      role,
      accessStatus,
      search: q,
    })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  /**
   * Cadastro pelo admin. A senha é gerada no servidor e vai só por e-mail:
   *  - admin/vendedor: convite com a marca do clube (`club_staff_invite`),
   *    com a senha provisória quando a conta é nova;
   *  - associado: sem senha (entra por CPF + e-mail ou Google) — recebe as
   *    boas-vindas do clube (régua "assine seu plano", passo D0, idempotente).
   */
  .post('/', json(createTenantUserInput), async c => {
    const tenantId = tenantOf(c).id
    const { tenantUser, provisionalPassword } = await usersService.create(tenantId, c.req.valid('json'))

    let convite: string | null = null
    if (tenantUser.role === 'client') {
      runInBackground(sendOnboardingWelcome(tenantId, tenantUser.id), error =>
        logger.error({ err: error, tenantId, userId: tenantUser.id }, 'Falha nas boas-vindas do associado'),
      )
      convite = 'club_subscribe_welcome'
      await notifyClientSignup({ organizationId: tenantId, userId: tenantUser.id, via: 'admin', personName: tenantUser.name })
    } else {
      const sent = await sendStaffInvite({
        tenantId,
        userId: tenantUser.id,
        email: tenantUser.email,
        name: tenantUser.name,
        role: tenantUser.role,
        password: provisionalPassword,
      })
      convite = `club_staff_invite:${sent.status}`
    }

    // A senha provisória nunca entra na trilha — só se a conta era nova.
    await recordAudit(c, {
      action: 'tenant_user.created',
      resource: 'tenant_user',
      resourceId: tenantUser.id,
      metadata: { email: tenantUser.email, role: tenantUser.role, contaNova: provisionalPassword !== null, convite },
    })
    return created(c, tenantUser)
  })

  /**
   * Redefinição de senha pelo ADMIN DO CLUBE: gera uma provisória no
   * servidor e a envia por e-mail ao próprio usuário (marca do clube). A
   * senha não volta na resposta. Só vale para membro DESTE clube e nunca
   * para conta da equipe da plataforma (que tem a rota própria em
   * `/platform/tenants/:id/usuarios/:userId/senha`).
   */
  .post('/:id/redefinir-senha', param(idParam), async c => {
    const session = c.get('auth')
    if (session?.membership.scope !== 'tenant') {
      throw AppError.forbidden('Rota do administrador do clube')
    }
    const { id } = c.req.valid('param')
    const resultado = await resetTenantUserPassword(tenantOf(c).id, id, session.user.id)
    await recordAudit(c, {
      action: 'tenant_user.password_reset',
      resource: 'tenant_user',
      resourceId: id,
      metadata: { email: resultado.email, role: resultado.role, gerada: true, emailStatus: resultado.emailStatus },
    })
    return ok(c, { email: resultado.email, emailStatus: resultado.emailStatus })
  })

  .get('/:id', param(idParam), async c =>
    ok(c, await usersService.getById(tenantOf(c).id, c.req.valid('param').id)),
  )

  .patch('/:id', param(idParam), json(updateTenantUserInput), async c => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const tenantUser = await usersService.update(tenantOf(c).id, id, patch, c.get('auth')?.user.id ?? null)
    await recordAudit(c, {
      action: 'tenant_user.updated',
      resource: 'tenant_user',
      resourceId: id,
      metadata: { campos: Object.keys(patch), role: tenantUser.role },
    })
    return ok(c, tenantUser)
  })

  /**
   * "Excluir cadastro": associado tem a assinatura viva cancelada, o vínculo
   * marcado `removed` e as sessões derrubadas (volta pelo site reativando o
   * mesmo cadastro, sem assinatura); equipe é desativada com a regra do
   * último responsável. Nada é apagado.
   */
  .delete('/:id', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const { tenantUser, result } = await usersService.remove(tenantOf(c).id, id, c.get('auth')?.user.id ?? null)
    await recordAudit(c, {
      action: 'tenant_user.deactivated',
      resource: 'tenant_user',
      resourceId: id,
      metadata: {
        email: tenantUser.email,
        role: tenantUser.role,
        vinculo: tenantUser.accessStatus,
        vinculoAnterior: result.previousStatus,
        assinaturasCanceladas: result.canceledSubscriptions,
        sessoesRevogadas: result.revokedSessions,
      },
    })
    return ok(c, tenantUser)
  })

  /** Bloqueia: como excluir, mas sem volta pelo site até o desbloqueio. */
  .post('/:id/bloquear', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const { tenantUser, result } = await usersService.block(tenantOf(c).id, id, c.get('auth')?.user.id ?? null)
    await recordAudit(c, {
      action: 'tenant_user.blocked',
      resource: 'tenant_user',
      resourceId: id,
      metadata: {
        email: tenantUser.email,
        role: tenantUser.role,
        vinculoAnterior: result.previousStatus,
        assinaturasCanceladas: result.canceledSubscriptions,
        sessoesRevogadas: result.revokedSessions,
      },
    })
    return ok(c, tenantUser)
  })

  /** Desbloqueia: associado volta a `removed` (pode voltar pelo site); equipe volta a `active`. */
  .post('/:id/desbloquear', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const { tenantUser, status } = await usersService.unblock(tenantOf(c).id, id)
    await recordAudit(c, {
      action: 'tenant_user.unblocked',
      resource: 'tenant_user',
      resourceId: id,
      metadata: { email: tenantUser.email, role: tenantUser.role, vinculo: status },
    })
    return ok(c, tenantUser)
  })

  /** Vincula um vendedor a um produtor já existente na Digital Saúde. */
  .put(
    '/:id/produtor',
    param(idParam),
    json(
      z.object({
        codigo: z.string().min(1),
        login: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
      }),
    ),
    async c => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const produtor = await sellersService.linkProdutor(tenantOf(c).id, id, input)
      // Sem `login`/`password` na trilha: a senha do produtor é segredo.
      await recordAudit(c, {
        action: 'seller.produtor_linked',
        resource: 'seller_profile',
        resourceId: id,
        metadata: { codigo: input.codigo, comSenha: Boolean(input.password) },
      })
      return ok(c, produtor)
    },
  )

  /** Cria o produtor no ERP e já vincula ao vendedor. */
  .post(
    '/:id/produtor',
    param(idParam),
    json(
      z.object({
        nome: z.string().min(1),
        email: z.string().email(),
        numeroDocumento: z.string().optional(),
        grupoProdutorCodigo: z.string().min(1),
      }),
    ),
    async c => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const produtor = await sellersService.createProdutor(tenantOf(c).id, id, input)
      // Cria cadastro permanente no ERP, sem delete do outro lado.
      await recordAudit(c, {
        action: 'seller.produtor_created',
        resource: 'seller_profile',
        resourceId: id,
        metadata: { codigo: produtor.codigo, grupoProdutorCodigo: input.grupoProdutorCodigo },
      })
      return created(c, produtor)
    },
  )
