import type { PapelComercial } from '../ui/tipos'

/**
 * Nomes de ícone aceitos pela casca. É um texto (e não o componente do lucide)
 * para o menu poder ser montado em Server Component e passado à casca cliente.
 */
export type IconeMenu =
  | 'hoje'
  | 'funil'
  | 'carteira'
  | 'comissoes'
  | 'link'
  | 'ajustes'
  | 'equipe'
  | 'resultados'
  | 'rede'
  | 'regras'
  | 'atender'
  | 'historico'

export type ItemMenu = {
  href: string
  label: string
  icon: IconeMenu
  /** Contador no ícone (ex.: leads novos no pool). */
  badge?: number
}

const junta = (base: string, caminho: string): string => {
  const raiz = base.replace(/\/+$/, '')
  return caminho ? `${raiz}${caminho}` : raiz || '/'
}

/** Menu da casca balcão: Atender · Hoje · Histórico · Ajustes. */
export function itensDoBalcao(basePath: string): ItemMenu[] {
  return [
    { href: junta(basePath, ''), label: 'Atender', icon: 'atender' },
    { href: junta(basePath, '/hoje'), label: 'Hoje', icon: 'hoje' },
    { href: junta(basePath, '/historico'), label: 'Histórico', icon: 'historico' },
    { href: junta(basePath, '/ajustes'), label: 'Ajustes', icon: 'ajustes' },
  ]
}

/**
 * Menu por papel comercial (seção 5.2 da especificação). `basePath` é a raiz da
 * área: `/vendas` (plataforma), `/{clube}/vendas` (clube) ou `/{clube}/balcao`.
 *
 *  - vendedor: Hoje · Funil · Carteira · Comissões · Meu link · Ajustes
 *  - supervisor: Hoje · Funil · Equipe · Resultados · Comissões · Ajustes
 *  - gerente: Hoje · Funil · Rede · Resultados · Comissões · Ajustes
 *  - master: Hoje · Funil · Rede · Resultados · Comissões · Regras · Ajustes
 *  - balcao: Atender · Hoje · Histórico · Ajustes
 */
export function itensDoPapel(papel: PapelComercial, basePath: string): ItemMenu[] {
  const rota = (caminho: string) => junta(basePath, caminho)
  switch (papel) {
    case 'balcao':
      return itensDoBalcao(basePath)
    case 'vendedor':
      return [
        { href: rota(''), label: 'Hoje', icon: 'hoje' },
        { href: rota('/funil'), label: 'Funil', icon: 'funil' },
        { href: rota('/carteira'), label: 'Carteira', icon: 'carteira' },
        { href: rota('/comissoes'), label: 'Comissões', icon: 'comissoes' },
        { href: rota('/meu-link'), label: 'Meu link', icon: 'link' },
        { href: rota('/ajustes'), label: 'Ajustes', icon: 'ajustes' },
      ]
    case 'supervisor':
      return [
        { href: rota(''), label: 'Hoje', icon: 'hoje' },
        { href: rota('/funil'), label: 'Funil', icon: 'funil' },
        { href: rota('/equipe'), label: 'Equipe', icon: 'equipe' },
        { href: rota('/resultados'), label: 'Resultados', icon: 'resultados' },
        { href: rota('/comissoes'), label: 'Comissões', icon: 'comissoes' },
        { href: rota('/ajustes'), label: 'Ajustes', icon: 'ajustes' },
      ]
    case 'gerente':
      return [
        { href: rota(''), label: 'Hoje', icon: 'hoje' },
        { href: rota('/funil'), label: 'Funil', icon: 'funil' },
        { href: rota('/rede'), label: 'Rede', icon: 'rede' },
        { href: rota('/resultados'), label: 'Resultados', icon: 'resultados' },
        { href: rota('/comissoes'), label: 'Comissões', icon: 'comissoes' },
        { href: rota('/ajustes'), label: 'Ajustes', icon: 'ajustes' },
      ]
    case 'master':
      return [
        { href: rota(''), label: 'Hoje', icon: 'hoje' },
        { href: rota('/funil'), label: 'Funil', icon: 'funil' },
        { href: rota('/rede'), label: 'Rede', icon: 'rede' },
        { href: rota('/resultados'), label: 'Resultados', icon: 'resultados' },
        { href: rota('/comissoes'), label: 'Comissões', icon: 'comissoes' },
        { href: rota('/regras'), label: 'Regras', icon: 'regras' },
        { href: rota('/ajustes'), label: 'Ajustes', icon: 'ajustes' },
      ]
  }
}

/** Item ativo: a raiz só vale na igualdade; as demais valem também em subrotas. */
export function itemAtivo(pathname: string | null, href: string, raiz: string): boolean {
  if (!pathname) return false
  const r = raiz.replace(/\/+$/, '') || '/'
  if (href === r) return pathname === r || pathname === `${r}/`
  return pathname === href || pathname.startsWith(`${href}/`)
}
