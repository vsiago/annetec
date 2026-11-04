import { Hono } from 'hono'
import { activityAdminController, activityIngestController } from '@/modules/activity/controller'
import { authController } from '@/modules/auth/controller'
import { billingController } from '@/modules/billing/controller'
import { catalogController } from '@/modules/catalog/controller'
import { clubBillingAdminController } from '@/modules/club-billing/admin-controller'
import { clubPortalController } from '@/modules/club-billing/portal-controller'
import { clubCheckoutController } from '@/modules/club-billing/public-controller'
import { webhooksController } from '@/modules/club-billing/webhook-controller'
import { contractsController, membershipCardsController } from '@/modules/contracts/controller'
import { crmController } from '@/modules/crm/controller'
import { healthController } from '@/modules/health/controller'
import { networkController } from '@/modules/network/controller'
import { platformNotificationsController, tenantNotificationsController } from '@/modules/notifications/controller'
import { onboardingPlatformController, platformEmailsController } from '@/modules/platform-onboarding/platform-controller'
import { onboardingPublicController, publicFilesController } from '@/modules/platform-onboarding/public-controller'
import { platformBillingController } from '@/modules/platform-billing/admin-controller'
import { platformPublicInvoiceController } from '@/modules/platform-billing/public-controller'
import { tenantPlatformSubscriptionController } from '@/modules/platform-billing/tenant-controller'
import { platformWebhookController } from '@/modules/platform-billing/webhook-controller'
import { holdingController } from '@/modules/holding/controller'
import { managedAccountsPlatformController } from '@/modules/managed-account/platform-controller'
import { transferValidationController } from '@/modules/managed-account/transfer-validation'
import { platformAccessGuard } from '@/http/middleware/platform-access'
import { platformApprovalsController } from '@/modules/platform-approvals/controller'
import { platformUsersController } from '@/modules/platform-users/controller'
import { platformSellerController } from '@/modules/platform-sales/seller-controller'
import { platformSalesTeamController } from '@/modules/platform-sales/team-controller'
import { supportController } from '@/modules/support/controller'
import { tenantBrandingController } from '@/modules/tenant-branding/controller'
import { tenantPlansController } from '@/modules/tenant-plans/controller'
import { tenantsController } from '@/modules/tenants/controller'
import { tenantPublicController } from '@/modules/tenants/public-controller'
import { usersController } from '@/modules/users/controller'
import type { AppEnv } from '@/http/types'

/**
 * Mapa de rotas da API v1.
 *
 * Dois espaços, espelhando as duas áreas do frontend:
 *   /api/v1/platform/*            → `/admin` (equipe Annetec; o vendedor ANNETEC
 *                                   só tem `/api/v1/platform/vendas/*`)
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
  .route('/api/v1/webhooks', webhooksController)
  // Validação de transferências/saques (mecanismo de segurança do Asaas da ANNETEC, vale para as subcontas).
  .route('/api/v1/webhooks/asaas/validacao-transferencia', transferValidationController)
  // Contratação B2B da plataforma (Q1): jornada pública, arquivos, compliance e caixa de saída.
  .route('/api/v1/public/contratacao', onboardingPublicController)
  .route('/api/v1/public/arquivos', publicFilesController)
  .route('/api/v1/platform/onboarding', onboardingPlatformController)
  // Central de Aprovações do console: contagem das três filas (clubes, contas gerenciadas, descontos).
  .route('/api/v1/platform/aprovacoes', platformApprovalsController)
  .route('/api/v1/platform/emails', platformEmailsController)
  // Cobrança da plataforma, guard de restrição e holding (Q2). O guard vem ANTES
  // de toda rota de inquilino; `/public`, `/cliente` e `/assinatura-annetec` passam sempre.
  .route('/api/v1/webhooks/asaas-plataforma', platformWebhookController)
  .route('/api/v1/public/faturas-annetec', platformPublicInvoiceController)
  .route('/api/v1/platform/billing', platformBillingController)
  // Contas de recebimento gerenciadas pela ANNETEC (subcontas Asaas dos clubes).
  .route('/api/v1/platform/contas-gerenciadas', managedAccountsPlatformController)
  .route('/api/v1/platform/holding', holdingController)
  .route('/api/v1/platform/notificacoes', platformNotificationsController)
  // Vendas da plataforma: área do vendedor ANNETEC (`platform_seller`) e a
  // gestão comercial da equipe. Prefixos separados de propósito: o guard de um
  // nunca alcança as rotas do outro.
  .route('/api/v1/platform/vendas', platformSellerController)
  .route('/api/v1/platform/comercial', platformSalesTeamController)
  .use('/api/v1/t/:tenantSlug/*', platformAccessGuard)
  .route('/api/v1/t/:tenantSlug/assinatura-annetec', tenantPlatformSubscriptionController)
  .route('/api/v1/t/:tenantSlug/public/checkout', clubCheckoutController)
  .route('/api/v1/t/:tenantSlug/public', tenantPublicController)
  .route('/api/v1/t/:tenantSlug/marca', tenantBrandingController)
  .route('/api/v1/t/:tenantSlug/usuarios', usersController)
  .route('/api/v1/t/:tenantSlug/contratos', contractsController)
  .route('/api/v1/t/:tenantSlug/carteirinhas', membershipCardsController)
  .route('/api/v1/t/:tenantSlug/catalogo', catalogController)
  .route('/api/v1/t/:tenantSlug/financeiro', billingController)
  .route('/api/v1/t/:tenantSlug/crm', crmController)
  .route('/api/v1/t/:tenantSlug/rede', networkController)
  .route('/api/v1/t/:tenantSlug/atendimentos', supportController)
  .route('/api/v1/t/:tenantSlug/faturamento', clubBillingAdminController)
  .route('/api/v1/t/:tenantSlug/cliente', clubPortalController)
  .route('/api/v1/t/:tenantSlug/notificacoes', tenantNotificationsController)

export type ApiRoutes = typeof routes
