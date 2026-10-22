'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type {
  Appointment,
  AppointmentMessage,
  Benefit,
  Client,
  ClientPlan,
  Interaction,
  Lead,
  Partner,
  Sale,
  SalesGoal,
  Seller,
  User,
} from '@/lib/types'
import { useTenant } from './tenant-context'
import { useAuth } from './auth-context'
import {
  beneficioDaApi,
  beneficioParaApi,
  beneficioParaApiCriacao,
  atendimentoDaApi,
  atendimentoParaApi,
  atendimentoParaApiCriacao,
  camposSemDestino,
  mensagemDaApi,
  mensagemParaApi,
  leadDaApi,
  leadParaApi,
  leadParaApiCriacao,
  metaDaApi,
  parceiroDaApi,
  parceiroParaApi,
  parceiroParaApiCriacao,
  planoDaApi,
  planoParaApi,
  planoParaApiCriacao,
  usuarioParaApi,
  usuarioParaApiCriacao,
  vendaDaApi,
  vendaParaApi,
  vendaParaApiCriacao,
} from '@/lib/adapters/painel'
import {
  createTenantUserAction,
  blockTenantUserAction,
  deactivateTenantUserAction,
  unblockTenantUserAction,
  listTenantUsersAction,
  updateTenantUserAction,
} from '@/lib/actions/tenant-users-api'
import {
  addOperatorLeadInteractionAction,
  createOperatorLeadAction,
  createOperatorSaleAction,
  deleteOperatorLeadAction,
  listOperatorLeadsAction,
  listOperatorSalesAction,
  listOperatorSalesGoalsAction,
  updateOperatorLeadAction,
  updateOperatorSaleAction,
} from '@/lib/actions/operator-crm-api'
import {
  createOperatorBenefitAction,
  createOperatorClubPlanAction,
  createOperatorPartnerAction,
  deleteOperatorBenefitAction,
  deleteOperatorClubPlanAction,
  deleteOperatorPartnerAction,
  listOperatorBenefitsAction,
  listOperatorClubPlansAction,
  listOperatorPartnersAction,
  updateOperatorBenefitAction,
  updateOperatorClubPlanAction,
  updateOperatorPartnerAction,
} from '@/lib/actions/operator-network-api'
import { listPublicBenefitsAction, listPublicPartnersAction } from '@/lib/actions/tenant-public-api'
import {
  addOperatorAppointmentMessageAction,
  createOperatorAppointmentAction,
  listOperatorAppointmentsAction,
  updateOperatorAppointmentAction,
} from '@/lib/actions/operator-support-api'

type TenantUser = User | Seller | Client

