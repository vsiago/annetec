import { z } from 'zod'
import { cep, cnpj, email, hexColor, slug, telefone, uf, uuid } from '../common/primitives'
import { tenantStatus } from './enums'

export const tenantAddress = z.object({
  cep,
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: uf,
})
export type TenantAddress = z.infer<typeof tenantAddress>

export const tenantBranding = z.object({
  logoUrl: z.string().url().optional(),
  logoLightUrl: z.string().url().optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
})
export type TenantBranding = z.infer<typeof tenantBranding>

/**
 * Credenciais da integração Digital Saúde por inquilino. Cada inquilino é uma
 * administradora com seu próprio par token/senhaApi — por isso a configuração
 * vive na linha do inquilino e não no ambiente do processo.
 *
 * `apiPassword` NUNCA sai da API: as respostas usam `tenantIntegrationPublic`.
 */
export const tenantIntegration = z.object({
  provider: z.literal('digitalsaude'),
  baseUrl: z.string().url().default('https://digitalsaude.com.br/api/v2'),
  appToken: z.string().min(1),
  apiPassword: z.string().min(1),
  /** Códigos fixos exigidos no POST /contrato/ desta administradora. */
  defaultGrupoCodigo: z.string().optional(),
  defaultFilialCodigo: z.string().optional(),
  defaultConvenioCodigo: z.string().optional(),
  enabled: z.boolean().default(true),
})
export type TenantIntegration = z.infer<typeof tenantIntegration>

export const tenantIntegrationPublic = tenantIntegration
  .omit({ appToken: true, apiPassword: true })
  .extend({
    configured: z.boolean(),
    lastCheckedAt: z.string().datetime().nullable(),
    lastCheckOk: z.boolean().nullable(),
  })
export type TenantIntegrationPublic = z.infer<typeof tenantIntegrationPublic>

export const tenant = z.object({
  id: uuid,
  slug,
  name: z.string().min(1),
  legalName: z.string().min(1),
  document: cnpj,
  email,
  phone: telefone,
  address: tenantAddress,
  branding: tenantBranding,
  planId: uuid,
  status: tenantStatus,
  createdAt: z.string().datetime(),
  trialEndsAt: z.string().datetime().nullable(),
})
export type Tenant = z.infer<typeof tenant>

export const createTenantInput = tenant
  .omit({ id: true, createdAt: true, status: true, trialEndsAt: true })
  .extend({
    status: tenantStatus.default('trial'),
    /** Usuário admin criado junto com o inquilino (fluxo do wizard). */
    ownerName: z.string().min(1),
    ownerEmail: email,
    integration: tenantIntegration.optional(),
  })
export type CreateTenantInput = z.infer<typeof createTenantInput>

export const updateTenantInput = createTenantInput
  .omit({ ownerName: true, ownerEmail: true, slug: true })
  .partial()
export type UpdateTenantInput = z.infer<typeof updateTenantInput>

/** Plano de assinatura que a Annetec vende ao inquilino. */
export const tenantPlan = z.object({
  id: uuid,
  name: z.string().min(1),
  priceMonthly: z.number().nonnegative(),
  memberLimit: z.number().int().positive(),
  features: z.array(z.string()),
})
export type TenantPlan = z.infer<typeof tenantPlan>

export const createTenantPlanInput = tenantPlan.omit({ id: true })
export type CreateTenantPlanInput = z.infer<typeof createTenantPlanInput>
