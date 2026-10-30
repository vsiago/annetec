import {
  ERROR_CODES,
  isPlatformAccountRole,
  type ClientPortalLoginInput,
  type GoogleLoginInput,
  type LoginInput,
  type LoginMethodInput,
  type LoginMethodOutput,
} from '@annetec/contracts'
import { APIError as BetterAuthError } from 'better-auth/api'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { googleLoginEnabled } from '@/config/env'
import { db } from '@/db/client'
import { AppError } from '@/http/errors'
import { auth } from '@/lib/auth'
import { account, member, organization, session as sessionTable, tenantIntegrations, user } from '@/db/schema'
import { logger } from '@/lib/logger'
import {
  accessUnavailable,
  admitLogin,
  loginAccessDecision,
  type LoginVia,
  type TenantRoleValue,
} from '@/modules/users/member-access'

/**
 * Orquestração fina sobre `auth.api.*`. Nenhuma regra de senha, hash ou
 * cookie mora aqui — isso é o Better Auth.
 *
 * Nenhum login pede o slug do inquilino: o e-mail já é a chave — uma conta
 * Better Auth só tem um e-mail, então a partir dele descobrimos sozinhos se é
 * plataforma, e se for de inquilino, em qual (ou quais) organization a pessoa
 * tem vínculo. `tenantSlug` continua aceito como parâmetro OPCIONAL — dá pra
 * forçar um inquilino específico (uso programático/suporte), mas a tela de
 * login nunca precisa pedir isso.
 *
 * Todo método devolve `{ token, session }`, onde `session` é exatamente o que
 * `auth.api.getSession` devolve — já com `membership` resolvido pelo plugin
 * `customSession` — para o controller nunca precisar remontar nada.
 */
