var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../packages/contracts/src/common/primitives.ts
import { z } from "zod";
var onlyDigits = (value) => value.replace(/\D/g, "");
var cpf = z.string().transform(onlyDigits).refine((v) => v.length === 11, "CPF deve conter 11 d\xEDgitos").refine(isValidCpf, "CPF inv\xE1lido");
var cnpj = z.string().transform(onlyDigits).refine((v) => v.length === 14, "CNPJ deve conter 14 d\xEDgitos").refine(isValidCnpj, "CNPJ inv\xE1lido");
var numeroDocumento = z.string().transform(onlyDigits).refine((v) => v.length === 11 || v.length === 14, "Documento deve ser um CPF ou CNPJ").refine((v) => v.length === 11 ? isValidCpf(v) : isValidCnpj(v), "Documento inv\xE1lido");
var cep = z.string().transform(onlyDigits).refine((v) => v.length === 8, "CEP deve conter 8 d\xEDgitos");
var UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
];
var uf = z.enum(UFS);
var email = z.string().trim().toLowerCase().email("E-mail inv\xE1lido");
var telefone = z.string().transform(onlyDigits).refine((v) => v.length >= 10 && v.length <= 11, "Telefone deve conter DDD + n\xFAmero");
var dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato yyyy-MM-dd");
var slug = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug deve conter apenas letras min\xFAsculas, n\xFAmeros e h\xEDfens");
var hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor deve estar em hexadecimal");
var uuid = z.string().uuid();
function isValidCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (slice) => {
    let sum = 0;
    for (let i2 = 0; i2 < slice; i2++) sum += Number(digits[i2]) * (slice + 1 - i2);
    const rest = sum * 10 % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}
function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (slice) => {
    const weights = slice === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i2 = 0; i2 < slice; i2++) sum += Number(digits[i2]) * weights[i2];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}

// ../../packages/contracts/src/common/errors.ts
import { z as z2 } from "zod";
var ERROR_CODES = {
  // 400
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
  // 401 / 403
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  TENANT_MISMATCH: "TENANT_MISMATCH",
  // 404 / 409
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  // 422
  BUSINESS_RULE_VIOLATION: "BUSINESS_RULE_VIOLATION",
  // 429
  RATE_LIMITED: "RATE_LIMITED",
  // 5xx
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // Integração Digital Saúde
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UPSTREAM_UNAUTHORIZED: "UPSTREAM_UNAUTHORIZED",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  UPSTREAM_CONTRACT_MISMATCH: "UPSTREAM_CONTRACT_MISMATCH",
  INTEGRATION_NOT_CONFIGURED: "INTEGRATION_NOT_CONFIGURED"
};
var errorCode = z2.enum(
  Object.values(ERROR_CODES)
);
var ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  MALFORMED_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  TENANT_MISMATCH: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_EXISTS: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
  UPSTREAM_UNAUTHORIZED: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_CONTRACT_MISMATCH: 502,
  INTEGRATION_NOT_CONFIGURED: 503
};
var fieldIssue = z2.object({
  path: z2.string(),
  message: z2.string()
});
var apiError = z2.object({
  code: errorCode,
  message: z2.string(),
  issues: z2.array(fieldIssue).optional(),
  requestId: z2.string().optional()
});

// ../../packages/contracts/src/common/envelope.ts
import { z as z3 } from "zod";
var pageMeta = z3.object({
  page: z3.number().int().positive(),
  perPage: z3.number().int().positive(),
  total: z3.number().int().nonnegative(),
  totalPages: z3.number().int().nonnegative()
});
var errorEnvelope = z3.object({
  success: z3.literal(false),
  error: apiError
});

// ../../packages/contracts/src/common/pagination.ts
import { z as z4 } from "zod";
var paginationQuery = z4.object({
  page: z4.coerce.number().int().positive().default(1),
  perPage: z4.coerce.number().int().positive().max(200).default(20),
  sort: z4.string().optional(),
  q: z4.string().trim().min(1).optional()
});

// ../../packages/contracts/src/annetec/enums.ts
import { z as z5 } from "zod";
var platformRole = z5.enum(["superadmin", "platform_admin"]);
var tenantRole = z5.enum(["admin", "seller", "client"]);
var tenantStatus = z5.enum(["trial", "active", "suspended", "cancelled"]);
var contractStatus = z5.enum([
  "pendente",
  "produzido",
  "ativo",
  "suspenso",
  "cancelado",
  "desconhecido"
]);
var invoiceStatus = z5.enum(["aberta", "paga", "vencida", "cancelada", "desconhecido"]);
var receiptStatus = z5.enum(["emitido", "pago", "cancelado", "desconhecido"]);
var beneficiaryKind = z5.enum(["titular", "dependente", "agregado"]);
var BENEFICIARY_KIND_BY_UPSTREAM_ID = {
  1: "titular",
  2: "dependente",
  3: "agregado"
};
var UPSTREAM_ID_BY_BENEFICIARY_KIND = {
  titular: 1,
  dependente: 2,
  agregado: 3
};
var registrationFeeKind = z5.enum(["por_contrato", "por_vida"]);
var leadStatus = z5.enum([
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "closed",
  "lost"
]);
var saleStatus = z5.enum(["pending", "confirmed", "cancelled"]);
var partnerCategory = z5.enum([
  "health",
  "dental",
  "pharmacy",
  "wellness",
  "food",
  "education",
  "other"
]);
var benefitCategory = z5.enum(["health", "dental", "pharmacy", "funeral", "discount"]);
var appointmentStatus = z5.enum(["aguardando", "em_atendimento", "concluido"]);
var activeStatus = z5.enum(["active", "inactive"]);

// ../../packages/contracts/src/annetec/auth.ts
import { z as z6 } from "zod";
var authScope = z6.enum(["platform", "tenant"]);
var loginInput = z6.object({
  email,
  password: z6.string().min(8, "A senha deve ter ao menos 8 caracteres"),
  /**
   * Normalmente ausente — o e-mail já identifica a conta, e o servidor
   * resolve sozinho se é plataforma ou em qual inquilino a pessoa tem
   * vínculo. Só é preciso informar para forçar um inquilino específico
   * quando a mesma conta é admin/vendedor em mais de um.
   */
  tenantSlug: slug.optional()
});
var clientPortalLoginInput = z6.object({
  tenantSlug: slug.optional(),
  cpf,
  email
});
var registerInput = z6.object({
  tenantSlug: slug,
  name: z6.string().min(1),
  email,
  cpf,
  password: z6.string().min(8)
});
var sessionUser = z6.object({
  id: z6.string(),
  name: z6.string(),
  email,
  avatarUrl: z6.string().nullable(),
  scope: authScope,
  /** Preenchido quando `scope === 'platform'`. */
  platformRole: platformRole.nullable(),
  /** Preenchidos quando `scope === 'tenant'`. */
  tenantId: z6.string().nullable(),
  tenantSlug: z6.string().nullable(),
  tenantRole: tenantRole.nullable()
});
var authSession = z6.object({
  token: z6.string(),
  user: sessionUser
});
var forgotPasswordInput = z6.object({ email });
var changePasswordInput = z6.object({
  currentPassword: z6.string().min(1),
  newPassword: z6.string().min(8)
});

// ../../packages/contracts/src/annetec/platform-user.ts
import { z as z7 } from "zod";
var platformUser = z7.object({
  id: z7.string(),
  name: z7.string(),
  email,
  phone: z7.string().nullable(),
  role: platformRole,
  avatarUrl: z7.string().nullable(),
  createdAt: z7.string().datetime()
});
var createPlatformUserInput = z7.object({
  name: z7.string().min(1),
  email,
  phone: z7.string().optional(),
  role: platformRole,
  password: z7.string().min(8)
});

// ../../packages/contracts/src/annetec/tenant.ts
import { z as z8 } from "zod";
var tenantAddress = z8.object({
  cep,
  street: z8.string().min(1),
  number: z8.string().min(1),
  complement: z8.string().optional(),
  neighborhood: z8.string().min(1),
  city: z8.string().min(1),
  state: uf
});
var tenantBranding = z8.object({
  logoUrl: z8.string().url().optional(),
  logoLightUrl: z8.string().url().optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor
});
var tenantIntegration = z8.object({
  provider: z8.literal("digitalsaude"),
  baseUrl: z8.string().url().default("https://digitalsaude.com.br/api/v2"),
  appToken: z8.string().min(1),
  apiPassword: z8.string().min(1),
  /** Códigos fixos exigidos no POST /contrato/ desta administradora. */
  defaultGrupoCodigo: z8.string().optional(),
  defaultFilialCodigo: z8.string().optional(),
  defaultConvenioCodigo: z8.string().optional(),
  enabled: z8.boolean().default(true)
});
var tenantIntegrationPublic = tenantIntegration.omit({ appToken: true, apiPassword: true }).extend({
  configured: z8.boolean(),
  lastCheckedAt: z8.string().datetime().nullable(),
  lastCheckOk: z8.boolean().nullable()
});
var tenant = z8.object({
  id: uuid,
  slug,
  name: z8.string().min(1),
  legalName: z8.string().min(1),
  document: cnpj,
  email,
  phone: telefone,
  address: tenantAddress,
  branding: tenantBranding,
  planId: uuid,
  status: tenantStatus,
  createdAt: z8.string().datetime(),
  trialEndsAt: z8.string().datetime().nullable()
});
var createTenantInput = tenant.omit({ id: true, createdAt: true, status: true, trialEndsAt: true }).extend({
  status: tenantStatus.default("trial"),
  /** Usuário admin criado junto com o inquilino (fluxo do wizard). */
  ownerName: z8.string().min(1),
  ownerEmail: email,
  integration: tenantIntegration.optional()
});
var updateTenantInput = createTenantInput.omit({ ownerName: true, ownerEmail: true, slug: true }).partial();
var tenantPlan = z8.object({
  id: uuid,
  name: z8.string().min(1),
  priceMonthly: z8.number().nonnegative(),
  memberLimit: z8.number().int().positive(),
  features: z8.array(z8.string())
});
var createTenantPlanInput = tenantPlan.omit({ id: true });

