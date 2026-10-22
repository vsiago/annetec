import { onlyDigits, type ClubPixData } from '@annetec/contracts'
import { AppError } from '@/http/errors'
import {
  CardDeclinedError,
  type CreateChargeInput,
  type GatewayCharge,
  type GatewayCustomerInput,
  type PaymentGateway,
} from '@/integrations/payments/gateway'
import { logger } from '@/lib/logger'
import { AsaasApiError, type AsaasClient } from './client'
import type { AsaasBillingType, AsaasCreatePaymentInput, AsaasEnvironment, AsaasPayment } from './types'
import { mapAsaasCardBrand, mapAsaasPaymentStatus } from './webhook'

const BILLING_TYPE: Record<CreateChargeInput['method'], AsaasBillingType> = {
  pix: 'PIX',
  boleto: 'BOLETO',
  credit_card: 'CREDIT_CARD',
}

/**
 * Asaas como processador (blueprint §0.6). Só cria/consulta/cancela/estorna —
 * o ciclo da assinatura é nosso. Cartão é capturado na criação; recusa vem
 * como 400 e a cobrança NÃO é criada (→ `CardDeclinedError`).
 */
export class AsaasGateway implements PaymentGateway {
  readonly provider = 'asaas' as const
  readonly sandbox: boolean
  readonly canSimulate: boolean

  constructor(
    private readonly client: AsaasClient,
    environment: AsaasEnvironment,
  ) {
    this.sandbox = environment === 'sandbox'
    this.canSimulate = this.sandbox
  }

  /** Reaproveita cliente pelo CPF antes de criar (evita duplicata no painel do Asaas). */
  async ensureCustomer(input: GatewayCustomerInput): Promise<string> {
    const cpf = onlyDigits(input.cpf)
    const existing = await this.client.customers.list({ cpfCnpj: cpf, limit: 10 })
    const found = existing.data.find(customer => !customer.deleted)
    if (found) return found.id
    const created = await this.client.customers.create({
      name: input.name,
      cpfCnpj: cpf,
      email: input.email,
      mobilePhone: input.phone ? onlyDigits(input.phone) : undefined,
      externalReference: input.externalReference,
      // White label: o associado NUNCA pode receber comunicação com a marca do
      // Asaas (nem da ANNETEC). Por isso as notificações do Asaas (e-mail/SMS/
      // WhatsApp de cobrança) ficam desligadas no cliente, e os avisos de
      // vencimento, atraso e suspensão saem da própria plataforma com a marca
      // do inquilino (`club-billing/automation.service.ts` → `deliverReminder`).
      notificationDisabled: true,
    })
    return created.id
  }

  async createCharge(input: CreateChargeInput): Promise<GatewayCharge> {
    const body: AsaasCreatePaymentInput = {
      customer: input.customerId,
      billingType: BILLING_TYPE[input.method],
      value: input.amount,
      dueDate: input.dueDate,
      description: input.description.slice(0, 500),
      externalReference: input.externalReference,
      ...(input.finePercent ? { fine: { value: input.finePercent } } : {}),
      ...(input.interestMonthlyPercent ? { interest: { value: input.interestMonthlyPercent } } : {}),
    }

    if (input.method === 'credit_card') {
      if (input.card) {
        body.creditCard = {
          holderName: input.card.holderName,
          number: onlyDigits(input.card.number),
          expiryMonth: String(input.card.expiryMonth).padStart(2, '0'),
          expiryYear: String(input.card.expiryYear),
          ccv: input.card.ccv,
        }
        body.creditCardHolderInfo = {
          name: input.card.holderName,
          email: input.card.holderEmail,
          cpfCnpj: onlyDigits(input.card.holderCpf),
          postalCode: onlyDigits(input.card.holderPostalCode),
          addressNumber: input.card.holderAddressNumber,
          ...(input.card.holderPhone ? { mobilePhone: onlyDigits(input.card.holderPhone) } : {}),
        }
      } else if (input.cardToken) {
        body.creditCardToken = input.cardToken
      } else {
        throw AppError.businessRule('Informe os dados do cartão')
      }
      if (input.remoteIp) body.remoteIp = input.remoteIp
    }

    let payment: AsaasPayment
    try {
      payment = await this.client.payments.create(body)
    } catch (error) {
      if (error instanceof AsaasApiError && error.inconclusive) {
        // Timeout/5xx: a cobrança pode ter sido criada. Consulta antes de qualquer repetição.
        const found = await this.findByExternalReference(input.externalReference)
        if (!found) throw error
        logger.warn({ integration: 'asaas', externalReference: input.externalReference }, 'asaas: cobrança recuperada após resposta inconclusiva')
        payment = found
      } else {
        throw error
      }
    }

    const charge = await this.toGatewayCharge(payment, true)
    if (input.method === 'credit_card' && charge.status === 'failed') {
      throw new CardDeclinedError()
    }
    return charge
  }

