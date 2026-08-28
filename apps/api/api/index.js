import {
  auth,
  sellersService,
  usersService
} from "./chunk-5IYDE4MR.js";
import {
  contractsService
} from "./chunk-VJLBNHDX.js";
import {
  mapCommissionReceipt,
  mapConvenio,
  mapInvoice,
  mapPaymentStatement,
  mapPlan,
  mapPriceTable
} from "./chunk-P2WGSFUZ.js";
import {
  AppError,
  ERROR_CODES,
  attachDocumentInput,
  benefits,
  changePasswordInput,
  clientPortalLoginInput,
  clientProfiles,
  contractStatus,
  corsOrigins,
  cpf,
  createBenefitInput,
  createContractInput,
  createDigitalSaudeClient,
  createInteractionInput,
  createLeadInput,
  createPartnerInput,
  createPlatformUserInput,
  createSaleInput,
  createTenantInput,
  createTenantPlanInput,
  createTenantUserInput,
  db,
  declarePathologyInput,
  encryptSecret,
  errorHandler,
  getDigitalSaudeClient,
  invalidateDigitalSaudeClient,
  invoiceStatus,
  leadInteractions,
  leadStatus,
  leads,
  logger,
  loginInput,
  member,
  organization,
  paginationQuery,
  partnerCategory,
  partners,
  platformRole,
  quoteInput,
  registerInput,
  sales,
  salesGoals,
  sellerProfiles,
  tenantIntegration,
  tenantIntegrations,
  tenantPlans,
  tenantProfiles,
  tenantRole,
  tenantStatus,
  updateLeadInput,
  updateTenantInput,
  updateTenantUserInput,
  upsertSalesGoalInput,
  upstreamCache,
  user,
  zodIssues
} from "./chunk-HNEZMN3V.js";

// src/vercel.ts
import { handle } from "hono/vercel";

// src/app.ts
import { Hono as Hono14 } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

// src/http/middleware/request-id.ts
import { randomUUID } from "crypto";
import { createMiddleware } from "hono/factory";
var requestId = createMiddleware(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming && incoming.length <= 100 ? incoming : randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  const startedAt = performance.now();
  await next();
  logger.info(
    {
      requestId: id,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt)
    },
    "request"
  );
});

// src/routes.ts
import { Hono as Hono13 } from "hono";

// src/modules/auth/controller.ts
import { Hono } from "hono";
import { z } from "zod";

// src/http/middleware/auth.ts
import { createMiddleware as createMiddleware2 } from "hono/factory";
var optionalAuth = createMiddleware2(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) c.set("auth", session);
  await next();
});
var requireAuth = createMiddleware2(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw AppError.unauthenticated();
  c.set("auth", session);
  await next();
});
function requirePlatformRole(...roles) {
  return createMiddleware2(async (c, next) => {
    const session = c.get("auth");
    if (!session) throw AppError.unauthenticated();
    if (session.membership.scope !== "platform" || !session.membership.platformRole) {
      throw AppError.forbidden("Rota restrita \xE0 equipe Annetec");
    }
    if (roles.length > 0 && !roles.includes(session.membership.platformRole)) {
      throw AppError.forbidden("Papel insuficiente para esta opera\xE7\xE3o");
    }
    await next();
  });
}
function requireTenantRole(...roles) {
  return createMiddleware2(async (c, next) => {
    const session = c.get("auth");
    if (!session) throw AppError.unauthenticated();
    if (session.membership.scope === "platform") {
      await next();
      return;
    }
    if (!session.membership.tenantId || !session.membership.tenantRole) {
      throw AppError.forbidden("Sess\xE3o sem inquilino ativo");
    }
    const tenant = c.get("tenant");
    if (tenant && tenant.id !== session.membership.tenantId) {
      throw new AppError(ERROR_CODES.TENANT_MISMATCH, "Sess\xE3o n\xE3o pertence a este inquilino");
    }
    if (roles.length > 0 && !roles.includes(session.membership.tenantRole)) {
      throw AppError.forbidden("Papel insuficiente para esta opera\xE7\xE3o");
    }
    await next();
  });
}

// src/http/respond.ts
function ok(c, data, meta) {
  return c.json({ success: true, data, ...meta ? { meta } : {} }, 200);
}
function created(c, data) {
  return c.json({ success: true, data }, 201);
}
function noContent(c) {
  return c.json({ success: true, data: null }, 200);
}
function paginate(items, page, perPage, total) {
  const meta = {
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage)
  };
  return { items, meta };
}

// src/http/validate.ts
import { zValidator } from "@hono/zod-validator";
function validate(target, schema) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.validation(zodIssues(result.error));
    }
    return void 0;
  });
}
var json = (schema) => validate("json", schema);
var query = (schema) => validate("query", schema);
var param = (schema) => validate("param", schema);

// src/modules/auth/service.ts
import { and, desc, eq, inArray } from "drizzle-orm";
var authService = {
  async login(input) {
    const result = await auth.api.signInEmail({ body: { email: input.email, password: input.password } });
    const bareSession = await getSessionByToken(result.token);
    if (bareSession.membership.scope === "platform") {
      return { token: result.token, session: bareSession };
    }
    const organizationId = input.tenantSlug ? await resolveOrganizationBySlug(input.tenantSlug) : await resolveTenantOrganization(result.user.id, ["admin", "seller"]);
    if (!organizationId) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "E-mail ou senha inv\xE1lidos");
    }
    await setActiveOrganization(result.token, organizationId);
    const session = await getSessionByToken(result.token);
    return { token: result.token, session };
  },
  /**
   * Login do portal do associado por CPF + e-mail. Sem tenantSlug, a Digital
   * Saúde é quem responde a pergunta "esse CPF+e-mail existe onde?": se a
   * pessoa já é nossa conhecida, usamos o inquilino do vínculo dela (rápido,
   * sem sair pra rede); senão, tentamos cada inquilino com integração ativa
   * até um responder com um contrato de verdade.
   */
  async loginClientPortal(input) {
    if (input.tenantSlug) {
      const { token, session } = await signInClientPortal(input.tenantSlug, input.cpf, input.email);
      return { token, session };
    }
    const knownSlug = await resolveClientTenantSlug(input.email);
    const candidates = await listEnabledTenantSlugs();
    const orderedSlugs = knownSlug ? [knownSlug, ...candidates.filter((slug) => slug !== knownSlug)] : candidates;
    for (const slug of orderedSlugs) {
      try {
        return await signInClientPortal(slug, input.cpf, input.email);
      } catch (error) {
        logger.debug({ tenantSlug: slug, err: error }, "Login do portal n\xE3o bateu neste inquilino, tentando o pr\xF3ximo");
      }
    }
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, "N\xE3o encontramos contrato com este CPF e e-mail");
  },
  async register(input) {
    const organizationId = await resolveOrganizationBySlug(input.tenantSlug);
    if (!organizationId) throw AppError.notFound("Inquilino");
    const signUp = await auth.api.signUpEmail({
      body: { name: input.name, email: input.email, password: input.password }
    });
    if (!signUp.token) {
      throw AppError.businessRule("N\xE3o foi poss\xEDvel criar a sess\xE3o ap\xF3s o cadastro");
    }
    await auth.api.addMember({
      body: { userId: signUp.user.id, organizationId, role: "client" }
    });
    await db.insert(clientProfiles).values({
      userId: signUp.user.id,
      organizationId,
      cpf: input.cpf
    });
    await setActiveOrganization(signUp.token, organizationId);
    const session = await getSessionByToken(signUp.token);
    return { token: signUp.token, session };
  },
  /** Renova a sessão a partir do próprio token — o Better Auth cuida do rolling expiry. */
  async me(token) {
    return getSessionByToken(token);
  },
  async logout(token) {
    await auth.api.signOut({ headers: bearerHeaders(token) });
  }
};
async function signInClientPortal(tenantSlug, cpf2, email) {
  const result = await auth.api.signInClientPortal({ body: { tenantSlug, cpf: cpf2, email } });
  const session = await getSessionByToken(result.token);
  return { token: result.token, session };
}
async function listEnabledTenantSlugs() {
  const rows = await db.select({ slug: organization.slug }).from(organization).innerJoin(tenantIntegrations, eq(tenantIntegrations.organizationId, organization.id)).where(eq(tenantIntegrations.enabled, true));
  return rows.map((row) => row.slug);
}
async function resolveClientTenantSlug(email) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).limit(1);
  if (!existing) return null;
  const [membership] = await db.select({ organizationId: member.organizationId }).from(member).where(and(eq(member.userId, existing.id), eq(member.role, "client"))).orderBy(desc(member.createdAt)).limit(1);
  if (!membership) return null;
  const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, membership.organizationId)).limit(1);
  return org?.slug ?? null;
}
async function resolveTenantOrganization(userId, roles) {
  const rows = await db.select({ organizationId: member.organizationId, role: member.role, createdAt: member.createdAt }).from(member).where(and(eq(member.userId, userId), inArray(member.role, roles)));
  if (rows.length === 0) return null;
  const rolePriority = { admin: 0, seller: 1 };
  rows.sort((a, b) => {
    const byRole = (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9);
    if (byRole !== 0) return byRole;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return rows[0].organizationId;
}
async function resolveOrganizationBySlug(tenantSlug) {
  const [tenant] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, tenantSlug.toLowerCase())).limit(1);
  return tenant?.id ?? null;
}
async function setActiveOrganization(token, organizationId) {
  await auth.api.setActiveOrganization({ headers: bearerHeaders(token), body: { organizationId } });
}
async function getSessionByToken(token) {
  const session = await auth.api.getSession({ headers: bearerHeaders(token) });
  if (!session) throw AppError.unauthenticated();
  return session;
}
function bearerHeaders(token) {
  return new Headers({ authorization: `Bearer ${token}` });
}