// ../../packages/contracts/src/annetec/membership.ts
import { z as z9 } from "zod";
var tenantUser = z9.object({
  id: uuid,
  tenantId: uuid,
  name: z9.string().min(1),
  email,
  role: tenantRole,
  phone: z9.string().nullable(),
  avatarUrl: z9.string().url().nullable(),
  active: z9.boolean(),
  createdAt: z9.string().datetime()
});
var createTenantUserInput = tenantUser.omit({ id: true, tenantId: true, createdAt: true, avatarUrl: true, active: true }).extend({
  password: z9.string().min(8).optional(),
  active: z9.boolean().default(true)
});
var updateTenantUserInput = createTenantUserInput.partial();
var sellerProfile = z9.object({
  userId: uuid,
  region: z9.string().nullable(),
  salesGoal: z9.number().nonnegative(),
  totalSales: z9.number().nonnegative(),
  commissionRate: z9.number().min(0).max(1),
  /** `codigo` do produtor correspondente na Digital Saúde. */
  upstreamProdutorCodigo: z9.string().nullable(),
  /** Login do produtor no upstream, usado nos endpoints de recibo. */
  upstreamProdutorLogin: z9.string().nullable()
});
var address = z9.object({
  street: z9.string().nullable(),
  number: z9.string().nullable(),
  complement: z9.string().nullable(),
  neighborhood: z9.string().nullable(),
  city: z9.string().nullable(),
  state: uf.nullable(),
  zipCode: z9.string().nullable()
});
var beneficiary = z9.object({
  id: uuid,
  contractId: uuid,
  upstreamCodigo: z9.string().nullable(),
  kind: beneficiaryKind,
  name: z9.string(),
  cpf: z9.string().nullable(),
  birthDate: z9.string().nullable(),
  motherName: z9.string().nullable(),
  relationship: z9.string().nullable(),
  gender: z9.string().nullable(),
  email: z9.string().nullable(),
  phone: z9.string().nullable(),
  address: address.nullable(),
  monthlyFee: z9.number().nullable(),
  effectiveDate: z9.string().nullable(),
  /** `linkCarteiraProvisoria` do upstream. */
  provisionalCardUrl: z9.string().nullable(),
  status: z9.string().nullable()
});
var contract = z9.object({
  id: uuid,
  tenantId: uuid,
  upstreamCodigo: z9.string(),
  proposalNumber: z9.string().nullable(),
  holderName: z9.string().nullable(),
  status: contractStatus,
  /** `statusContrato.nome` original, preservado para auditoria. */
  upstreamStatus: z9.string().nullable(),
  signedAt: z9.string().nullable(),
  dueDay: z9.number().int().min(1).max(31).nullable(),
  monthlyValue: z9.number().nullable(),
  outstandingBalance: z9.number().nullable(),
  planCodigo: z9.string().nullable(),
  planName: z9.string().nullable(),
  convenioCodigo: z9.string().nullable(),
  convenioName: z9.string().nullable(),
  sellerUpstreamCodigo: z9.string().nullable(),
  /** Vinculos locais Annetec, usados nas regras de visibilidade. */
  clientUserId: uuid.nullable(),
  sellerUserId: uuid.nullable(),
  beneficiaries: z9.array(beneficiary),
  syncedAt: z9.string().datetime().nullable()
});
var createContractInput = z9.object({
  proposalNumber: z9.string().min(1),
  signedAt: dateOnly,
  dueDay: z9.number().int().min(1).max(31),
  planCodigo: z9.string().min(1),
  sellerId: uuid.optional(),
  notes: z9.string().optional(),
  optionalCodes: z9.array(z9.string()).optional(),
  holder: z9.object({
    name: z9.string().min(1),
    cpf,
    birthDate: dateOnly,
    email,
    phone: telefone,
    motherName: z9.string().optional(),
    genderId: z9.number().int().optional(),
    maritalStatusId: z9.number().int().optional(),
    address: z9.object({
      street: z9.string().min(1),
      number: z9.string().min(1),
      complement: z9.string().optional(),
      neighborhood: z9.string().min(1),
      city: z9.string().min(1),
      state: uf,
      zipCode: z9.string().min(8)
    })
  }),
  dependents: z9.array(
    z9.object({
      name: z9.string().min(1),
      cpf: cpf.optional(),
      birthDate: dateOnly,
      relationshipId: z9.number().int(),
      kind: beneficiaryKind.default("dependente"),
      motherName: z9.string().optional(),
      genderId: z9.number().int().optional()
    })
  ).default([])
});
var membershipCard = z9.object({
  contractId: uuid,
  beneficiaryId: uuid,
  holderName: z9.string(),
  cardNumber: z9.string(),
  planName: z9.string().nullable(),
  status: contractStatus,
  effectiveDate: z9.string().nullable(),
  provisionalCardUrl: z9.string().nullable()
});
var declarePathologyInput = z9.object({
  beneficiaryUpstreamCodigo: z9.string().min(1),
  cid: z9.string().optional(),
  name: z9.string().min(1),
  description: z9.string().optional(),
  eventYear: z9.string().optional(),
  questionNumber: z9.string().optional()
});
var attachDocumentInput = z9.object({
  contractUpstreamCodigo: z9.string().min(1),
  fileName: z9.string().min(1),
  fileUrl: z9.string().url()
});

// ../../packages/contracts/src/annetec/catalog.ts
import { z as z10 } from "zod";
var healthPlan = z10.object({
  codigo: z10.string(),
  name: z10.string(),
  productCodigo: z10.string().nullable(),
  productName: z10.string().nullable(),
  operatorName: z10.string().nullable(),
  operatorAns: z10.string().nullable(),
  operatorLogoUrl: z10.string().nullable(),
  accommodation: z10.string().nullable()
});
var convenio = z10.object({
  codigo: z10.string(),
  name: z10.string(),
  registrationFee: z10.number().nullable(),
  registrationFeeKind: registrationFeeKind.nullable(),
  productCodigo: z10.string().nullable(),
  branches: z10.array(z10.object({ codigo: z10.string(), name: z10.string() }))
});
var waitingPeriod = z10.object({
  codigo: z10.string(),
  name: z10.string()
});
var priceTableEntry = z10.object({
  id: z10.number().int().nullable(),
  planCodigo: z10.string().nullable(),
  planName: z10.string().nullable(),
  ageRangeName: z10.string().nullable(),
  ageFrom: z10.number().int().nullable(),
  ageTo: z10.number().int().nullable(),
  chargeValue: z10.number().nullable(),
  netValue: z10.number().nullable(),
  effectiveDate: z10.string().nullable()
});
var priceTable = z10.object({
  codigo: z10.string(),
  name: z10.string(),
  effectiveDate: z10.string().nullable(),
  groupCodigo: z10.string().nullable(),
  entries: z10.array(priceTableEntry)
});
var quoteInput = z10.object({
  name: z10.string().min(1),
  state: uf,
  lives: z10.array(
    z10.object({
      age: z10.number().int().min(0).max(120),
      relationshipId: z10.number().int()
    })
  ).min(1)
});
var quoteResult = z10.object({
  plans: z10.array(healthPlan),
  quotedAt: z10.string().datetime()
});
var partner = z10.object({
  id: uuid,
  tenantId: uuid,
  name: z10.string().min(1),
  category: partnerCategory,
  discountPercent: z10.number().min(0).max(100),
  address: z10.string().nullable(),
  phone: z10.string().nullable(),
  city: z10.string().nullable(),
  state: uf.nullable(),
  status: activeStatus
});
var createPartnerInput = partner.omit({ id: true, tenantId: true });
var benefit = z10.object({
  id: uuid,
  tenantId: uuid,
  name: z10.string().min(1),
  description: z10.string(),
  category: benefitCategory,
  discountPercent: z10.number().min(0).max(100).nullable(),
  provider: z10.string().nullable(),
  locations: z10.array(z10.string())
});
var createBenefitInput = benefit.omit({ id: true, tenantId: true });

