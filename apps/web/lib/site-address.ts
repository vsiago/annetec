import { useCallback, useSyncExternalStore } from 'react'

/**
 * Endereço do site de um clube, como a pessoa lê na tela: `<domínio>/<slug>`.
 *
 * O domínio nunca fica escrito no código: vem da origem em que o console está
 * aberto (`window.location.host`), então vale igual em produção, homologação e
 * no computador de quem desenvolve. Onde não existe navegador (renderização no
 * servidor), cai para o caminho puro `/<slug>`, que também é o link real.
 */

/** `formatSiteAddress('annetec.org.br', 'clube-x')` → `annetec.org.br/clube-x`; sem domínio → `/clube-x`. */
export function formatSiteAddress(host: string, slug: string): string {
  return `${host}/${slug}`
}

/** Endereço do site no navegador; no servidor, `/<slug>`. Para eventos e efeitos — em renderização, use `useSiteAddress`. */
export function siteAddress(slug: string): string {
  const host = typeof window === 'undefined' ? '' : window.location.host
  return formatSiteAddress(host, slug)
}

function subscribe(): () => void {
  // A origem não muda enquanto a página está aberta.
  return () => {}
}

/**
 * Versão para renderização: no servidor e na hidratação devolve `/<slug>`
 * (o mesmo HTML nos dois lados) e, logo depois, passa a mostrar o endereço
 * completo com o domínio de onde o console está aberto.
 */
export function useSiteAddress(): (slug: string) => string {
  const host = useSyncExternalStore(
    subscribe,
    () => window.location.host,
    () => '',
  )
  return useCallback((slug: string) => formatSiteAddress(host, slug), [host])
}
