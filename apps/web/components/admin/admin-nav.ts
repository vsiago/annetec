import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  CircleDollarSign,
  FileText,
  HandCoins,
  Handshake,
  Headset,
  Home,
  IdCard,
  Package,
  ReceiptText,
  Settings,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'

export interface AdminNavItem {
  /** Segmento sob `/[tenant]/admin`; vazio é o próprio painel. */
  segment: string
  label: string
  /** Rótulo curto da barra inferior no mobile, onde não cabe o nome inteiro. */
  shortLabel?: string
  icon: LucideIcon
}

/**
 * Menu do painel da administradora — fonte única para a sidebar do desktop
 * (expandida e recolhida) e a barra inferior do mobile.
 *
 * O menu é enxuto de propósito: o dia a dia do clube é montar a oferta e
 * receber cadastros e pagamentos, então só Início, Produtos e Planos,
 * Cadastros e o grupo Financeiro ficam à vista. O resto vai para o grupo
 * "Mais módulos" — continua a um clique, sem disputar atenção com o que
 * importa.
 *
 * Financeiro agrupa Recebimento (o dinheiro que entrou) e Faturamento
 * (cobranças e assinaturas). Faturamento continua em `/admin/faturamento`
 * — os links antigos (`?tab=cobrancas`...) seguem valendo; `/admin/financeiro`
 * e `/admin/cobranca` redirecionam para lá.
 * "Clínicas e Elegibilidade" virou a Rede de Parceiros e "Comunicação" virou o
 * Atendimento — eram maquetes que duplicavam essas telas.
 */
export const adminNavPrimary: AdminNavItem[] = [
  { segment: '', label: 'Início', icon: Home },
  { segment: 'planos', label: 'Produtos e Planos', shortLabel: 'Produtos', icon: Package },
  { segment: 'cadastros', label: 'Cadastros', icon: IdCard },
]

export interface AdminNavGroup {
  label: string
  icon: LucideIcon
  items: AdminNavItem[]
}

/** Grupo Financeiro: abre e fecha na sidebar; recolhida, vira menu flutuante. */
export const adminNavFinance: AdminNavGroup = {
  label: 'Financeiro',
  icon: Wallet,
  items: [
    { segment: 'financeiro/recebimento', label: 'Recebimento', icon: HandCoins },
    { segment: 'faturamento', label: 'Faturamento', icon: ReceiptText },
  ],
}

export const adminNavMore: AdminNavItem[] = [
  { segment: 'leads', label: 'Leads', icon: Users },
  { segment: 'vendas', label: 'Vendas', icon: TrendingUp },
  { segment: 'clientes', label: 'Beneficiários', icon: UsersRound },
  { segment: 'parceiros', label: 'Rede de Parceiros', shortLabel: 'Parceiros', icon: Handshake },
  { segment: 'comissoes', label: 'Comissões', icon: CircleDollarSign },
  { segment: 'relatorios', label: 'Relatórios', icon: FileText },
  { segment: 'atendimento', label: 'Atendimento', icon: Headset },
  { segment: 'usuarios', label: 'Usuários e Permissões', shortLabel: 'Usuários', icon: UserCog },
  { segment: 'configuracoes', label: 'Configurações', shortLabel: 'Config', icon: Settings },
  { segment: 'assinatura', label: 'Assinatura da plataforma', shortLabel: 'Assinatura', icon: BadgeCheck },
]

/** Lista completa, na ordem do menu — para quem só precisa percorrer tudo. */
export const adminNavItems: AdminNavItem[] = [...adminNavPrimary, ...adminNavFinance.items, ...adminNavMore]

/** Chave do `localStorage` que lembra se "Mais módulos" ficou aberto. */
export const ADMIN_NAV_MORE_STORAGE_KEY = 'annetec_admin_more_open'

/** Chave do `localStorage` que lembra se o grupo Financeiro ficou aberto. */
export const ADMIN_NAV_FINANCE_STORAGE_KEY = 'annetec_admin_finance_open'

export function adminNavHref(base: string, segment: string): string {
  return segment ? `${base}/${segment}` : base
}

/**
 * Item ativo: Início só na igualdade (senão ficaria aceso em toda página);
 * os demais também nas sub-rotas (`/faturamento/...`).
 */
export function isAdminNavActive(pathname: string | null, base: string, segment: string): boolean {
  if (!pathname) return false
  const href = adminNavHref(base, segment)
  if (!segment) return pathname === href || pathname === `${href}/`
  return pathname === href || pathname.startsWith(`${href}/`)
}
