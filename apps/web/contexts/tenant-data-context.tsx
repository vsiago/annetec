'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Seller, Client, Benefit, Partner, Lead, Sale, SalesGoal, Appointment, Interaction, ClientPlan } from '@/lib/types'
import { useTenant } from './tenant-context'
import { listUsers, createTenantUser, updateUser as updateUserAction, deleteUser as deleteUserAction, type CreateTenantUserInput } from '@/lib/actions/tenant-users'
import { listBenefits, createBenefit as createBenefitAction, updateBenefit as updateBenefitAction, deleteBenefit as deleteBenefitAction } from '@/lib/actions/benefits'
import { listPartners, createPartner as createPartnerAction, updatePartner as updatePartnerAction, deletePartner as deletePartnerAction } from '@/lib/actions/partners'
import { listLeads, createLead as createLeadAction, updateLead as updateLeadAction, addLeadInteraction as addLeadInteractionAction, deleteLead as deleteLeadAction } from '@/lib/actions/leads'
import { listSales, listSalesGoals, createSale as createSaleAction, updateSale as updateSaleAction } from '@/lib/actions/sales'
import { listAppointments, createAppointment as createAppointmentAction, updateAppointment as updateAppointmentAction } from '@/lib/actions/appointments'
import { listClientPlans, createClientPlan as createClientPlanAction, updateClientPlan as updateClientPlanAction, deleteClientPlan as deleteClientPlanAction } from '@/lib/actions/client-plans'

type TenantUser = User | Seller | Client

interface TenantDataContextType {
  isLoading: boolean
  users: TenantUser[]
  benefits: Benefit[]
  partners: Partner[]
  leads: Lead[]
  sales: Sale[]
  salesGoals: SalesGoal[]
  appointments: Appointment[]
  clientPlans: ClientPlan[]
  refresh: () => Promise<void>

  createUser: (input: CreateTenantUserInput) => Promise<{ success: boolean; error?: string }>
  updateUser: (id: string, patch: Partial<TenantUser>) => Promise<{ success: boolean; error?: string }>
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>

  createBenefit: (input: Omit<Benefit, 'id' | 'tenantId'>) => Promise<void>
  updateBenefit: (id: string, patch: Partial<Benefit>) => Promise<void>
  deleteBenefit: (id: string) => Promise<void>

  createPartner: (input: Omit<Partner, 'id' | 'tenantId'>) => Promise<void>
  updatePartner: (id: string, patch: Partial<Partner>) => Promise<void>
  deletePartner: (id: string) => Promise<void>

  createLead: (input: Omit<Lead, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'interactions'>) => Promise<void>
  updateLead: (id: string, patch: Partial<Lead>) => Promise<void>
  addLeadInteraction: (id: string, interaction: Omit<Interaction, 'id'>) => Promise<void>
  deleteLead: (id: string) => Promise<void>

  createSale: (input: Omit<Sale, 'id' | 'tenantId'>) => Promise<void>
  updateSale: (id: string, patch: Partial<Sale>) => Promise<void>

  createAppointment: (input: Omit<Appointment, 'id' | 'tenantId' | 'createdAt' | 'status'>) => Promise<void>
  updateAppointment: (id: string, patch: Partial<Appointment>) => Promise<void>

  createClientPlan: (input: Omit<ClientPlan, 'id' | 'tenantId'>) => Promise<void>
  updateClientPlan: (id: string, patch: Partial<ClientPlan>) => Promise<void>
  deleteClientPlan: (id: string) => Promise<void>
}

const TenantDataContext = createContext<TenantDataContextType | undefined>(undefined)