export const authService = {
  async login(input: LoginInput) {
    const result = await auth.api
      .signInEmail({ body: { email: input.email, password: input.password } })
      .catch((error: unknown) => {
        // O Better Auth responde 401 em inglês ("Invalid email or password");
        // a tela mostra a mensagem como veio, então padronizamos aqui.
        if (error instanceof BetterAuthError && error.statusCode === 401) {
          throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos')
        }
        throw error
      })
    // Mesma mensagem de credenciais inválidas quando falta vínculo: não
    // revela se a conta existe sem vínculo com o inquilino pedido (ou nenhum).
    return completeMembershipLogin(result, input.tenantSlug, 'E-mail ou senha inválidos', 'password')
  },

  /**
   * Login com Google pelo fluxo ID token: o navegador manda o `credential`
   * do Google Identity Services e o Better Auth (`signInSocial` com
   * `idToken`) confere assinatura, emissor, audiência (nosso client id) e
   * validade antes de abrir a sessão. Depois disso, a resolução de vínculo
   * é a do login por senha — com o cadastro de associado descrito abaixo.
   *
   * A conta que abriu sessão precisa ter EXATAMENTE o e-mail verificado do
   * token (`assertGoogleIdentity`) — nunca outra conta do mesmo clube.
   *
   * Cadastro pelo Google — SÓ na tela de um inquilino (`tenantSlug`) e só
   * com o Google afirmando `email_verified`:
   *  - e-mail sem conta → cria a conta (nome/foto do Google, e-mail
   *    verificado) pelo próprio Better Auth (`requestSignUp`) e o vínculo
   *    `client` neste clube. Nunca outro papel;
   *  - conta existente sem vínculo com este clube → ganha vínculo `client`
   *    só se for apenas associado (ou nada) em outros clubes. Conta de
   *    plataforma ou admin/vendedor de qualquer clube é recusada com
   *    `GOOGLE_STAFF_MESSAGE` — vínculo de equipe nunca nasce de login.
   * Sem `tenantSlug` (login global), e-mail desconhecido continua recusado.
   */
  async loginGoogle(input: GoogleLoginInput) {
    if (!googleLoginEnabled) {
      throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Login com Google não configurado')
    }
    const signIn = await signInWithGoogle(input.idToken, input.tenantSlug)
    await assertGoogleIdentity(signIn, input.idToken)
    const joinedOrganizationId = input.tenantSlug ? await joinTenantAsClient(signIn, input.tenantSlug) : null
    const { token, session } = await completeMembershipLogin(signIn, input.tenantSlug, GOOGLE_NOT_LINKED_MESSAGE, 'google')
    return { token, session, onboarding: { accountCreated: signIn.created, joinedOrganizationId } }
  },

  /**
   * Login do portal do associado por CPF + e-mail. Sem tenantSlug, a Digital
   * Saúde é quem responde a pergunta "esse CPF+e-mail existe onde?": se a
   * pessoa já é nossa conhecida, usamos o inquilino do vínculo dela (rápido,
   * sem sair pra rede); senão, tentamos cada inquilino com integração ativa
   * até um responder com um contrato de verdade.
   */
  async loginClientPortal(input: ClientPortalLoginInput) {
    if (input.tenantSlug) {
      const { token, session } = await signInClientPortal(input.tenantSlug, input.cpf, input.email)
      return { token, session }
    }

    const knownSlug = await resolveClientTenantSlug(input.email)
    const candidates = await listEnabledTenantSlugs()
    const orderedSlugs = knownSlug ? [knownSlug, ...candidates.filter(slug => slug !== knownSlug)] : candidates

    for (const slug of orderedSlugs) {
      try {
        return await signInClientPortal(slug, input.cpf, input.email)
      } catch (error) {
        // Vínculo bloqueado é resposta final, não "tenta o próximo clube".
        if (error instanceof AppError && error.code === ERROR_CODES.ACCESS_UNAVAILABLE) throw error
        logger.debug({ tenantSlug: slug, err: error }, 'Login do portal não bateu neste inquilino, tentando o próximo')
      }
    }

    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Não encontramos assinatura ou contrato com este CPF e e-mail')
  },

  /**
   * Qual o próximo passo da tela de login do inquilino para este e-mail:
   * - associado (`member.role = 'client'`) deste inquilino → `portal` (CPF).
   *   Vale mesmo com account `credential`: o checkout cria o titular com uma
   *   senha aleatória que ninguém conhece, e nenhuma tela deixa o associado
   *   definir a própria senha;
   * - qualquer outro caso (admin/vendedor, e-mail desconhecido ou sem vínculo
   *   aqui) → `password`, para não revelar se a conta existe.
   */
  async loginMethod(input: LoginMethodInput): Promise<LoginMethodOutput> {
    const [clientMembership] = await db
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(
        and(
          eq(user.email, input.email.toLowerCase()),
          eq(member.role, 'client'),
          eq(organization.slug, input.tenantSlug.toLowerCase()),
        ),
      )
      .limit(1)
    return { method: clientMembership ? 'portal' : 'password', googleEnabled: googleLoginEnabled }
  },

  /** Renova a sessão a partir do próprio token — o Better Auth cuida do rolling expiry. */
  async me(token: string) {
    return getSessionByToken(token)
  },

  async logout(token: string): Promise<void> {
    await auth.api.signOut({ headers: bearerHeaders(token) })
  },
}

const GOOGLE_NOT_LINKED_MESSAGE = 'Esta conta Google não tem vínculo com este clube'
const GOOGLE_INVALID_MESSAGE = 'Não foi possível validar o login com Google. Tente novamente.'
/**
 * Conta de plataforma ou de equipe (admin/vendedor) de algum clube tentando
 * entrar como associado em outro. Quem vê isto acabou de provar ao Google a
 * posse do e-mail, então dizer que é conta administrativa não vaza nada a terceiros.
 */
const GOOGLE_STAFF_MESSAGE =
  'Este e-mail já é usado por uma conta administrativa e não pode ser cadastrado como associado deste clube. Entre com outro e-mail do Google.'

