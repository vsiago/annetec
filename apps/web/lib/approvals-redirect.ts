import { approvalsHrefFromLegacy } from '@annetec/contracts'

type SearchParams = Record<string, string | string[] | undefined>

/**
 * Destino em Aprovações para uma tela antiga de fila (`/admin/financeiro/
 * contas-gerenciadas`, `/admin/comercial/descontos`), com os mesmos parâmetros
 * de foco (`clube`, `pedido`, `proposta`…). Usado nas páginas que só redirecionam.
 */
export function approvalsRedirectTarget(legacyPath: string, params: SearchParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first) query.set(key, first)
  }
  const text = query.toString()
  return approvalsHrefFromLegacy(text ? `${legacyPath}?${text}` : legacyPath) ?? '/admin/compliance'
}
