import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  BarChart3,
  CircleDollarSign,
  Gift,
  HandCoins,
  Handshake,
  Headset,
  Home,
  IdCard,
  Landmark,
  Package,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  UsersRound,
} from 'lucide-react'

/** Indicador que a sidebar desenha ao lado do item (dado vivo, não texto fixo). */
export type AdminNavBadge = 'receiving-missing' | 'support-waiting'

export interface AdminNavItem {
  /** Segmento sob `/[tenant]/admin`; vazio é o próprio painel. */
  segment: string
  label: string
  /** Rótulo curto da barra inferior e da folha do mobile, onde não cabe o nome inteiro. */
  shortLabel?: string
  /** Frase curta que explica o item (dica no menu recolhido e na folha do mobile). */
  hint?: string
  icon: LucideIcon
  /**
   * Quando dois itens apontam para a mesma tela em abas diferentes
   * (Cobranças × Conta de recebimento): `tab` é o `?tab=` do link e, em
   * `tabOf`, a aba que o item representa. O padrão da tela é `cobrancas`.
   */
  tab?: string
  badge?: AdminNavBadge
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/**
 * Menu do painel do clube — fonte única para a sidebar do desktop (expandida
 * e recolhida) e a folha "Menu" do mobile. Tudo fica à vista, agrupado pela
 * tarefa de quem administra o clube; nada escondido atrás de "Mais módulos".
 *
 * - Associados × Contas de acesso: "Associados" (cadastros) é a assinatura —
 *   plano, dependentes, pagamento. "Contas de acesso" (clientes) é a pessoa
 *   que entra no portal: dados cadastrais, carteirinha, bloqueio de acesso.
 *   São duas visões do mesmo público, por isso ficam lado a lado.
 * - Financeiro: Cobranças e assinaturas e Conta de recebimento são abas da
 *   mesma tela (`/faturamento`); o atalho existe porque, sem a conta do
 *   Asaas conectada, o clube não consegue cobrar ninguém.
 * - `/admin/financeiro` e `/admin/cobranca` redirecionam para Faturamento.
 */
export const adminNavHome: AdminNavItem = { segment: '', label: 'Início', icon: Home }

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: 'Associados',
    items: [
      {
        segment: 'cadastros',
        label: 'Associados',
        icon: IdCard,
        hint: 'Assinaturas, planos e dependentes',
      },
      {
        segment: 'clientes',
        label: 'Contas de acesso',
        shortLabel: 'Acessos',
        icon: UsersRound,
        hint: 'Quem entra no portal do associado',
      },
    ],
  },
  {
    label: 'Produto',
    items: [
      { segment: 'planos', label: 'Planos', icon: Package, hint: 'O que o clube vende' },
      { segment: 'beneficios', label: 'Benefícios', icon: Gift, hint: 'O que o associado recebe' },
      {
        segment: 'parceiros',
        label: 'Rede credenciada',
        shortLabel: 'Rede',
        icon: Handshake,
        hint: 'Clínicas, farmácias e parceiros',
      },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { segment: 'leads', label: 'Leads', icon: Users, hint: 'Interessados em contratar' },
      { segment: 'vendas', label: 'Vendas', icon: TrendingUp, hint: 'Contratos fechados' },
      {
        segment: 'vendedores',
        label: 'Vendedores e metas',
        shortLabel: 'Vendedores',
        icon: Target,
        hint: 'Equipe de vendas e metas do mês',
      },
      { segment: 'comissoes', label: 'Comissões', icon: CircleDollarSign, hint: 'Estimativa pelas vendas' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      {
        segment: 'faturamento',
        tab: 'cobrancas',
        label: 'Cobranças e assinaturas',
        shortLabel: 'Cobranças',
        icon: ReceiptText,
        hint: 'Mensalidades, atrasos e assinaturas',
      },
      {
        segment: 'financeiro/recebimento',
        label: 'Recebimentos',
        icon: HandCoins,
        hint: 'O dinheiro que entrou',
      },
      {
        segment: 'faturamento',
        tab: 'recebimento',
        label: 'Conta de recebimento',
        shortLabel: 'Conta',
        icon: Landmark,
        hint: 'Conta Asaas onde o clube recebe',
        badge: 'receiving-missing',
      },
      { segment: 'relatorios', label: 'Relatórios', icon: BarChart3, hint: 'Números do clube' },
    ],
  },
  {
    label: 'Atendimento',
    items: [
      {
        segment: 'atendimento',
        label: 'Atendimento',
        icon: Headset,
        hint: 'Chamados dos associados',
        badge: 'support-waiting',
      },
    ],
  },
  {
    label: 'Clube',
    items: [
      {
        segment: 'usuarios',
        label: 'Equipe e permissões',
        shortLabel: 'Equipe',
        icon: UserCog,
        hint: 'Quem acessa o painel',
      },
      {
        segment: 'configuracoes',
        label: 'Dados do clube',
        shortLabel: 'Dados',
        icon: Settings,
        hint: 'Nome, cores e contato',
      },
      {
        segment: 'assinatura',
        label: 'Plano ANNETEC',
        icon: BadgeCheck,
        hint: 'Sua assinatura da plataforma',
      },
    ],
  },
]

/** Barra inferior do mobile: quatro atalhos + "Menu" (folha com todos os grupos). */
export const adminNavMobileBar: AdminNavItem[] = [
  adminNavHome,
  { segment: 'cadastros', label: 'Associados', icon: IdCard },
  { segment: 'planos', label: 'Planos', icon: Package },
  { segment: 'faturamento', tab: 'cobrancas', label: 'Financeiro', icon: Wallet },
]

/** Lista completa, na ordem do menu. */
export const adminNavItems: AdminNavItem[] = [adminNavHome, ...adminNavGroups.flatMap(group => group.items)]

export function adminNavHref(base: string, segment: string, tab?: string): string {
  const path = segment ? `${base}/${segment}` : base
  // A aba padrão (cobranças) fica sem `?tab=`: é o endereço "limpo" da tela.
  return tab && tab !== 'cobrancas' ? `${path}?tab=${tab}` : path
}

/** Chave única do item (dois itens podem dividir o mesmo segmento). */
export function adminNavKey(item: AdminNavItem): string {
  return `${item.segment}|${item.tab ?? ''}`
}

/**
 * Item ativo: Início só na igualdade (senão ficaria aceso em toda página);
 * os demais também nas sub-rotas (`/faturamento/...`). Quando o item é uma
 * aba de uma tela, só acende se a aba da URL for a dele (`currentTab` vazio =
 * aba padrão, cobranças).
 */
export function isAdminNavActive(
  pathname: string | null,
  base: string,
  segment: string,
  tab?: string,
  currentTab?: string | null,
): boolean {
  if (!pathname) return false
  const href = adminNavHref(base, segment)
  const onPath = !segment
    ? pathname === href || pathname === `${href}/`
    : pathname === href || pathname.startsWith(`${href}/`)
  if (!onPath || !tab) return onPath
  return (currentTab || 'cobrancas') === tab
}

/** Atalho: ativo ou não, direto de um item do menu. */
export function isAdminNavItemActive(
  pathname: string | null,
  base: string,
  item: AdminNavItem,
  currentTab?: string | null,
): boolean {
  // "Cobranças" é a aba padrão: qualquer aba que não seja "Conta de recebimento"
  // continua sendo Cobranças e assinaturas (automação, visão geral...).
  if (item.tab === 'cobrancas') {
    return isAdminNavActive(pathname, base, item.segment) && currentTab !== 'recebimento'
  }
  return isAdminNavActive(pathname, base, item.segment, item.tab, currentTab)
}