/**
 * Passo comum aos logins que abrem sessão ANTES de saber o vínculo (senha e
 * Google): plataforma passa direto; conta de inquilino precisa de vínculo —
 * com `tenantSlug`, membro DAQUELA organization (qualquer papel); sem ele,
 * o próprio vínculo decide (admin > vendedor > associado). Sem vínculo, a
 * sessão recém-aberta é revogada antes de recusar.
 *
 * O vínculo escolhido passa por `admitLogin`: bloqueado ou equipe desligada
 * → sessão revogada e `ACCESS_UNAVAILABLE`; associado excluído → o mesmo
 * vínculo é reativado (sem assinatura: `needsSubscription` na resposta).
 */
async function completeMembershipLogin(
  result: { token: string; user: { id: string } },
  tenantSlug: string | undefined,
  notLinkedMessage: string,
  via: LoginVia,
) {
  const bareSession = await getSessionByToken(result.token)

  // Conta de plataforma: papel já vem no próprio usuário, sem organization
  // nenhuma envolvida — nada mais a resolver.
  if (bareSession.membership.scope === 'platform') {
    return { token: result.token, session: bareSession }
  }

  const organizationId = await resolveLoginOrganization(result.user.id, tenantSlug)

  if (!organizationId) {
    // A credencial bateu, então o Better Auth já abriu uma sessão: revoga
    // antes de recusar, para não deixar sessão órfã. Falha aqui não muda a
    // resposta.
    await auth.api.signOut({ headers: bearerHeaders(result.token) }).catch(() => null)
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, notLinkedMessage)
  }

  try {
    await admitLogin(organizationId, result.user.id, via)
  } catch (error) {
    await auth.api.signOut({ headers: bearerHeaders(result.token) }).catch(() => null)
    throw error
  }

  await setActiveOrganization(result.token, organizationId)
  const session = await getSessionByToken(result.token)
  return { token: result.token, session }
}

function resolveLoginOrganization(userId: string, tenantSlug: string | undefined): Promise<string | null> {
  return tenantSlug
    ? resolveMemberOrganizationBySlug(userId, tenantSlug)
    : resolveTenantOrganization(userId, ['admin', 'seller', 'client'])
}

/**
 * `signInSocial` com ID token, com duas exceções às recusas do Better Auth
 * (ambas só DEPOIS de ele validar a assinatura do token, e só na tela de um
 * inquilino):
 *
 * 1. "account not linked": o Better Auth só vincula a conta Google a uma
 *    conta local com o mesmo e-mail se a local tiver `emailVerified` — e as
 *    contas do checkout (`signUpEmail`) nascem sem. Se o Google afirmar que o
 *    e-mail é verificado, existir conta local com EXATAMENTE esse e-mail e ela
 *    já for membro do inquilino pedido — ou puder virar associado dele (ver
 *    `canJoinAsClient`) —, marcamos o e-mail local como verificado (o Google
 *    acabou de provar a posse dele) e tentamos de novo, agora vinculando.
 *    Antes disso a senha local (`account` credential) e as sessões da conta
 *    são apagadas: quem a criou sem provar o e-mail não continua entrando.
 * 2. "signup disabled" (e-mail sem conta): com e-mail verificado e inquilino
 *    existente, refaz o `signInSocial` com `requestSignUp` — o próprio Better
 *    Auth cria a conta e o vínculo Google. O papel no clube vem depois, em
 *    `joinTenantAsClient`, sempre `client`.
 *
 * Login sem slug nunca toca nem cria conta. Nunca se escolhe conta por papel
 * ou por slug.
 */
async function signInWithGoogle(idToken: string, tenantSlug: string | undefined): Promise<GoogleSignIn> {
  try {
    return { ...(await callGoogleSignIn(idToken)), created: false }
  } catch (error) {
    const message = betterAuthMessage(error)
    if (message === 'account not linked' && (await adoptLocalAccountForGoogle(idToken, tenantSlug))) {
      return { ...(await retryGoogleSignIn(idToken, false)), created: false }
    }
    if (message === 'signup disabled' && (await canSignUpWithGoogle(idToken, tenantSlug))) {
      const created = await retryGoogleSignIn(idToken, true)
      logger.info({ userId: created.user.id, tenantSlug }, 'Conta criada pelo login com Google na tela do clube')
      return { ...created, created: true }
    }
    throw toGoogleLoginError(error)
  }
}