export function TenantDataProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [salesGoals, setSalesGoals] = useState<SalesGoal[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [clientPlans, setClientPlans] = useState<ClientPlan[]>([])

  const refresh = useCallback(async () => {
    if (!tenantId) return
    setIsLoading(true)
    const [u, b, p, l, s, sg, a, cp] = await Promise.all([
      listUsers(tenantId),
      listBenefits(tenantId),
      listPartners(tenantId),
      listLeads(tenantId),
      listSales(tenantId),
      listSalesGoals(tenantId),
      listAppointments(tenantId),
      listClientPlans(tenantId),
    ])
    if (u.success) setUsers(u.data)
    if (b.success) setBenefits(b.data)
    if (p.success) setPartners(p.data)
    if (l.success) setLeads(l.data)
    if (s.success) setSales(s.data)
    if (sg.success) setSalesGoals(sg.data)
    if (a.success) setAppointments(a.data)
    if (cp.success) setClientPlans(cp.data)
    setIsLoading(false)
  }, [tenantId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value: TenantDataContextType = {
    isLoading,
    users,
    benefits,
    partners,
    leads,
    sales,
    salesGoals,
    appointments,
    clientPlans,
    refresh,

    createUser: async input => {
      const result = await createTenantUser(input)
      await refresh()
      return result.success ? { success: true } : { success: false, error: result.error }
    },
    updateUser: async (id, patch) => {
      const result = await updateUserAction(id, patch)
      await refresh()
      return result.success ? { success: true } : { success: false, error: result.error }
    },
    deleteUser: async id => {
      const result = await deleteUserAction(id)
      await refresh()
      return result.success ? { success: true } : { success: false, error: result.error }
    },

    createBenefit: async input => {
      await createBenefitAction({ ...input, tenantId })
      await refresh()
    },
    updateBenefit: async (id, patch) => {
      await updateBenefitAction(id, patch)
      await refresh()
    },
    deleteBenefit: async id => {
      await deleteBenefitAction(id)
      await refresh()
    },

    createPartner: async input => {
      await createPartnerAction({ ...input, tenantId })
      await refresh()
    },
    updatePartner: async (id, patch) => {
      await updatePartnerAction(id, patch)
      await refresh()
    },
    deletePartner: async id => {
      await deletePartnerAction(id)
      await refresh()
    },

    createLead: async input => {
      await createLeadAction({ ...input, tenantId })
      await refresh()
    },
    updateLead: async (id, patch) => {
      await updateLeadAction(id, patch)
      await refresh()
    },
    addLeadInteraction: async (id, interaction) => {
      await addLeadInteractionAction(id, interaction)
      await refresh()
    },
    deleteLead: async id => {
      await deleteLeadAction(id)
      await refresh()
    },

    createSale: async input => {
      await createSaleAction({ ...input, tenantId })
      await refresh()
    },
    updateSale: async (id, patch) => {
      await updateSaleAction(id, patch)
      await refresh()
    },

    createAppointment: async input => {
      await createAppointmentAction({ ...input, tenantId })
      await refresh()
    },
    updateAppointment: async (id, patch) => {
      await updateAppointmentAction(id, patch)
      await refresh()
    },

    createClientPlan: async input => {
      await createClientPlanAction({ ...input, tenantId })
      await refresh()
    },
    updateClientPlan: async (id, patch) => {
      await updateClientPlanAction(id, patch)
      await refresh()
    },
    deleteClientPlan: async id => {
      await deleteClientPlanAction(id)
      await refresh()
    },
  }

  return <TenantDataContext.Provider value={value}>{children}</TenantDataContext.Provider>
}

export function useTenantData() {
  const context = useContext(TenantDataContext)
  if (context === undefined) {
    throw new Error('useTenantData must be used within a TenantDataProvider')
  }
  return context
}

export function getAllSellers(users: TenantUser[]): Seller[] {
  return users.filter(u => u.role === 'seller') as Seller[]
}

export function getAllClients(users: TenantUser[]): Client[] {
  return users.filter(u => u.role === 'client') as Client[]
}

export function getClientsBySellerId(users: TenantUser[], sellerId: string): Client[] {
  return getAllClients(users).filter(c => c.sellerId === sellerId)
}

export function getLeadsBySellerId(leads: Lead[], sellerId: string): Lead[] {
  return leads.filter(l => l.sellerId === sellerId)
}

export function getSalesBySellerId(sales: Sale[], sellerId: string): Sale[] {
  return sales.filter(s => s.sellerId === sellerId)
}
