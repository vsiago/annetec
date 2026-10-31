/**
 * Troca a URL da tela atual (só a query) sem navegar nem recarregar dados do servidor.
 *
 * Usa o `history` nativo no lugar de `router.replace`: no Next 16.2.6, quando a página
 * é carregada já com query (link, F5), o `router.replace` seguinte reaproveita a query
 * antiga e a URL "volta" sozinha. O Next sincroniza `useSearchParams` com `replaceState`.
 * Só serve para telas client que leem `useSearchParams` e buscam os dados no cliente.
 */
export function replaceQuery(url: string) {
  window.history.replaceState(null, '', url)
}