// src/modules/auth/presenter.ts
function toSessionUser(session) {
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.image ?? null,
    scope: session.membership.scope,
    platformRole: session.membership.platformRole,
    tenantId: session.membership.tenantId,
    tenantSlug: session.membership.tenantSlug,
    tenantRole: session.membership.tenantRole
  };
}

// src/modules/auth/controller.ts
var authController = new Hono().post("/login", json(loginInput), async (c) => {
  const { token, session } = await authService.login(c.req.valid("json"));
  return ok(c, { token, user: toSessionUser(session) });
}).post("/login/portal", json(clientPortalLoginInput), async (c) => {
  const { token, session } = await authService.loginClientPortal(c.req.valid("json"));
  return ok(c, { token, user: toSessionUser(session) });
}).post("/register", json(registerInput), async (c) => {
  const { token, session } = await authService.register(c.req.valid("json"));
  return created(c, { token, user: toSessionUser(session) });
}).post("/logout", requireAuth, async (c) => {
  const token = bearerToken(c.req.header("authorization"));
  if (token) await authService.logout(token);
  return noContent(c);
}).get("/me", requireAuth, async (c) => {
  const session = c.get("auth");
  if (!session) throw AppError.unauthenticated();
  return ok(c, toSessionUser(session));
}).post("/password", requireAuth, json(changePasswordInput), async (c) => {
  const token = bearerToken(c.req.header("authorization"));
  if (!token) throw AppError.unauthenticated();
  const { currentPassword, newPassword } = c.req.valid("json");
  await auth.api.changePassword({
    headers: c.req.raw.headers,
    body: { currentPassword, newPassword, revokeOtherSessions: true }
  });
  return noContent(c);
}).post("/password/forgot", json(z.object({ email: z.string().email() })), async (c) => {
  await auth.api.requestPasswordReset({ body: { email: c.req.valid("json").email } }).catch(() => null);
  return noContent(c);
});
function bearerToken(header) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

// src/modules/billing/controller.ts
import { Hono as Hono2 } from "hono";
import { z as z2 } from "zod";

// src/http/middleware/tenant.ts
import { eq as eq2 } from "drizzle-orm";
import { createMiddleware as createMiddleware3 } from "hono/factory";
var resolveTenant = createMiddleware3(async (c, next) => {
  const slug = c.req.param("tenantSlug");
  if (!slug) throw AppError.notFound("Inquilino");
  const [row] = await db.select({
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    status: tenantProfiles.status
  }).from(organization).innerJoin(tenantProfiles, eq2(tenantProfiles.organizationId, organization.id)).where(eq2(organization.slug, slug.toLowerCase())).limit(1);
  if (!row) throw AppError.notFound("Inquilino");
  if (row.status === "cancelled") {
    throw AppError.forbidden("Este inquilino est\xE1 cancelado");
  }
  c.set("tenant", { id: row.id, slug: row.slug, name: row.name });
  await next();
});
function tenantOf(c) {
  const tenant = c.get("tenant");
  if (!tenant) throw new Error("resolveTenant n\xE3o foi registrado nesta rota");
  return tenant;
}

// src/modules/billing/service.ts
var KNOWN_UPSTREAM_INVOICE_STATUS_IDS = [1, 2, 3, 4];
var billingService = {
  async listInvoicesByContract(tenantId, contractCodigo, filters = {}) {
    const client = await getDigitalSaudeClient(tenantId);
    if (filters.upstreamStatusId !== void 0) {
      const result = await client.call("faturaPorContrato", {
        codigoContrato: contractCodigo,
        idStatusFatura: filters.upstreamStatusId
      });
      return result.map((item) => mapInvoice(item, contractCodigo));
    }
    const batches = await Promise.all(
      KNOWN_UPSTREAM_INVOICE_STATUS_IDS.map(async (idStatusFatura) => {
        try {
          const result = await client.call("faturaPorContrato", {
            codigoContrato: contractCodigo,
            idStatusFatura
          });
          return result.map((item) => mapInvoice(item, contractCodigo));
        } catch {
          return [];
        }
      })
    );
    const byCode = /* @__PURE__ */ new Map();
    for (const invoice of batches.flat()) byCode.set(invoice.upstreamCodigo, invoice);
    const invoices = [...byCode.values()].sort(byDueDateDesc);
    return filters.status ? invoices.filter((invoice) => invoice.status === filters.status) : invoices;
  },
  async getInvoice(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("faturaPorCodigo", { codigoFatura: codigo });
    if (!result) throw AppError.notFound("Fatura");
    return mapInvoice(result);
  },
  /** Faturas vencidas de toda a carteira — visão de cobrança do admin. */
  async listOverdueInvoices(tenantId) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("faturaVencidas");
    return result.map((item) => mapInvoice(item)).sort(byDueDateDesc);
  },
  async sendOverdueInvoicesByEmail(tenantId, contractCodigo) {
    const client = await getDigitalSaudeClient(tenantId);
    return client.call("faturaEnviarVencidaPorContrato", { codigoContrato: contractCodigo });
  },
  async listPaymentStatements(tenantId, contractCodigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("demonstrativoPorContrato", {
      codigoContrato: contractCodigo
    });
    return result.map(mapPaymentStatement);
  },
  async getPaymentStatement(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("demonstrativoPorCodigo", {
      codigoDemonstrativoPagamento: codigo
    });
    if (!result) throw AppError.notFound("Demonstrativo de pagamento");
    return mapPaymentStatement(result);
  },
  /**
   * Recibos de comissão do vendedor.
   *
   * O upstream pede login+senha do produtor em query string. As credenciais
   * ficam cifradas no perfil do vendedor e são decifradas só aqui — nunca
   * trafegam pelo cliente nem aparecem em log.
   */
  async listCommissionReceipts(tenantId, sellerId, status) {
    const credentials = await sellersService.upstreamProdutorCredentials(tenantId, sellerId);
    if (!credentials) {
      throw AppError.businessRule(
        "Vendedor sem credenciais de produtor da Digital Sa\xFAde configuradas"
      );
    }
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call(status === "pago" ? "reciboPagos" : "reciboEmitidos", {
      login: credentials.login,
      senha: credentials.password
    });
    return result.map(mapCommissionReceipt);
  },
  async getCommissionReceipt(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("reciboPorCodigo", { codigoRecibo: codigo });
    if (!result) throw AppError.notFound("Recibo");
    return mapCommissionReceipt(result);
  }
};
function byDueDateDesc(a, b) {
  return (b.dueAt ?? "").localeCompare(a.dueAt ?? "");
}

