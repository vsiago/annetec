import {
  mapContract
} from "./chunk-P2WGSFUZ.js";
import {
  AppError,
  ERROR_CODES,
  account,
  clientProfiles,
  db,
  decryptSecret,
  encryptSecret,
  env,
  getDigitalSaudeClient,
  invitation,
  logger,
  member,
  organization,
  sellerProfiles,
  session,
  user,
  verification
} from "./chunk-HNEZMN3V.js";

// src/modules/users/service.ts
import { and as and3, count, desc, eq as eq3, ilike, or } from "drizzle-orm";

// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, customSession, organization as organization2 } from "better-auth/plugins";
import { adminAc as platformAdminAc, userAc as platformUserAc } from "better-auth/plugins/admin/access";
import { adminAc, defaultAc, ownerAc } from "better-auth/plugins/organization/access";

// src/lib/auth-plugins/client-portal.ts
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

// src/lib/background.ts
function runInBackground(work, onError) {
  const settled = work.catch(onError);
  if (process.env.VERCEL) {
    void import("@vercel/functions").then(({ waitUntil }) => waitUntil(settled));
  }
}

// src/lib/auth-plugins/client-portal.ts
function clientPortal() {
  return {
    id: "client-portal",
    endpoints: {
      signInClientPortal: createAuthEndpoint(
        "/sign-in/client-portal",
        {
          method: "POST",
          body: z.object({
            tenantSlug: z.string().min(1),
            cpf: z.string().min(11),
            email: z.string().email()
          })
        },
        async (ctx) => {
          const { tenantSlug, cpf, email } = ctx.body;
          const [tenant] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, tenantSlug.toLowerCase())).limit(1);
          if (!tenant) throw new APIError("NOT_FOUND", { message: "Inquilino n\xE3o encontrado" });
          const client = await getDigitalSaudeClient(tenant.id);
          const upstreamContracts = await client.call("contratoPorClientePortal", { cpf, email });
          const contracts = upstreamContracts.map(mapContract).filter((c) => c.upstreamCodigo !== "");
          if (contracts.length === 0) {
            throw new APIError("UNAUTHORIZED", {
              message: "N\xE3o encontramos contrato com este CPF e e-mail"
            });
          }
          const holderName = contracts[0]?.holderName ?? "Associado";
          const normalizedEmail = email.toLowerCase();
          let authUser = (await ctx.context.internalAdapter.findUserByEmail(normalizedEmail))?.user;
          if (!authUser) {
            authUser = await ctx.context.internalAdapter.createUser(
              { email: normalizedEmail, name: holderName, emailVerified: true },
              { method: "digitalsaude-portal" }
            );
            logger.info({ tenantId: tenant.id, userId: authUser.id }, "Associado provisionado pelo portal");
          }
          const [existingMember] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, tenant.id), eq(member.userId, authUser.id))).limit(1);
          if (!existingMember) {
            await db.insert(member).values({
              id: crypto.randomUUID(),
              organizationId: tenant.id,
              userId: authUser.id,
              role: "client"
            });
          }
          await db.insert(clientProfiles).values({
            userId: authUser.id,
            organizationId: tenant.id,
            cpf,
            primaryContractCodigo: contracts[0]?.upstreamCodigo ?? null
          }).onConflictDoUpdate({
            target: [clientProfiles.userId, clientProfiles.organizationId],
            set: { cpf, primaryContractCodigo: contracts[0]?.upstreamCodigo ?? null }
          });
          const session2 = await ctx.context.internalAdapter.createSession(authUser.id, false, {
            activeOrganizationId: tenant.id
          });
          if (!session2) {
            throw new APIError("INTERNAL_SERVER_ERROR", { message: "Falha ao criar sess\xE3o" });
          }
          await setSessionCookie(ctx, { session: session2, user: authUser });
          runInBackground(
            import("./service-3XGIFHVX.js").then(
              ({ contractsService }) => contractsService.syncContracts(tenant.id, contracts, { clientUserId: authUser.id })
            ),
            (error) => logger.error({ err: error, tenantId: tenant.id }, "Falha ao sincronizar contratos no login")
          );
          return ctx.json({ token: session2.token, user: authUser });
        }
      )
    }
  };
}

