import { z } from 'zod'
import { cpf, email, slug } from '../common/primitives'
import { platformRole, tenantRole } from './enums'
import { papelComercial } from './vendas-rede'

/**
 * Contratos de autenticação.
 *
 * A autenticação em si (senha, sessão, cookie) é o Better Auth
 * (apps/api/src/lib/auth.ts) — aqui só ficam os formatos de entrada/saída que
 * o resto do sistema (frontend, outros módulos) precisa conhecer.
 *
 * Um único token de sessão sai de cada login (`token`, o session token do
 * Better Auth). O Next.js guarda esse token em cookie httpOnly do seu próprio
 * domínio e o reenvia como `Authorization: Bearer <token>` — não há par
 * access/refresh: o Better Auth renova a mesma sessão por rolling expiry.
 */

/**
 * Situação do associado em relação à assinatura do clube — decide se o
 * portal mostra o onboarding "assine um plano" e bloqueia o que depende dela:
 * - `subscribed`: tem assinatura viva (ativa, em atraso ou suspensa) — portal normal;
 * - `contract`: não assina o clube, mas tem contrato na operadora (associado
 *   antigo, login por CPF) — portal de sempre, sem onboarding;
 * - `pending_payment`: iniciou o checkout e o pagamento da adesão não confirmou;
 * - `none`: nunca assinou (ou só tem assinaturas canceladas).
 *
 * Mora aqui (e não em club-billing.ts) porque o `SessionUser` também a usa.
 */
export const clubAccessStatus = z.enum(['subscribed', 'contract', 'pending_payment', 'none'])
export type ClubAccessStatus = z.infer<typeof clubAccessStatus>

export const authScope = z.enum(['platform', 'tenant'])
export type AuthScope = z.infer<typeof authScope>

export const loginInput = z.object({
  email,
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  /**
   * Normalmente ausente — o e-mail já identifica a conta, e o servidor
   * resolve sozinho se é plataforma ou em qual inquilino a pessoa tem
   * vínculo. Informado pela tela de login do inquilino (`/[tenant]/login`):
   * aí a pessoa precisa ser membro daquele inquilino, em qualquer papel.
   */
  tenantSlug: slug.optional(),
})
export type LoginInput = z.infer<typeof loginInput>

/**
 * Login do associado pelo par CPF + e-mail, espelhando
 * `GET /contrato/procurarPorClientePortal`. Sem senha: a identidade é
 * validada contra a Digital Saúde no momento do login (ver o plugin Better
 * Auth `client-portal`).
 *
 * `tenantSlug` também é opcional aqui pelo mesmo motivo: sem ele, o servidor
 * tenta o inquilino do vínculo já conhecido e, se a pessoa for nova, cada
 * inquilino com integração ativa, até um confirmar o contrato.
 */
export const clientPortalLoginInput = z.object({
  tenantSlug: slug.optional(),
  cpf,
  email,
})
export type ClientPortalLoginInput = z.infer<typeof clientPortalLoginInput>

/**
 * Descoberta do método de login na tela do inquilino: a pessoa digita só o
 * e-mail e o servidor diz se o próximo passo é CPF (associado daquele
 * inquilino, portal sem senha) ou senha (todo o resto). E-mail desconhecido
 * responde `password` — a resposta nunca revela se a conta existe.
 */
export const loginMethodInput = z.object({
  tenantSlug: slug,
  email,
})
export type LoginMethodInput = z.infer<typeof loginMethodInput>

export const loginMethod = z.enum(['password', 'portal'])
export type LoginMethod = z.infer<typeof loginMethod>

export const loginMethodOutput = z.object({
  method: loginMethod,
  /** Login com Google disponível nesta API (client id/secret configurados). */
  googleEnabled: z.boolean(),
})
export type LoginMethodOutput = z.infer<typeof loginMethodOutput>

/**
 * Login com Google (fluxo ID token, sem redirect): o navegador obtém o
 * `credential` (JWT assinado pelo Google) pelo Google Identity Services e a
 * API valida a assinatura/audiência antes de abrir a sessão. Como no login
 * por senha, `tenantSlug` informa o inquilino da tela; sem ele o próprio
 * vínculo decide (admin > vendedor > associado).
 */
export const googleLoginInput = z.object({
  idToken: z.string().min(20, 'Credencial do Google inválida').max(8192, 'Credencial do Google inválida'),
  tenantSlug: slug.optional(),
})
export type GoogleLoginInput = z.infer<typeof googleLoginInput>

/** `GET /api/v1/auth/login/google/config` — se a tela deve mostrar o botão do Google. */
export const googleLoginConfig = z.object({ googleEnabled: z.boolean() })
export type GoogleLoginConfig = z.infer<typeof googleLoginConfig>

export const registerInput = z.object({
  tenantSlug: slug,
  name: z.string().min(1),
  email,
  cpf,
  password: z.string().min(8),
})
export type RegisterInput = z.infer<typeof registerInput>

export const sessionUser = z.object({
  id: z.string(),
  name: z.string(),
  email,
  avatarUrl: z.string().nullable(),
  scope: authScope,
  /** Preenchido quando `scope === 'platform'`. */
  platformRole: platformRole.nullable(),
  /** Preenchidos quando `scope === 'tenant'`. */
  tenantId: z.string().nullable(),
  tenantSlug: z.string().nullable(),
  tenantRole: tenantRole.nullable(),
  /** Id do superadmin dono da sessão real, quando esta é uma sessão de impersonação. */
  impersonatedBy: z.string().nullable(),
  /**
   * Rede Comercial: papel comercial do usuário (`vendas_agentes.papel`) no escopo
   * da sessão, ou `null` (equipe e `admin` do clube são master implícito). A web
   * decide o redirecionamento pós-login por aqui (`balcao` → `/[tenant]/balcao`).
   */
  salesRole: papelComercial.nullable().optional(),
  /** `vendas_agentes.id` do usuário no escopo da sessão, ou `null`. */
  salesAgentId: z.string().nullable().optional(),
  /**
   * Só em sessão de associado (`tenantRole === 'client'`), em todo login
   * (senha, portal CPF, Google) e no `GET /auth/me`: `true` quando ele ainda
   * não liberou os benefícios do clube (sem assinatura, só canceladas, ou
   * aguardando o 1º pagamento) — o portal mostra o onboarding "assine um
   * plano" e bloqueia carteirinha/benefícios. Ausente para equipe e plataforma.
   */
  needsSubscription: z.boolean().optional(),
  /**
   * Junto de `needsSubscription`: a situação que o gerou. `pending_payment`
   * = já assinou e o pagamento está pendente (a tela oferece "Concluir
   * pagamento" em vez dos planos).
   */
  subscriptionStatus: clubAccessStatus.optional(),
})
export type SessionUser = z.infer<typeof sessionUser>

export const authSession = z.object({
  token: z.string(),
  user: sessionUser,
})
export type AuthSession = z.infer<typeof authSession>

export const forgotPasswordInput = z.object({ email })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInput>

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
export type ChangePasswordInput = z.infer<typeof changePasswordInput>
