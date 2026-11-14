import { onlyDigits } from '@annetec/contracts'

/**
 * Onde a candidatura de parceiro comercial acontece: no site da plataforma
 * ANNETEC (`/seja-parceiro`) ou na vitrine de um clube (`/<slug>/seja-parceiro`).
 */
export type Escopo = { kind: 'platform' } | { kind: 'tenant'; slug: string }

/** Escopo da plataforma, estável entre renders. */
export const PLATFORM_ESCOPO: Escopo = { kind: 'platform' }

export function basePath(escopo: Escopo): string {
  return escopo.kind === 'tenant' ? `/${escopo.slug}/seja-parceiro` : '/seja-parceiro'
}

export function loginPath(escopo: Escopo): string {
  return escopo.kind === 'tenant' ? `/${escopo.slug}/login` : '/login'
}

export function homePath(escopo: Escopo): string {
  return escopo.kind === 'tenant' ? `/${escopo.slug}` : '/'
}

/** Slug do clube para as query strings dos proxies (`undefined` na plataforma). */
export function tenantParam(escopo: Escopo): string | undefined {
  return escopo.kind === 'tenant' ? escopo.slug : undefined
}

export function maskCnpj(value: string): string {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Erros do zod (`issues`) → `{ 'endereco.cep': 'mensagem' }`, primeiro erro de cada campo. */
export function issuesToFieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.')
    if (key && !(key in out)) out[key] = issue.message
  }
  return out
}