// src/modules/auth/membership.ts
import { and as and2, eq as eq2 } from "drizzle-orm";
var PLATFORM_ROLES = /* @__PURE__ */ new Set(["superadmin", "platform_admin"]);
async function resolveActiveMembership(authUser, authSession) {
  if (authUser.role && PLATFORM_ROLES.has(authUser.role)) {
    return {
      scope: "platform",
      platformRole: authUser.role,
      tenantId: null,
      tenantSlug: null,
      tenantRole: null
    };
  }
  const empty = {
    scope: "tenant",
    platformRole: null,
    tenantId: null,
    tenantSlug: null,
    tenantRole: null
  };
  if (!authSession.activeOrganizationId) return empty;
  const [row] = await db.select({ role: member.role, slug: organization.slug, organizationId: organization.id }).from(member).innerJoin(organization, eq2(organization.id, member.organizationId)).where(
    and2(
      eq2(member.organizationId, authSession.activeOrganizationId),
      eq2(member.userId, authUser.id)
    )
  ).limit(1);
  if (!row) return empty;
  return {
    scope: "tenant",
    platformRole: null,
    tenantId: row.organizationId,
    tenantSlug: row.slug,
    tenantRole: row.role
  };
}

// src/lib/auth.ts
var tenantRoles = {
  admin: ownerAc,
  seller: adminAc,
  client: defaultAc.newRole({ organization: [], member: [], invitation: [], team: [], ac: [] })
};
var auth = betterAuth({
  baseURL: env.API_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
      organization,
      member,
      invitation
    }
  }),
  advanced: {
    // IDs em formato UUID real, para casar com o resto do schema (contracts,
    // sales, leads...) que já usa `uuid`/`text` em colunas de referência solta.
    database: { generateId: () => crypto.randomUUID() }
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8
    // Default (true): o cadastro (`/auth/register`, cliente se autocadastrando
    // no inquilino) já sai logado. Não afeta `auth.api.createUser` — usado
    // quando a plataforma cria contas para outra pessoa — que nunca cria sessão.
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false }
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    // 30 dias
    updateAge: 60 * 60 * 24,
    // renova se usada há mais de 1 dia
    cookieCache: { enabled: true, maxAge: 60 }
  },
  plugins: [
    admin({
      // Todo mundo nasce 'user' (o default do próprio Better Auth); só quem
      // recebe explicitamente 'superadmin'/'platform_admin' é equipe Annetec.
      // Os dois usam as mesmas permissões administrativas padrão do plugin —
      // a distinção entre eles é só rótulo, ainda não regra de negócio.
      adminRoles: ["superadmin", "platform_admin"],
      roles: { user: platformUserAc, superadmin: platformAdminAc, platform_admin: platformAdminAc }
    }),
    organization2({
      roles: tenantRoles,
      // O criador de uma organization normalmente vira 'owner' — aqui viram
      // 'admin', que é o papel de administrador de inquilino que o resto do
      // sistema já entende.
      creatorRole: "admin",
      allowUserToCreateOrganization: false
      // só a plataforma cria inquilinos
    }),
    // Converte `Authorization: Bearer <token>` em sessão. É como o Next.js
    // (origem separada) fala com esta API sem depender de cookie cross-site.
    bearer(),
    // Login do portal do associado por CPF + e-mail, verificado contra a
    // Digital Saúde — ver src/lib/auth-plugins/client-portal.ts.
    clientPortal(),
    customSession(async ({ user: user2, session: session2 }) => {
      const richUser = user2;
      const richSession = session2;
      return {
        user: richUser,
        session: richSession,
        membership: await resolveActiveMembership(richUser, richSession)
      };
    })
  ]
});