// src/modules/billing/controller.ts
var codigoParam = z2.object({ codigo: z2.string().min(1) });
var contratoQuery = z2.object({
  contratoCodigo: z2.string().min(1),
  status: invoiceStatus.optional(),
  idStatusFatura: z2.coerce.number().int().optional()
});
var billingController = new Hono2().use("*", resolveTenant, requireAuth, requireTenantRole()).get("/faturas", query(contratoQuery), async (c) => {
  const tenant = tenantOf(c);
  const { contratoCodigo, status, idStatusFatura } = c.req.valid("query");
  await assertContractAccess(c, contratoCodigo);
  return ok(
    c,
    await billingService.listInvoicesByContract(tenant.id, contratoCodigo, {
      status,
      upstreamStatusId: idStatusFatura
    })
  );
}).get(
  "/faturas/vencidas",
  requireTenantRole("admin"),
  async (c) => ok(c, await billingService.listOverdueInvoices(tenantOf(c).id))
).get(
  "/faturas/:codigo",
  param(codigoParam),
  requireTenantRole("admin", "seller"),
  async (c) => ok(c, await billingService.getInvoice(tenantOf(c).id, c.req.valid("param").codigo))
).post(
  "/faturas/enviar-vencidas",
  json(z2.object({ contratoCodigo: z2.string().min(1) })),
  async (c) => {
    const tenant = tenantOf(c);
    const { contratoCodigo } = c.req.valid("json");
    await assertContractAccess(c, contratoCodigo);
    const message = await billingService.sendOverdueInvoicesByEmail(tenant.id, contratoCodigo);
    return ok(c, { message });
  }
).get("/demonstrativos", query(z2.object({ contratoCodigo: z2.string().min(1) })), async (c) => {
  const tenant = tenantOf(c);
  const { contratoCodigo } = c.req.valid("query");
  await assertContractAccess(c, contratoCodigo);
  return ok(c, await billingService.listPaymentStatements(tenant.id, contratoCodigo));
}).get(
  "/demonstrativos/:codigo",
  param(codigoParam),
  async (c) => ok(c, await billingService.getPaymentStatement(tenantOf(c).id, c.req.valid("param").codigo))
).get(
  "/comissoes",
  requireTenantRole("admin", "seller"),
  query(z2.object({ vendedorId: z2.string().uuid().optional(), status: z2.enum(["emitido", "pago"]).default("emitido") })),
  async (c) => {
    const tenant = tenantOf(c);
    const auth2 = c.get("auth");
    const { vendedorId, status } = c.req.valid("query");
    const sellerId = auth2?.membership.tenantRole === "seller" ? auth2.user.id : vendedorId;
    if (!sellerId) throw AppError.validation([{ path: "vendedorId", message: "Informe o vendedor" }]);
    return ok(c, await billingService.listCommissionReceipts(tenant.id, sellerId, status));
  }
).get(
  "/comissoes/:codigo",
  param(codigoParam),
  requireTenantRole("admin", "seller"),
  async (c) => ok(c, await billingService.getCommissionReceipt(tenantOf(c).id, c.req.valid("param").codigo))
);
async function assertContractAccess(c, contratoCodigo) {
  const auth2 = c.get("auth");
  if (auth2?.membership.scope !== "tenant" || auth2.membership.tenantRole !== "client") return;
  const tenant = c.get("tenant");
  if (!tenant) throw AppError.notFound("Inquilino");
  const contract = await contractsService.getByCodigo(tenant.id, contratoCodigo);
  if (contract.clientUserId !== auth2.user.id) {
    throw AppError.forbidden("Este contrato n\xE3o pertence \xE0 sua conta");
  }
}

// src/modules/catalog/controller.ts
import { Hono as Hono3 } from "hono";
import { z as z3 } from "zod";

// src/modules/catalog/service.ts
import { and as and2, eq as eq3, gt } from "drizzle-orm";
var CACHE_TTL_MINUTES = 60;
var catalogService = {
  listConvenios(tenantId) {
    return cached(tenantId, "convenios", async () => {
      const client = await getDigitalSaudeClient(tenantId);
      const result = await client.call("convenioListar");
      return result.map(mapConvenio);
    });
  },
  async getConvenio(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("convenioPorCodigo", { codigoConvenio: codigo });
    return result ? mapConvenio(result) : null;
  },
  listPlansByProduct(tenantId, codigoProduto) {
    return cached(tenantId, `planos:${codigoProduto}`, async () => {
      const client = await getDigitalSaudeClient(tenantId);
      const result = await client.call("planoPorProduto", { codigoProduto });
      return result.map(mapPlan);
    });
  },
  async getPlan(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("planoPorCodigo", { codigoPlano: codigo });
    return result ? mapPlan(result) : null;
  },
  listWaitingPeriods(tenantId, codigoConvenio) {
    return cached(tenantId, `carencias:${codigoConvenio}`, async () => {
      const client = await getDigitalSaudeClient(tenantId);
      const result = await client.call("carenciaPorConvenio", { codigoConvenio });
      return result.map((item) => ({ codigo: item.codigo ?? "", name: item.nome ?? "" }));
    });
  },
  listPriceTables(tenantId, codigoConvenio) {
    return cached(tenantId, `tabelas:${codigoConvenio}`, async () => {
      const client = await getDigitalSaudeClient(tenantId);
      const result = await client.call("tabelaPorConvenio", { codigoConvenio });
      return result.map(mapPriceTable);
    });
  },
  async getPriceTable(tenantId, codigo) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.one("tabelaPorCodigo", { codigoTabela: codigo });
    return result ? mapPriceTable(result) : null;
  },
  /** Simulação de preço por região e composição familiar. Sem cache. */
  async quote(tenantId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("calculoSimular", {
      nome: input.name,
      uf: input.state,
      calculoVidaList: input.lives.map((life) => ({
        idade: life.age,
        parentesco: { id: life.relationshipId }
      }))
    });
    return { plans: result.map(mapPlan), quotedAt: (/* @__PURE__ */ new Date()).toISOString() };
  },
  async invalidate(tenantId) {
    await db.delete(upstreamCache).where(eq3(upstreamCache.organizationId, tenantId));
  }
};
async function cached(tenantId, key, loader) {
  const [hit] = await db.select({ payload: upstreamCache.payload }).from(upstreamCache).where(
    and2(
      eq3(upstreamCache.organizationId, tenantId),
      eq3(upstreamCache.cacheKey, key),
      gt(upstreamCache.expiresAt, /* @__PURE__ */ new Date())
    )
  ).limit(1);
  if (hit) return hit.payload;
  const value = await loader();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 6e4);
  try {
    await db.delete(upstreamCache).where(
      and2(eq3(upstreamCache.organizationId, tenantId), eq3(upstreamCache.cacheKey, key))
    );
    await db.insert(upstreamCache).values({
      organizationId: tenantId,
      cacheKey: key,
      payload: value,
      expiresAt
    });
  } catch (error) {
    logger.warn({ tenantId, key, err: error }, "N\xE3o foi poss\xEDvel gravar o cache do cat\xE1logo");
  }
  return value;
}

// src/modules/catalog/controller.ts
var codigoParam2 = z3.object({ codigo: z3.string().min(1) });
var convenioQuery = z3.object({ codigoConvenio: z3.string().min(1) });
var catalogController = new Hono3().use("*", resolveTenant, requireAuth, requireTenantRole()).get("/convenios", async (c) => ok(c, await catalogService.listConvenios(tenantOf(c).id))).get(
  "/convenios/:codigo",
  param(codigoParam2),
  async (c) => ok(c, await catalogService.getConvenio(tenantOf(c).id, c.req.valid("param").codigo))
).get(
  "/planos",
  query(z3.object({ codigoProduto: z3.string().min(1) })),
  async (c) => ok(c, await catalogService.listPlansByProduct(tenantOf(c).id, c.req.valid("query").codigoProduto))
).get(
  "/planos/:codigo",
  param(codigoParam2),
  async (c) => ok(c, await catalogService.getPlan(tenantOf(c).id, c.req.valid("param").codigo))
).get(
  "/carencias",
  query(convenioQuery),
  async (c) => ok(c, await catalogService.listWaitingPeriods(tenantOf(c).id, c.req.valid("query").codigoConvenio))
).get(
  "/tabelas",
  query(convenioQuery),
  async (c) => ok(c, await catalogService.listPriceTables(tenantOf(c).id, c.req.valid("query").codigoConvenio))
).get(
  "/tabelas/:codigo",
  param(codigoParam2),
  async (c) => ok(c, await catalogService.getPriceTable(tenantOf(c).id, c.req.valid("param").codigo))
).post(
  "/cotacao",
  requireTenantRole("admin", "seller"),
  json(quoteInput),
  async (c) => ok(c, await catalogService.quote(tenantOf(c).id, c.req.valid("json")))
).delete("/cache", requireTenantRole("admin"), async (c) => {
  await catalogService.invalidate(tenantOf(c).id);
  return ok(c, { invalidated: true });
});

