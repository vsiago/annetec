import { z } from 'zod'
import { uuid } from '../common/primitives'
import { invoiceStatus, receiptStatus } from './enums'

/**
 * Financeiro. Faturas, demonstrativos e recibos vêm inteiramente da Digital
 * Saúde — a API Annetec não persiste valores, apenas normaliza, cacheia e
 * aplica as regras de visibilidade (um cliente só enxerga faturas dos seus
 * contratos; um vendedor só enxerga recibos do seu código de produtor).
 */

export const invoice = z.object({
  upstreamCodigo: z.string(),
  contractUpstreamCodigo: z.string().nullable(),
  number: z.number().int().nullable(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
  issuedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  amount: z.number().nullable(),
  status: invoiceStatus,
  upstreamStatus: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  /** Linha digitável do boleto. */
  barcodeLine: z.string().nullable(),
  beneficiaryName: z.string().nullable(),
  /**
   * CPF do titular da fatura. A tela de cobrança precisa dele para abrir o
   * contrato correspondente — `/fatura/procurarPorVencida` não devolve o
   * código do contrato, então o CPF é a única ponte entre uma fatura vencida
   * e a carteira.
   */
  beneficiaryCpf: z.string().nullable(),
})
export type Invoice = z.infer<typeof invoice>

export const listInvoicesQuery = z.object({
  contractCodigo: z.string().min(1),
  status: invoiceStatus.optional(),
  /** `idStatusFatura` cru, quando o chamador já conhece o código do upstream. */
  upstreamStatusId: z.coerce.number().int().optional(),
})
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>

export const paymentStatement = z.object({
  upstreamCodigo: z.string(),
  calendarYear: z.number().nullable(),
  referenceYear: z.number().nullable(),
  cpf: z.string().nullable(),
  amount: z.number().nullable(),
  documentUrl: z.string().nullable(),
})
export type PaymentStatement = z.infer<typeof paymentStatement>

export const commissionEntry = z.object({
  upstreamCodigo: z.string().nullable(),
  installment: z.number().int().nullable(),
  postedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.number().nullable(),
  installmentAmount: z.number().nullable(),
  holderName: z.string().nullable(),
  kind: z.string().nullable(),
})
export type CommissionEntry = z.infer<typeof commissionEntry>

/** Recibo de comissão do produtor/vendedor. */
export const commissionReceipt = z.object({
  upstreamCodigo: z.string(),
  issuedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  amount: z.number().nullable(),
  status: receiptStatus,
  upstreamStatus: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceAmount: z.number().nullable(),
  notes: z.string().nullable(),
  documentUrl: z.string().nullable(),
  entries: z.array(commissionEntry),
})
export type CommissionReceipt = z.infer<typeof commissionReceipt>

export const listCommissionReceiptsQuery = z.object({
  sellerId: uuid.optional(),
  status: z.enum(['emitido', 'pago']).default('emitido'),
})
export type ListCommissionReceiptsQuery = z.infer<typeof listCommissionReceiptsQuery>

/** Disparos de e-mail delegados ao upstream. */
export const sendOverdueInvoicesInput = z.object({ contractCodigo: z.string().min(1) })
export type SendOverdueInvoicesInput = z.infer<typeof sendOverdueInvoicesInput>

export const sendMembershipCardInput = z.object({ contractCodigo: z.string().min(1) })
export type SendMembershipCardInput = z.infer<typeof sendMembershipCardInput>