// src/modules/users/service.ts
var usersService = {
  async list(params) {
    const filters = [eq3(member.organizationId, params.tenantId)];
    if (params.role) filters.push(eq3(member.role, params.role));
    if (params.search) {
      const term = `%${params.search}%`;
      const match = or(ilike(user.name, term), ilike(user.email, term));
      if (match) filters.push(match);
    }
    const where = and3(...filters);
    const [rows, [totals]] = await Promise.all([
      db.select({ member, user }).from(member).innerJoin(user, eq3(user.id, member.userId)).where(where).orderBy(desc(member.createdAt)).limit(params.perPage).offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(member).innerJoin(user, eq3(user.id, member.userId)).where(where)
    ]);
    return { items: rows.map((row) => toDomain(row.member, row.user)), total: totals?.value ?? 0 };
  },
  async getById(tenantId, id) {
    const row = await findMembership(tenantId, id);
    if (!row) throw AppError.notFound("Usu\xE1rio");
    return toDomain(row.member, row.user);
  },
  async create(tenantId, input) {
    const email = input.email.toLowerCase();
    const [existingMembership] = await db.select({ userId: member.userId }).from(member).innerJoin(user, eq3(user.id, member.userId)).where(and3(eq3(member.organizationId, tenantId), eq3(user.email, email))).limit(1);
    if (existingMembership) {
      throw new AppError(ERROR_CODES.ALREADY_EXISTS, "J\xE1 existe um usu\xE1rio com este e-mail neste inquilino");
    }
    const authUser = await findOrCreateAuthUser(email, input.name, input.password);
    await auth.api.addMember({
      body: { userId: authUser.id, organizationId: tenantId, role: input.role }
    });
    if (input.role === "seller") {
      await db.insert(sellerProfiles).values({ userId: authUser.id, organizationId: tenantId }).onConflictDoNothing();
    }
    if (input.phone) {
      await db.update(user).set({ phone: input.phone }).where(eq3(user.id, authUser.id));
    }
    if (!input.active) {
      await db.update(member).set({ active: false }).where(and3(eq3(member.organizationId, tenantId), eq3(member.userId, authUser.id)));
    }
    return this.getById(tenantId, authUser.id);
  },
  async update(tenantId, id, input) {
    const row = await findMembership(tenantId, id);
    if (!row) throw AppError.notFound("Usu\xE1rio");
    if (input.name !== void 0 || input.email !== void 0 || input.phone !== void 0) {
      await db.update(user).set({
        ...input.name !== void 0 ? { name: input.name } : {},
        ...input.email !== void 0 ? { email: input.email.toLowerCase() } : {},
        ...input.phone !== void 0 ? { phone: input.phone } : {},
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq3(user.id, id));
    }
    if (input.role !== void 0 && input.role !== row.member.role) {
      await db.update(member).set({ role: input.role }).where(and3(eq3(member.organizationId, tenantId), eq3(member.userId, id)));
      if (input.role === "seller") {
        await db.insert(sellerProfiles).values({ userId: id, organizationId: tenantId }).onConflictDoNothing();
      }
    }
    if (input.active !== void 0) {
      await db.update(member).set({ active: input.active }).where(and3(eq3(member.organizationId, tenantId), eq3(member.userId, id)));
    }
    if (input.password) {
      throw AppError.businessRule("Use o fluxo de redefini\xE7\xE3o de senha para alterar a senha de outro usu\xE1rio");
    }
    return this.getById(tenantId, id);
  },
  /**
   * Remove o vínculo com o inquilino. A conta Better Auth em si não é
   * apagada — pode ter vínculo com outro inquilino, ou o histórico de vendas
   * e contratos aponta para o `userId` por chave estrangeira.
   */
  async deactivate(tenantId, id) {
    return this.update(tenantId, id, { active: false });
  }
};
var sellersService = {
  async upstreamProdutorCodigo(tenantId, sellerId) {
    const [row] = await db.select({ codigo: sellerProfiles.upstreamProdutorCodigo }).from(sellerProfiles).where(and3(eq3(sellerProfiles.userId, sellerId), eq3(sellerProfiles.organizationId, tenantId))).limit(1);
    return row?.codigo ?? null;
  },
  async upstreamProdutorCredentials(tenantId, sellerId) {
    const [row] = await db.select({
      login: sellerProfiles.upstreamProdutorLogin,
      password: sellerProfiles.upstreamProdutorPasswordEncrypted
    }).from(sellerProfiles).where(and3(eq3(sellerProfiles.userId, sellerId), eq3(sellerProfiles.organizationId, tenantId))).limit(1);
    if (!row?.login || !row.password) return null;
    return { login: row.login, password: decryptSecret(row.password) };
  },
  /**
   * Vincula o vendedor a um produtor existente no ERP, conferindo o código
   * antes de gravar — assim um código digitado errado falha na configuração e
   * não na hora de fechar uma venda.
   */
  async linkProdutor(tenantId, sellerId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    const produtor = await client.one("produtorPorCodigo", { codigoProdutor: input.codigo });
    if (!produtor) throw AppError.notFound("Produtor na Digital Sa\xFAde");
    await db.insert(sellerProfiles).values({
      userId: sellerId,
      organizationId: tenantId,
      upstreamProdutorCodigo: input.codigo,
      upstreamProdutorLogin: input.login ?? null,
      upstreamProdutorPasswordEncrypted: input.password ? encryptSecret(input.password) : null
    }).onConflictDoUpdate({
      target: [sellerProfiles.userId, sellerProfiles.organizationId],
      set: {
        upstreamProdutorCodigo: input.codigo,
        ...input.login !== void 0 ? { upstreamProdutorLogin: input.login } : {},
        ...input.password !== void 0 ? { upstreamProdutorPasswordEncrypted: encryptSecret(input.password) } : {}
      }
    });
    return { codigo: input.codigo, nome: produtor.nome ?? null };
  },
  /** Cria o produtor no ERP e já vincula ao vendedor. */
  async createProdutor(tenantId, sellerId, input) {
    const client = await getDigitalSaudeClient(tenantId);
    const result = await client.call("produtorIncluir", {
      nome: input.nome,
      email: input.email,
      numeroDocumento: input.numeroDocumento,
      grupoProdutor: { codigo: input.grupoProdutorCodigo }
    });
    const codigo = result[0]?.codigo;
    if (!codigo) throw AppError.businessRule("A Digital Sa\xFAde n\xE3o retornou o c\xF3digo do produtor");
    await this.linkProdutor(tenantId, sellerId, { codigo });
    return { codigo, nome: result[0]?.nome ?? input.nome };
  }
};
async function findOrCreateAuthUser(email, name, password) {
  const [existing] = await db.select().from(user).where(eq3(user.email, email)).limit(1);
  if (existing) return existing;
  const signUp = await auth.api.signUpEmail({
    body: { email, name, password: password ?? generateProvisionalPassword() }
  });
  return signUp.user;
}
function findMembership(tenantId, userId) {
  return db.select({ member, user }).from(member).innerJoin(user, eq3(user.id, member.userId)).where(and3(eq3(member.organizationId, tenantId), eq3(member.userId, userId))).limit(1).then((rows) => rows[0]);
}
function generateProvisionalPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function toDomain(memberRow, userRow) {
  return {
    id: userRow.id,
    tenantId: memberRow.organizationId,
    name: userRow.name,
    email: userRow.email,
    role: memberRow.role,
    phone: userRow.phone ?? null,
    avatarUrl: userRow.image,
    active: memberRow.active,
    createdAt: memberRow.createdAt.toISOString()
  };
}

export {
  usersService,
  sellersService,
  auth
};