// src/modules/contracts/controller.ts
import { Hono as Hono4 } from "hono";
import { z as z4 } from "zod";
var codigoParam3 = z4.object({ codigo: z4.string().min(1) });
var listQuery = paginationQuery.extend({ status: contractStatus.optional() });
var contractsController = new Hono4().use("*", resolveTenant, requireAuth, requireTenantRole()).get("/", query(listQuery), async (c) => {
  const tenant = tenantOf(c);
  const { page, perPage, status, q } = c.req.valid("query");
  const { items, total } = await contractsService.list({
    tenantId: tenant.id,
    page,
    perPage,
    status,
    search: q,
    ...visibilityFilter(c)
  });
  const result = paginate(items, page, perPage, total);
  return ok(c, result.items, result.meta);
}).get("/:codigo", param(codigoParam3), async (c) => {
  const tenant = tenantOf(c);
  const contract = await contractsService.getByCodigo(tenant.id, c.req.valid("param").codigo);
  assertCanSee(c, contract);
  return ok(c, contract);
}).post("/:codigo/sync", param(codigoParam3), requireTenantRole("admin", "seller"), async (c) => {
  const tenant = tenantOf(c);
  return ok(c, await contractsService.refreshFromUpstream(tenant.id, c.req.valid("param").codigo));
}).post("/", requireTenantRole("admin", "seller"), json(createContractInput), async (c) => {
  const tenant = tenantOf(c);
  const auth2 = c.get("auth");
  const contract = await contractsService.create(tenant.id, c.req.valid("json"), {
    sellerUserId: auth2?.membership.tenantRole === "seller" ? auth2.user.id : null
  });
  return created(c, contract);
}).post("/:codigo/produzido", param(codigoParam3), requireTenantRole("admin"), async (c) => {
  const tenant = tenantOf(c);
  return ok(c, await contractsService.markAsProduced(tenant.id, c.req.valid("param").codigo));
}).post("/:codigo/carteirinha/email", param(codigoParam3), async (c) => {
  const tenant = tenantOf(c);
  const contract = await contractsService.getByCodigo(tenant.id, c.req.valid("param").codigo);
  assertCanSee(c, contract);
  const message = await contractsService.sendMembershipCardByEmail(tenant.id, contract.upstreamCodigo);
  return ok(c, { message });
}).post("/anexos", requireTenantRole("admin", "seller"), json(attachDocumentInput), async (c) => {
  const tenant = tenantOf(c);
  return created(c, await contractsService.attachDocument(tenant.id, c.req.valid("json")));
}).post("/patologias", requireTenantRole("admin", "seller"), json(declarePathologyInput), async (c) => {
  const tenant = tenantOf(c);
  return created(c, await contractsService.declarePathology(tenant.id, c.req.valid("json")));
}).post(
  "/pendencias",
  requireTenantRole("admin"),
  json(z4.object({ contractCodigo: z4.string().min(1), pendencyCode: z4.string().min(1) })),
  async (c) => {
    const tenant = tenantOf(c);
    const { contractCodigo, pendencyCode } = c.req.valid("json");
    return created(c, await contractsService.registerPendency(tenant.id, contractCodigo, pendencyCode));
  }
).get(
  "/busca/cpf",
  requireTenantRole("admin"),
  query(z4.object({ cpf })),
  async (c) => {
    const tenant = tenantOf(c);
    const result = await contractsService.findUpstreamByCpf(tenant.id, c.req.valid("query").cpf);
    return ok(c, result);
  }
);
var membershipCardsController = new Hono4().use("*", resolveTenant, requireAuth, requireTenantRole("client")).get("/", async (c) => {
  const tenant = tenantOf(c);
  const auth2 = c.get("auth");
  if (!auth2) throw AppError.unauthenticated();
  return ok(c, await contractsService.membershipCards(tenant.id, auth2.user.id));
});
function visibilityFilter(c) {
  const auth2 = c.get("auth");
  if (auth2?.membership.scope === "tenant" && auth2.membership.tenantRole === "client") return { clientUserId: auth2.user.id };
  if (auth2?.membership.scope === "tenant" && auth2.membership.tenantRole === "seller") return { sellerUserId: auth2.user.id };
  return {};
}
function assertCanSee(c, contract) {
  const auth2 = c.get("auth");
  if (auth2?.membership.scope !== "tenant" || auth2.membership.tenantRole !== "client") return;
  if (!contract.clientUserId || contract.clientUserId !== auth2.user.id) {
    throw AppError.forbidden("Este contrato n\xE3o pertence \xE0 sua conta");
  }
}

// src/modules/crm/controller.ts
import { Hono as Hono5 } from "hono";
import { z as z5 } from "zod";

