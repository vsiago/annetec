import type { UserRole } from '@/lib/types'

/**
 * Página inicial de cada papel dentro de um inquilino, depois do login.
 *
 * Associado que ainda não liberou o clube (`needsSubscription`: sem
 * assinatura ou com o 1º pagamento pendente) vai direto para o onboarding
 * `/cliente/assinar` — o portal só abre para quem assina.
 */
export function getRoleRedirectPath(
  tenantSlug: string,
  role: UserRole,
  options: { needsSubscription?: boolean } = {},
): string {
  switch (role) {
    case 'admin':
      return `/${tenantSlug}/admin`
    case 'seller':
      return `/${tenantSlug}/vendedor`
    case 'client':
      return options.needsSubscription ? clientOnboardingPath(tenantSlug) : `/${tenantSlug}/cliente`
    default:
      return `/${tenantSlug}/login`
  }
}

/** Onboarding obrigatório do associado sem assinatura (a régua de e-mails da API aponta para cá). */
export function clientOnboardingPath(tenantSlug: string): string {
  return `/${tenantSlug}/cliente/assinar`
}

/** Valor de `?motivo=` que faz o login avisar que a sessão anterior caiu. */
export const SESSION_ENDED_REASON = 'sessao-encerrada'

/** Login do inquilino; com `sessionEnded`, mostra "Sua sessão foi encerrada. Entre novamente." */
export function tenantLoginPath(tenantSlug: string, options: { sessionEnded?: boolean } = {}): string {
  const base = `/${tenantSlug}/login`
  return options.sessionEnded ? `${base}?motivo=${SESSION_ENDED_REASON}` : base
}