// ../../packages/contracts/src/annetec/billing.ts
import { z as z11 } from "zod";
var invoice = z11.object({
  upstreamCodigo: z11.string(),
  contractUpstreamCodigo: z11.string().nullable(),
  number: z11.number().int().nullable(),
  year: z11.number().int().nullable(),
  month: z11.number().int().nullable(),
  issuedAt: z11.string().nullable(),
  dueAt: z11.string().nullable(),
  paidAt: z11.string().nullable(),
  amount: z11.number().nullable(),
  status: invoiceStatus,
  upstreamStatus: z11.string().nullable(),
  invoiceUrl: z11.string().nullable(),
  receiptUrl: z11.string().nullable(),
  /** Linha digitável do boleto. */
  barcodeLine: z11.string().nullable(),
  beneficiaryName: z11.string().nullable()
});
var listInvoicesQuery = z11.object({
  contractCodigo: z11.string().min(1),
  status: invoiceStatus.optional(),
  /** `idStatusFatura` cru, quando o chamador já conhece o código do upstream. */
  upstreamStatusId: z11.coerce.number().int().optional()
});
var paymentStatement = z11.object({
  upstreamCodigo: z11.string(),
  calendarYear: z11.number().nullable(),
  referenceYear: z11.number().nullable(),
  cpf: z11.string().nullable(),
  amount: z11.number().nullable(),
  documentUrl: z11.string().nullable()
});
var commissionEntry = z11.object({
  upstreamCodigo: z11.string().nullable(),
  installment: z11.number().int().nullable(),
  postedAt: z11.string().nullable(),
  dueAt: z11.string().nullable(),
  description: z11.string().nullable(),
  amount: z11.number().nullable(),
  installmentAmount: z11.number().nullable(),
  holderName: z11.string().nullable(),
  kind: z11.string().nullable()
});
var commissionReceipt = z11.object({
  upstreamCodigo: z11.string(),
  issuedAt: z11.string().nullable(),
  paidAt: z11.string().nullable(),
  cancelledAt: z11.string().nullable(),
  amount: z11.number().nullable(),
  status: receiptStatus,
  upstreamStatus: z11.string().nullable(),
  invoiceNumber: z11.string().nullable(),
  invoiceAmount: z11.number().nullable(),
  notes: z11.string().nullable(),
  documentUrl: z11.string().nullable(),
  entries: z11.array(commissionEntry)
});
var listCommissionReceiptsQuery = z11.object({
  sellerId: uuid.optional(),
  status: z11.enum(["emitido", "pago"]).default("emitido")
});
var sendOverdueInvoicesInput = z11.object({ contractCodigo: z11.string().min(1) });
var sendMembershipCardInput = z11.object({ contractCodigo: z11.string().min(1) });

// ../../packages/contracts/src/annetec/crm.ts
import { z as z12 } from "zod";
var interaction = z12.object({
  id: uuid,
  leadId: uuid,
  type: z12.enum(["call", "email", "meeting", "note", "whatsapp"]),
  description: z12.string().min(1),
  occurredAt: z12.string().datetime(),
  authorId: uuid.nullable()
});
var createInteractionInput = interaction.omit({
  id: true,
  leadId: true,
  authorId: true
});
var lead = z12.object({
  id: uuid,
  tenantId: uuid,
  name: z12.string().min(1),
  email: email.nullable(),
  phone: z12.string().nullable(),
  source: z12.string().nullable(),
  status: leadStatus,
  notes: z12.string().nullable(),
  estimatedValue: z12.number().nonnegative().nullable(),
  sellerId: uuid.nullable(),
  createdAt: z12.string().datetime(),
  updatedAt: z12.string().datetime(),
  interactions: z12.array(interaction).default([])
});
var createLeadInput = lead.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  interactions: true
});
var updateLeadInput = createLeadInput.partial();
var sale = z12.object({
  id: uuid,
  tenantId: uuid,
  leadId: uuid.nullable(),
  clientUserId: uuid.nullable(),
  clientName: z12.string(),
  sellerId: uuid,
  sellerName: z12.string(),
  planCodigo: z12.string().nullable(),
  planName: z12.string().nullable(),
  value: z12.number().nonnegative(),
  commission: z12.number().nonnegative(),
  status: saleStatus,
  soldAt: z12.string().datetime(),
  /** `codigo` do contrato gerado na Digital Saúde, quando houver. */
  contractUpstreamCodigo: z12.string().nullable()
});
var createSaleInput = sale.omit({
  id: true,
  tenantId: true,
  sellerName: true,
  commission: true
});
var salesGoal = z12.object({
  id: uuid,
  tenantId: uuid,
  sellerId: uuid,
  month: z12.number().int().min(1).max(12),
  year: z12.number().int().min(2020).max(2100),
  target: z12.number().nonnegative(),
  achieved: z12.number().nonnegative(),
  commissionRate: z12.number().min(0).max(1)
});
var upsertSalesGoalInput = salesGoal.omit({ id: true, tenantId: true, achieved: true });
var appointment = z12.object({
  id: uuid,
  tenantId: uuid,
  clientUserId: uuid.nullable(),
  clientName: z12.string(),
  description: z12.string(),
  status: appointmentStatus,
  protocol: z12.string().nullable(),
  createdAt: z12.string().datetime()
});
var createAppointmentInput = appointment.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  protocol: true,
  status: true
});

// ../../packages/contracts/src/digitalsaude/models.ts
import { z as z13 } from "zod";
var s = () => z13.string().nullish();
var n = () => z13.number().nullish();
var i = () => z13.number().int().nullish();
var dsIdNome = z13.object({ id: i(), nome: s() });
var dsCodigoNome = z13.object({ codigo: s(), nome: s() });
var dsAcomodacao = dsIdNome;
var dsEstadoCivil = dsIdNome;
var dsParentesco = dsIdNome;
var dsSexo = dsIdNome;
var dsStatusBeneficiario = dsIdNome;
var dsStatusContrato = dsIdNome;
var dsStatusFatura = dsIdNome;
var dsStatusRecibo = dsIdNome;
var dsTipoLancamento = dsIdNome;
var dsTipoBeneficiario = dsIdNome;
var dsTipoTaxaCadastro = dsIdNome;
var dsFilial = dsCodigoNome;
var dsGrupo = dsCodigoNome;
var dsOpcional = dsCodigoNome;
var dsUsuario = dsCodigoNome;
var dsCarencia = dsCodigoNome;
var dsAnexo = z13.object({
  codigo: s(),
  arquivo: s(),
  data: s(),
  linkAnexo: s()
});
var dsAtendimento = z13.object({
  protocolo: s(),
  solicitante: s()
});
var dsOperadora = z13.object({
  id: i(),
  nome: s(),
  numeroAns: s(),
  linkLogo: s(),
  site: s()
});
var dsProduto = z13.object({
  codigo: s(),
  nome: s(),
  operadora: dsOperadora.nullish(),
  anexoList: z13.array(dsAnexo).nullish(),
  opcionalList: z13.array(dsOpcional).nullish()
});
var dsPlano = z13.object({
  codigo: s(),
  nome: s(),
  produto: dsProduto.nullish(),
  acomodacao: dsAcomodacao.nullish()
});
var dsProdutor = z13.object({
  codigo: s(),
  nome: s(),
  numeroDocumento: s()
});
var dsConvenio = z13.object({
  codigo: s(),
  nome: s(),
  valorTaxaCadastro: n(),
  tipoTaxaCadastro: dsTipoTaxaCadastro.nullish(),
  produto: dsProduto.nullish(),
  filialList: z13.array(dsFilial).nullish()
});
var dsBeneficiario = z13.object({
  codigo: s(),
  nome: s(),
  dataNascimento: s(),
  marcaOptica: s(),
  linkCarteiraProvisoria: s(),
  rg: s(),
  orgaoEmissor: s(),
  cpf: s(),
  /** Declaração de Nascido Vivo */
  dnv: s(),
  /** Cartão Nacional de Saúde */
  cns: s(),
  pis: s(),
  nomeMae: s(),
  endereco: s(),
  numero: s(),
  complemento: s(),
  bairro: s(),
  municipio: s(),
  uf: s(),
  cep: s(),
  dddTelefone: s(),
  telefone: s(),
  dddCelular: s(),
  celular: s(),
  email: s(),
  emailSecundario: s(),
  altura: n(),
  peso: n(),
  /** Índice de Massa Corporal */
  imc: n(),
  dataVigencia: s(),
  mensalidade: n(),
  carencia: dsCarencia.nullish(),
  /** `estatoCivil` (sic) — grafia do upstream, mantida de propósito. */
  estatoCivil: dsEstadoCivil.nullish(),
  tipoBeneficiario: dsTipoBeneficiario.nullish(),
  sexo: dsSexo.nullish(),
  parentesco: dsParentesco.nullish(),
  statusBeneficiario: dsStatusBeneficiario.nullish()
});
var dsContrato = z13.object({
  codigo: s(),
  nomeTitular: s(),
  numeroProposta: s(),
  dataInclusao: s(),
  dataAssinatura: s(),
  diaVencimento: i(),
  cpfResponsavel: s(),
  nomeResponsavel: s(),
  saldoDevedor: n(),
  observacao: s(),
  valor: n(),
  plano: dsPlano.nullish(),
  statusContrato: dsStatusContrato.nullish(),
  convenio: dsConvenio.nullish(),
  produtor: dsProdutor.nullish(),
  grupo: dsGrupo.nullish(),
  filial: dsFilial.nullish(),
  beneficiarioList: z13.array(dsBeneficiario).nullish(),
  anexoList: z13.array(dsAnexo).nullish(),
  opcionalList: z13.array(dsOpcional).nullish()
});
var dsDemonstrativoPagamento = z13.object({
  codigo: s(),
  anoCalendario: n(),
  anoReferencia: n(),
  cpf: s(),
  valor: n(),
  linkDemonstrativo: s()
});
var dsFatura = z13.object({
  codigo: s(),
  dataFatura: s(),
  dataVencimento: s(),
  numero: i(),
  ano: i(),
  mes: i(),
  valorCobranca: n(),
  linkFatura: s(),
  linkReciboPagamento: s(),
  linhaDigitavel: s(),
  dataPagamento: s(),
  registrado: i(),
  beneficiario: dsBeneficiario.nullish(),
  statusFatura: dsStatusFatura.nullish()
});
var dsFaixaEtaria = z13.object({
  id: i(),
  nome: s(),
  idadeInicial: i(),
  idadeFinal: i()
});
var dsLancamento = z13.object({
  codigo: s(),
  numeroParcela: i(),
  dataLancamento: s(),
  dataVencimento: s(),
  descricao: s(),
  valorLancamento: n(),
  valorParcela: n(),
  nomeTitular: s(),
  /** No Swagger este campo se chama `statusFatura` mas carrega TipoLancamento. */
  statusFatura: dsTipoLancamento.nullish()
});
var dsRecibo = z13.object({
  codigo: s(),
  dataRecibo: s(),
  dataEmissao: s(),
  dataPagamento: s(),
  dataCancelamento: s(),
  valor: n(),
  arquivo: s(),
  dataNotaFiscal: s(),
  numeroNotaFiscal: s(),
  valorNotaFiscal: n(),
  observacao: s(),
  produtor: dsProdutor.nullish(),
  statusRecibo: dsStatusRecibo.nullish(),
  anexoList: z13.array(dsAnexo).nullish(),
  lancamentoList: z13.array(dsLancamento).nullish()
});
var dsTabelaPreco = z13.object({
  id: i(),
  valorCobranca: n(),
  valorNet: n(),
  dataVigencia: s(),
  plano: dsPlano.nullish(),
  faixaEtaria: dsFaixaEtaria.nullish()
});
var dsTabela = z13.object({
  codigo: s(),
  nome: s(),
  dataVigencia: s(),
  grupo: dsGrupo.nullish(),
  tabelaPrecoList: z13.array(dsTabelaPreco).nullish()
});
var dsNotificacao = z13.object({
  codigo: s(),
  assunto: s(),
  mensagem: s(),
  usuario: dsUsuario.nullish()
});
var dsPatologia = z13.object({
  id: n(),
  codigo: s(),
  nome: s(),
  descricao: s(),
  anoEvento: s(),
  numeroPergunta: s(),
  beneficiario: dsBeneficiario.nullish()
});