/**
 * Dado do inquilino para as telas do painel, do portal do vendedor e do
 * portal do associado.
 *
 * Três coisas definem o comportamento daqui:
 *
 * 1. **A sessão manda no que é buscado.** Este provider fica DENTRO do
 *    `AuthProvider` (ver `app/[tenant]/layout.tsx`) justamente para ler o
 *    papel antes de pedir qualquer coisa. `/usuarios` só autoriza admin e
 *    `/crm/*` só admin e vendedor — buscar tudo para todo mundo seria uma
 *    fila de 401/403 a cada navegação, e no visitante anônimo da landing
 *    seria uma fila de 401 a cada carga de página.
 *
 * 2. **A landing lê a vitrine pública.** Sem sessão, parceiros e benefícios
 *    vêm de `/t/:slug/public/*`, que não pede token. É o que mantém a página
 *    institucional funcionando agora que as rotas do inquilino exigem sessão
 *    de verdade em vez de devolver mock.
 *
 * 3. **Nada aqui é mais mock.** As oito coleções vêm do banco. As duas
 *    últimas a migrar foram atendimento (`/atendimentos`) e planos do clube
 *    (`/rede/planos`), que ganharam rota própria por serem regra da Annetec —
 *    não espelho da Digital Saúde.
 */
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

  createUser: (input: CreateTenantUserInput) => Promise<Resultado>
  updateUser: (id: string, patch: Partial<TenantUser>) => Promise<Resultado>
  /**
   * "Excluir cadastro": associado tem a assinatura cancelada e o vínculo vira
   * `removed` (pode voltar pelo site); equipe é desativada. A linha CONTINUA
   * na lista, com a situação nova — as telas filtram por situação.
   */
  deleteUser: (id: string) => Promise<Resultado>
  /** Bloqueia o acesso (não entra nem se cadastra de novo com o e-mail neste clube). */
  blockUser: (id: string) => Promise<Resultado>
  /** Desfaz o bloqueio: associado volta para `removed`, equipe para `active`. */
  unblockUser: (id: string) => Promise<Resultado>

  createBenefit: (input: Omit<Benefit, 'id' | 'tenantId'>) => Promise<void>
  updateBenefit: (id: string, patch: Partial<Benefit>) => Promise<void>
  deleteBenefit: (id: string) => Promise<void>

  createPartner: (input: Omit<Partner, 'id' | 'tenantId'>) => Promise<void>
  updatePartner: (id: string, patch: Partial<Partner>) => Promise<void>
  deletePartner: (id: string) => Promise<void>

  createLead: (
    input: Omit<Lead, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'interactions'>,
  ) => Promise<void>
  updateLead: (id: string, patch: Partial<Lead>) => Promise<void>
  addLeadInteraction: (id: string, interaction: Omit<Interaction, 'id'>) => Promise<void>
  deleteLead: (id: string) => Promise<void>

  createSale: (input: Omit<Sale, 'id' | 'tenantId'>) => Promise<void>
  updateSale: (id: string, patch: Partial<Sale>) => Promise<void>

  createAppointment: (
    input: Omit<Appointment, 'id' | 'tenantId' | 'createdAt' | 'status'>,
  ) => Promise<void>
  updateAppointment: (id: string, patch: Partial<Appointment>) => Promise<void>
  addAppointmentMessage: (
    id: string,
    message: Omit<AppointmentMessage, 'id' | 'at'>,
  ) => Promise<void>

  /**
   * Planos do clube. As três REJEITAM com `Error(mensagem da API)` quando a
   * gravação falha — antes a falha era engolida e a tela dizia "salvo" sobre
   * um plano que não mudou. Quem chama trata com try/catch + toast.
   */
  createClientPlan: (input: Omit<ClientPlan, 'id' | 'tenantId'>) => Promise<void>
  updateClientPlan: (id: string, patch: Partial<ClientPlan>) => Promise<void>
  deleteClientPlan: (id: string) => Promise<void>
  /**
   * Rebusca só a lista de planos (sem o `isLoading` global que desmonta as
   * telas). Usada por Produtos e Planos depois de gravar pela action própria,
   * para Cadastros, Faturamento e o portal do vendedor verem o plano novo.
   * Não rejeita: lista desatualizada não desfaz uma gravação que deu certo.
   */
  reloadClientPlans: () => Promise<void>
  /**
   * Rebusca só a lista de usuários, sem o `isLoading` global. Usada pelo sino
   * quando chega um cadastro novo: o "Ver detalhes" abre `clientes/<id>`, que
   * procura a pessoa nesta lista.
   */
  reloadUsers: () => Promise<void>
}

type Resultado = { success: boolean; error?: string }

/**
 * O que as telas passam para `createUser`: só o que a API grava. Id, datas,
 * carteirinha e SENHA nascem no servidor — a senha provisória vai por e-mail
 * ao próprio usuário (associado não tem senha: entra por CPF/Google).
 */
export type CreateTenantUserInput = Pick<User, 'name' | 'email' | 'role'> & {
  phone?: string
  /** Só associado. */
  cpf?: string
}

const TenantDataContext = createContext<TenantDataContextType | undefined>(undefined)

