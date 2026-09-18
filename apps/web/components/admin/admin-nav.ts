import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  CreditCard,
  FileText,
  Handshake,
  Headset,
  Home,
  Megaphone,
  Package,
  Settings,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
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
 * Menu do painel da administradora — fonte única para a sidebar do desktop e
 * a barra inferior do mobile, que antes repetiam a mesma lista e saíam de
 * sincronia a cada item novo.
 *
 * A ordem e os nomes seguem o painel aprovado com o cliente. Rotas que ainda
 * não têm backend existem como casca (`MockPage`) para a navegação da
 * apresentação funcionar inteira.
 */
export const adminNavItems: AdminNavItem[] = [
  { segment: '', label: 'Início', icon: Home },
  { segment: 'leads', label: 'Leads', icon: Users },
  { segment: 'vendas', label: 'Vendas', icon: TrendingUp },
  { segment: 'clientes', label: 'Beneficiários', icon: UsersRound },
  { segment: 'planos', label: 'Planos e Produtos', shortLabel: 'Planos', icon: Package },
  { segment: 'parceiros', label: 'Rede de Parceiros', shortLabel: 'Parceiros', icon: Handshake },
  { segment: 'clinicas', label: 'Clínicas e Elegibilidade', shortLabel: 'Clínicas', icon: Building2 },
  { segment: 'cobranca', label: 'Cobrança', icon: CreditCard },
  { segment: 'financeiro', label: 'Financeiro', icon: BarChart3 },
  { segment: 'comissoes', label: 'Comissões', icon: CircleDollarSign },
  { segment: 'relatorios', label: 'Relatórios', icon: FileText },
  { segment: 'comunicacao', label: 'Comunicação', shortLabel: 'Comunicação', icon: Megaphone },
  { segment: 'atendimento', label: 'Atendimento', icon: Headset },
  { segment: 'usuarios', label: 'Usuários e Permissões', shortLabel: 'Usuários', icon: UserCog },
  { segment: 'configuracoes', label: 'Configurações', shortLabel: 'Config', icon: Settings },
]

export function adminNavHref(base: string, segment: string): string {
  return segment ? `${base}/${segment}` : base
}