// ../../packages/contracts/src/digitalsaude/endpoints.ts
import { z as z14 } from "zod";
var codigoContratoQuery = z14.object({ codigoContrato: z14.string().min(1) });
var digitalSaudeEndpoints = {
  // ---------------------------------------------------------------- anexo
  anexoIncluir: {
    method: "POST",
    path: "/anexo/",
    body: z14.object({
      codigoContrato: z14.string().min(1),
      nomeArquivo: z14.string().optional(),
      arquivo: z14.string().optional(),
      linkAnexo: z14.string().url()
    }),
    response: z14.array(dsAnexo)
  },
  // ---------------------------------------------------------- atendimento
  atendimentoPorContrato: {
    method: "GET",
    path: "/atendimento/procurarPorContrato",
    query: z14.object({
      codigoContrato: z14.string().min(1),
      codigoTipoAtendimento: z14.string().min(1)
    }),
    response: z14.array(dsAtendimento)
  },
  atendimentoPorProtocolo: {
    method: "GET",
    path: "/atendimento/{protocolo}",
    params: z14.object({ protocolo: z14.string().min(1) }),
    response: z14.array(dsAtendimento)
  },
  // ------------------------------------------------------------- carencia
  carenciaPorConvenio: {
    method: "GET",
    path: "/carencia/procurarPorConvenio",
    query: z14.object({ codigoConvenio: z14.string().min(1) }),
    response: z14.array(dsCarencia)
  },
  carenciaPorCodigo: {
    method: "GET",
    path: "/carencia/{codigoCarencia}",
    params: z14.object({ codigoCarencia: z14.string().min(1) }),
    response: z14.array(dsCarencia)
  },
  // --------------------------------------------------------------- tabela
  tabelaPorConvenio: {
    method: "GET",
    path: "/tabela/procurarPorConvenio",
    query: z14.object({ codigoConvenio: z14.string().min(1) }),
    response: z14.array(dsTabela)
  },
  tabelaPorCodigo: {
    method: "GET",
    path: "/tabela/{codigoTabela}",
    params: z14.object({ codigoTabela: z14.string().min(1) }),
    response: z14.array(dsTabela)
  },
  // ------------------------------------------------------------- contrato
  /** Projetado para URA/central telefônica — nao usar em app de cliente. */
  contratoPorCpfTitular: {
    method: "GET",
    path: "/contrato/procurarPorCpfTitular",
    query: z14.object({ cpf: z14.string().min(11) }),
    response: z14.array(dsContrato)
  },
  /** Busca por CPF + e-mail: par de credenciais usado no login do cliente. */
  contratoPorClientePortal: {
    method: "GET",
    path: "/contrato/procurarPorClientePortal",
    query: z14.object({ cpf: z14.string().min(11), email: z14.string().email() }),
    response: z14.array(dsContrato)
  },
  contratoPorCodigo: {
    method: "GET",
    path: "/contrato/{codigoContrato}",
    params: codigoContratoQuery,
    response: z14.array(dsContrato)
  },
  contratoEnviarCarteira: {
    method: "GET",
    path: "/contrato/enviarCarteiraPorContrato",
    query: codigoContratoQuery,
    response: z14.string()
  },
  contratoRetornarParaProduzido: {
    method: "GET",
    path: "/contrato/retornarContratoParaProduzido",
    query: codigoContratoQuery,
    response: z14.string()
  },
  contratoIncluir: {
    method: "POST",
    path: "/contrato/",
    body: z14.object({
      numeroProposta: z14.string().min(1),
      dataAssinatura: z14.string().min(1),
      diaVencimento: z14.number().int().min(1).max(31),
      cpfResponsavel: z14.string().optional(),
      nomeResponsavel: z14.string().optional(),
      observacao: z14.string().optional(),
      plano: z14.object({ codigo: z14.string().min(1) }),
      convenio: z14.object({ codigo: z14.string().min(1) }),
      produtor: z14.object({ codigo: z14.string().min(1) }),
      supervisor: z14.object({ codigo: z14.string() }).optional(),
      corretora: z14.object({ codigo: z14.string() }).optional(),
      angariador: z14.object({ codigo: z14.string() }).optional(),
      grupo: z14.object({ codigo: z14.string().min(1) }),
      filial: z14.object({ codigo: z14.string().min(1) }),
      opcionalList: z14.array(z14.object({ codigo: z14.string() })).optional(),
      beneficiarioList: z14.array(dsBeneficiario.partial()).min(1)
    }),
    response: z14.array(dsContrato)
  },
  // -------------------------------------------------------------- calculo
  /** Simulação de preços por região: base do fluxo de cotação do vendedor. */
  calculoSimular: {
    method: "POST",
    path: "/calculo/",
    body: z14.object({
      nome: z14.string().min(1),
      uf: z14.string().length(2),
      calculoVidaList: z14.array(
        z14.object({
          idade: z14.number().int().min(0).max(120),
          parentesco: z14.object({ id: z14.number().int() })
        })
      ).min(1)
    }),
    response: z14.array(dsPlano)
  },
  // ------------------------------------------------------------- convenio
  convenioPorCodigo: {
    method: "GET",
    path: "/convenio/{codigoConvenio}",
    params: z14.object({ codigoConvenio: z14.string().min(1) }),
    response: z14.array(dsConvenio)
  },
  convenioListar: {
    method: "GET",
    path: "/convenio/",
    response: z14.array(dsConvenio)
  },
  // ------------------------------------------- demonstrativo de pagamento
  demonstrativoPorCodigo: {
    method: "GET",
    path: "/demonstrativoPagamento/{codigoDemonstrativoPagamento}",
    params: z14.object({ codigoDemonstrativoPagamento: z14.string().min(1) }),
    response: z14.array(dsDemonstrativoPagamento)
  },
  demonstrativoPorContrato: {
    method: "GET",
    path: "/demonstrativoPagamento/procurarPorContrato",
    query: codigoContratoQuery,
    response: z14.array(dsDemonstrativoPagamento)
  },
  // --------------------------------------------------------------- fatura
  faturaEnviarVencidaPorContrato: {
    method: "GET",
    path: "/fatura/enviarFaturaVencidaPorContrato",
    query: codigoContratoQuery,
    response: z14.string()
  },
  faturaPorContrato: {
    method: "GET",
    path: "/fatura/procurarPorContrato",
    query: z14.object({
      codigoContrato: z14.string().min(1),
      idStatusFatura: z14.coerce.number().int()
    }),
    response: z14.array(dsFatura)
  },
  faturaVencidas: {
    method: "GET",
    path: "/fatura/procurarPorVencida",
    response: z14.array(dsFatura)
  },
  faturaPorCodigo: {
    method: "GET",
    path: "/fatura/{codigoFatura}",
    params: z14.object({ codigoFatura: z14.string().min(1) }),
    response: z14.array(dsFatura)
  },
  // ---------------------------------------------------------------- plano
  planoPorProduto: {
    method: "GET",
    path: "/plano/procurarPorProduto",
    query: z14.object({ codigoProduto: z14.string().min(1) }),
    response: z14.array(dsPlano)
  },
  planoPorCodigo: {
    method: "GET",
    path: "/plano/{codigoPlano}",
    params: z14.object({ codigoPlano: z14.string().min(1) }),
    response: z14.array(dsPlano)
  },
  // ------------------------------------------------------------ patologia
  patologiaIncluir: {
    method: "POST",
    path: "/patologia/",
    body: z14.object({
      codigo: z14.string().optional(),
      nome: z14.string().min(1),
      descricao: z14.string().optional(),
      anoEvento: z14.string().optional(),
      numeroPergunta: z14.string().optional(),
      beneficiario: z14.object({ codigo: z14.string().min(1) })
    }),
    response: z14.array(dsPatologia)
  },
  // ------------------------------------------------------------ pendencia
  pendenciaIncluir: {
    method: "POST",
    path: "/pendencia/",
    body: z14.object({
      id: z14.string().optional(),
      codigoPendencia: z14.string().min(1),
      contrato: z14.object({ codigo: z14.string().min(1) })
    }),
    response: z14.array(dsContrato)
  },
  // ------------------------------------------------------------- produtor
  produtorPorDocumento: {
    method: "GET",
    path: "/produtor/procurarPorNumeroDocumento",
    query: z14.object({ numeroDocumento: z14.string().min(11) }),
    response: z14.array(dsProdutor)
  },
  produtorPorLogin: {
    method: "GET",
    path: "/produtor/procurarPorLogin",
    query: z14.object({ loginProdutor: z14.string().min(1) }),
    response: z14.array(dsProdutor)
  },
  produtorPorCodigo: {
    method: "GET",
    path: "/produtor/{codigoProdutor}",
    params: z14.object({ codigoProdutor: z14.string().min(1) }),
    response: z14.array(dsProdutor)
  },
  produtorIncluir: {
    method: "POST",
    path: "/produtor/",
    body: z14.object({
      nome: z14.string().min(1),
      numeroDocumento: z14.string().optional(),
      endereco: z14.string().optional(),
      numero: z14.string().optional(),
      complemento: z14.string().optional(),
      bairro: z14.string().optional(),
      municipio: z14.string().optional(),
      uf: z14.string().length(2).optional(),
      cep: z14.string().optional(),
      dddTelefone: z14.string().optional(),
      telefone: z14.string().optional(),
      dddCelular: z14.string().optional(),
      celular: z14.string().optional(),
      email: z14.string().email(),
      dataNascimento: z14.string().optional(),
      produtor: z14.object({ codigo: z14.string() }).optional(),
      grupoProdutor: z14.object({ codigo: z14.string().min(1) }),
      sexo: z14.object({ id: z14.number().int() }).optional()
    }),
    response: z14.array(dsProdutor)
  },
  // ----------------------------------------------------------- notificacao
  notificacaoIncluir: {
    method: "POST",
    path: "/notificacao/",
    body: z14.object({
      assunto: z14.string().min(1),
      mensagem: z14.string().min(1),
      usuario: z14.object({ codigo: z14.string().min(1) })
    }),
    response: z14.array(dsNotificacao)
  },
  // --------------------------------------------------------------- recibo
  reciboPorCodigo: {
    method: "GET",
    path: "/recibo/{codigoRecibo}",
    params: z14.object({ codigoRecibo: z14.string().min(1) }),
    response: z14.array(dsRecibo)
  },
  /**
   * Atenção: o upstream exige login+senha do produtor em QUERY STRING. A API
   * Annetec nunca expõe estes dois endpoints diretamente — as credenciais são
   * lidas do vínculo do vendedor no banco pelo serviço de comissões.
   */
  reciboEmitidos: {
    method: "GET",
    path: "/recibo/procurarPorEmitido",
    query: z14.object({ login: z14.string().min(1), senha: z14.string().min(1) }),
    response: z14.array(dsRecibo),
    sensitive: true
  },
  reciboPagos: {
    method: "GET",
    path: "/recibo/procurarPorPago",
    query: z14.object({ login: z14.string().min(1), senha: z14.string().min(1) }),
    response: z14.array(dsRecibo),
    sensitive: true
  }
};

