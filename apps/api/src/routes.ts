import { Hono } from 'hono'
import { activityAdminController, activityIngestController } from '@/modules/activity/controller'
import { authController } from '@/modules/auth/controller'
import { billingController } from '@/modules/billing/controller'
import { catalogController } from '@/modules/catalog/controller'
import { contractsController, membershipCardsController } from '@/modules/contracts/controller'
import { crmController } from '@/modules/crm/controller'
import { healthController } from '@/modules/health/controller'
import { networkController } from '@/modules/network/controller'
import { platformUsersController } from '@/modules/platform-users/controller'
import { tenantPlansController } from '@/modules/tenant-plans/controller'
import { tenantsController } from '@/modules/tenants/controller'
import { tenantPublicController } from '@/modules/tenants/public-controller'
import { usersController } from '@/modules/users/controller'
import type { AppEnv } from '@/http/types'

/**
 * Mapa de rotas da API v1.
 *
 * Dois espaços, espelhando as duas áreas do frontend:
 *   /api/v1/platform/*            → `/admin` (equipe Annetec)
 *   /api/v1/t/:tenantSlug/*       → `/[tenant]` (admin, vendedor, cliente)
 *
 * O slug na URL é o mesmo do App Router, então cada tela do Next tem uma rota
 * de API com o caminho equivalente.
 */
export const routes = new Hono<AppEnv>()
  .route('/', healthController)
  .route('/api/v1/activity', activityIngestController)
  .route('/api/v1/platform/activity', activityAdminController)
  .route('/api/v1/auth', authController)
  .route('/api/v1/platform/tenants', tenantsController)
  .route('/api/v1/platform/users', platformUsersController)
  .route('/api/v1/platform/plans', tenantPlansController)
  .route('/api/v1/t/:tenantSlug/public', tenantPublicController)
  .route('/api/v1/t/:tenantSlug/usuarios', usersController)
  .route('/api/v1/t/:tenantSlug/contratos', contractsController)
  .route('/api/v1/t/:tenantSlug/carteirinhas', membershipCardsController)
  .route('/api/v1/t/:tenantSlug/catalogo', catalogController)
  .route('/api/v1/t/:tenantSlug/financeiro', billingController)
  .route('/api/v1/t/:tenantSlug/crm', crmController)
  .route('/api/v1/t/:tenantSlug/rede', networkController)

export type ApiRoutes = typeof routes
