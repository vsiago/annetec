// User types and roles
export type UserRole = 'admin' | 'seller' | 'client'

export interface User {
  id: string
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
  name: string
  description: string
  category: 'health' | 'dental' | 'pharmacy' | 'funeral' | 'discount'
  discount?: number
  provider?: string
  locations?: string[]
}