// src/integrations/digitalsaude/provider.ts
import { eq } from "drizzle-orm";

// src/config/env.ts
import { config as loadDotenv } from "dotenv";
import { z as z15 } from "zod";
loadDotenv();
var envSchema = z15.object({
  NODE_ENV: z15.enum(["development", "test", "production"]).default("development"),
  PORT: z15.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z15.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
  /** Connection string do Postgres/Supabase (use o pooler em serverless). */
  DATABASE_URL: z15.string().url(),
  /** URL pública desta API — usada pelo Better Auth para montar cookies/links. */
  API_BASE_URL: z15.string().url().default("http://localhost:3333"),
  /** Segredo do Better Auth (assinatura de sessão/cookie). Mín. 32 caracteres. */
  BETTER_AUTH_SECRET: z15.string().min(32),
  /** Origens autorizadas no CORS, separadas por vírgula. */
  CORS_ORIGINS: z15.string().default("http://localhost:3000"),
  /**
   * Credenciais globais da Digital Saúde. Servem de fallback quando o
   * inquilino não tem credenciais próprias configuradas — o caso comum é cada
   * administradora ter as suas, gravadas em `tenant_integrations`.
   */
  DIGITALSAUDE_BASE_URL: z15.string().url().default("https://digitalsaude.com.br/api/v2"),
  DIGITALSAUDE_APP_TOKEN: z15.string().optional(),
  DIGITALSAUDE_API_PASSWORD: z15.string().optional(),
  DIGITALSAUDE_TIMEOUT_MS: z15.coerce.number().int().positive().default(15e3)
});
var parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i2) => `  - ${i2.path.join(".")}: ${i2.message}`).join("\n");
  throw new Error(`Vari\xE1veis de ambiente inv\xE1lidas:
${issues}`);
}
var env = parsed.data;
var corsOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
var isProduction = env.NODE_ENV === "production";
var isTest = env.NODE_ENV === "test";

// src/db/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// src/db/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  account: () => account,
  activeStatusEnum: () => activeStatusEnum,
  appointmentStatusEnum: () => appointmentStatusEnum,
  appointments: () => appointments,
  auditLogs: () => auditLogs,
  beneficiaries: () => beneficiaries,
  beneficiariesRelations: () => beneficiariesRelations,
  beneficiaryKindEnum: () => beneficiaryKindEnum,
  benefitCategoryEnum: () => benefitCategoryEnum,
  benefits: () => benefits,
  clientProfiles: () => clientProfiles,
  clientProfilesRelations: () => clientProfilesRelations,
  contractStatusEnum: () => contractStatusEnum,
  contracts: () => contracts,
  contractsRelations: () => contractsRelations,
  interactionTypeEnum: () => interactionTypeEnum,
  invitation: () => invitation,
  leadInteractions: () => leadInteractions,
  leadInteractionsRelations: () => leadInteractionsRelations,
  leadStatusEnum: () => leadStatusEnum,
  leads: () => leads,
  leadsRelations: () => leadsRelations,
  member: () => member,
  organization: () => organization,
  partnerCategoryEnum: () => partnerCategoryEnum,
  partners: () => partners,
  saleStatusEnum: () => saleStatusEnum,
  sales: () => sales,
  salesGoals: () => salesGoals,
  sellerProfiles: () => sellerProfiles,
  sellerProfilesRelations: () => sellerProfilesRelations,
  session: () => session,
  tenantIntegrations: () => tenantIntegrations,
  tenantPlans: () => tenantPlans,
  tenantProfiles: () => tenantProfiles,
  tenantProfilesRelations: () => tenantProfilesRelations,
  tenantStatusEnum: () => tenantStatusEnum,
  upstreamCache: () => upstreamCache,
  user: () => user,
  verification: () => verification
});

// src/db/schema/enums.ts
import { pgEnum } from "drizzle-orm/pg-core";
var tenantStatusEnum = pgEnum("tenant_status", ["trial", "active", "suspended", "cancelled"]);
var contractStatusEnum = pgEnum("contract_status", [
  "pendente",
  "produzido",
  "ativo",
  "suspenso",
  "cancelado",
  "desconhecido"
]);
var beneficiaryKindEnum = pgEnum("beneficiary_kind", ["titular", "dependente", "agregado"]);
var leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "closed",
  "lost"
]);
var interactionTypeEnum = pgEnum("interaction_type", [
  "call",
  "email",
  "meeting",
  "note",
  "whatsapp"
]);
var saleStatusEnum = pgEnum("sale_status", ["pending", "confirmed", "cancelled"]);
var partnerCategoryEnum = pgEnum("partner_category", [
  "health",
  "dental",
  "pharmacy",
  "wellness",
  "food",
  "education",
  "other"
]);
var benefitCategoryEnum = pgEnum("benefit_category", [
  "health",
  "dental",
  "pharmacy",
  "funeral",
  "discount"
]);
var appointmentStatusEnum = pgEnum("appointment_status", [
  "aguardando",
  "em_atendimento",
  "concluido"
]);
var activeStatusEnum = pgEnum("active_status", ["active", "inactive"]);