// src/modules/crm/service.ts
import { and as and3, count, desc as desc2, eq as eq4, gte, ilike, lte, or, sum } from "drizzle-orm";
var crmService = {
  async listLeads(params) {
    const filters = [eq4(leads.organizationId, params.tenantId)];
    if (params.status) filters.push(eq4(leads.status, params.status));
    if (params.sellerId) filters.push(eq4(leads.sellerId, params.sellerId));
    if (params.search) {
      const term = `%${params.search}%`;
      const match = or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.phone, term));
      if (match) filters.push(match);
    }
    const where = and3(...filters);
    const [rows, [totals]] = await Promise.all([
      db.query.leads.findMany({
        where,
        with: { interactions: true },
        orderBy: desc2(leads.updatedAt),
        limit: params.perPage,
        offset: (params.page - 1) * params.perPage
      }),
      db.select({ value: count() }).from(leads).where(where)
    ]);
    return { items: rows.map(toLead), total: totals?.value ?? 0 };
  },
  async getLead(tenantId, id) {
    const row = await db.query.leads.findFirst({
      where: and3(eq4(leads.organizationId, tenantId), eq4(leads.id, id)),
      with: { interactions: true }
    });
    if (!row) throw AppError.notFound("Lead");
    return toLead(row);
  },
  async createLead(tenantId, input) {
    const [row] = await db.insert(leads).values({
      organizationId: tenantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source,
      status: input.status,
      notes: input.notes,
      estimatedValue: input.estimatedValue === null ? null : String(input.estimatedValue),
      sellerId: input.sellerId
    }).returning();
    return toLead({ ...row, interactions: [] });
  },
  async updateLead(tenantId, id, input) {
    const [row] = await db.update(leads).set({
      ...input.name !== void 0 ? { name: input.name } : {},
      ...input.email !== void 0 ? { email: input.email } : {},
      ...input.phone !== void 0 ? { phone: input.phone } : {},
      ...input.source !== void 0 ? { source: input.source } : {},
      ...input.status !== void 0 ? { status: input.status } : {},
      ...input.notes !== void 0 ? { notes: input.notes } : {},
      ...input.sellerId !== void 0 ? { sellerId: input.sellerId } : {},
      ...input.estimatedValue !== void 0 ? { estimatedValue: input.estimatedValue === null ? null : String(input.estimatedValue) } : {},
      updatedAt: /* @__PURE__ */ new Date()
    }).where(and3(eq4(leads.organizationId, tenantId), eq4(leads.id, id))).returning();
    if (!row) throw AppError.notFound("Lead");
    return this.getLead(tenantId, row.id);
  },
  async deleteLead(tenantId, id) {
    const deleted = await db.delete(leads).where(and3(eq4(leads.organizationId, tenantId), eq4(leads.id, id))).returning({ id: leads.id });
    if (deleted.length === 0) throw AppError.notFound("Lead");
  },
  async addInteraction(tenantId, leadId, input, authorId) {
    await this.getLead(tenantId, leadId);
    await db.insert(leadInteractions).values({
      leadId,
      type: input.type,
      description: input.description,
      occurredAt: new Date(input.occurredAt),
      authorId
    });
    await db.update(leads).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq4(leads.id, leadId));
    return this.getLead(tenantId, leadId);
  },
  async listSales(params) {
    const filters = [eq4(sales.organizationId, params.tenantId)];
    if (params.sellerId) filters.push(eq4(sales.sellerId, params.sellerId));
    if (params.from) filters.push(gte(sales.soldAt, new Date(params.from)));
    if (params.to) filters.push(lte(sales.soldAt, new Date(params.to)));
    const where = and3(...filters);
    const [rows, [totals]] = await Promise.all([
      db.select({ sale: sales, sellerName: user.name }).from(sales).innerJoin(user, eq4(user.id, sales.sellerId)).where(where).orderBy(desc2(sales.soldAt)).limit(params.perPage).offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(sales).where(where)
    ]);
    return {
      items: rows.map((row) => toSale(row.sale, row.sellerName)),
      total: totals?.value ?? 0
    };
  },
  async createSale(tenantId, input) {
    const [seller] = await db.select({ name: user.name, rate: sellerProfiles.commissionRate }).from(member).innerJoin(user, eq4(user.id, member.userId)).leftJoin(
      sellerProfiles,
      and3(eq4(sellerProfiles.userId, member.userId), eq4(sellerProfiles.organizationId, member.organizationId))
    ).where(and3(eq4(member.userId, input.sellerId), eq4(member.organizationId, tenantId))).limit(1);
    if (!seller) throw AppError.notFound("Vendedor");
    const rate = Number(seller.rate ?? 0);
    const commission = Number((input.value * rate).toFixed(2));
    const [row] = await db.insert(sales).values({
      organizationId: tenantId,
      leadId: input.leadId,
      clientUserId: input.clientUserId,
      clientName: input.clientName,
      sellerId: input.sellerId,
      planCodigo: input.planCodigo,
      planName: input.planName,
      value: String(input.value),
      commission: String(commission),
      status: input.status,
      soldAt: new Date(input.soldAt),
      contractUpstreamCodigo: input.contractUpstreamCodigo
    }).returning();
    if (input.leadId) {
      await db.update(leads).set({ status: "closed", updatedAt: /* @__PURE__ */ new Date() }).where(and3(eq4(leads.organizationId, tenantId), eq4(leads.id, input.leadId)));
    }
    return toSale(row, seller.name);
  },
  /**
   * Metas por vendedor/mês. `achieved` não é coluna: é somado das vendas
   * confirmadas do período, para não existir número de meta divergente do
   * histórico real de vendas.
   */
  async listGoals(tenantId, params) {
    const filters = [eq4(salesGoals.organizationId, tenantId), eq4(salesGoals.year, params.year)];
    if (params.month) filters.push(eq4(salesGoals.month, params.month));
    if (params.sellerId) filters.push(eq4(salesGoals.sellerId, params.sellerId));
    const rows = await db.select().from(salesGoals).where(and3(...filters));
    return Promise.all(
      rows.map(async (row) => {
        const start = new Date(Date.UTC(row.year, row.month - 1, 1));
        const end = new Date(Date.UTC(row.year, row.month, 1));
        const [achieved] = await db.select({ total: sum(sales.value) }).from(sales).where(
          and3(
            eq4(sales.organizationId, tenantId),
            eq4(sales.sellerId, row.sellerId),
            eq4(sales.status, "confirmed"),
            gte(sales.soldAt, start),
            lte(sales.soldAt, end)
          )
        );
        return {
          id: row.id,
          tenantId: row.organizationId,
          sellerId: row.sellerId,
          month: row.month,
          year: row.year,
          target: Number(row.target),
          achieved: Number(achieved?.total ?? 0),
          commissionRate: Number(row.commissionRate)
        };
      })
    );
  },
  async upsertGoal(tenantId, input) {
    await db.insert(salesGoals).values({
      organizationId: tenantId,
      sellerId: input.sellerId,
      month: input.month,
      year: input.year,
      target: String(input.target),
      commissionRate: String(input.commissionRate)
    }).onConflictDoUpdate({
      target: [salesGoals.sellerId, salesGoals.year, salesGoals.month],
      set: { target: String(input.target), commissionRate: String(input.commissionRate) }
    });
    const [goal] = await this.listGoals(tenantId, {
      year: input.year,
      month: input.month,
      sellerId: input.sellerId
    });
    return goal;
  }
};
function toLead(row) {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    notes: row.notes,
    estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
    sellerId: row.sellerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    interactions: row.interactions.map((interaction) => ({
      id: interaction.id,
      leadId: interaction.leadId,
      type: interaction.type,
      description: interaction.description,
      occurredAt: interaction.occurredAt.toISOString(),
      authorId: interaction.authorId
    }))
  };
}
function toSale(row, sellerName) {
  return {
    id: row.id,
    tenantId: row.organizationId,
    leadId: row.leadId,
    clientUserId: row.clientUserId,
    clientName: row.clientName,
    sellerId: row.sellerId,
    sellerName,
    planCodigo: row.planCodigo,
    planName: row.planName,
    value: Number(row.value),
    commission: Number(row.commission),
    status: row.status,
    soldAt: row.soldAt.toISOString(),
    contractUpstreamCodigo: row.contractUpstreamCodigo
  };
}

// src/modules/crm/controller.ts
var idParam = z5.object({ id: z5.string().uuid() });
var crmController = new Hono5().use("*", resolveTenant, requireAuth, requireTenantRole("admin", "seller")).get(
  "/leads",
  query(paginationQuery.extend({ status: leadStatus.optional(), vendedorId: z5.string().uuid().optional() })),
  async (c) => {
    const { page, perPage, status, q, vendedorId } = c.req.valid("query");
    const { items, total } = await crmService.listLeads({
      tenantId: tenantOf(c).id,
      page,
      perPage,
      status,
      search: q,
      sellerId: ownScope(c) ?? vendedorId
    });
    const result = paginate(items, page, perPage, total);
    return ok(c, result.items, result.meta);
  }
).post("/leads", json(createLeadInput), async (c) => {
  const input = c.req.valid("json");
  return created(
    c,
    await crmService.createLead(tenantOf(c).id, {
      ...input,
      sellerId: ownScope(c) ?? input.sellerId
    })
  );
}).get(
  "/leads/:id",
  param(idParam),
  async (c) => ok(c, await crmService.getLead(tenantOf(c).id, c.req.valid("param").id))
).patch(
  "/leads/:id",
  param(idParam),
  json(updateLeadInput),
  async (c) => ok(c, await crmService.updateLead(tenantOf(c).id, c.req.valid("param").id, c.req.valid("json")))
).delete("/leads/:id", param(idParam), requireTenantRole("admin"), async (c) => {
  await crmService.deleteLead(tenantOf(c).id, c.req.valid("param").id);
  return noContent(c);
}).post("/leads/:id/interacoes", param(idParam), json(createInteractionInput), async (c) => {
  const auth2 = c.get("auth");
  return created(
    c,
    await crmService.addInteraction(
      tenantOf(c).id,
      c.req.valid("param").id,
      c.req.valid("json"),
      auth2?.user.id ?? null
    )
  );
}).get(
  "/vendas",
  query(
    paginationQuery.extend({
      vendedorId: z5.string().uuid().optional(),
      de: z5.string().datetime().optional(),
      ate: z5.string().datetime().optional()
    })
  ),
  async (c) => {
    const { page, perPage, vendedorId, de, ate } = c.req.valid("query");
    const { items, total } = await crmService.listSales({
      tenantId: tenantOf(c).id,
      page,
      perPage,
      sellerId: ownScope(c) ?? vendedorId,
      from: de,
      to: ate
    });
    const result = paginate(items, page, perPage, total);
    return ok(c, result.items, result.meta);
  }
).post("/vendas", json(createSaleInput), async (c) => {
  const input = c.req.valid("json");
  return created(
    c,
    await crmService.createSale(tenantOf(c).id, {
      ...input,
      sellerId: ownScope(c) ?? input.sellerId
    })
  );
}).get(
  "/metas",
  query(
    z5.object({
      ano: z5.coerce.number().int(),
      mes: z5.coerce.number().int().min(1).max(12).optional(),
      vendedorId: z5.string().uuid().optional()
    })
  ),
  async (c) => {
    const { ano, mes, vendedorId } = c.req.valid("query");
    return ok(
      c,
      await crmService.listGoals(tenantOf(c).id, {
        year: ano,
        month: mes,
        sellerId: ownScope(c) ?? vendedorId
      })
    );
  }
).put(
  "/metas",
  requireTenantRole("admin"),
  json(upsertSalesGoalInput),
  async (c) => ok(c, await crmService.upsertGoal(tenantOf(c).id, c.req.valid("json")))
);
function ownScope(c) {
  const auth2 = c.get("auth");
  return auth2?.membership.scope === "tenant" && auth2.membership.tenantRole === "seller" ? auth2.user.id : void 0;
}

