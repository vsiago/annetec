import { z } from 'zod'

/**
 * Enums do domínio Annetec. São a fonte única — o banco (Drizzle), a API e o
 * frontend derivam daqui, e os mappers traduzem os `{ id, nome }` da Digital
 * Saúde para estes valores.
 */

/**
 * Papéis de quem opera a plataforma Annetec (fora do escopo de inquilino).
 *
 *  - `superadmin` e `platform_admin`: a EQUIPE (console `/admin`);
 *  - `platform_seller`: vendedor ANNETEC — conta de plataforma que só enxerga
 *    a própria área de vendas (`/api/v1/platform/vendas/*`). Nunca passa nas
 *    rotas da equipe nem lê painel de clube.
 */
export const platformRole = z.enum(['superadmin', 'platform_admin', 'platform_seller'])
export type PlatformRole = z.infer<typeof platformRole>

/** Papéis da EQUIPE Annetec — o "qualquer papel de plataforma" das rotas do console. */
export const PLATFORM_STAFF_ROLES = ['superadmin', 'platform_admin'] as const
export const platformStaffRole = z.enum(PLATFORM_STAFF_ROLES)
export type PlatformStaffRole = z.infer<typeof platformStaffRole>

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  superadmin: 'Superadmin',
  platform_admin: 'Administrador da plataforma',
  platform_seller: 'Vendedor ANNETEC',
}

/** `user.role` de uma conta de plataforma (equipe OU vendedor). */
export function isPlatformAccountRole(role: string | null | undefined): role is PlatformRole {
  return role !== null && role !== undefined && (platformRole.options as readonly string[]).includes(role)
}

/** `user.role` da EQUIPE (superadmin/platform_admin) — vendedor fica de fora. */
export function isPlatformStaffRole(role: string | null | undefined): role is PlatformStaffRole {
  return role !== null && role !== undefined && (PLATFORM_STAFF_ROLES as readonly string[]).includes(role)
}

/** Papéis dentro de um inquilino. */
export const tenantRole = z.enum(['admin', 'seller', 'client'])
export type TenantRole = z.infer<typeof tenantRole>

export const tenantStatus = z.enum(['trial', 'active', 'suspended', 'cancelled'])
export type TenantStatus = z.infer<typeof tenantStatus>

/**
 * O que a organização é dentro do modelo híbrido da Annetec.
 *
 *  - `operator`: administradora que contrata a plataforma (o inquilino
 *    clássico). Opera em `/[tenant]/*` com as próprias credenciais da Digital
 *    Saúde;
 *  - `platform`: a própria Annetec operando como operadora, com seus clientes
 *    diretos. Opera em `/admin/*`. Existe no MESMO registro de organizações
 *    justamente para reaproveitar contratos, financeiro e catálogo sem
 *    duplicar regra — só o espaço de rota e o guard de sessão mudam.
 *
 * Só pode haver UMA organização `platform` (garantido por índice único
 * parcial na migração).
 */
export const tenantKind = z.enum(['operator', 'platform'])
export type TenantKind = z.infer<typeof tenantKind>

/**
 * Status de contrato normalizado. A Digital Saúde devolve
 * `statusContrato: { id, nome }` com texto livre; o mapper reduz para este
 * conjunto e guarda o original em `upstreamStatus`.
 */
export const contractStatus = z.enum([
  'pendente',
  'produzido',
  'ativo',
  'suspenso',
  'cancelado',
  'desconhecido',
])
export type ContractStatus = z.infer<typeof contractStatus>

export const invoiceStatus = z.enum(['aberta', 'paga', 'vencida', 'cancelada', 'desconhecido'])
export type InvoiceStatus = z.infer<typeof invoiceStatus>

export const receiptStatus = z.enum(['emitido', 'pago', 'cancelado', 'desconhecido'])
export type ReceiptStatus = z.infer<typeof receiptStatus>

/** `1 - Titular / 2 - Dependente / 3 - Agregado` no upstream. */
export const beneficiaryKind = z.enum(['titular', 'dependente', 'agregado'])
export type BeneficiaryKind = z.infer<typeof beneficiaryKind>

export const BENEFICIARY_KIND_BY_UPSTREAM_ID: Record<number, BeneficiaryKind> = {
  1: 'titular',
  2: 'dependente',
  3: 'agregado',
}

export const UPSTREAM_ID_BY_BENEFICIARY_KIND: Record<BeneficiaryKind, number> = {
  titular: 1,
  dependente: 2,
  agregado: 3,
}

/** `1 - Valor por Contrato / 2 - Valor por Vida`. */
export const registrationFeeKind = z.enum(['por_contrato', 'por_vida'])
export type RegistrationFeeKind = z.infer<typeof registrationFeeKind>

