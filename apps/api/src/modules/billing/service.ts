import type {
  CommissionReceipt,
  Invoice,
  InvoiceStatus,
  PaymentStatement,
} from '@annetec/contracts'
import { AppError } from '@/http/errors'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import {
  mapCommissionReceipt,
  mapInvoice,
  mapPaymentStatement,
} from '@/integrations/digitalsaude/mappers'
import { sellersService } from '@/modules/users/service'

/**
 * Financeiro. Nada é persistido aqui: valores, boletos e recibos são sempre
 * lidos do ERP no momento da consulta, porque um boleto desatualizado é pior
 * que uma tela um pouco mais lenta.
 *
 * O upstream exige `idStatusFatura` em `/fatura/procurarPorContrato`, mas não
 * documenta a tabela de códigos. Estratégia: quando o chamador não informa o id
 * cru, buscamos todos os status conhecidos e filtramos pelo status normalizado.
 */
const KNOWN_UPSTREAM_INVOICE_STATUS_IDS = [1, 2, 3, 4]

export const billingService = {
  async listInvoicesByContract(
    tenantId: string,
    contractCodigo: string,
    filters: { status?: InvoiceStatus; upstreamStatusId?: number } = {},
  ): Promise<Invoice[]> {
    const client = await getDigitalSaudeClient(tenantId)

    if (filters.upstreamStatusId !== undefined) {
      const result = await client.call('faturaPorContrato', {
        codigoContrato: contractCodigo,
        idStatusFatura: filters.upstreamStatusId,
      })
      return result.map(item => mapInvoice(item, contractCodigo))
    }

    const batches = await Promise.all(
      KNOWN_UPSTREAM_INVOICE_STATUS_IDS.map(async idStatusFatura => {
        try {
          const result = await client.call('faturaPorContrato', {
            codigoContrato: contractCodigo,
            idStatusFatura,
          })
          return result.map(item => mapInvoice(item, contractCodigo))
        } catch {
          // Um status desconhecido pelo ERP não deve zerar a lista inteira.
          return [] as Invoice[]
        }
      }),
    )

    const byCode = new Map<string, Invoice>()
    for (const invoice of batches.flat()) byCode.set(invoice.upstreamCodigo, invoice)

    const invoices = [...byCode.values()].sort(byDueDateDesc)
    return filters.status ? invoices.filter(invoice => invoice.status === filters.status) : invoices
  },

  async getInvoice(tenantId: string, codigo: string): Promise<Invoice> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('faturaPorCodigo', { codigoFatura: codigo })
    if (!result) throw AppError.notFound('Fatura')
    return mapInvoice(result)
  },

  /** Faturas vencidas de toda a carteira — visão de cobrança do admin. */
  async listOverdueInvoices(tenantId: string): Promise<Invoice[]> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('faturaVencidas')
    return result.map(item => mapInvoice(item)).sort(byDueDateDesc)
  },

  async sendOverdueInvoicesByEmail(tenantId: string, contractCodigo: string): Promise<string> {
    const client = await getDigitalSaudeClient(tenantId)
    return client.call('faturaEnviarVencidaPorContrato', { codigoContrato: contractCodigo })
  },

  async listPaymentStatements(
    tenantId: string,
    contractCodigo: string,
  ): Promise<PaymentStatement[]> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('demonstrativoPorContrato', {
      codigoContrato: contractCodigo,
    })
    return result.map(mapPaymentStatement)
  },

  async getPaymentStatement(tenantId: string, codigo: string): Promise<PaymentStatement> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('demonstrativoPorCodigo', {
      codigoDemonstrativoPagamento: codigo,
    })
    if (!result) throw AppError.notFound('Demonstrativo de pagamento')
    return mapPaymentStatement(result)
  },

  /**
   * Recibos de comissão do vendedor.
   *
   * O upstream pede login+senha do produtor em query string. As credenciais
   * ficam cifradas no perfil do vendedor e são decifradas só aqui — nunca
   * trafegam pelo cliente nem aparecem em log.
   */
  async listCommissionReceipts(
    tenantId: string,
    sellerId: string,
    status: 'emitido' | 'pago',
  ): Promise<CommissionReceipt[]> {
    const credentials = await sellersService.upstreamProdutorCredentials(tenantId, sellerId)
    if (!credentials) {
      throw AppError.businessRule(
        'Vendedor sem credenciais de produtor da Digital Saúde configuradas',
      )
    }

    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call(status === 'pago' ? 'reciboPagos' : 'reciboEmitidos', {
      login: credentials.login,
      senha: credentials.password,
    })
    return result.map(mapCommissionReceipt)
  },

  async getCommissionReceipt(tenantId: string, codigo: string): Promise<CommissionReceipt> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('reciboPorCodigo', { codigoRecibo: codigo })
    if (!result) throw AppError.notFound('Recibo')
    return mapCommissionReceipt(result)
  },
}

function byDueDateDesc(a: Invoice, b: Invoice) {
  return (b.dueAt ?? '').localeCompare(a.dueAt ?? '')
}