// src/modules/health/controller.ts
import { sql } from "drizzle-orm";
import { Hono as Hono6 } from "hono";
var healthController = new Hono6().get("/healthz", (c) => ok(c, { status: "ok", uptime: Math.round(process.uptime()) })).get("/readyz", async (c) => {
  const startedAt = performance.now();
  await db.execute(sql`select 1`);
  return ok(c, {
    status: "ok",
    database: { ok: true, latencyMs: Math.round(performance.now() - startedAt) }
  });
});

// src/modules/network/controller.ts
import { and as and4, count as count2, desc as desc3, eq as eq5, ilike as ilike2, or as or2 } from "drizzle-orm";
import { Hono as Hono7 } from "hono";
import { z as z6 } from "zod";
var idParam2 = z6.object({ id: z6.string().uuid() });
var networkController = new Hono7().use("*", resolveTenant, requireAuth, requireTenantRole()).get(
  "/parceiros",
  query(paginationQuery.extend({ categoria: partnerCategory.optional() })),
  async (c) => {
    const tenant = tenantOf(c);
    const { page, perPage, categoria, q } = c.req.valid("query");
    const filters = [eq5(partners.organizationId, tenant.id)];
    if (categoria) filters.push(eq5(partners.category, categoria));
    if (q) {
      const term = `%${q}%`;
      const match = or2(ilike2(partners.name, term), ilike2(partners.city, term));
      if (match) filters.push(match);
    }
    const where = and4(...filters);
    const [rows, [totals]] = await Promise.all([
      db.select().from(partners).where(where).orderBy(desc3(partners.createdAt)).limit(perPage).offset((page - 1) * perPage),
      db.select({ value: count2() }).from(partners).where(where)
    ]);
    const result = paginate(rows.map(toPartner), page, perPage, totals?.value ?? 0);
    return ok(c, result.items, result.meta);
  }
).post("/parceiros", requireTenantRole("admin"), json(createPartnerInput), async (c) => {
  const input = c.req.valid("json");
  const [row] = await db.insert(partners).values({
    organizationId: tenantOf(c).id,
    name: input.name,
    category: input.category,
    discountPercent: String(input.discountPercent),
    address: input.address,
    phone: input.phone,
    city: input.city,
    state: input.state,
    status: input.status
  }).returning();
  return created(c, toPartner(row));
}).patch(
  "/parceiros/:id",
  requireTenantRole("admin"),
  param(idParam2),
  json(createPartnerInput.partial()),
  async (c) => {
    const input = c.req.valid("json");
    const [row] = await db.update(partners).set({
      ...input.name !== void 0 ? { name: input.name } : {},
      ...input.category !== void 0 ? { category: input.category } : {},
      ...input.discountPercent !== void 0 ? { discountPercent: String(input.discountPercent) } : {},
      ...input.address !== void 0 ? { address: input.address } : {},
      ...input.phone !== void 0 ? { phone: input.phone } : {},
      ...input.city !== void 0 ? { city: input.city } : {},
      ...input.state !== void 0 ? { state: input.state } : {},
      ...input.status !== void 0 ? { status: input.status } : {}
    }).where(and4(eq5(partners.organizationId, tenantOf(c).id), eq5(partners.id, c.req.valid("param").id))).returning();
    if (!row) throw AppError.notFound("Parceiro");
    return ok(c, toPartner(row));
  }
).delete("/parceiros/:id", requireTenantRole("admin"), param(idParam2), async (c) => {
  const deleted = await db.delete(partners).where(and4(eq5(partners.organizationId, tenantOf(c).id), eq5(partners.id, c.req.valid("param").id))).returning({ id: partners.id });
  if (deleted.length === 0) throw AppError.notFound("Parceiro");
  return noContent(c);
}).get("/beneficios", async (c) => {
  const rows = await db.select().from(benefits).where(eq5(benefits.organizationId, tenantOf(c).id)).orderBy(desc3(benefits.createdAt));
  return ok(c, rows.map(toBenefit));
}).post("/beneficios", requireTenantRole("admin"), json(createBenefitInput), async (c) => {
  const input = c.req.valid("json");
  const [row] = await db.insert(benefits).values({
    organizationId: tenantOf(c).id,
    name: input.name,
    description: input.description,
    category: input.category,
    discountPercent: input.discountPercent === null ? null : String(input.discountPercent),
    provider: input.provider,
    locations: input.locations
  }).returning();
  return created(c, toBenefit(row));
}).delete("/beneficios/:id", requireTenantRole("admin"), param(idParam2), async (c) => {
  const deleted = await db.delete(benefits).where(and4(eq5(benefits.organizationId, tenantOf(c).id), eq5(benefits.id, c.req.valid("param").id))).returning({ id: benefits.id });
  if (deleted.length === 0) throw AppError.notFound("Benef\xEDcio");
  return noContent(c);
});
function toPartner(row) {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    category: row.category,
    discountPercent: Number(row.discountPercent),
    address: row.address,
    phone: row.phone,
    city: row.city,
    state: row.state,
    status: row.status
  };
}
function toBenefit(row) {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    description: row.description,
    category: row.category,
    discountPercent: row.discountPercent === null ? null : Number(row.discountPercent),
    provider: row.provider,
    locations: row.locations
  };
}

// src/modules/platform-users/controller.ts
import { Hono as Hono8 } from "hono";

// src/modules/platform-users/service.ts
import { and as and5, count as count3, desc as desc4, eq as eq6, ilike as ilike3, inArray as inArray2, or as or3 } from "drizzle-orm";
var PLATFORM_ROLES = ["superadmin", "platform_admin"];
var platformUsersService = {
  async list(params) {
    const filters = [inArray2(user.role, PLATFORM_ROLES)];
    if (params.role) filters.push(eq6(user.role, params.role));
    if (params.search) {
      const term = `%${params.search}%`;
      const match = or3(ilike3(user.name, term), ilike3(user.email, term));
      if (match) filters.push(match);
    }
    const where = and5(...filters);
    const [rows, [totals]] = await Promise.all([
      db.select().from(user).where(where).orderBy(desc4(user.createdAt)).limit(params.perPage).offset((params.page - 1) * params.perPage),
      db.select({ value: count3() }).from(user).where(where)
    ]);
    return { items: rows.map(toDomain), total: totals?.value ?? 0 };
  },
  /**
   * Cria a conta headerless — a mesma "ação de sistema" usada em todo lugar
   * que a Annetec provisiona conta em nome de outra pessoa. A autorização
   * (só superadmin chega aqui) já foi feita por `requirePlatformRole` na rota;
   * não depende de sessão do Better Auth para isso.
   */
  async create(input) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq6(user.email, input.email.toLowerCase())).limit(1);
    if (existing) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, "J\xE1 existe uma conta com este e-mail");
    }
    const created2 = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email.toLowerCase(),
        password: input.password,
        role: input.role,
        data: input.phone ? { phone: input.phone } : void 0
      }
    });
    const [row] = await db.select().from(user).where(eq6(user.id, created2.user.id)).limit(1);
    if (!row) throw AppError.businessRule("Falha ao carregar a conta rec\xE9m-criada");
    return toDomain(row);
  }
};
function toDomain(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role,
    avatarUrl: row.image,
    createdAt: row.createdAt.toISOString()
  };
}

// src/modules/platform-users/controller.ts
var listQuery2 = paginationQuery.extend({ role: platformRole.optional() });
var platformUsersController = new Hono8().use("*", requireAuth, requirePlatformRole()).get("/", query(listQuery2), async (c) => {
  const { page, perPage, role, q } = c.req.valid("query");
  const { items, total } = await platformUsersService.list({ page, perPage, role, search: q });
  const result = paginate(items, page, perPage, total);
  return ok(c, result.items, result.meta);
}).post(
  "/",
  requirePlatformRole("superadmin"),
  json(createPlatformUserInput),
  async (c) => created(c, await platformUsersService.create(c.req.valid("json")))
);

