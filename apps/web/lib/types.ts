// ---------------------------------------------------------------------------
// Platform-level types (Annetec staff, operates /admin, manages tenants)
// ---------------------------------------------------------------------------

export type PlatformRole = 'superadmin' | 'platform_admin'

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
  notes: string
  value: number
  createdAt: Date
  updatedAt: Date
  sellerId: string
  interactions: Interaction[]
}

export interface Interaction {
  id: string
  type: 'call' | 'email' | 'meeting' | 'note'
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
}

// Accredited partner network (rede de credenciados) — core feature of
// white-label benefits clubs like meucard.club / labcard.com.br
export type PartnerCategory = 'health' | 'dental' | 'pharmacy' | 'wellness' | 'food' | 'education' | 'other'
export type PartnerStatus = 'active' | 'inactive'

export interface Partner {
  id: string
  tenantId: string
  name: string
  category: PartnerCategory
  discountPercent: number
  address: string
  phone: string
  status: PartnerStatus
}

// Mocked teleorientação / support appointment
export type AppointmentStatus = 'aguardando' | 'em_atendimento' | 'concluido'

export interface Appointment {
  id: string
  tenantId: string
  clientId: string
  clientName: string
  description: string
  status: AppointmentStatus
  createdAt: Date
}