// src/db/schema/auth.ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
var user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phone: text("phone"),
  /** Papel de plataforma (equipe Annetec). Só o plugin `admin` escreve aqui. */
  role: text("role").notNull().default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  /** Adicionado pelo plugin `organization`: inquilino "ativo" da sessão. */
  activeOrganizationId: text("active_organization_id"),
  /** Adicionado pelo plugin `admin`: preenchido durante impersonação. */
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  /** Hash scrypt do provider `credential` (e-mail/senha). */
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  /** Não usado pela Annetec (dados de negócio ficam em `tenant_profiles`); a coluna existe porque o plugin sempre lê/grava nela. */
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
});
var member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("client"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

// src/db/schema/platform.ts
import { relations } from "drizzle-orm";
import { boolean as boolean2, integer, jsonb, numeric, pgTable as pgTable2, text as text2, timestamp as timestamp2 } from "drizzle-orm/pg-core";
var tenantPlans = pgTable2("tenant_plans", {
  id: text2("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text2("name").notNull(),
  priceMonthly: numeric("price_monthly", { precision: 12, scale: 2 }).notNull(),
  memberLimit: integer("member_limit").notNull(),
  features: jsonb("features").$type().notNull().default([]),
  createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow()
});
var tenantProfiles = pgTable2("tenant_profiles", {
  organizationId: text2("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  legalName: text2("legal_name").notNull(),
  document: text2("document").notNull(),
  email: text2("email").notNull(),
  phone: text2("phone").notNull(),
  address: jsonb("address").$type().notNull(),
  branding: jsonb("branding").$type().notNull(),
  planId: text2("plan_id").references(() => tenantPlans.id, { onDelete: "set null" }),
  status: tenantStatusEnum("status").notNull().default("trial"),
  trialEndsAt: timestamp2("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var tenantIntegrations = pgTable2("tenant_integrations", {
  organizationId: text2("organization_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  provider: text2("provider").notNull().default("digitalsaude"),
  baseUrl: text2("base_url").notNull().default("https://digitalsaude.com.br/api/v2"),
  appTokenEncrypted: text2("app_token_encrypted").notNull(),
  apiPasswordEncrypted: text2("api_password_encrypted").notNull(),
  defaultGrupoCodigo: text2("default_grupo_codigo"),
  defaultFilialCodigo: text2("default_filial_codigo"),
  defaultConvenioCodigo: text2("default_convenio_codigo"),
  enabled: boolean2("enabled").notNull().default(true),
  lastCheckedAt: timestamp2("last_checked_at", { withTimezone: true }),
  lastCheckOk: boolean2("last_check_ok"),
  updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var tenantProfilesRelations = relations(tenantProfiles, ({ one }) => ({
  organization: one(organization, {
    fields: [tenantProfiles.organizationId],
    references: [organization.id]
  }),
  plan: one(tenantPlans, { fields: [tenantProfiles.planId], references: [tenantPlans.id] }),
  integration: one(tenantIntegrations, {
    fields: [tenantProfiles.organizationId],
    references: [tenantIntegrations.organizationId]
  })
}));

// src/db/schema/identity.ts
import { relations as relations2 } from "drizzle-orm";
import { index, numeric as numeric2, pgTable as pgTable3, primaryKey, text as text3 } from "drizzle-orm/pg-core";
var sellerProfiles = pgTable3(
  "seller_profiles",
  {
    userId: text3("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text3("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    region: text3("region"),
    salesGoal: numeric2("sales_goal", { precision: 12, scale: 2 }).notNull().default("0"),
    commissionRate: numeric2("commission_rate", { precision: 5, scale: 4 }).notNull().default("0"),
    /** Vínculo com o `Produtor` da Digital Saúde. */
    upstreamProdutorCodigo: text3("upstream_produtor_codigo"),
    upstreamProdutorLogin: text3("upstream_produtor_login"),
    /** Cifrada: o upstream exige login+senha em query string nos recibos. */
    upstreamProdutorPasswordEncrypted: text3("upstream_produtor_password_encrypted")
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index("seller_profiles_produtor_idx").on(table.upstreamProdutorCodigo)
  ]
);
var clientProfiles = pgTable3(
  "client_profiles",
  {
    userId: text3("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text3("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    cpf: text3("cpf").notNull(),
    /** Contrato principal exibido na carteirinha. */
    primaryContractCodigo: text3("primary_contract_codigo")
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index("client_profiles_cpf_idx").on(table.cpf)
  ]
);
var sellerProfilesRelations = relations2(sellerProfiles, ({ one }) => ({
  user: one(user, { fields: [sellerProfiles.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [sellerProfiles.organizationId],
    references: [organization.id]
  })
}));
var clientProfilesRelations = relations2(clientProfiles, ({ one }) => ({
  user: one(user, { fields: [clientProfiles.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [clientProfiles.organizationId],
    references: [organization.id]
  })
}));

// src/db/schema/membership.ts
import { relations as relations3 } from "drizzle-orm";
import {
  date,
  index as index2,
  integer as integer2,
  jsonb as jsonb2,
  numeric as numeric3,
  pgTable as pgTable4,
  text as text4,
  timestamp as timestamp3,
  uniqueIndex,
  uuid as uuid2
} from "drizzle-orm/pg-core";
var contracts = pgTable4(
  "contracts",
  {
    id: uuid2("id").primaryKey().defaultRandom(),
    organizationId: text4("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    upstreamCodigo: text4("upstream_codigo").notNull(),
    proposalNumber: text4("proposal_number"),
    holderName: text4("holder_name"),
    holderCpf: text4("holder_cpf"),
    status: contractStatusEnum("status").notNull().default("desconhecido"),
    upstreamStatus: text4("upstream_status"),
    signedAt: date("signed_at"),
    dueDay: integer2("due_day"),
    monthlyValue: numeric3("monthly_value", { precision: 12, scale: 2 }),
    outstandingBalance: numeric3("outstanding_balance", { precision: 12, scale: 2 }),
    planCodigo: text4("plan_codigo"),
    planName: text4("plan_name"),
    convenioCodigo: text4("convenio_codigo"),
    convenioName: text4("convenio_name"),
    sellerUpstreamCodigo: text4("seller_upstream_codigo"),
    /** Vendedor Annetec responsável, quando a venda nasceu no CRM. */
    sellerUserId: text4("seller_user_id").references(() => user.id, { onDelete: "set null" }),
    /** Associado dono do contrato no portal. */
    clientUserId: text4("client_user_id").references(() => user.id, { onDelete: "set null" }),
    raw: jsonb2("raw").$type(),
    syncedAt: timestamp3("synced_at", { withTimezone: true }),
    createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp3("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("contracts_org_upstream_key").on(table.organizationId, table.upstreamCodigo),
    index2("contracts_org_status_idx").on(table.organizationId, table.status),
    index2("contracts_holder_cpf_idx").on(table.organizationId, table.holderCpf),
    index2("contracts_client_user_idx").on(table.clientUserId)
  ]
);
var beneficiaries = pgTable4(
  "beneficiaries",
  {
    id: uuid2("id").primaryKey().defaultRandom(),
    contractId: uuid2("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    upstreamCodigo: text4("upstream_codigo"),
    kind: beneficiaryKindEnum("kind").notNull().default("dependente"),
    name: text4("name").notNull(),
    cpf: text4("cpf"),
    birthDate: date("birth_date"),
    motherName: text4("mother_name"),
    relationship: text4("relationship"),
    gender: text4("gender"),
    email: text4("email"),
    phone: text4("phone"),
    monthlyFee: numeric3("monthly_fee", { precision: 12, scale: 2 }),
    effectiveDate: date("effective_date"),
    provisionalCardUrl: text4("provisional_card_url"),
    status: text4("status"),
    raw: jsonb2("raw").$type(),
    createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp3("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index2("beneficiaries_contract_idx").on(table.contractId),
    index2("beneficiaries_cpf_idx").on(table.cpf)
  ]
);
var contractsRelations = relations3(contracts, ({ many, one }) => ({
  beneficiaries: many(beneficiaries),
  seller: one(user, { fields: [contracts.sellerUserId], references: [user.id] }),
  client: one(user, { fields: [contracts.clientUserId], references: [user.id] })
}));
var beneficiariesRelations = relations3(beneficiaries, ({ one }) => ({
  contract: one(contracts, { fields: [beneficiaries.contractId], references: [contracts.id] })
}));

// src/db/schema/business.ts
import { relations as relations4 } from "drizzle-orm";
import {
  index as index3,
  integer as integer3,
  jsonb as jsonb3,
  numeric as numeric4,
  pgTable as pgTable5,
  text as text5,
  timestamp as timestamp4,
  uniqueIndex as uniqueIndex2,
  uuid as uuid3
} from "drizzle-orm/pg-core";
var leads = pgTable5(
  "leads",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text5("name").notNull(),
    email: text5("email"),
    phone: text5("phone"),
    source: text5("source"),
    status: leadStatusEnum("status").notNull().default("new"),
    notes: text5("notes"),
    estimatedValue: numeric4("estimated_value", { precision: 12, scale: 2 }),
    sellerId: text5("seller_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp4("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index3("leads_org_status_idx").on(table.organizationId, table.status),
    index3("leads_seller_idx").on(table.sellerId)
  ]
);
var leadInteractions = pgTable5(
  "lead_interactions",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    leadId: uuid3("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: interactionTypeEnum("type").notNull(),
    description: text5("description").notNull(),
    authorId: text5("author_id").references(() => user.id, { onDelete: "set null" }),
    occurredAt: timestamp4("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index3("lead_interactions_lead_idx").on(table.leadId)]
);
var sales = pgTable5(
  "sales",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    leadId: uuid3("lead_id").references(() => leads.id, { onDelete: "set null" }),
    contractId: uuid3("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    contractUpstreamCodigo: text5("contract_upstream_codigo"),
    clientUserId: text5("client_user_id").references(() => user.id, { onDelete: "set null" }),
    clientName: text5("client_name").notNull(),
    sellerId: text5("seller_id").notNull().references(() => user.id, { onDelete: "restrict" }),
    planCodigo: text5("plan_codigo"),
    planName: text5("plan_name"),
    value: numeric4("value", { precision: 12, scale: 2 }).notNull(),
    commission: numeric4("commission", { precision: 12, scale: 2 }).notNull().default("0"),
    status: saleStatusEnum("status").notNull().default("pending"),
    soldAt: timestamp4("sold_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index3("sales_org_seller_idx").on(table.organizationId, table.sellerId),
    index3("sales_sold_at_idx").on(table.organizationId, table.soldAt)
  ]
);
var salesGoals = pgTable5(
  "sales_goals",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    sellerId: text5("seller_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    month: integer3("month").notNull(),
    year: integer3("year").notNull(),
    target: numeric4("target", { precision: 12, scale: 2 }).notNull(),
    commissionRate: numeric4("commission_rate", { precision: 5, scale: 4 }).notNull().default("0")
  },
  (table) => [
    uniqueIndex2("sales_goals_seller_period_key").on(table.sellerId, table.year, table.month)
  ]
);
var partners = pgTable5(
  "partners",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text5("name").notNull(),
    category: partnerCategoryEnum("category").notNull(),
    discountPercent: numeric4("discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    address: text5("address"),
    phone: text5("phone"),
    city: text5("city"),
    state: text5("state"),
    status: activeStatusEnum("status").notNull().default("active"),
    createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index3("partners_org_category_idx").on(table.organizationId, table.category)]
);
var benefits = pgTable5(
  "benefits",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text5("name").notNull(),
    description: text5("description").notNull().default(""),
    category: benefitCategoryEnum("category").notNull(),
    discountPercent: numeric4("discount_percent", { precision: 5, scale: 2 }),
    provider: text5("provider"),
    locations: jsonb3("locations").$type().notNull().default([]),
    createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index3("benefits_org_idx").on(table.organizationId)]
);
var appointments = pgTable5(
  "appointments",
  {
    id: uuid3("id").primaryKey().defaultRandom(),
    organizationId: text5("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    clientUserId: text5("client_user_id").references(() => user.id, { onDelete: "set null" }),
    clientName: text5("client_name").notNull(),
    description: text5("description").notNull(),
    status: appointmentStatusEnum("status").notNull().default("aguardando"),
    /** Protocolo devolvido por `/atendimento/` quando o inquilino usa o módulo. */
    protocol: text5("protocol"),
    createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index3("appointments_org_status_idx").on(table.organizationId, table.status)]
);
var leadsRelations = relations4(leads, ({ many, one }) => ({
  interactions: many(leadInteractions),
  seller: one(user, { fields: [leads.sellerId], references: [user.id] })
}));
var leadInteractionsRelations = relations4(leadInteractions, ({ one }) => ({
  lead: one(leads, { fields: [leadInteractions.leadId], references: [leads.id] })
}));

// src/db/schema/ops.ts
import { index as index4, jsonb as jsonb4, pgTable as pgTable6, text as text6, timestamp as timestamp5, uuid as uuid4 } from "drizzle-orm/pg-core";
var auditLogs = pgTable6(
  "audit_logs",
  {
    id: uuid4("id").primaryKey().defaultRandom(),
    organizationId: text6("organization_id").references(() => organization.id, {
      onDelete: "set null"
    }),
    actorId: text6("actor_id"),
    actorScope: text6("actor_scope", { enum: ["platform", "tenant"] }),
    action: text6("action").notNull(),
    resource: text6("resource").notNull(),
    resourceId: text6("resource_id"),
    metadata: jsonb4("metadata").$type(),
    ip: text6("ip"),
    requestId: text6("request_id"),
    createdAt: timestamp5("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index4("audit_logs_org_idx").on(table.organizationId, table.createdAt),
    index4("audit_logs_resource_idx").on(table.resource, table.resourceId)
  ]
);
var upstreamCache = pgTable6(
  "upstream_cache",
  {
    id: uuid4("id").primaryKey().defaultRandom(),
    organizationId: text6("organization_id").references(() => organization.id, {
      onDelete: "cascade"
    }),
    cacheKey: text6("cache_key").notNull(),
    payload: jsonb4("payload").notNull(),
    fetchedAt: timestamp5("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp5("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [index4("upstream_cache_key_idx").on(table.organizationId, table.cacheKey)]
);

// src/db/client.ts
var client = postgres(env.DATABASE_URL, {
  max: process.env.VERCEL ? 1 : isProduction ? 10 : 5,
  prepare: false,
  onnotice: () => {
  }
});
var db = drizzle(client, { schema: schema_exports, casing: "snake_case" });

// src/http/errors.ts
import { APIError as BetterAuthError } from "better-auth/api";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

// src/lib/logger.ts
var ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};
var threshold = ORDER[env.LOG_LEVEL];
function emit(level, context, message) {
  if (ORDER[level] < threshold) return;
  const fields = typeof context === "string" ? {} : serialize(context);
  const text7 = typeof context === "string" ? context : message ?? "";
  const line = JSON.stringify({ level, time: (/* @__PURE__ */ new Date()).toISOString(), msg: text7, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
function serialize(context) {
  const out = {};
  for (const [key2, value] of Object.entries(context)) {
    if (value === void 0) continue;
    out[key2] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
  }
  return out;
}
var logger = {
  debug: (context, message) => emit("debug", context, message),
  info: (context, message) => emit("info", context, message),
  warn: (context, message) => emit("warn", context, message),
  error: (context, message) => emit("error", context, message)
};

// src/http/errors.ts
var AppError = class _AppError extends Error {
  code;
  status;
  issues;
  cause;
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? ERROR_STATUS[code];
    this.issues = options.issues;
    this.cause = options.cause;
  }
  static notFound(resource) {
    return new _AppError(ERROR_CODES.NOT_FOUND, `${resource} n\xE3o encontrado`);
  }
  static unauthenticated(message = "Autentica\xE7\xE3o necess\xE1ria") {
    return new _AppError(ERROR_CODES.UNAUTHENTICATED, message);
  }
  static forbidden(message = "Voc\xEA n\xE3o tem permiss\xE3o para esta opera\xE7\xE3o") {
    return new _AppError(ERROR_CODES.FORBIDDEN, message);
  }
  static conflict(message) {
    return new _AppError(ERROR_CODES.CONFLICT, message);
  }
  static businessRule(message) {
    return new _AppError(ERROR_CODES.BUSINESS_RULE_VIOLATION, message);
  }
  static validation(issues, message = "Dados inv\xE1lidos") {
    return new _AppError(ERROR_CODES.VALIDATION_ERROR, message, { issues });
  }
};
function zodIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(raiz)",
    message: issue.message
  }));
}
var errorHandler = (err, c) => {
  const requestId = c.get("requestId");
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ requestId, code: err.code, err: err.cause ?? err }, err.message);
    }
    return respondWithError(c, err.status, err.code, err.message, err.issues, requestId);
  }
  if (err instanceof ZodError) {
    return respondWithError(
      c,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Dados inv\xE1lidos",
      zodIssues(err),
      requestId
    );
  }
  if (err instanceof HTTPException) {
    const code = err.status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.MALFORMED_REQUEST;
    return respondWithError(c, err.status, code, err.message, void 0, requestId);
  }
  if (err instanceof BetterAuthError) {
    return respondWithError(
      c,
      err.statusCode,
      betterAuthErrorCode(err.statusCode),
      err.body?.message ?? err.message,
      void 0,
      requestId
    );
  }
  logger.error({ requestId, err }, "Erro n\xE3o tratado");
  return respondWithError(
    c,
    500,
    ERROR_CODES.INTERNAL_ERROR,
    isProduction ? "Erro interno do servidor" : String(err),
    void 0,
    requestId
  );
};
function betterAuthErrorCode(status) {
  if (status === 401) return ERROR_CODES.INVALID_CREDENTIALS;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.ALREADY_EXISTS;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status >= 400 && status < 500) return ERROR_CODES.VALIDATION_ERROR;
  return ERROR_CODES.INTERNAL_ERROR;
}
function respondWithError(c, status, code, message, issues, requestId) {
  return c.json(
    { success: false, error: { code, message, ...issues ? { issues } : {}, requestId } },
    status
  );
}

// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
var key = createHash("sha256").update(`annetec:secrets:${env.BETTER_AUTH_SECRET}`).digest();
function encryptSecret(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}
function decryptSecret(stored) {
  const [version, ivB64, tagB64, dataB64] = stored.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Segredo cifrado em formato desconhecido");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

// src/integrations/digitalsaude/client.ts
import { z as z16 } from "zod";
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
var MAX_ATTEMPTS = 3;
function createDigitalSaudeClient(credentials) {
  const baseUrl = credentials.baseUrl.replace(/\/+$/, "");
  const timeoutMs = credentials.timeoutMs ?? env.DIGITALSAUDE_TIMEOUT_MS;
  async function call(name, input) {
    const endpoint = digitalSaudeEndpoints[name];
    const raw = input ?? {};
    const url = new URL(baseUrl + buildPath(endpoint.path, endpoint.params, raw, name));
    if (endpoint.query) {
      const parsed2 = parseInput(endpoint.query, raw, name, "query");
      for (const [key2, value] of Object.entries(parsed2)) {
        if (value !== void 0 && value !== null) url.searchParams.set(key2, String(value));
      }
    }
    const body = endpoint.body ? parseInput(endpoint.body, raw, name, "body") : void 0;
    const payload = await request(endpoint.method, url, body, name);
    return validateResponse(endpoint.response, payload, name);
  }
  async function request(method, url, body, name) {
    const maxAttempts = method === "GET" ? MAX_ATTEMPTS : 1;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          method,
          headers: {
            token: credentials.appToken,
            senhaApi: credentials.apiPassword,
            accept: "application/json",
            ...body ? { "content-type": "application/json" } : {}
          },
          body: body ? JSON.stringify(body) : void 0,
          signal: AbortSignal.timeout(timeoutMs)
        });
        const text7 = await decodeBody(response);
        logger.debug(
          {
            integration: "digitalsaude",
            tenant: credentials.label,
            endpoint: name,
            status: response.status,
            attempt,
            durationMs: Math.round(performance.now() - startedAt)
          },
          "upstream call"
        );
        if (response.ok) return parseJsonBody(text7);
        if (response.status === 401 || response.status === 403) {
          throw new AppError(
            ERROR_CODES.UPSTREAM_UNAUTHORIZED,
            "Credenciais da Digital Sa\xFAde recusadas para este inquilino"
          );
        }
        if (response.status === 404) throw AppError.notFound("Registro na Digital Sa\xFAde");
        if (response.status === 400) {
          throw new AppError(ERROR_CODES.UPSTREAM_ERROR, upstreamMessage(text7, "Requisi\xE7\xE3o recusada pela Digital Sa\xFAde"));
        }
        if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
          lastError = new Error(`HTTP ${response.status}`);
          await backoff(attempt);
          continue;
        }
        throw new AppError(
          ERROR_CODES.UPSTREAM_ERROR,
          upstreamMessage(text7, `Digital Sa\xFAde respondeu ${response.status}`)
        );
      } catch (error) {
        if (error instanceof AppError) throw error;
        const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
        lastError = error;
        if (attempt < maxAttempts) {
          await backoff(attempt);
          continue;
        }
        if (isTimeout) {
          throw new AppError(ERROR_CODES.UPSTREAM_TIMEOUT, "Digital Sa\xFAde n\xE3o respondeu a tempo", {
            cause: error
          });
        }
        throw new AppError(ERROR_CODES.UPSTREAM_ERROR, "Falha de comunica\xE7\xE3o com a Digital Sa\xFAde", {
          cause: error
        });
      }
    }
    throw new AppError(ERROR_CODES.UPSTREAM_ERROR, "Falha de comunica\xE7\xE3o com a Digital Sa\xFAde", {
      cause: lastError
    });
  }
  return {
    call,
    async one(name, input) {
      const result = await call(name, input);
      if (Array.isArray(result)) return result[0] ?? null;
      return result;
    },
    async healthCheck() {
      try {
        await call("convenioListar");
        return true;
      } catch (error) {
        logger.warn(
          { integration: "digitalsaude", tenant: credentials.label, err: error },
          "healthCheck falhou"
        );
        return false;
      }
    }
  };
}
function buildPath(template, paramsSchema, raw, name) {
  if (!paramsSchema) return template;
  const params = parseInput(paramsSchema, raw, name, "params");
  return template.replace(/\{(\w+)\}/g, (_match, key2) => {
    const value = params[key2];
    if (value === void 0 || value === null) {
      throw AppError.validation([{ path: key2, message: "Par\xE2metro obrigat\xF3rio ausente" }]);
    }
    return encodeURIComponent(String(value));
  });
}
function parseInput(schema, raw, name, where) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map((issue) => ({
        path: `${where}.${issue.path.join(".")}`,
        message: issue.message
      })),
      `Entrada inv\xE1lida para ${name}`
    );
  }
  return result.data;
}
function validateResponse(schema, payload, name) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  if (schema instanceof z16.ZodString && payload !== null && payload !== void 0) {
    return String(typeof payload === "object" ? JSON.stringify(payload) : payload);
  }
  logger.error(
    { integration: "digitalsaude", endpoint: name, issues: result.error.issues.slice(0, 5) },
    "Resposta do upstream fora do contrato"
  );
  throw new AppError(
    ERROR_CODES.UPSTREAM_CONTRACT_MISMATCH,
    `Resposta inesperada da Digital Sa\xFAde em ${name}`
  );
}
async function decodeBody(response) {
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  const encoding = charset && charset !== "utf-8" ? charset : "utf-8";
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
function parseJsonBody(text7) {
  const trimmed = text7.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
function upstreamMessage(text7, fallback) {
  const trimmed = text7.trim();
  if (!trimmed) return fallback;
  try {
    const parsed2 = JSON.parse(trimmed);
    const message = parsed2.mensagem ?? parsed2.message ?? parsed2.erro ?? parsed2.error;
    return typeof message === "string" ? message : fallback;
  } catch {
    return trimmed.length <= 300 ? trimmed : fallback;
  }
}
function backoff(attempt) {
  const delay = 250 * 2 ** (attempt - 1);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// src/integrations/digitalsaude/provider.ts
var cache = /* @__PURE__ */ new Map();
async function getDigitalSaudeClient(tenantId) {
  const [row] = await db.select().from(tenantIntegrations).where(eq(tenantIntegrations.organizationId, tenantId)).limit(1);
  if (row && row.enabled) {
    const stamp = row.updatedAt.getTime();
    const cached = cache.get(tenantId);
    if (cached && cached.updatedAt === stamp) return cached.client;
    const client2 = createDigitalSaudeClient({
      baseUrl: row.baseUrl,
      appToken: decryptSecret(row.appTokenEncrypted),
      apiPassword: decryptSecret(row.apiPasswordEncrypted),
      label: tenantId
    });
    cache.set(tenantId, { client: client2, updatedAt: stamp });
    return client2;
  }
  if (row && !row.enabled) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      "A integra\xE7\xE3o com a Digital Sa\xFAde est\xE1 desativada para este inquilino"
    );
  }
  return getFallbackClient();
}
async function getIntegrationDefaults(tenantId) {
  const [row] = await db.select({
    grupoCodigo: tenantIntegrations.defaultGrupoCodigo,
    filialCodigo: tenantIntegrations.defaultFilialCodigo,
    convenioCodigo: tenantIntegrations.defaultConvenioCodigo
  }).from(tenantIntegrations).where(eq(tenantIntegrations.organizationId, tenantId)).limit(1);
  return row ?? { grupoCodigo: null, filialCodigo: null, convenioCodigo: null };
}
function invalidateDigitalSaudeClient(tenantId) {
  cache.delete(tenantId);
}
function getFallbackClient() {
  if (!env.DIGITALSAUDE_APP_TOKEN || !env.DIGITALSAUDE_API_PASSWORD) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      "Integra\xE7\xE3o com a Digital Sa\xFAde n\xE3o configurada para este inquilino"
    );
  }
  return createDigitalSaudeClient({
    baseUrl: env.DIGITALSAUDE_BASE_URL,
    appToken: env.DIGITALSAUDE_APP_TOKEN,
    apiPassword: env.DIGITALSAUDE_API_PASSWORD,
    label: "env-fallback"
  });
}

export {
  cpf,
  ERROR_CODES,
  paginationQuery,
  platformRole,
  tenantRole,
  tenantStatus,
  contractStatus,
  invoiceStatus,
  BENEFICIARY_KIND_BY_UPSTREAM_ID,
  UPSTREAM_ID_BY_BENEFICIARY_KIND,
  leadStatus,
  partnerCategory,
  loginInput,
  clientPortalLoginInput,
  registerInput,
  changePasswordInput,
  createPlatformUserInput,
  tenantIntegration,
  createTenantInput,
  updateTenantInput,
  createTenantPlanInput,
  createTenantUserInput,
  updateTenantUserInput,
  createContractInput,
  declarePathologyInput,
  attachDocumentInput,
  quoteInput,
  createPartnerInput,
  createBenefitInput,
  createInteractionInput,
  createLeadInput,
  updateLeadInput,
  createSaleInput,
  upsertSalesGoalInput,
  env,
  corsOrigins,
  logger,
  AppError,
  zodIssues,
  errorHandler,
  user,
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  tenantPlans,
  tenantProfiles,
  tenantIntegrations,
  sellerProfiles,
  clientProfiles,
  contracts,
  beneficiaries,
  leads,
  leadInteractions,
  sales,
  salesGoals,
  partners,
  benefits,
  upstreamCache,
  db,
  encryptSecret,
  decryptSecret,
  createDigitalSaudeClient,
  getDigitalSaudeClient,
  getIntegrationDefaults,
  invalidateDigitalSaudeClient
};