export const leadStatus = z.enum([
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'closed',
  'lost',
])
export type LeadStatus = z.infer<typeof leadStatus>

export const saleStatus = z.enum(['pending', 'confirmed', 'cancelled'])
export type SaleStatus = z.infer<typeof saleStatus>

export const partnerCategory = z.enum([
  'health',
  'dental',
  'pharmacy',
  'wellness',
  'food',
  'education',
  'other',
])
export type PartnerCategory = z.infer<typeof partnerCategory>

export const benefitCategory = z.enum(['health', 'dental', 'pharmacy', 'funeral', 'discount'])
export type BenefitCategory = z.infer<typeof benefitCategory>

/**
 * Andamento do chamado na mesa de atendimento.
 *
 * Distinguir "aguardando usuário" de "aguardando terceiro" é o que permite
 * cobrar o prazo da pessoa certa; separar "resolvido" de "encerrado" é o que
 * diferencia o chamado que teve solução do que só foi fechado.
 *
 * `concluido` é o nome legado de `resolvido`, mantido porque remover valor de
 * enum no Postgres exige recriar o tipo. Não usar em gravação nova.
 */
export const appointmentStatus = z.enum([
  'aguardando',
  'em_atendimento',
  'aguardando_usuario',
  'aguardando_terceiro',
  'resolvido',
  'encerrado',
  'concluido',
])
export type AppointmentStatus = z.infer<typeof appointmentStatus>

/** Por onde o associado procurou o clube. */
export const appointmentChannel = z.enum(['telefone', 'whatsapp', 'email', 'app', 'presencial'])
export type AppointmentChannel = z.infer<typeof appointmentChannel>

export const appointmentPriority = z.enum(['alta', 'normal', 'baixa'])
export type AppointmentPriority = z.infer<typeof appointmentPriority>

/**
 * Sentido da mensagem: `entrada` veio do associado, `saida` é a resposta da
 * equipe e `nota` é registro interno que o associado nunca vê.
 */
export const appointmentMessageKind = z.enum(['entrada', 'saida', 'nota'])
export type AppointmentMessageKind = z.infer<typeof appointmentMessageKind>

export const activeStatus = z.enum(['active', 'inactive'])
export type ActiveStatus = z.infer<typeof activeStatus>

// ---------------------------------------------------------------------------
// Clube de Benefícios — enums usados pelo plano (catalog.ts) E pela cobrança
// (club-billing.ts). Moram aqui para o plano poder usá-los sem ciclo de import
// (club-billing importa catalog). Mesmos nomes e valores de antes: quem
// importa de `@annetec/contracts` não percebe a mudança.
// ---------------------------------------------------------------------------

export const clubPaymentMethod = z.enum(['pix', 'boleto', 'credit_card'])
export type ClubPaymentMethod = z.infer<typeof clubPaymentMethod>

export const dependentRelationship = z.enum(['conjuge', 'filho', 'enteado', 'pai_mae', 'irmao', 'neto', 'outro'])
export type DependentRelationship = z.infer<typeof dependentRelationship>

/** Categoria de uma cobertura do plano do clube (agrupa e dá o ícone na tela). */
export const clubCoverageCategory = z.enum([
  'telemedicine',
  'consultations',
  'exams',
  'pharmacy',
  'dental',
  'mental_health',
  'wellness',
  'assistance',
  'discounts',
  'other',
])
export type ClubCoverageCategory = z.infer<typeof clubCoverageCategory>

/**
 * Como a cobertura funciona para o associado:
 *  - `included`: sem custo no uso (pode ter limite de usos);
 *  - `discount_percent`: desconto de `value`% sobre o preço do parceiro;
 *  - `copay`: coparticipação — o associado paga `value` R$ por uso;
 *  - `usage_limit`: incluso até `limitQuantity` usos por `limitPeriod`.
 */
export const clubCoverageKind = z.enum(['included', 'discount_percent', 'copay', 'usage_limit'])
export type ClubCoverageKind = z.infer<typeof clubCoverageKind>

export const clubCoverageChannel = z.enum(['in_person', 'online', 'both'])
export type ClubCoverageChannel = z.infer<typeof clubCoverageChannel>

/** Janela do limite de uso: por mês, por ano ou durante todo o contrato. */
export const clubCoverageLimitPeriod = z.enum(['month', 'year', 'contract'])
export type ClubCoverageLimitPeriod = z.infer<typeof clubCoverageLimitPeriod>

/** 'page_view' = navegação; 'action' = evento pontual (login, logout, ...). */
export const activityKind = z.enum(['page_view', 'action'])
export type ActivityKind = z.infer<typeof activityKind>
