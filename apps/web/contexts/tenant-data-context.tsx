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

  /**
   * Toda mutação aplica o resultado direto no estado da coleção que mudou,
   * em vez de rebuscar as oito listas.
   *
   * O `refresh()` liga `isLoading`, e cada página do painel devolve `null`
   * enquanto carrega — então recarregar tudo a cada gravação desmontava a
   * tela inteira: a lista piscava, a paginação voltava para a página 1, o
   * filtro aberto fechava e a linha selecionada no painel lateral se perdia.
   * Trocando pelo patch local, só a lista afetada re-renderiza e o resto da
   * tela não sente a gravação. `refresh()` fica para a carga inicial.
   */
  function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    const index = list.findIndex(current => current.id === item.id)
    if (index === -1) return [...list, item]
    const next = [...list]
    next[index] = item
    return next
  }

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
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      return { success: true }
    },
    updateUser: async (id, patch) => {
      const result = await updateUserAction(id, patch)
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      return { success: true }
    },
    deleteUser: async id => {
      const result = await deleteUserAction(id)
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => prev.filter(item => item.id !== id))
      return { success: true }
    },

    createBenefit: async input => {
      const result = await createBenefitAction({ ...input, tenantId })
      if (result.success) setBenefits(prev => upsert(prev, result.data))
    },
    updateBenefit: async (id, patch) => {
      const result = await updateBenefitAction(id, patch)
      if (result.success) setBenefits(prev => upsert(prev, result.data))
    },
    deleteBenefit: async id => {
      const result = await deleteBenefitAction(id)
      if (result.success) setBenefits(prev => prev.filter(item => item.id !== id))
    },

    createPartner: async input => {
      const result = await createPartnerAction({ ...input, tenantId })
      if (result.success) setPartners(prev => upsert(prev, result.data))
    },
    updatePartner: async (id, patch) => {
      const result = await updatePartnerAction(id, patch)
      if (result.success) setPartners(prev => upsert(prev, result.data))
    },
    deletePartner: async id => {
      const result = await deletePartnerAction(id)
      if (result.success) setPartners(prev => prev.filter(item => item.id !== id))
    },

    createLead: async input => {
      const result = await createLeadAction({ ...input, tenantId })
      if (result.success) setLeads(prev => upsert(prev, result.data))
    },
    updateLead: async (id, patch) => {
      const result = await updateLeadAction(id, patch)
      if (result.success) setLeads(prev => upsert(prev, result.data))
    },
    addLeadInteraction: async (id, interaction) => {
      const result = await addLeadInteractionAction(id, interaction)
      if (result.success) setLeads(prev => upsert(prev, result.data))
    },
    deleteLead: async id => {
      const result = await deleteLeadAction(id)
      if (result.success) setLeads(prev => prev.filter(item => item.id !== id))
    },

    createSale: async input => {
      const result = await createSaleAction({ ...input, tenantId })
      if (result.success) setSales(prev => upsert(prev, result.data))
    },
    updateSale: async (id, patch) => {
      const result = await updateSaleAction(id, patch)
      if (result.success) setSales(prev => upsert(prev, result.data))
    },

    createAppointment: async input => {
      const result = await createAppointmentAction({ ...input, tenantId })
      if (result.success) setAppointments(prev => upsert(prev, result.data))
    },
    updateAppointment: async (id, patch) => {
      const result = await updateAppointmentAction(id, patch)
      if (result.success) setAppointments(prev => upsert(prev, result.data))
    },

    createClientPlan: async input => {
      const result = await createClientPlanAction({ ...input, tenantId })
      if (result.success) setClientPlans(prev => upsert(prev, result.data))
    },
    updateClientPlan: async (id, patch) => {
      const result = await updateClientPlanAction(id, patch)
      if (result.success) setClientPlans(prev => upsert(prev, result.data))
    },
    deleteClientPlan: async id => {
      const result = await deleteClientPlanAction(id)
      if (result.success) setClientPlans(prev => prev.filter(item => item.id !== id))
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
