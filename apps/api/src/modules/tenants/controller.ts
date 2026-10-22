import {
  addTenantResponsibleInput,
  createTenantInput,
  paginationQuery,
  resetTenantUserPasswordInput,
  setTenantMemberAccessInput,
  tenantIntegration,
  tenantRole,
  tenantStatus,
  updateTenantInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { recordAudit } from '@/lib/audit'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { tenantMembersService } from './members.service'
import { tenantsService } from './service'

const idParam = z.object({ id: z.string().uuid() })
const userParam = z.object({ id: z.string().uuid(), userId: z.string() })
const papelParam = z.object({ id: z.string().uuid(), papel: tenantRole })
const listQuery = paginationQuery.extend({ status: tenantStatus.optional() })

/**
 * Administração de inquilinos — território exclusivo da equipe Annetec
 * (`/admin/inquilinos` no frontend). Montado em `/api/v1/platform/tenants`.
 */
export const tenantsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', query(listQuery), async c => {
    const { page, perPage, status, q } = c.req.valid('query')
    const { items, total } = await tenantsService.list({ page, perPage, status, search: q })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .post('/', json(createTenantInput), async c => {
    const { tenant, ownerPassword } = await tenantsService.create(c.req.valid('json'))
    await recordAudit(c, {
      action: 'tenant.created',
      resource: 'tenant',
      resourceId: tenant.id,
      organizationId: tenant.id,
      metadata: { slug: tenant.slug, document: tenant.document, status: tenant.status },
    })
    // A senha provisória aparece UMA vez, na resposta do wizard.
    return created(c, { tenant, ownerPassword })
  })

  /**
   * A Annetec operando como operadora — clientes diretos, fora da lista de
   * inquilinos. O frontend usa o `slug` devolvido aqui para reaproveitar as
   * mesmas rotas `/api/v1/t/:tenantSlug/*` (contratos, financeiro, catálogo)
   * já existentes: sessão de plataforma passa livre por `requireTenantRole`.
   */
  .get('/operador', async c => {
    const operator = await tenantsService.getOperator()
    if (!operator) return ok(c, null)
    return ok(c, operator)
  })

  .get('/:id', param(idParam), async c => ok(c, await tenantsService.getById(c.req.valid('param').id)))

  .patch('/:id', param(idParam), json(updateTenantInput), async c => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const tenant = await tenantsService.update(id, patch)
    await recordAudit(c, {
      action: 'tenant.updated',
      resource: 'tenant',
      resourceId: id,
      organizationId: id,
      metadata: { campos: Object.keys(patch), status: tenant.status },
    })
    return ok(c, tenant)
  })

  .delete('/:id', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const tenant = await tenantsService.cancel(id)
    await recordAudit(c, {
      action: 'tenant.cancelled',
      resource: 'tenant',
      resourceId: id,
      organizationId: id,
      metadata: { slug: tenant.slug },
    })
    return ok(c, tenant)
  })

  .get('/:id/integration', param(idParam), async c =>
    ok(c, await tenantsService.getIntegration(c.req.valid('param').id)),
  )

  /**
   * Auditado sem o corpo: `appToken` e `apiPassword` passam por aqui e não
   * podem cair na trilha. Só os códigos padrão, que não são segredo.
   */
  .put('/:id/integration', param(idParam), json(tenantIntegration), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const integration = await tenantsService.saveIntegration(id, input)
    await recordAudit(c, {
      action: 'tenant.integration_saved',
      resource: 'tenant_integration',
      resourceId: id,
      organizationId: id,
      metadata: {
        baseUrl: input.baseUrl,
        enabled: input.enabled,
        defaultConvenioCodigo: input.defaultConvenioCodigo ?? null,
        defaultGrupoCodigo: input.defaultGrupoCodigo ?? null,
      },
    })
    return ok(c, integration)
  })

  .post('/:id/integration/test', param(idParam), async c =>
    ok(c, { ok: await tenantsService.testIntegration(c.req.valid('param').id) }),
  )

  /**
   * Lê no ERP os códigos que antes eram copiados do portal na mão (grupo,
   * filial, convênio, produto, grupo de produtor). Só leitura.
   */
  .get('/:id/integration/discovery', param(idParam), async c =>
    ok(c, await tenantsService.discoverIntegrationDefaults(c.req.valid('param').id)),
  )

  /**
   * Usuários do inquilino vistos pela plataforma. A rota equivalente do
   * inquilino é por slug; esta é por id, que é a chave da tela de gestão.
   * Devolve `{ items, activeAdmins }`: cada conta com último acesso e o que
   * "Remover" faria com ela; `activeAdmins` = responsáveis ativos.
   */
  .get('/:id/usuarios', param(idParam), async c =>
    ok(c, await tenantMembersService.list(c.req.valid('param').id)),
  )

  /**
   * Adiciona um responsável (admin) ao clube. Conta nova nasce com senha
   * gerada no servidor, que só sai no convite com a marca do clube; conta já
   * existente recebe o convite sem senha. Conta da plataforma: 403.
   */
  .post(
    '/:id/responsaveis',
    requirePlatformRole('superadmin'),
    param(idParam),
    json(addTenantResponsibleInput),
    async c => {
      const { id } = c.req.valid('param')
      const resultado = await tenantMembersService.addResponsible(id, c.req.valid('json'))
      await recordAudit(c, {
        action: 'tenant_user.responsible_added',
        resource: 'tenant_user',
        resourceId: resultado.userId,
        organizationId: id,
        metadata: {
          email: resultado.email,
          contaNova: resultado.accountCreated,
          papelAnterior: resultado.previousRole,
          convite: `club_staff_invite:${resultado.emailStatus}`,
        },
      })
      const member = await tenantMembersService.getSummary(id, resultado.userId)
      return created(c, { member, accountCreated: resultado.accountCreated, emailStatus: resultado.emailStatus })
    },
  )

  /**
   * Ativa/desativa o vínculo da pessoa com o clube. Desativar derruba na
   * hora as sessões dela ligadas ao clube (todas, se era o único vínculo) e
   * é recusado (422) para o último responsável ativo.
   */
  .patch(
    '/:id/usuarios/:userId/acesso',
    requirePlatformRole('superadmin'),
    param(userParam),
    json(setTenantMemberAccessInput),
    async c => {
      const { id, userId } = c.req.valid('param')
      const { active } = c.req.valid('json')
      const { email, role, ...resultado } = await tenantMembersService.setAccess(
        id,
        userId,
        active,
        c.get('auth')?.user.id ?? null,
      )
      await recordAudit(c, {
        action: active ? 'tenant_user.reactivated' : 'tenant_user.deactivated',
        resource: 'tenant_user',
        resourceId: userId,
        organizationId: id,
        metadata: { email, role, sessoesRevogadas: resultado.revokedSessions, via: 'plataforma' },
      })
      return ok(c, resultado)
    },
  )

  /**
   * Remove a pessoa do clube. Último vínculo de conta comum → a conta é
   * excluída. Com histórico que a exclusão quebraria (vendas como vendedor,
   * assinatura) só desativa o acesso e responde 422 com o motivo.
   */
  .delete('/:id/usuarios/:userId', requirePlatformRole('superadmin'), param(userParam), async c => {
    const { id, userId } = c.req.valid('param')
    const resultado = await tenantMembersService.remove(id, userId, c.get('auth')?.user.id ?? null)

    if (resultado.outcome === 'blocked') {
      await recordAudit(c, {
        action: 'tenant_user.deactivated',
        resource: 'tenant_user',
        resourceId: userId,
        organizationId: id,
        metadata: {
          email: resultado.email,
          motivo: 'remoção bloqueada',
          bloqueio: resultado.reason,
          sessoesRevogadas: resultado.revokedSessions,
          via: 'plataforma',
        },
      })
      throw AppError.businessRule(
        `Não é possível remover ${resultado.email}: ${resultado.reason}. O acesso foi desativado no lugar.`,
      )
    }

    await recordAudit(c, {
      action: resultado.accountDeleted ? 'platform.user.deleted' : 'tenant_user.removed',
      resource: resultado.accountDeleted ? 'user' : 'tenant_user',
      resourceId: userId,
      organizationId: id,
      metadata: {
        email: resultado.email,
        contaExcluida: resultado.accountDeleted,
        sessoesRevogadas: resultado.revokedSessions,
        via: 'plataforma',
      },
    })
    const { outcome: _outcome, ...corpo } = resultado
    return ok(c, corpo)
  })

  /**
   * Reset administrativo de senha. Omitir `password` gera uma provisória e
   * devolve UMA vez — a partir daí ela não existe mais em lugar nenhum
   * legível, igual à senha do wizard de criação.
   */
  .post(
    '/:id/usuarios/:userId/senha',
    requirePlatformRole('superadmin'),
    param(userParam),
    json(resetTenantUserPasswordInput),
    async c => {
      const { id, userId } = c.req.valid('param')
      const { password } = c.req.valid('json')
      const resultado = await tenantsService.resetUserPassword(
        id,
        userId,
        c.req.raw.headers,
        password,
      )
      // A senha em si nunca entra na trilha — só o fato de ter sido trocada.
      await recordAudit(c, {
        action: 'tenant_user.password_reset',
        resource: 'tenant_user',
        resourceId: userId,
        organizationId: id,
        metadata: { email: resultado.email, gerada: !password },
      })
      return ok(c, resultado)
    },
  )

  /**
   * Entrar como o inquilino escolhendo a conta pelo PAPEL — o que os atalhos
   * "Portal do admin / vendedor / beneficiário" usam para abrir em um clique.
   * Mesma sessão, mesmo corte de papel e mesma trilha da rota por usuário
   * abaixo; só a escolha de QUEM é automática.
   */
  .post('/:id/entrar-como/:papel', requirePlatformRole('superadmin'), param(papelParam), async c => {
    const { id, papel } = c.req.valid('param')
    const { role, email, ...sessao } = await tenantsService.impersonateRole(id, papel, c.req.raw.headers)
    await recordAudit(c, {
      action: 'tenant_user.impersonate_start',
      resource: 'tenant_user',
      resourceId: sessao.user.id,
      organizationId: id,
      metadata: { email, role, via: 'atalho' },
    })
    return ok(c, sessao)
  })

  /**
   * Entrar como um usuário do inquilino — sessão real, por até 1h (default
   * do plugin `admin`). Tão sensível quanto reset de senha — acesso silencioso
   * à conta, não só troca de credencial — então mesmo corte de papel.
   */
  .post(
    '/:id/usuarios/:userId/entrar-como',
    requirePlatformRole('superadmin'),
    param(userParam),
    async c => {
      const { id, userId } = c.req.valid('param')
      const { role, email, ...sessao } = await tenantsService.impersonateMember(id, userId, c.req.raw.headers)
      await recordAudit(c, {
        action: 'tenant_user.impersonate_start',
        resource: 'tenant_user',
        resourceId: userId,
        organizationId: id,
        metadata: { email, role },
      })
      return ok(c, sessao)
    },
  )

  /** Apura quais operações o token do inquilino pode executar de fato. */
  .post('/:id/integration/capabilities', param(idParam), async c =>
    ok(c, await tenantsService.probeCapabilities(c.req.valid('param').id)),
  )
