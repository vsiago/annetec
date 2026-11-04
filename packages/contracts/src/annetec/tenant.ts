import { z } from 'zod'
import { cep, cnpj, email, hexColor, slug, telefone, uf, uuid } from '../common/primitives'
import { tenantKind, tenantStatus } from './enums'

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

/** URL http(s) — em dev o logo vem de `http://localhost`, então não força https. */
const brandAssetUrl = z
  .string()
  .url()
  .refine(value => /^https?:\/\//i.test(value), 'A URL deve começar com http:// ou https://')

/**
 * Marca do clube. As URLs apontam para a rota pública de arquivos da API
 * (`/api/v1/public/arquivos/:id`), nunca para o bucket. Os ícones são gerados
 * a partir do logo (`iconSource: 'auto'`) ou do símbolo enviado à parte
 * (`'upload'`).
 */
export const tenantBranding = z.object({
  logoUrl: brandAssetUrl.optional(),
  logoLightUrl: brandAssetUrl.optional(),
  /** 512×512, transparente — ícone do app e avatar. */
  iconUrl: brandAssetUrl.optional(),
  /** 192×192, transparente — manifest/PWA. */
  iconSmallUrl: brandAssetUrl.optional(),
  /** 180×180, OPACO (fundo branco) — tela inicial do iOS. */
  appleTouchIconUrl: brandAssetUrl.optional(),
  /** 48×48, transparente — favicon. */
  faviconUrl: brandAssetUrl.optional(),
  iconSource: z.enum(['auto', 'upload']).optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
})
export type TenantBranding = z.infer<typeof tenantBranding>

/** Resposta do envio de logo/ícone: marca já mesclada + o que o sistema aprendeu da imagem. */
export const logoUploadResult = z.object({
  branding: tenantBranding,
  /** Até 2 cores dominantes sugeridas (`#RRGGBB`); vazio no ícone. */
  suggestedColors: z.array(hexColor),
  warnings: z.array(z.string()),
  width: z.number().int(),
  height: z.number().int(),
  hasTransparency: z.boolean(),
})
export type LogoUploadResult = z.infer<typeof logoUploadResult>

/** Mesmo formato para o envio do ícone. */
export const iconUploadResult = logoUploadResult
export type IconUploadResult = LogoUploadResult

/** `PATCH /t/:tenantSlug/marca` — só as cores; o logo não é tocado. */
export const updateTenantBrandColorsInput = z.object({
  primaryColor: hexColor,
  secondaryColor: hexColor,
})
export type UpdateTenantBrandColorsInput = z.infer<typeof updateTenantBrandColorsInput>

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
  /** Exigidos por `/plano/procurarPorProduto` e `POST /produtor/`. */
  defaultProdutoCodigo: z.string().optional(),
  defaultGrupoProdutorCodigo: z.string().optional(),
  enabled: z.boolean().default(true),
})
export type TenantIntegration = z.infer<typeof tenantIntegration>

export const tenantIntegrationPublic = tenantIntegration
  .omit({ appToken: true, apiPassword: true })
  .extend({
    configured: z.boolean(),
    lastCheckedAt: z.string().datetime().nullable(),
    lastCheckOk: z.boolean().nullable(),
    /** Mapa operação → permitido, apurado contra o ERP. */
    capabilities: z.record(z.boolean()).nullable(),
    capabilitiesCheckedAt: z.string().datetime().nullable(),
  })
export type TenantIntegrationPublic = z.infer<typeof tenantIntegrationPublic>

/**
 * O que dá para descobrir sozinho no ERP na hora de configurar um inquilino.
 * Antes disto, grupo/filial/convênio/produto/grupoProdutor eram copiados do
 * portal da Digital Saúde na mão — e `grupoProdutor` nem campo tinha.
 */
export const integrationDiscovery = z.object({
  convenios: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  produtos: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  filiais: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  grupos: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  gruposProdutor: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  estipulantes: z.array(z.object({ codigo: z.string(), nome: z.string() })),
  /** Preenchido quando a descoberta encontrou uma única opção. */
  sugestao: z.object({
    defaultConvenioCodigo: z.string().nullable(),
    defaultProdutoCodigo: z.string().nullable(),
    defaultFilialCodigo: z.string().nullable(),
    defaultGrupoCodigo: z.string().nullable(),
    defaultGrupoProdutorCodigo: z.string().nullable(),
  }),
  avisos: z.array(z.string()),
})
export type IntegrationDiscovery = z.infer<typeof integrationDiscovery>

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
  kind: tenantKind.default('operator'),
  createdAt: z.string().datetime(),
  trialEndsAt: z.string().datetime().nullable(),
})
export type Tenant = z.infer<typeof tenant>

export const createTenantInput = tenant
  .omit({ id: true, createdAt: true, status: true, trialEndsAt: true, kind: true })
  .extend({
    status: tenantStatus.default('trial'),
    /** Usuário admin criado junto com o inquilino (fluxo do wizard). */
    ownerName: z.string().min(1),
    ownerEmail: email,
    integration: tenantIntegration.optional(),
  })
export type CreateTenantInput = z.infer<typeof createTenantInput>

export const updateTenantInput = createTenantInput
  .omit({ ownerName: true, ownerEmail: true, slug: true, branding: true })
  .extend({
    /**
     * Só as cores: as imagens (logo, ícones) mudam apenas pelos endpoints de
     * logo/ícone. Campos de imagem enviados aqui são descartados pelo parse.
     */
    branding: tenantBranding.pick({ primaryColor: true, secondaryColor: true }),
  })
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

export const updateTenantPlanInput = createTenantPlanInput.partial()
export type UpdateTenantPlanInput = z.infer<typeof updateTenantPlanInput>