export function TenantDataProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const { user: sessao, isLoading: carregandoSessao, endSession } = useAuth()

  const slug = tenant?.slug ?? ''
  const papel = sessao?.role ?? null

  // Quem lê o quê — o mesmo recorte que a API aplica nas rotas.
  const leUsuarios = papel === 'admin'
  const leCrm = papel === 'admin' || papel === 'seller'

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
    if (!slug) return
    setIsLoading(true)

    // Rede credenciada e clube: autenticado lê a rota do inquilino (que traz
    // inclusive parceiro inativo, necessário para administrar); visitante lê
    // a vitrine pública, que só expõe parceiro ativo.
    const [parceiros, beneficios] = await Promise.all([
      papel ? listOperatorPartnersAction(slug) : listPublicPartnersAction(slug),
      papel ? listOperatorBenefitsAction(slug) : listPublicBenefitsAction(slug),
    ])
    // 401 = a sessão caiu no servidor (vínculo desativado, sessões
    // derrubadas). Para aqui: o AuthProvider limpa o cookie e o
    // ProtectedRoute leva ao login com o aviso — sem tela meio carregada.
    if (sessaoCaiu(parceiros, beneficios)) {
      setIsLoading(false)
      void endSession()
      return
    }
    if (parceiros.success) setPartners(parceiros.data.map(parceiroDaApi))
    if (beneficios.success) setBenefits(beneficios.data.map(beneficioDaApi))

    if (leCrm) {
      const [listaLeads, listaVendas, listaMetas] = await Promise.all([
        listOperatorLeadsAction(slug),
        listOperatorSalesAction(slug),
        listOperatorSalesGoalsAction(slug, anoCorrente()),
      ])
      if (sessaoCaiu(listaLeads, listaVendas, listaMetas)) {
        setIsLoading(false)
        void endSession()
        return
      }
      if (listaLeads.success) setLeads(listaLeads.data.map(leadDaApi))
      if (listaVendas.success) setSales(listaVendas.data.map(vendaDaApi))
      if (listaMetas.success) setSalesGoals(listaMetas.data.map(metaDaApi))
    } else {
      setLeads([])
      setSales([])
      setSalesGoals([])
    }

    if (leUsuarios) {
      const listaUsuarios = await listTenantUsersAction(slug)
      if (sessaoCaiu(listaUsuarios)) {
        setIsLoading(false)
        void endSession()
        return
      }
      if (listaUsuarios.success) setUsers(listaUsuarios.data)
    } else {
      // Vendedor e associado não enxergam a lista de usuários do inquilino —
      // e não precisam: as telas deles usam o próprio `useAuth().user`.
      setUsers([])
    }

    // Atendimento e planos do clube. Só com sessão: `/atendimentos` exige
    // papel de inquilino e a vitrine pública ainda não expõe os planos.
    if (papel) {
      const [atendimentos, planos] = await Promise.all([
        listOperatorAppointmentsAction(slug),
        listOperatorClubPlansAction(slug),
      ])
      if (atendimentos.success) setAppointments(atendimentos.data.map(atendimentoDaApi))
      if (planos.success) setClientPlans(planos.data.map(planoDaApi))
    } else {
      setAppointments([])
      setClientPlans([])
    }

    setIsLoading(false)
  }, [slug, papel, leCrm, leUsuarios, endSession])

  useEffect(() => {
    // Enquanto a sessão não resolveu não dá para saber o que buscar: disparar
    // agora mandaria a carga anônima e, um instante depois, a autenticada.
    if (carregandoSessao) return
    refresh()
  }, [carregandoSessao, refresh])

  const reloadClientPlans = useCallback(async () => {
    if (!slug || !papel) return
    const planos = await listOperatorClubPlansAction(slug)
    if (planos.success) setClientPlans(planos.data.map(planoDaApi))
    else console.warn('[planos] não foi possível atualizar a lista de planos:', planos.error)
  }, [slug, papel])

  const reloadUsers = useCallback(async () => {
    if (!slug || !leUsuarios) return
    const lista = await listTenantUsersAction(slug)
    if (lista.success) setUsers(lista.data)
  }, [slug, leUsuarios])

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
    // Registro novo entra no TOPO: as listagens da API vêm em ordem
    // decrescente de criação, e anexar no fim faria o recém-criado sumir na
    // última página em vez de aparecer na primeira linha.
    if (index === -1) return [item, ...list]
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
      const result = await createTenantUserAction(slug, usuarioParaApiCriacao(input))
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      return { success: true }
    },

    /**
     * Só os campos de conta chegam ao servidor. Plano, carteirinha, meta e
     * comissão não têm rota de escrita — em vez de gravar pela metade e
     * devolver sucesso, a chamada diz qual campo ficou de fora.
     */
    updateUser: async (id, patch) => {
      const orfaos = camposSemDestino(patch as Record<string, unknown>)
      const corpo = usuarioParaApi(patch)
      if (orfaos.length > 0 && Object.keys(corpo).length === 0) {
        return {
          success: false,
          error: `Ainda não é possível alterar por aqui: ${orfaos.join(', ')}. Esses dados vêm da adesão.`,
        }
      }
      const result = await updateTenantUserAction(slug, id, corpo)
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      if (orfaos.length > 0) {
        return {
          success: false,
          error: `Salvo, exceto: ${orfaos.join(', ')} — esses dados vêm da adesão.`,
        }
      }
      return { success: true }
    },

    /** Exclui o vínculo; a conta continua existindo e assinando o histórico. */
    deleteUser: async id => {
      const result = await deactivateTenantUserAction(slug, id)
      if (!result.success) return { success: false, error: result.error }
      const atualizado = result.data
      setUsers(prev =>
        atualizado
          ? upsert(prev, atualizado)
          : prev.map(item =>
              item.id === id ? { ...item, active: false, accessStatus: 'removed' as const } : item,
            ),
      )
      return { success: true }
    },

    blockUser: async id => {
      const result = await blockTenantUserAction(slug, id)
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      return { success: true }
    },

    unblockUser: async id => {
      const result = await unblockTenantUserAction(slug, id)
      if (!result.success) return { success: false, error: result.error }
      setUsers(prev => upsert(prev, result.data))
      return { success: true }
    },

    createBenefit: async input => {
      const result = await createOperatorBenefitAction(slug, beneficioParaApiCriacao(input))
      if (result.success) setBenefits(prev => upsert(prev, beneficioDaApi(result.data)))
    },
    updateBenefit: async (id, patch) => {
      const result = await updateOperatorBenefitAction(slug, id, beneficioParaApi(patch))
      if (result.success) setBenefits(prev => upsert(prev, beneficioDaApi(result.data)))
    },
    deleteBenefit: async id => {
      const result = await deleteOperatorBenefitAction(slug, id)
      if (result.success) setBenefits(prev => prev.filter(item => item.id !== id))
    },

    createPartner: async input => {
      const result = await createOperatorPartnerAction(slug, parceiroParaApiCriacao(input))
      if (result.success) setPartners(prev => upsert(prev, parceiroDaApi(result.data)))
    },
    updatePartner: async (id, patch) => {
      const result = await updateOperatorPartnerAction(slug, id, parceiroParaApi(patch))
      if (result.success) setPartners(prev => upsert(prev, parceiroDaApi(result.data)))
    },
    deletePartner: async id => {
      const result = await deleteOperatorPartnerAction(slug, id)
      if (result.success) setPartners(prev => prev.filter(item => item.id !== id))
    },

    createLead: async input => {
      const result = await createOperatorLeadAction(slug, leadParaApiCriacao(input))
      if (result.success) setLeads(prev => upsert(prev, leadDaApi(result.data)))
    },
    updateLead: async (id, patch) => {
      const result = await updateOperatorLeadAction(slug, id, leadParaApi(patch))
      if (result.success) setLeads(prev => upsert(prev, leadDaApi(result.data)))
    },

    /**
     * A rota devolve o LEAD inteiro já com a interação anexada, então o lead
     * do estado é substituído pelo que voltou. Sintetizar a interação aqui
     * daria uma linha parecida mas não igual: id e horário são do servidor, e
     * `authorId` ele preenche a partir da sessão — a tela passaria a mostrar
     * uma interação que não é a que ficou gravada.
     */
    addLeadInteraction: async (id, interaction) => {
      const result = await addOperatorLeadInteractionAction(slug, id, {
        type: interaction.type,
        description: interaction.description,
        occurredAt: new Date(interaction.date).toISOString(),
      })
      if (result.success) setLeads(prev => upsert(prev, leadDaApi(result.data)))
    },
    deleteLead: async id => {
      const result = await deleteOperatorLeadAction(slug, id)
      if (result.success) setLeads(prev => prev.filter(item => item.id !== id))
    },

    createSale: async input => {
      const result = await createOperatorSaleAction(slug, vendaParaApiCriacao(input))
      if (result.success) setSales(prev => upsert(prev, vendaDaApi(result.data)))
    },
    updateSale: async (id, patch) => {
      const result = await updateOperatorSaleAction(slug, id, vendaParaApi(patch))
      if (result.success) setSales(prev => upsert(prev, vendaDaApi(result.data)))
    },

    createAppointment: async input => {
      const result = await createOperatorAppointmentAction(slug, atendimentoParaApiCriacao(input))
      if (result.success) setAppointments(prev => upsert(prev, atendimentoDaApi(result.data)))
    },
    updateAppointment: async (id, patch) => {
      const result = await updateOperatorAppointmentAction(slug, id, atendimentoParaApi(patch))
      if (result.success) setAppointments(prev => upsert(prev, atendimentoDaApi(result.data)))
    },

    /**
     * A rota devolve só a MENSAGEM criada, não o chamado inteiro. Ela é
     * encaixada na thread que já está em memória, junto com a data de última
     * movimentação — é por ela que a mesa ordena, e deixá-la parada mandaria
     * o chamado recém-respondido para o fim da fila.
     */
    addAppointmentMessage: async (id, message) => {
      const result = await addOperatorAppointmentMessageAction(slug, id, mensagemParaApi(message))
      if (!result.success) return
      const criada = mensagemDaApi(result.data)
      setAppointments(prev =>
        prev.map(item =>
          item.id === id
            ? { ...item, messages: [...item.messages, criada], lastInteractionAt: criada.at }
            : item,
        ),
      )
    },

    createClientPlan: async input => {
      const result = await createOperatorClubPlanAction(slug, planoParaApiCriacao(input))
      if (!result.success) throw new Error(result.error)
      setClientPlans(prev => upsert(prev, planoDaApi(result.data)))
    },
    updateClientPlan: async (id, patch) => {
      const result = await updateOperatorClubPlanAction(slug, id, planoParaApi(patch))
      if (!result.success) throw new Error(result.error)
      setClientPlans(prev => upsert(prev, planoDaApi(result.data)))
    },
    deleteClientPlan: async id => {
      const result = await deleteOperatorClubPlanAction(slug, id)
      if (!result.success) throw new Error(result.error)
      setClientPlans(prev => prev.filter(item => item.id !== id))
    },
    reloadClientPlans,
    reloadUsers,
  }

  return <TenantDataContext.Provider value={value}>{children}</TenantDataContext.Provider>
}

/** Alguma das leituras voltou 401 — a sessão não vale mais no servidor. */
function sessaoCaiu(...resultados: { success: boolean }[]): boolean {
  return resultados.some(
    resultado => !resultado.success && (resultado as { unauthorized?: true }).unauthorized === true,
  )
}

/** Metas são listadas por ano; o painel sempre abre no corrente. */
function anoCorrente(): number {
  return new Date().getFullYear()
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
