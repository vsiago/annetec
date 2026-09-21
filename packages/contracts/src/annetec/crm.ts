import { z } from 'zod'
import { email, uuid } from '../common/primitives'
import { appointmentStatus, leadStatus, saleStatus } from './enums'

/**
 * CRM e metas: dado 100% Annetec, sem contrapartida na Digital Saúde. É aqui
 * que o funil do vendedor vive até virar contrato — a conversão de um lead
 * chama `POST /contrato/` no upstream e grava o `upstreamCodigo` na venda.
 */

export const interaction = z.object({
  id: uuid,
  leadId: uuid,
  type: z.enum(['call', 'email', 'meeting', 'note', 'whatsapp']),
  description: z.string().min(1),
  occurredAt: z.string().datetime(),
  authorId: uuid.nullable(),
})
export type Interaction = z.infer<typeof interaction>

export const createInteractionInput = interaction.omit({
  id: true,
  leadId: true,
  authorId: true,
})
export type CreateInteractionInput = z.infer<typeof createInteractionInput>

export const lead = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  email: email.nullable(),
  phone: z.string().nullable(),
  source: z.string().nullable(),
  status: leadStatus,
  notes: z.string().nullable(),
  estimatedValue: z.number().nonnegative().nullable(),
  sellerId: uuid.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  interactions: z.array(interaction).default([]),
})
export type Lead = z.infer<typeof lead>

export const createLeadInput = lead.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  interactions: true,
})
export type CreateLeadInput = z.infer<typeof createLeadInput>

export const updateLeadInput = createLeadInput.partial()
export type UpdateLeadInput = z.infer<typeof updateLeadInput>

export const sale = z.object({
  id: uuid,
  tenantId: uuid,
  leadId: uuid.nullable(),
  clientUserId: uuid.nullable(),
  clientName: z.string(),
  sellerId: uuid,
  sellerName: z.string(),
  planCodigo: z.string().nullable(),
  planName: z.string().nullable(),
  value: z.number().nonnegative(),
  commission: z.number().nonnegative(),
  status: saleStatus,
  soldAt: z.string().datetime(),
  /** `codigo` do contrato gerado na Digital Saúde, quando houver. */
  contractUpstreamCodigo: z.string().nullable(),
})
export type Sale = z.infer<typeof sale>

export const createSaleInput = sale.omit({
  id: true,
  tenantId: true,
  sellerName: true,
  commission: true,
})
export type CreateSaleInput = z.infer<typeof createSaleInput>

/**
 * Correção de venda já registrada. `sellerId` fica de fora: trocar o vendedor
 * muda a quem a comissão pertence — isso é estorno e novo lançamento, não
 * edição. A comissão também não entra: ela é recalculada pela taxa vigente
 * do vendedor, nunca digitada.
 */
export const updateSaleInput = createSaleInput
  .omit({ sellerId: true })
  .partial()
export type UpdateSaleInput = z.infer<typeof updateSaleInput>

export const salesGoal = z.object({
  id: uuid,
  tenantId: uuid,
  sellerId: uuid,
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  target: z.number().nonnegative(),
  achieved: z.number().nonnegative(),
  commissionRate: z.number().min(0).max(1),
})
export type SalesGoal = z.infer<typeof salesGoal>

export const upsertSalesGoalInput = salesGoal.omit({ id: true, tenantId: true, achieved: true })
export type UpsertSalesGoalInput = z.infer<typeof upsertSalesGoalInput>

/** Teleorientação / suporte. Espelha `/atendimento/` do upstream quando o
 *  inquilino usa o módulo de atendimento da Digital Saúde. */
export const appointment = z.object({
  id: uuid,
  tenantId: uuid,
  clientUserId: uuid.nullable(),
  clientName: z.string(),
  description: z.string(),
  status: appointmentStatus,
  protocol: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type Appointment = z.infer<typeof appointment>

export const createAppointmentInput = appointment.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  protocol: true,
  status: true,
})
export type CreateAppointmentInput = z.infer<typeof createAppointmentInput>

/**
 * Andamento do atendimento. Só `status` e `description` mudam: `clientName` e
 * `clientUserId` identificam de quem é o chamado — trocá-los transformaria o
 * histórico de uma pessoa no de outra. Para isso, abre-se outro chamado.
 *
 * `protocol` também fica de fora: quando o inquilino usa o módulo de
 * atendimento da Digital Saúde, quem o emite é o ERP.
 */
export const updateAppointmentInput = z.object({
  status: appointmentStatus.optional(),
  description: z.string().min(1).optional(),
})
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentInput>