  async getCharge(id: string): Promise<GatewayCharge> {
    return this.toGatewayCharge(await this.client.payments.get(id), false)
  }

  async cancelCharge(id: string): Promise<void> {
    await this.client.payments.delete(id)
  }

  async refundCharge(id: string, amount?: number): Promise<GatewayCharge> {
    const payment = await this.client.payments.refund(id, amount ? { value: amount } : {})
    return this.toGatewayCharge(payment, false)
  }

  async receiveInCash(id: string, paidAt: string, amount: number): Promise<GatewayCharge> {
    const payment = await this.client.payments.receiveInCash(id, { paymentDate: paidAt, value: amount, notifyCustomer: false })
    return this.toGatewayCharge(payment, false)
  }

  async simulatePayment(id: string): Promise<void> {
    if (!this.sandbox) throw AppError.businessRule('Simular pagamento só existe na sandbox do Asaas')
    await this.client.sandbox.confirmPayment(id)
  }

  async currentPix(id: string): Promise<ClubPixData | null> {
    const qr = await this.client.payments.pixQrCode(id)
    if (!qr.payload) return null
    return {
      payload: qr.payload,
      qrCodeBase64: qr.encodedImage || null,
      expiresAt: qr.expirationDate ? brasiliaToIso(qr.expirationDate) : null,
    }
  }

  private async findByExternalReference(externalReference: string): Promise<AsaasPayment | null> {
    try {
      const list = await this.client.payments.list({ externalReference, limit: 10 })
      return list.data.find(payment => !payment.deleted) ?? null
    } catch {
      return null
    }
  }

  /** `withExtras`: busca QR do Pix / linha digitável do boleto quando ainda em aberto. */
  private async toGatewayCharge(payment: AsaasPayment, withExtras: boolean): Promise<GatewayCharge> {
    const status = mapAsaasPaymentStatus(payment.status, payment.deleted)
    const paidDate = payment.clientPaymentDate ?? payment.paymentDate ?? payment.confirmedDate ?? null
    const charge: GatewayCharge = {
      id: payment.id,
      status,
      paidAt: status === 'paid' ? (paidDate ? new Date(`${paidDate.slice(0, 10)}T12:00:00-03:00`) : new Date()) : null,
      paidAmount: status === 'paid' ? (payment.value ?? null) : null,
      invoiceUrl: payment.invoiceUrl ?? null,
      pix: null,
      boleto: null,
      card: null,
    }

    if (payment.creditCard?.creditCardNumber || payment.creditCard?.creditCardToken) {
      charge.card = {
        token: payment.creditCard.creditCardToken ?? null,
        brand: mapAsaasCardBrand(payment.creditCard.creditCardBrand),
        last4: onlyDigits(payment.creditCard.creditCardNumber ?? '').slice(-4),
      }
    }

    if (withExtras && (status === 'pending' || status === 'overdue')) {
      if (payment.billingType === 'PIX') {
        const qr = await this.client.payments.pixQrCode(payment.id)
        charge.pix = {
          payload: qr.payload,
          qrCodeBase64: qr.encodedImage || null,
          expiresAt: qr.expirationDate ? brasiliaToIso(qr.expirationDate) : null,
        }
      } else if (payment.billingType === 'BOLETO') {
        const field = await this.client.payments.identificationField(payment.id)
        charge.boleto = {
          identificationField: onlyDigits(field.identificationField),
          barCode: field.barCode ?? null,
          url: payment.bankSlipUrl ?? payment.invoiceUrl ?? null,
        }
      }
    }
    return charge
  }
}

/** `YYYY-MM-DD HH:MM:SS` em Brasília → ISO UTC. */
function brasiliaToIso(value: string): string | null {
  const date = new Date(`${value.trim().replace(' ', 'T')}-03:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
