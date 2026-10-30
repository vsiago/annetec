// ---------------------------------------------------------------------------
// Platform-level types (Annetec staff, operates /admin, manages tenants)
// ---------------------------------------------------------------------------

import type { PlatformRole as ContractsPlatformRole } from '@annetec/contracts'

/**
 * Papel da conta de plataforma — o mesmo de @annetec/contracts:
 * `superadmin` e `platform_admin` (equipe, console `/admin`) e
 * `platform_seller` (vendedor ANNETEC, só a área `/vendas`).
 */
export type PlatformRole = ContractsPlatformRole

/** Situação do vínculo com o clube — espelha `MemberAccessStatus` de @annetec/contracts. */
export type MemberAccessStatus = 'active' | 'removed' | 'blocked'

export interface PlatformUser {
  id: string
  name: string
  email: string
  role: PlatformRole
  phone?: string
  avatar?: string
  /** Conta desativada continua existindo e assinando o histórico, mas não entra. */
  active: boolean
  createdAt: Date
}

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled'

export interface TenantAddress {
  cep: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}

export interface TenantBranding {
  logoUrl?: string
  logoLightUrl?: string
  primaryColor: string
  secondaryColor: string
}

export interface Tenant {
  id: string
  slug: string
  name: string
  legalName: string
  document: string // CNPJ
  email: string
  phone: string
  address: TenantAddress
  branding: TenantBranding
  planId: string
  status: TenantStatus
  createdAt: Date
  trialEndsAt?: Date
}

// Subscription tiers Annetec sells to tenants (not to be confused with a
// tenant's own end-customer `plan` field on Client below)
export interface TenantPlan {
  id: string
  name: string
  priceMonthly: number
  memberLimit: number
  features: string[]
}

// ---------------------------------------------------------------------------
// Tenant-scoped types (data belonging to a single tenant/inquilino)
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'seller' | 'client'

export interface User {
  id: string
  tenantId: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  phone?: string
  createdAt: Date
  /** Vínculo ativo neste inquilino (`member.active`); ausente fora da lista de usuários. */
  active?: boolean
  /**
   * Situação do vínculo com o clube (`member.access_status`): `active`,
   * `removed` (excluído/desativado — associado pode voltar pelo site) ou
   * `blocked` (não entra nem se cadastra de novo com este e-mail). Ausente
   * fora da lista de usuários.
   */
  accessStatus?: MemberAccessStatus
  /** Conta bloqueada pela plataforma. */
  banned?: boolean
  /** Último acesso conhecido neste inquilino; ausente = sem registro. */
  lastLoginAt?: Date
  /** `User-Agent` desse acesso (resumido na tela como navegador/app). */
  lastLoginUserAgent?: string
  /**
   * Só associado (sessão `client`): ainda não liberou os benefícios do clube
   * (sem assinatura ou pagamento pendente). Ver `SessionUser.needsSubscription`.
   */
  needsSubscription?: boolean
  /** Situação que gerou `needsSubscription` (`pending_payment` = pagamento pendente). */
  subscriptionStatus?: 'subscribed' | 'contract' | 'pending_payment' | 'none'
}

export interface Admin extends User {
  role: 'admin'
}

export interface Seller extends User {
  role: 'seller'
  region: string
  salesGoal: number
  totalSales: number
  commissionRate: number
}

export interface Client extends User {
  role: 'client'
  cpf: string
  /** "São Pedro da Aldeia - RJ", exibido na ficha do beneficiário. */
  city?: string
  plan: string
  planStatus: 'active' | 'pending' | 'cancelled'
  contractDate: Date
  cardNumber: string
  dependents: Dependent[]
  sellerId: string
}

export interface Dependent {
  id: string
  name: string
  cpf: string
  relationship: string
  birthDate: Date
}

// CRM types
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'closed' | 'lost'

