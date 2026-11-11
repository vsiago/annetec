import { ERROR_CODES, PLATFORM_STAFF_ROLES, isPlatformStaffRole, type PlatformRole, type PlatformStaffRole } from '@annetec/contracts'
import { createMiddleware } from 'hono/factory'
import { auth } from '@/lib/auth'
import { isUserBanned } from '@/modules/auth/membership'
import { loadClubAccess } from '@/modules/club-billing/access.service'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/**
 * Toda autenticação passa por `auth.api.getSession`. Nenhum middleware decodifica
 * token: o Better Auth já resolveu cookie/bearer para uma sessão (ou não) antes
 * de chegarmos aqui, e o plugin `customSession` já anexou `membership`
 * (ver `modules/auth/membership.ts`).
 */

/** Popula `c.get('auth')` quando houver sessão válida; nunca falha. Conta desativada conta como anônima. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session && !isUserBanned(session.user)) c.set('auth', session)
  await next()
})

/**
 * Exige sessão válida. Sessão de inquilino sem vínculo ATIVO (o clube
 * excluiu/bloqueou a pessoa depois que ela entrou — ver
 * `resolveActiveMembership`) não é sessão válida: 401, como sessão expirada.
 * Conta desativada (`user.banned`) também não, mesmo com sessão aberta antes.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) throw AppError.unauthenticated()
  if (isUserBanned(session.user)) {
    throw AppError.unauthenticated('Sua sessão foi encerrada. Entre novamente.')
  }
  if (session.membership.scope === 'tenant' && !session.membership.tenantId) {
    throw AppError.unauthenticated('Sua sessão foi encerrada. Entre novamente.')
  }
  c.set('auth', session)
  await next()
})

/**
 * Associado sem assinatura viva não usa o que depende dela (carteirinha,
 * benefícios, dependentes, faturas): 403 `SUBSCRIPTION_REQUIRED` e o portal
 * leva para o onboarding. `allowPending`: aguardando o 1º pagamento passa —
 * é por estas rotas (assinatura/faturas) que ele conclui o pagamento.
 * Equipe e plataforma passam direto; usar depois de `requireTenantRole`.
 */
export function requireClubSubscription(options: { allowPending?: boolean } = {}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const membership = c.get('auth')?.membership
    if (membership?.scope === 'tenant' && membership.tenantRole === 'client' && membership.tenantId) {
      const access = await loadClubAccess(membership.tenantId, c.get('auth')!.user.id)
      const pendingAllowed = options.allowPending && access.status === 'pending_payment'
      if (access.needsSubscription && !pendingAllowed) {
        throw new AppError(ERROR_CODES.SUBSCRIPTION_REQUIRED, 'Assine um plano do clube para acessar esta área.')
      }
    }
    await next()
  })
}

/**
 * Exige sessão da EQUIPE Annetec com um dos papéis informados. Sem argumentos
 * = qualquer papel da EQUIPE (`superadmin` | `platform_admin`) — o vendedor
 * (`platform_seller`) é conta de plataforma, mas NUNCA passa aqui: ele só tem
 * as rotas próprias, atrás de `requirePlatformSeller`. O tipo do parâmetro nem
 * aceita `platform_seller`, para ninguém liberar uma rota da equipe por engano.
 */
export function requirePlatformRole(...roles: PlatformStaffRole[]) {
  const allowed: readonly PlatformStaffRole[] = roles.length > 0 ? roles : PLATFORM_STAFF_ROLES
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()
    const role = session.membership.platformRole
    if (session.membership.scope !== 'platform' || !isPlatformStaffRole(role)) {
      throw AppError.forbidden('Rota restrita à equipe Annetec')
    }
    if (!allowed.includes(role)) {
      throw AppError.forbidden('Papel insuficiente para esta operação')
    }
    await next()
  })
}

/**
 * Exige sessão de VENDEDOR ANNETEC (`platform_seller`). Só as rotas
 * `/api/v1/platform/vendas/*` usam; os serviços dali filtram tudo pelo
 * próprio vendedor da sessão.
 */
export const requirePlatformSeller = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  if (session.membership.scope !== 'platform' || session.membership.platformRole !== 'platform_seller') {
    throw AppError.forbidden('Rota restrita aos vendedores ANNETEC')
  }
  await next()
})

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Sessão de PLATAFORMA numa rota de inquilino: leitura sempre; escrita só
 * superadmin, ou no inquilino-operador (`kind: 'platform'`). Vendedor ANNETEC
 * (ou papel desconhecido) não lê nem escreve painel de clube. Puro.
 */
export function platformMayAccess(
  method: string,
  platformRole: PlatformRole | null,
  tenantKind: 'operator' | 'platform' | null,
): boolean {
  if (!isPlatformStaffRole(platformRole)) return false
  if (READ_ONLY_METHODS.has(method.toUpperCase())) return true
  if (platformRole === 'superadmin') return true
  return tenantKind === 'platform'
}

/**
 * Barra o perfil de BALCÃO da Rede Comercial (`session.membership.salesRole === 'balcao'`)
 * em rotas legadas do clube.
 *
 * O balcão autentica como `member.role = 'seller'` (não mudamos isso), e por isso passa em
 * `requireTenantRole('admin', 'seller')`. As rotas que são de vendedor/admin de verdade
 * (CRM, contratos, comissões, cotação, atendimentos de suporte) declaram este guard logo
 * depois de `requireTenantRole`: balcão = 403 `VENDAS_SEM_PERMISSAO_NA_REDE`; vendedor
 * comercial, admin e equipe da plataforma seguem. O papel vem da sessão, que o servidor
 * recalcula a cada requisição a partir de `vendas_agentes`.
 */
export const bloquearBalcao = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('auth')?.membership.salesRole === 'balcao') {
    throw new AppError(ERROR_CODES.VENDAS_SEM_PERMISSAO_NA_REDE, 'O perfil de balcão não acessa este módulo.')
  }
  await next()
})

/**
 * Exige sessão de inquilino com um dos papéis informados E que o inquilino
 * ativo da sessão seja o mesmo resolvido pela rota. É esta segunda checagem
 * que impede um admin do inquilino A de ler dados do inquilino B trocando o
 * slug na URL.
 */
export function requireTenantRole(...roles: ('admin' | 'seller' | 'client')[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()

    // Equipe Annetec: LEITURA de qualquer inquilino, para suporte. Escrita só
    // o superadmin — ou qualquer papel da equipe no inquilino-operador (a
    // própria Annetec operando como operadora, `kind: 'platform'`).
    if (session.membership.scope === 'platform') {
      const tenant = c.get('tenant')
      if (!isPlatformStaffRole(session.membership.platformRole)) {
        throw AppError.forbidden('Conta de vendedor ANNETEC não acessa o painel dos clubes')
      }
      if (!platformMayAccess(c.req.method, session.membership.platformRole, tenant?.kind ?? null)) {
        throw AppError.forbidden('A equipe Annetec só consulta este inquilino. Alterações exigem superadmin.')
      }
      await next()
      return
    }

    if (!session.membership.tenantId || !session.membership.tenantRole) {
      throw AppError.forbidden('Sessão sem inquilino ativo')
    }

    const tenant = c.get('tenant')
    if (tenant && tenant.id !== session.membership.tenantId) {
      throw new AppError(ERROR_CODES.TENANT_MISMATCH, 'Sessão não pertence a este inquilino')
    }

    if (roles.length > 0 && !roles.includes(session.membership.tenantRole)) {
      throw AppError.forbidden('Papel insuficiente para esta operação')
    }

    await next()
  })
}