// src/modules/tenant-plans/controller.ts
import { Hono as Hono9 } from "hono";

// src/modules/tenant-plans/service.ts
import { desc as desc5 } from "drizzle-orm";
var tenantPlansService = {
  async list() {
    const rows = await db.select().from(tenantPlans).orderBy(desc5(tenantPlans.priceMonthly));
    return rows.map(toDomain2);
  },
  async create(input) {
    const [row] = await db.insert(tenantPlans).values({
      name: input.name,
      priceMonthly: String(input.priceMonthly),
      memberLimit: input.memberLimit,
      features: input.features
    }).returning();
    return toDomain2(row);
  }
};
function toDomain2(row) {
  return {
    id: row.id,
    name: row.name,
    priceMonthly: Number(row.priceMonthly),
    memberLimit: row.memberLimit,
    features: row.features
  };
}

// src/modules/tenant-plans/controller.ts
var tenantPlansController = new Hono9().use("*", requireAuth, requirePlatformRole()).get("/", async (c) => ok(c, await tenantPlansService.list())).post(
  "/",
  requirePlatformRole("superadmin"),
  json(createTenantPlanInput),
  async (c) => created(c, await tenantPlansService.create(c.req.valid("json")))
);

// src/modules/tenants/controller.ts
import { Hono as Hono10 } from "hono";
import { z as z7 } from "zod";

// src/modules/tenants/service.ts
import { and as and6, count as count4, desc as desc6, eq as eq7, ilike as ilike4, or as or4 } from "drizzle-orm";
var tenantsService = {
  async list(params) {
    const filters = [];
    if (params.status) filters.push(eq7(tenantProfiles.status, params.status));
    if (params.search) {
      const term = `%${params.search}%`;
      const match = or4(
        ilike4(organization.name, term),
        ilike4(organization.slug, term),
        ilike4(tenantProfiles.document, term)
      );
      if (match) filters.push(match);
    }
    const where = filters.length > 0 ? and6(...filters) : void 0;
    const [rows, [totals]] = await Promise.all([
      db.select().from(organization).innerJoin(tenantProfiles, eq7(tenantProfiles.organizationId, organization.id)).where(where).orderBy(desc6(tenantProfiles.createdAt)).limit(params.perPage).offset((params.page - 1) * params.perPage),
      db.select({ value: count4() }).from(organization).innerJoin(tenantProfiles, eq7(tenantProfiles.organizationId, organization.id)).where(where)
    ]);
    return { items: rows.map((row) => toDomain3(row.organization, row.tenant_profiles)), total: totals?.value ?? 0 };
  },
  async getById(id) {
    const row = await findByOrgId(id);
    if (!row) throw AppError.notFound("Inquilino");
    return toDomain3(row.organization, row.tenant_profiles);
  },
  async getBySlug(slug) {
    const [row] = await db.select().from(organization).innerJoin(tenantProfiles, eq7(tenantProfiles.organizationId, organization.id)).where(eq7(organization.slug, slug.toLowerCase())).limit(1);
    if (!row) throw AppError.notFound("Inquilino");
    return toDomain3(row.organization, row.tenant_profiles);
  },
  /**
   * Mesmos dados de `getBySlug`, mas para a rota pública (sem sessão) que
   * resolve a página institucional `/[tenant]` e o login com a marca do
   * clube antes de qualquer login existir. Um inquilino cancelado não deve
   * resolver aqui — mesma regra de `resolveTenant` para as rotas
   * autenticadas.
   */
  async getPublicBySlug(slug) {
    const tenant = await this.getBySlug(slug);
    if (tenant.status === "cancelled") {
      throw AppError.forbidden("Este inquilino est\xE1 cancelado");
    }
    return tenant;
  },
  /**
   * Cria o inquilino e seu admin. `headers` é a sessão do superadmin que
   * chamou. `auth.api.createUser`/`createOrganization` são chamados sem
   * `headers`: sem sessão no contexto, o Better Auth trata como ação de
   * sistema e pula a checagem de permissão — o mesmo padrão usado em todo
   * lugar que a Annetec provisiona conta em nome de outra pessoa (a
   * autorização de quem pode chegar até aqui já foi feita por
   * `requirePlatformRole` na rota).
   */
  async create(input) {
    const [existingOrg] = await db.select({ id: organization.id }).from(organization).where(eq7(organization.slug, input.slug)).limit(1);
    if (existingOrg) throw new AppError(ERROR_CODES.ALREADY_EXISTS, "J\xE1 existe inquilino com este slug");
    const [existingDocument] = await db.select({ organizationId: tenantProfiles.organizationId }).from(tenantProfiles).where(eq7(tenantProfiles.document, input.document)).limit(1);
    if (existingDocument) throw new AppError(ERROR_CODES.ALREADY_EXISTS, "J\xE1 existe inquilino com este CNPJ");
    const ownerPassword = generateProvisionalPassword();
    const created2 = await auth.api.createUser({
      body: { email: input.ownerEmail.toLowerCase(), name: input.ownerName, password: ownerPassword }
    });
    const org = await auth.api.createOrganization({
      body: { name: input.name, slug: input.slug, userId: created2.user.id }
    });
    if (!org) throw AppError.businessRule("N\xE3o foi poss\xEDvel criar o inquilino");
    await db.insert(tenantProfiles).values({
      organizationId: org.id,
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      address: input.address,
      branding: input.branding,
      planId: input.planId,
      status: input.status,
      trialEndsAt: input.status === "trial" ? new Date(Date.now() + 30 * 864e5) : null
    });
    if (input.integration) {
      await db.insert(tenantIntegrations).values(toIntegrationRow(org.id, input.integration));
    }
    logger.info({ organizationId: org.id, slug: org.slug }, "Inquilino criado");
    return { tenant: await this.getBySlug(org.slug), ownerPassword };
  },
  async update(id, input) {
    const row = await findByOrgId(id);
    if (!row) throw AppError.notFound("Inquilino");
    if (input.name !== void 0) {
      await db.update(organization).set({ name: input.name }).where(eq7(organization.id, id));
    }
    await db.update(tenantProfiles).set({
      ...input.legalName !== void 0 ? { legalName: input.legalName } : {},
      ...input.document !== void 0 ? { document: input.document } : {},
      ...input.email !== void 0 ? { email: input.email } : {},
      ...input.phone !== void 0 ? { phone: input.phone } : {},
      ...input.address !== void 0 ? { address: input.address } : {},
      ...input.branding !== void 0 ? { branding: input.branding } : {},
      ...input.planId !== void 0 ? { planId: input.planId } : {},
      ...input.status !== void 0 ? { status: input.status } : {},
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq7(tenantProfiles.organizationId, id));
    return this.getById(id);
  },
  /**
   * Cancelamento é lógico. Apagar a `organization` derrubaria em cascata
   * usuários, contratos e histórico de vendas — informação que a
   * administradora ainda precisa acessar depois do encerramento do contrato.
   */
  async cancel(id) {
    await db.update(tenantProfiles).set({ status: "cancelled", updatedAt: /* @__PURE__ */ new Date() }).where(eq7(tenantProfiles.organizationId, id));
    return this.getById(id);
  },
  async getIntegration(tenantId) {
    const [row] = await db.select().from(tenantIntegrations).where(eq7(tenantIntegrations.organizationId, tenantId)).limit(1);
    if (!row) return null;
    return {
      provider: "digitalsaude",
      baseUrl: row.baseUrl,
      defaultGrupoCodigo: row.defaultGrupoCodigo ?? void 0,
      defaultFilialCodigo: row.defaultFilialCodigo ?? void 0,
      defaultConvenioCodigo: row.defaultConvenioCodigo ?? void 0,
      enabled: row.enabled,
      configured: true,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk
    };
  },
  /**
   * Grava as credenciais e valida contra o ERP na mesma operação. Credencial
   * errada é rejeitada na hora, em vez de aparecer como erro no primeiro
   * associado que tentar entrar.
   */
  async saveIntegration(tenantId, input) {
    const probe = createDigitalSaudeClient({
      baseUrl: input.baseUrl,
      appToken: input.appToken,
      apiPassword: input.apiPassword,
      label: tenantId
    });
    const ok2 = await probe.healthCheck();
    if (!ok2) {
      throw new AppError(
        ERROR_CODES.UPSTREAM_UNAUTHORIZED,
        "A Digital Sa\xFAde recusou estas credenciais. Confira token e senhaApi."
      );
    }
    const row = toIntegrationRow(tenantId, input);
    await db.insert(tenantIntegrations).values({ ...row, lastCheckedAt: /* @__PURE__ */ new Date(), lastCheckOk: true }).onConflictDoUpdate({
      target: tenantIntegrations.organizationId,
      set: { ...row, lastCheckedAt: /* @__PURE__ */ new Date(), lastCheckOk: true, updatedAt: /* @__PURE__ */ new Date() }
    });
    invalidateDigitalSaudeClient(tenantId);
    const saved = await this.getIntegration(tenantId);
    return saved;
  },
  async testIntegration(tenantId) {
    const { getDigitalSaudeClient: getDigitalSaudeClient2 } = await import("./provider-743IQRXH.js");
    const client = await getDigitalSaudeClient2(tenantId);
    const ok2 = await client.healthCheck();
    await db.update(tenantIntegrations).set({ lastCheckedAt: /* @__PURE__ */ new Date(), lastCheckOk: ok2 }).where(eq7(tenantIntegrations.organizationId, tenantId));
    return ok2;
  }
};
function findByOrgId(id) {
  return db.select().from(organization).innerJoin(tenantProfiles, eq7(tenantProfiles.organizationId, organization.id)).where(eq7(organization.id, id)).limit(1).then((rows) => rows[0]);
}
function toIntegrationRow(organizationId, input) {
  return {
    organizationId,
    provider: input.provider,
    baseUrl: input.baseUrl,
    appTokenEncrypted: encryptSecret(input.appToken),
    apiPasswordEncrypted: encryptSecret(input.apiPassword),
    defaultGrupoCodigo: input.defaultGrupoCodigo ?? null,
    defaultFilialCodigo: input.defaultFilialCodigo ?? null,
    defaultConvenioCodigo: input.defaultConvenioCodigo ?? null,
    enabled: input.enabled
  };
}
function generateProvisionalPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function toDomain3(org, profile) {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    legalName: profile.legalName,
    document: profile.document,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    branding: profile.branding,
    planId: profile.planId,
    status: profile.status,
    createdAt: profile.createdAt.toISOString(),
    trialEndsAt: profile.trialEndsAt?.toISOString() ?? null
  };
}