export interface Lead {
  id: string
  tenantId: string
  name: string
  email: string
  phone: string
  source: string
  status: LeadStatus
  /** Plano que motivou o contato, exibido na coluna "Interesse". */
  interest?: string
  notes: string
  value: number
  createdAt: Date
  updatedAt: Date
  sellerId: string
  interactions: Interaction[]
}

export interface Interaction {
  id: string
  /** Mesmos canais que o contrato da API aceita — WhatsApp inclusive. */
  type: 'call' | 'email' | 'meeting' | 'note' | 'whatsapp'
  description: string
  date: Date
}

// Sales and Commission types
export interface Sale {
  id: string
  tenantId: string
  clientId: string
  clientName: string
  sellerId: string
  sellerName: string
  plan: string
  /** Canal que originou a venda, exibido no filtro "Origem". */
  source?: string
  value: number
  commission: number
  date: Date
  status: 'pending' | 'confirmed' | 'cancelled'
}

export interface SalesGoal {
  id: string
  tenantId: string
  sellerId: string
  month: number
  year: number
  target: number
  achieved: number
  commissionRate: number
}

// Benefit types
export interface Benefit {
  id: string
  tenantId: string
  name: string
  description: string
  category: 'health' | 'dental' | 'pharmacy' | 'funeral' | 'discount'
  discount?: number
  provider?: string
  locations?: string[]
}

// Plan catalog a tenant sells to its own end customers (distinct from
// TenantPlan, which is what Annetec sells to the tenant itself)
export interface ClientPlan {
  id: string
  tenantId: string
  name: string
  priceMonthly: number
  description: string
  /** Coberturas listadas no cartão do plano. */
  features?: string[]
  /** Destaca o plano como "Mais escolhido" na vitrine. */
  highlight?: boolean
  /** Público a que o plano se destina, usado no filtro da vitrine. */
  audience?: string
  /** Mensalidade por dependente (R$). `null`/0 = dependentes inclusos. */
  priceDependentMonthly?: number | null
  /** Teto de dependentes. `null` = sem limite; 0 = plano individual. */
  maxDependents?: number | null
}

// Accredited partner network (rede de credenciados) — core feature of
// white-label benefits clubs like meucard.club / labcard.com.br
export type PartnerCategory = 'health' | 'dental' | 'pharmacy' | 'wellness' | 'food' | 'education' | 'other'
export type PartnerStatus = 'active' | 'inactive'

export interface Partner {
  id: string
  tenantId: string
  name: string
  /** Frase curta do parceiro, exibida abaixo do nome na rede credenciada. */
  tagline?: string
  category: PartnerCategory
  discountPercent: number
  address: string
  city?: string
  phone: string
  email?: string
  website?: string
  /** Início do credenciamento. */
  since?: Date
  specialties?: string[]
  status: PartnerStatus
}

// Mesa de atendimento (helpdesk do clube)
export type AppointmentStatus =
  | 'aguardando'
  | 'em_atendimento'
  | 'aguardando_usuario'
  | 'aguardando_terceiro'
  | 'resolvido'
  | 'encerrado'

export type AppointmentChannel = 'telefone' | 'whatsapp' | 'email' | 'app' | 'presencial'
export type AppointmentPriority = 'alta' | 'normal' | 'baixa'

export interface AppointmentMessage {
  id: string
  /** `entrada` veio do associado, `saida` é resposta da equipe, `nota` é interna. */
  kind: 'entrada' | 'saida' | 'nota'
  title: string
  body: string
  at: Date
  author?: string
}

export interface Appointment {
  id: string
  tenantId: string
  clientId: string
  clientName: string
  /** Assunto curto, o que aparece na lista. */
  subject: string
  description: string
  channel: AppointmentChannel
  priority: AppointmentPriority
  status: AppointmentStatus
  /** Quem da equipe está com o chamado; vazio quando ainda está na fila. */
  assignedId: string
  assignedName: string
  /** Emitido pela Digital Saúde quando o inquilino usa o módulo de atendimento. */
  protocol: string
  lastInteractionAt: Date
  createdAt: Date
  messages: AppointmentMessage[]
}
