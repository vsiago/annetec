import { z } from 'zod'
import { cep, celular, dateOnly, email, telefone, uuid } from '../common/primitives'
import {
  asaasEnvironment,
  clubReceivingAccount,
  managedAccountGeneralStatus,
  managedAutoDebit,
  receivingAccountSource,
} from './club-billing'

/**
 * Conta de recebimento GERENCIADA pela ANNETEC (opção à conta Asaas própria
 * do clube): o admin do clube pede, com os dados cadastrais e o aceite do
 * termo; o superadmin aprova e a API cria a SUBCONTA Asaas do clube dentro da
 * conta da ANNETEC. As mensalidades dos associados caem nessa subconta e, no
 * vencimento das faturas da ANNETEC, a automação debita o valor do saldo dela
 * (transferência para a carteira da ANNETEC).
 *
 * Rotas do clube: `/t/:slug/faturamento/configuracoes/recebimento/gerenciada*`.
 * Rotas da plataforma: `/platform/contas-gerenciadas*` (superadmin escreve;
 * platform_admin lê; vendedor nunca).
 */

// ---------------------------------------------------------------------------
// Termo de aceite
// ---------------------------------------------------------------------------

/** Versão do termo. Mudou o texto? Suba a versão: a API recusa aceite de versão antiga. */
export const MANAGED_ACCOUNT_TERMS_VERSION = '2026-10-30'

export const MANAGED_ACCOUNT_TERMS_TEXT =
  'Autorizo a ANNETEC a abrir e gerenciar a conta de recebimento do clube e a debitar do saldo, no vencimento, o valor das faturas da plataforma.'

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

/** Natureza jurídica (campo `companyType` do Asaas, obrigatório para CNPJ). */
export const asaasCompanyType = z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'])
export type AsaasCompanyType = z.infer<typeof asaasCompanyType>

/** Ordem = ordem das opções nas telas (associação primeiro: é o caso comum dos clubes). */
export const ASAAS_COMPANY_TYPE_LABELS: Record<AsaasCompanyType, string> = {
  ASSOCIATION: 'Associação',
  LIMITED: 'Sociedade limitada (LTDA)',
  INDIVIDUAL: 'Empresário individual',
  MEI: 'MEI (microempreendedor individual)',
}