interface GoogleSignIn {
  token: string
  user: { id: string; email: string }
  /** A conta nasceu agora (cadastro pelo Google). */
  created: boolean
}

function retryGoogleSignIn(idToken: string, requestSignUp: boolean) {
  return callGoogleSignIn(idToken, requestSignUp).catch((retryError: unknown) => {
    throw toGoogleLoginError(retryError)
  })
}

async function callGoogleSignIn(idToken: string, requestSignUp = false) {
  const result = await auth.api.signInSocial({
    body: { provider: 'google', idToken: { token: idToken }, ...(requestSignUp ? { requestSignUp: true } : {}) },
  })
  // Com `idToken` o Better Auth sempre devolve a sessão (`redirect: false`);
  // a checagem só estreita o tipo, que é a união com o ramo de redirect.
  if (!('token' in result) || !result.token || !result.user) {
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_INVALID_MESSAGE)
  }
  return { token: result.token, user: { id: result.user.id, email: result.user.email } }
}

/** Cadastro pelo Google só na tela de um inquilino que existe, com e-mail verificado pelo Google. */
async function canSignUpWithGoogle(idToken: string, tenantSlug: string | undefined): Promise<boolean> {
  if (!tenantSlug || !verifiedGoogleEmail(idToken)) return false
  return (await resolveOrganizationBySlug(tenantSlug)) !== null
}

/**
 * Pode ganhar vínculo `client` automático num clube: não é conta de
 * plataforma nem equipe (admin/vendedor) de NENHUM clube. Associado de outro
 * clube pode (a mesma pessoa física pode ser associada de dois clubes).
 */
async function canJoinAsClient(userId: string, platformRole: string | null | undefined): Promise<boolean> {
  if (isPlatformAccountRole(platformRole)) return false
  const [staff] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), inArray(member.role, ['admin', 'seller'])))
    .limit(1)
  return !staff
}

/**
 * Depois da sessão aberta (e da identidade conferida): na tela de um
 * inquilino, garante o vínculo `client` de quem ainda não é membro dele.
 * Devolve a organization quando o vínculo nasceu agora. Conta de plataforma
 * ou de equipe é recusada (sessão revogada) — nunca ganha vínculo.
 */
async function joinTenantAsClient(signIn: GoogleSignIn, tenantSlug: string): Promise<string | null> {
  const refuse = async (reason: string): Promise<never> => {
    await auth.api.signOut({ headers: bearerHeaders(signIn.token) }).catch(() => null)
    logger.warn({ userId: signIn.user.id, tenantSlug, reason }, 'Login com Google recusado: conta administrativa sem vínculo com o clube')
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_STAFF_MESSAGE)
  }

  const organizationId = await resolveOrganizationBySlug(tenantSlug)
  if (!organizationId) return null
  if (await resolveMemberOrganizationBySlug(signIn.user.id, tenantSlug)) return null
  const bareSession = await getSessionByToken(signIn.token)
  if (bareSession.membership.scope === 'platform') return refuse('plataforma')
  if (!(await canJoinAsClient(signIn.user.id, null))) return refuse('equipe de outro clube')

  await auth.api.addMember({ body: { userId: signIn.user.id, organizationId, role: 'client' } })
  logger.info({ userId: signIn.user.id, tenantId: organizationId, created: signIn.created }, 'Vínculo de associado criado pelo login com Google')
  return organizationId
}

/** E-mail do token do Google, normalizado — só se o Google afirmar que é verificado. */
function verifiedGoogleEmail(idToken: string): string | null {
  const claims = decodeJwtPayload(idToken)
  if (!claims || claims.email_verified !== true || typeof claims.email !== 'string') return null
  const email = claims.email.trim().toLowerCase()
  return email || null
}