// src/modules/tenants/controller.ts
var idParam3 = z7.object({ id: z7.string().uuid() });
var listQuery3 = paginationQuery.extend({ status: tenantStatus.optional() });
var tenantsController = new Hono10().use("*", requireAuth, requirePlatformRole()).get("/", query(listQuery3), async (c) => {
  const { page, perPage, status, q } = c.req.valid("query");
  const { items, total } = await tenantsService.list({ page, perPage, status, search: q });
  const result = paginate(items, page, perPage, total);
  return ok(c, result.items, result.meta);
}).post("/", json(createTenantInput), async (c) => {
  const { tenant, ownerPassword } = await tenantsService.create(c.req.valid("json"));
  return created(c, { tenant, ownerPassword });
}).get("/:id", param(idParam3), async (c) => ok(c, await tenantsService.getById(c.req.valid("param").id))).patch(
  "/:id",
  param(idParam3),
  json(updateTenantInput),
  async (c) => ok(c, await tenantsService.update(c.req.valid("param").id, c.req.valid("json")))
).delete(
  "/:id",
  param(idParam3),
  async (c) => ok(c, await tenantsService.cancel(c.req.valid("param").id))
).get(
  "/:id/integration",
  param(idParam3),
  async (c) => ok(c, await tenantsService.getIntegration(c.req.valid("param").id))
).put(
  "/:id/integration",
  param(idParam3),
  json(tenantIntegration),
  async (c) => ok(c, await tenantsService.saveIntegration(c.req.valid("param").id, c.req.valid("json")))
).post(
  "/:id/integration/test",
  param(idParam3),
  async (c) => ok(c, { ok: await tenantsService.testIntegration(c.req.valid("param").id) })
);

// src/modules/tenants/public-controller.ts
import { Hono as Hono11 } from "hono";
var tenantPublicController = new Hono11().get("/", async (c) => {
  const slug = c.req.param("tenantSlug");
  if (!slug) throw AppError.notFound("Inquilino");
  return ok(c, await tenantsService.getPublicBySlug(slug));
});

// src/modules/users/controller.ts
import { Hono as Hono12 } from "hono";
import { z as z8 } from "zod";
var idParam4 = z8.object({ id: z8.string().uuid() });
var listQuery4 = paginationQuery.extend({ role: tenantRole.optional() });
var usersController = new Hono12().use("*", resolveTenant, requireAuth, requireTenantRole("admin")).get("/", query(listQuery4), async (c) => {
  const { page, perPage, role, q } = c.req.valid("query");
  const { items, total } = await usersService.list({
    tenantId: tenantOf(c).id,
    page,
    perPage,
    role,
    search: q
  });
  const result = paginate(items, page, perPage, total);
  return ok(c, result.items, result.meta);
}).post(
  "/",
  json(createTenantUserInput),
  async (c) => created(c, await usersService.create(tenantOf(c).id, c.req.valid("json")))
).get(
  "/:id",
  param(idParam4),
  async (c) => ok(c, await usersService.getById(tenantOf(c).id, c.req.valid("param").id))
).patch(
  "/:id",
  param(idParam4),
  json(updateTenantUserInput),
  async (c) => ok(c, await usersService.update(tenantOf(c).id, c.req.valid("param").id, c.req.valid("json")))
).delete(
  "/:id",
  param(idParam4),
  async (c) => ok(c, await usersService.deactivate(tenantOf(c).id, c.req.valid("param").id))
).put(
  "/:id/produtor",
  param(idParam4),
  json(
    z8.object({
      codigo: z8.string().min(1),
      login: z8.string().min(1).optional(),
      password: z8.string().min(1).optional()
    })
  ),
  async (c) => ok(
    c,
    await sellersService.linkProdutor(
      tenantOf(c).id,
      c.req.valid("param").id,
      c.req.valid("json")
    )
  )
).post(
  "/:id/produtor",
  param(idParam4),
  json(
    z8.object({
      nome: z8.string().min(1),
      email: z8.string().email(),
      numeroDocumento: z8.string().optional(),
      grupoProdutorCodigo: z8.string().min(1)
    })
  ),
  async (c) => created(
    c,
    await sellersService.createProdutor(
      tenantOf(c).id,
      c.req.valid("param").id,
      c.req.valid("json")
    )
  )
);

// src/routes.ts
var routes = new Hono13().route("/", healthController).route("/api/v1/auth", authController).route("/api/v1/platform/tenants", tenantsController).route("/api/v1/platform/users", platformUsersController).route("/api/v1/platform/plans", tenantPlansController).route("/api/v1/t/:tenantSlug/public", tenantPublicController).route("/api/v1/t/:tenantSlug/usuarios", usersController).route("/api/v1/t/:tenantSlug/contratos", contractsController).route("/api/v1/t/:tenantSlug/carteirinhas", membershipCardsController).route("/api/v1/t/:tenantSlug/catalogo", catalogController).route("/api/v1/t/:tenantSlug/financeiro", billingController).route("/api/v1/t/:tenantSlug/crm", crmController).route("/api/v1/t/:tenantSlug/rede", networkController);

// src/app.ts
function createApp() {
  const app = new Hono14();
  app.use("*", requestId);
  app.use("*", secureHeaders());
  app.use(
    "/api/*",
    cors({
      origin: corsOrigins,
      allowHeaders: ["authorization", "content-type", "x-request-id"],
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      exposeHeaders: ["x-request-id"],
      credentials: true,
      maxAge: 86400
    })
  );
  app.route("/", routes);
  app.notFound(
    (c) => c.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Rota n\xE3o encontrada: ${c.req.method} ${c.req.path}`,
          requestId: c.get("requestId")
        }
      },
      404
    )
  );
  app.onError(errorHandler);
  return app;
}

// src/vercel.ts
var config = {
  runtime: "nodejs"
};
var vercel_default = handle(createApp());
export {
  config,
  vercel_default as default
};
