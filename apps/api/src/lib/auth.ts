import { betterAuth, type Session } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, bearer, customSession, organization, type UserWithRole } from 'better-auth/plugins'
import { adminAc as platformAdminAc, userAc as platformUserAc } from 'better-auth/plugins/admin/access'
import { adminAc, defaultAc, ownerAc } from 'better-auth/plugins/organization/access'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { env } from '@/config/env'
import { clientPortal } from '@/lib/auth-plugins/client-portal'
import { resolveActiveMembership } from '@/modules/auth/membership'

/**
 * Papéis de inquilino, reaproveitando as permissões padrão do plugin
 * `organization` (que já cobrem organization/member/invitation/team) só
 * renomeadas para o vocabulário Annetec: 'admin' no lugar de 'owner', 'seller'
 * no lugar de 'admin', 'client' sem nenhuma permissão de gestão do inquilino.
 */
const tenantRoles = {
  admin: ownerAc,
  seller: adminAc,
  client: defaultAc.newRole({ organization: [], member: [], invitation: [], team: [], ac: [] }),
}

/**
 * A sessão que `customSession` recebe, já com os campos que os plugins
 * `admin` (`role`, banimento) e `organization` (`activeOrganizationId`)
 * adicionam. Anotado à mão em vez de inferido do objeto de opções: inferir a
 * partir da própria chamada de `betterAuth(...)` que está sendo construída é
 * uma referência circular, e o Better Auth não tem como saber os campos que
 * OUTRO plugin (`admin`) adiciona à sessão a partir de dentro de `organization`.
 */
type SessionWithMembership = Session & { activeOrganizationId?: string | null }

/**
 * Instância única do Better Auth — é a fonte da verdade de identidade,
 * sessão, senha e vínculo pessoa↔inquilino de toda a API. Nenhum outro módulo
 * assina token, faz hash de senha ou grava sessão: chama `auth.api.*`.
 *
 * Dois planos de acesso, dois mecanismos do próprio Better Auth:
 *
 *  - **plataforma** (equipe Annetec, `/admin`): plugin `admin`. `user.role`
 *    é `'user'` por padrão para todo mundo; só quem tem `'superadmin'` ou
 *    `'platform_admin'` conta como plataforma (`adminRoles`). É o nosso
 *    `platformRole` — não criamos um campo próprio, reaproveitamos o do
 *    plugin.
 *  - **inquilino** (admin/vendedor/cliente, `/[tenant]`): plugin
 *    `organization`. Um inquilino é uma `organization`; o papel da pessoa
 *    dentro dele é `member.role` ('admin' | 'seller' | 'client'). Uma mesma
 *    conta pode ser membro de vários inquilinos — é assim que a mesma pessoa
 *    consegue ser cliente em duas administradoras com o mesmo e-mail.
 *
 * `customSession` achata os dois em um único formato de sessão (ver
 * `modules/auth/membership.ts`), para o resto da API nunca precisar saber
 * que por baixo são dois plugins diferentes. Precisa ser o último plugin da
 * lista: molda o formato que `auth.api.getSession` devolve.
 */
export const auth = betterAuth({
  baseURL: env.API_BASE_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ORIGINS.split(',').map(origin => origin.trim()),

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),

  advanced: {
    // IDs em formato UUID real, para casar com o resto do schema (contracts,
    // sales, leads...) que já usa `uuid`/`text` em colunas de referência solta.
    database: { generateId: () => crypto.randomUUID() },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Default (true): o cadastro (`/auth/register`, cliente se autocadastrando
    // no inquilino) já sai logado. Não afeta `auth.api.createUser` — usado
    // quando a plataforma cria contas para outra pessoa — que nunca cria sessão.
  },

  user: {
    additionalFields: {
      phone: { type: 'string', required: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    updateAge: 60 * 60 * 24, // renova se usada há mais de 1 dia
    cookieCache: { enabled: true, maxAge: 60 },
  },

  plugins: [
    admin({
      // Todo mundo nasce 'user' (o default do próprio Better Auth); só quem
      // recebe explicitamente 'superadmin'/'platform_admin' é equipe Annetec.
      // Os dois usam as mesmas permissões administrativas padrão do plugin —
      // a distinção entre eles é só rótulo, ainda não regra de negócio.
      adminRoles: ['superadmin', 'platform_admin'],
      roles: { user: platformUserAc, superadmin: platformAdminAc, platform_admin: platformAdminAc },
    }),
    organization({
      roles: tenantRoles,
      // O criador de uma organization normalmente vira 'owner' — aqui viram
      // 'admin', que é o papel de administrador de inquilino que o resto do
      // sistema já entende.
      creatorRole: 'admin',
      allowUserToCreateOrganization: false, // só a plataforma cria inquilinos
    }),
    // Converte `Authorization: Bearer <token>` em sessão. É como o Next.js
    // (origem separada) fala com esta API sem depender de cookie cross-site.
    bearer(),
    // Login do portal do associado por CPF + e-mail, verificado contra a
    // Digital Saúde — ver src/lib/auth-plugins/client-portal.ts.
    clientPortal(),
    customSession(async ({ user, session }) => {
      // Cast justificado: `admin` (role/banned) e `organization`
      // (activeOrganizationId) são plugins IRMÃOS deste, no mesmo array —
      // o TypeScript não propaga o que um adiciona ao tipo que o outro
      // enxerga. Os dois campos existem de verdade em runtime (conferido
      // contra o schema de cada plugin); ver `SessionWithMembership` acima.
      const richUser = user as UserWithRole
      const richSession = session as SessionWithMembership
      return {
        user: richUser,
        session: richSession,
        membership: await resolveActiveMembership(richUser, richSession),
      }
    }),
  ],
})

export type Auth = typeof auth