/**
 * Trava final depois de o Better Auth abrir a sessão: a conta local precisa
 * ter EXATAMENTE o e-mail verificado do token (sem diferenciar maiúsculas).
 * Cobre conta Google já vinculada cuja conta local trocou de e-mail depois,
 * e qualquer vínculo que não tenha nascido do e-mail exato. Seguro ler as
 * claims aqui: o `signInSocial` desta mesma chamada acabou de validar o token
 * (assinatura, emissor, audiência, validade).
 */
async function assertGoogleIdentity(result: { token: string; user: { id: string; email: string } }, idToken: string) {
  const tokenEmail = verifiedGoogleEmail(idToken)
  if (tokenEmail && result.user.email.trim().toLowerCase() === tokenEmail) return
  await auth.api.signOut({ headers: bearerHeaders(result.token) }).catch(() => null)
  logger.warn({ userId: result.user.id }, 'Login com Google recusado: e-mail do token difere do e-mail da conta')
  throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_NOT_LINKED_MESSAGE)
}

/** Ver `signInWithGoogle` (exceção 1). Devolve se a conta local pode ser vinculada agora. */
async function adoptLocalAccountForGoogle(idToken: string, tenantSlug: string | undefined): Promise<boolean> {
  // Sem slug não há "inquilino pedido" contra o qual conferir o vínculo.
  if (!tenantSlug) return false
  const email = verifiedGoogleEmail(idToken)
  if (!email) return false

  const [local] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  if (!local || local.emailVerified || local.email.toLowerCase() !== email) return false
  if (!(await resolveMemberOrganizationBySlug(local.id, tenantSlug))) {
    // Sem vínculo aqui: só adota quem pode virar associado deste clube (que
    // precisa existir). Conta administrativa recebe a recusa clara, sem
    // tocar na conta.
    if (!(await resolveOrganizationBySlug(tenantSlug))) return false
    if (!(await canJoinAsClient(local.id, local.role))) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_STAFF_MESSAGE)
    }
  }

  // A conta local nunca teve o e-mail provado: quem a criou pode não ser o
  // dono do e-mail (cadastro antecipado com o e-mail de outra pessoa). O
  // Google acabou de provar quem é o dono — então a senha local e toda sessão
  // aberta com ela deixam de valer ANTES de a conta virar dele. O acesso
  // passa a ser pelo Google (ou por uma senha nova redefinida pelo clube).
  const senhas = await db
    .delete(account)
    .where(and(eq(account.userId, local.id), eq(account.providerId, 'credential')))
    .returning({ id: account.id })
  const sessoes = await db.delete(sessionTable).where(eq(sessionTable.userId, local.id)).returning({ id: sessionTable.id })
  await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, local.id))
  logger.info(
    { userId: local.id, senhasRemovidas: senhas.length, sessoesRevogadas: sessoes.length },
    'E-mail confirmado pelo Google; senha local e sessões antigas descartadas; conta Google vinculada à conta existente',
  )
  return true
}

/**
 * Lê as claims do JWT SEM validar. Só é chamado depois de o Better Auth já
 * ter validado este mesmo token (a recusa "account not linked" vem depois da
 * verificação de assinatura) — nunca use para decidir identidade sozinho.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function betterAuthMessage(error: unknown): string | undefined {
  return error instanceof BetterAuthError ? (error.body?.message ?? error.message) : undefined
}

/** Erros do `signInSocial` (em inglês) → mensagem em português, que a tela mostra como veio. */
function toGoogleLoginError(error: unknown): unknown {
  if (!(error instanceof BetterAuthError)) return error
  const code = error.body?.code
  const message = betterAuthMessage(error)
  if (code === 'PROVIDER_NOT_FOUND' || code === 'ID_TOKEN_NOT_SUPPORTED') {
    return new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Login com Google não configurado')
  }
  if (code === 'EMAIL_NOT_VERIFIED') {
    return new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'O e-mail desta conta Google não está verificado')
  }
  if (message === 'signup disabled' || message === 'account not linked') {
    return new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_NOT_LINKED_MESSAGE)
  }
  if (error.statusCode === 401) {
    return new AppError(ERROR_CODES.INVALID_CREDENTIALS, GOOGLE_INVALID_MESSAGE)
  }
  return error
}