/** Naturezas jurídicas (código da Receita, 4 dígitos) com correspondência direta no Asaas. */
const COMPANY_TYPE_BY_LEGAL_NATURE: Record<string, AsaasCompanyType> = {
  /** Associação Privada. */
  '3999': 'ASSOCIATION',
  /** Sociedade Empresária Limitada. */
  '2062': 'LIMITED',
  /** Sociedade Simples Limitada. */
  '2240': 'LIMITED',
  /** EIRELI (natureza empresária / simples) — hoje SLU, limitada. */
  '2305': 'LIMITED',
  '2313': 'LIMITED',
  /** Empresário (Individual) — MEI quando optante do SIMEI. */
  '2135': 'INDIVIDUAL',
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Tipo de empresa do Asaas a partir da natureza jurídica da Receita (consulta
 * de CNPJ). Só devolve quando a correspondência é inequívoca: "Associação
 * Privada" → ASSOCIATION, "Sociedade Empresária Limitada" → LIMITED, empresário
 * individual → INDIVIDUAL (ou MEI, se optante do SIMEI). Sindicato, fundação,
 * S.A., cooperativa etc. não têm tipo equivalente: `null` — a tela pede para a
 * pessoa escolher e confirmar (nunca um padrão silencioso).
 */
export function companyTypeFromLegalNature(nature: {
  code?: string | null
  name?: string | null
  mei?: boolean | null
}): AsaasCompanyType | null {
  const code = (nature.code ?? '').replace(/\D/g, '')
  const name = normalizeText(nature.name ?? '')
  if (nature.mei === true || /microempreendedor|\bmei\b/.test(name)) return 'MEI'
  const byCode = code.length === 4 ? COMPANY_TYPE_BY_LEGAL_NATURE[code] : undefined
  if (byCode) return byCode
  if (code.length === 4) return null
  // Sem código: só o nome, e só os casos sem ambiguidade.
  if (name === 'associacao privada') return 'ASSOCIATION'
  if (/^sociedade (empresaria|simples) limitada$/.test(name)) return 'LIMITED'
  if (/^empresario( \(?individual\)?)?$/.test(name)) return 'INDIVIDUAL'
  return null
}

/**
 * `pendente` = aguardando o superadmin; `aprovando` = criando a subconta no
 * Asaas agora; `aprovado` = subconta criada e conectada; `recusado` = o
 * superadmin recusou (motivo); `falhou` = a criação/gravação deu erro (o
 * superadmin tenta de novo, recupera a chave ou recusa). Pendente, aprovando
 * e falhou bloqueiam um novo pedido.
 */
export const managedAccountRequestStatus = z.enum(['pendente', 'aprovando', 'aprovado', 'recusado', 'falhou'])
export type ManagedAccountRequestStatus = z.infer<typeof managedAccountRequestStatus>

export const MANAGED_ACCOUNT_REQUEST_STATUS_LABELS: Record<ManagedAccountRequestStatus, string> = {
  pendente: 'Aguardando aprovação da ANNETEC',
  aprovando: 'Criando a conta',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  falhou: 'Falha na criação da conta',
}

/** Endereço da subconta (o Asaas resolve cidade/UF pelo CEP). */
export const managedAccountAddress = z.object({
  postalCode: cep,
  street: z.string().trim().min(1, 'Informe o logradouro').max(200),
  number: z.string().trim().min(1, 'Informe o número').max(20),
  complement: z.string().trim().max(100).nullish(),
  /** Bairro. */
  province: z.string().trim().min(1, 'Informe o bairro').max(100),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(2).nullish(),
})
export type ManagedAccountAddress = z.infer<typeof managedAccountAddress>

/**
 * `POST /t/:slug/faturamento/configuracoes/recebimento/gerenciada`. Nome e
 * CPF/CNPJ vêm do cadastro do clube (não editáveis aqui). `companyType` é
 * obrigatório para CNPJ e `birthDate` para CPF — conferidos na API.
 */
export const requestManagedAccountInput = z.object({
  companyType: asaasCompanyType.optional(),
  birthDate: dateOnly.optional(),
  /** Faturamento/renda mensal estimado (R$), exigido pelo Asaas. */
  incomeValue: z.number().positive('Informe o faturamento mensal').max(1_000_000_000),
  /** E-mail da conta (comunicações do Asaas). */
  email,
  /** E-mail de login da subconta no Asaas. */
  loginEmail: email,
  phone: telefone.optional(),
  mobilePhone: celular,
  site: z.string().trim().url('Site inválido').max(200).optional(),
  address: managedAccountAddress,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o termo para continuar' }) }),
  /** Versão do termo exibida na tela (`MANAGED_ACCOUNT_TERMS_VERSION`). */
  termsVersion: z.string().trim().min(1).max(40),
})
export type RequestManagedAccountInput = z.infer<typeof requestManagedAccountInput>

export const managedAccountRequest = z.object({
  id: uuid,
  status: managedAccountRequestStatus,
  statusLabel: z.string(),
  /** Razão social/nome do cadastro do clube. */
  name: z.string(),
  /** CPF/CNPJ: mascarado na visão do clube; completo (formatado) no console da plataforma. */
  cpfCnpj: z.string().nullable(),
  personType: z.enum(['PJ', 'PF']),
  companyType: asaasCompanyType.nullable(),
  birthDate: z.string().nullable(),
  incomeValue: z.number(),
  email: z.string(),
  loginEmail: z.string(),
  phone: z.string().nullable(),
  mobilePhone: z.string(),
  site: z.string().nullable(),
  address: managedAccountAddress,
  terms: z.object({
    version: z.string(),
    text: z.string(),
    acceptedAt: z.string().datetime(),
    acceptedByName: z.string().nullable(),
    acceptedIp: z.string().nullable(),
  }),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  /** Motivo da recusa (status `recusado`). */
  refuseReason: z.string().nullable(),
  /** Erro da criação/gravação (status `falhou`). */
  lastError: z.string().nullable(),
  /**
   * Correções feitas pelo superadmin antes da aprovação (o aceite do termo
   * continua o original). Mais antiga primeiro; o antes/depois fica na auditoria.
   */
  corrections: z.array(
    z.object({
      at: z.string().datetime(),
      byName: z.string().nullable(),
      /** Rótulos dos campos alterados ("Tipo de empresa", "Endereço"…). */
      fields: z.array(z.string()),
    }),
  ),
})
export type ManagedAccountRequest = z.infer<typeof managedAccountRequest>

/**
 * `PATCH /platform/contas-gerenciadas/:orgId/pedido` (só superadmin): corrige os
 * dados do pedido ANTES da aprovação (pedido pendente ou com falha, sem subconta
 * criada). Nome e CPF/CNPJ vêm do cadastro do clube e não mudam aqui; o aceite
 * do termo (quem, quando, IP) fica o original. Só os campos enviados mudam.
 */
export const updateManagedAccountRequestInput = z
  .object({
    companyType: asaasCompanyType,
    birthDate: dateOnly,
    incomeValue: z.number().positive('Informe o faturamento mensal').max(1_000_000_000),
    email,
    loginEmail: email,
    /** `null` apaga o telefone fixo. */
    phone: telefone.nullable(),
    mobilePhone: celular,
    /** `null` apaga o site. */
    site: z.string().trim().url('Site inválido').max(200).nullable(),
    address: managedAccountAddress,
  })
  .partial()
  .refine(value => Object.values(value).some(item => item !== undefined), { message: 'Nada para corrigir' })
export type UpdateManagedAccountRequestInput = z.infer<typeof updateManagedAccountRequestInput>

/** Rótulo de cada campo corrigível (auditoria e histórico de correções). */
export const MANAGED_ACCOUNT_REQUEST_FIELD_LABELS: Record<keyof UpdateManagedAccountRequestInput, string> = {
  companyType: 'Tipo de empresa',
  birthDate: 'Data de nascimento',
  incomeValue: 'Faturamento mensal',
  email: 'E-mail de contato',
  loginEmail: 'E-mail de acesso',
  phone: 'Telefone fixo',
  mobilePhone: 'Celular',
  site: 'Site',
  address: 'Endereço',
}

/**
 * `GET /t/:slug/faturamento/configuracoes/recebimento/gerenciada/natureza`:
 * natureza jurídica do CNPJ do clube na Receita e o tipo de empresa sugerido
 * para o pedido. `suggestedCompanyType = null` = sem correspondência (ou
 * consulta indisponível): a tela pede escolha e confirmação.
 */
export const managedAccountLegalNature = z.object({
  /** `encontrada` (Receita respondeu), `nao_encontrada`, `indisponivel` ou `nao_se_aplica` (CPF). */
  status: z.enum(['encontrada', 'nao_encontrada', 'indisponivel', 'nao_se_aplica']),
  code: z.string().nullable(),
  name: z.string().nullable(),
  mei: z.boolean().nullable(),
  suggestedCompanyType: asaasCompanyType.nullable(),
})
export type ManagedAccountLegalNature = z.infer<typeof managedAccountLegalNature>

/** Pré-preenchimento do formulário a partir do cadastro do clube. */
export const managedAccountRequestDefaults = z.object({
  name: z.string(),
  /** CPF/CNPJ formatado (é o do cadastro; não muda aqui). */
  cpfCnpj: z.string().nullable(),
  personType: z.enum(['PJ', 'PF']).nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: managedAccountAddress.partial().nullable(),
})
export type ManagedAccountRequestDefaults = z.infer<typeof managedAccountRequestDefaults>

/** `GET /t/:slug/faturamento/configuracoes/recebimento/gerenciada` (e resposta do pedido). */
export const clubManagedAccountStatus = z.object({
  /** Último pedido do clube (`null` = nunca pediu). */
  request: managedAccountRequest.nullable(),
  /** Conta de recebimento atual (própria, gerenciada ou nenhuma). */
  account: clubReceivingAccount,
  /** Pode enviar um pedido agora. */
  canRequest: z.boolean(),
  /** Por que não pode pedir (pronto para a tela). */
  blockedReason: z.string().nullable(),
  defaults: managedAccountRequestDefaults,
  terms: z.object({ version: z.string(), text: z.string() }),
})
export type ClubManagedAccountStatus = z.infer<typeof clubManagedAccountStatus>

// ---------------------------------------------------------------------------
// Plataforma
// ---------------------------------------------------------------------------

export const listManagedAccountsQuery = z.object({
  /** Filtra pelo status do último pedido. */
  status: managedAccountRequestStatus.optional(),
  /** Nome ou slug do clube. */
  q: z.string().trim().min(1).max(100).optional(),
})
export type ListManagedAccountsQuery = z.infer<typeof listManagedAccountsQuery>

/** Linha de `GET /platform/contas-gerenciadas` (sem saldo: custaria 1 chamada ao Asaas por clube). */
export const managedAccountListItem = z.object({
  organizationId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  request: managedAccountRequest.pick({ id: true, status: true, statusLabel: true, createdAt: true, decidedAt: true }).nullable(),
  /** Conta de recebimento atual do clube. */
  source: receivingAccountSource.nullable(),
  env: asaasEnvironment.nullable(),
  generalStatus: managedAccountGeneralStatus.nullable(),
  generalStatusLabel: z.string().nullable(),
  pendingDocuments: z.number().int(),
  autoDebitEnabled: z.boolean(),
  lastDebit: managedAutoDebit.nullable(),
})
export type ManagedAccountListItem = z.infer<typeof managedAccountListItem>

/** `GET /platform/contas-gerenciadas/:orgId` (e resposta das ações). */
export const managedAccountDetail = z.object({
  organizationId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  request: managedAccountRequest.nullable(),
  account: clubReceivingAccount,
  /** Id da subconta e carteira no Asaas (da conta conectada ou do pedido, para recuperação). */
  asaasAccountId: z.string().nullable(),
  walletId: z.string().nullable(),
  /** Saldo da subconta agora (`null` = não é gerenciada ou o Asaas não respondeu). */
  balance: z.number().nullable(),
  balanceError: z.string().nullable(),
  /** Assinaturas de associados vinculadas à conta atual (regra de troca de conta). */
  linkedSubscriptions: z.number().int(),
  /** A subconta existe no Asaas mas a chave não foi gravada: use "Recuperar chave". */
  keyRecoveryNeeded: z.boolean(),
  debits: z.array(managedAutoDebit),
})
export type ManagedAccountDetail = z.infer<typeof managedAccountDetail>

/** `POST /platform/contas-gerenciadas/:orgId/recusar`. */
export const refuseManagedAccountInput = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo da recusa').max(500),
})
export type RefuseManagedAccountInput = z.infer<typeof refuseManagedAccountInput>

/** `PATCH /platform/contas-gerenciadas/:orgId/debito-automatico`. */
export const updateManagedAutoDebitInput = z.object({ enabled: z.boolean() })
export type UpdateManagedAutoDebitInput = z.infer<typeof updateManagedAutoDebitInput>

/** `POST /platform/contas-gerenciadas/:orgId/debitar-agora`. Sem `chargeId` = a fatura vencida mais antiga. */
export const forceManagedDebitInput = z.object({ chargeId: uuid.optional() })
export type ForceManagedDebitInput = z.infer<typeof forceManagedDebitInput>

/**
 * Resultado de uma tentativa: `concluida` (fatura quitada), `em_andamento`
 * (transferência aguardando o Asaas — atualize depois), `falhou` (motivo no
 * débito) ou `ignorada` (nada a fazer: sem fatura vencida, já debitada, outra
 * tentativa em curso…).
 */
export const managedDebitResult = z.object({
  outcome: z.enum(['concluida', 'em_andamento', 'falhou', 'ignorada']),
  message: z.string(),
  debit: managedAutoDebit.nullable(),
})
export type ManagedDebitResult = z.infer<typeof managedDebitResult>