async function signInClientPortal(tenantSlug: string, cpf: string, email: string) {
  const result = await auth.api.signInClientPortal({ body: { tenantSlug, cpf, email } }).catch((error: unknown) => {
    // O plugin recusa vínculo bloqueado com `code` próprio (ver client-portal.ts).
    if (error instanceof BetterAuthError && error.body?.code === ERROR_CODES.ACCESS_UNAVAILABLE) throw accessUnavailable()
    throw error
  })
  const session = await getSessionByToken(result.token)
  return { token: result.token, session }
}

/** Todos os slugs de inquilino com a integração Digital Saúde ativa, mais recentes primeiro. */
async function listEnabledTenantSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: organization.slug })
    .from(organization)
    .innerJoin(tenantIntegrations, eq(tenantIntegrations.organizationId, organization.id))
    .where(eq(tenantIntegrations.enabled, true))
  return rows.map(row => row.slug)
}

/** Se o e-mail já é de um associado conhecido, o slug do inquilino do vínculo dele. */
async function resolveClientTenantSlug(email: string): Promise<string | null> {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase())).limit(1)
  if (!existing) return null

  const [membership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, existing.id), eq(member.role, 'client')))
    .orderBy(desc(member.createdAt))
    .limit(1)
  if (!membership) return null

  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, membership.organizationId))
    .limit(1)
  return org?.slug ?? null
}

/**
 * Em qual organization esta pessoa tem um dos papéis pedidos. Com mais de um
 * vínculo (raro — mesma conta em mais de um inquilino), prioriza os que
 * podem abrir sessão (ativos, ou associado excluído que volta), depois
 * 'admin', 'seller', 'client' e, empatado, o vínculo mais recente. Só
 * vínculos recusáveis (bloqueado, equipe desligada) → devolve um deles, e
 * `admitLogin` recusa com a mensagem genérica.
 */
async function resolveTenantOrganization(
  userId: string,
  roles: ('admin' | 'seller' | 'client')[],
): Promise<string | null> {
  const rows = await db
    .select({
      organizationId: member.organizationId,
      role: member.role,
      accessStatus: member.accessStatus,
      createdAt: member.createdAt,
    })
    .from(member)
    .where(and(eq(member.userId, userId), inArray(member.role, roles)))

  if (rows.length === 0) return null

  const usable = (row: (typeof rows)[number]) =>
    loginAccessDecision({ role: row.role as TenantRoleValue, accessStatus: row.accessStatus }) === 'refuse' ? 1 : 0
  const rolePriority: Record<string, number> = { admin: 0, seller: 1, client: 2 }
  rows.sort((a, b) => {
    const byAccess = usable(a) - usable(b)
    if (byAccess !== 0) return byAccess
    const byRole = (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9)
    if (byRole !== 0) return byRole
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  return rows[0]!.organizationId
}

/** A organization do slug, só se esta pessoa for membro dela (qualquer papel). */
async function resolveMemberOrganizationBySlug(userId: string, tenantSlug: string): Promise<string | null> {
  const organizationId = await resolveOrganizationBySlug(tenantSlug)
  if (!organizationId) return null
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1)
  return membership ? organizationId : null
}

async function resolveOrganizationBySlug(tenantSlug: string): Promise<string | null> {
  const [tenant] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, tenantSlug.toLowerCase()))
    .limit(1)
  return tenant?.id ?? null
}

/** Exportada: `tenantsService.impersonateMember` reaproveita para a sessão de impersonação. */
export async function setActiveOrganization(token: string, organizationId: string) {
  await auth.api.setActiveOrganization({ headers: bearerHeaders(token), body: { organizationId } })
}

/** Exportada pelo mesmo motivo que `setActiveOrganization` acima. */
export async function getSessionByToken(token: string) {
  const session = await auth.api.getSession({ headers: bearerHeaders(token) })
  if (!session) throw AppError.unauthenticated()
  return session
}

function bearerHeaders(token: string): Headers {
  return new Headers({ authorization: `Bearer ${token}` })
}
