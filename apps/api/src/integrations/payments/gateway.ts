import {
  ERROR_CODES,
  type CardBrand,
  type ClubBoletoData,
  type ClubPaymentMethod,
  type ClubPixData,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { AppError } from '@/http/errors'

/**
 * Contrato do PROCESSADOR de pagamento (blueprint §0.6). O motor de cobrança
 * (assinatura, períodos, régua, inadimplência) é nosso; o gateway só cria,
 * consulta, cancela e estorna cobranças. Trocar de gateway = escrever outra
 * classe que implemente esta interface.
 *
 * Regra de ouro: dados de cartão (número, CVV) entram em `createCharge` e
 * morrem ali — nenhuma implementação grava, loga ou devolve esses campos.
 */

export type GatewayChargeStatus = 'pending' | 'paid' | 'overdue' | 'failed' | 'canceled' | 'refunded'

export interface GatewayCardData {
  token: string | null
  brand: CardBrand
  last4: string
}

export interface GatewayCharge {
  id: string
  status: GatewayChargeStatus
  paidAt: Date | null
  paidAmount: number | null
  invoiceUrl: string | null
  pix: ClubPixData | null
  boleto: ClubBoletoData | null
  card: GatewayCardData | null
}

export interface GatewayCustomerInput {
  name: string
  /** Só dígitos. */
  cpf: string
  email: string
  phone?: string | null
  /** `user.id` do associado. */
  externalReference: string
}

/** Cartão digitado. Trafega só em memória — nunca persistido nem logado. */
export interface GatewayCardInput {
  holderName: string
  number: string
  expiryMonth: number
  expiryYear: number
  ccv: string
  holderCpf: string
  holderEmail: string
  holderPhone?: string | null
  holderPostalCode: string
  holderAddressNumber: string
}

export interface CreateChargeInput {
  customerId: string
  method: ClubPaymentMethod
  amount: number
  /** `yyyy-MM-dd`. */
  dueDate: string
  description: string
  /** `club_charges.id`. */
  externalReference: string
  /** Assinatura dona da cobrança (o simulado monta o link do boleto com ela). */
  subscriptionId?: string
  card?: GatewayCardInput
  cardToken?: string
  remoteIp?: string
  finePercent?: number
  interestMonthlyPercent?: number
  /**
   * Cartão numa cobrança que JÁ teve tentativa: antes de cobrar de novo,
   * procura pelo `externalReference` um pagamento no cartão aprovado/em
   * análise (a tentativa anterior pode ter passado com resposta inconclusiva)
   * e devolve ele em vez de cobrar duas vezes. Falha na consulta → lança, sem
   * cobrar. Gateways sem consulta (simulado) ignoram.
   */
  reuseExistingCardPayment?: boolean
}

export interface PaymentGateway {
  readonly provider: PaymentGatewayProvider
  /** Asaas sandbox (gateway real, dinheiro de mentira). O simulado também conta como não-produção. */
  readonly sandbox: boolean
  /** Pode "simular pagamento" (simulado ou Asaas sandbox). */
  readonly canSimulate: boolean
  ensureCustomer(input: GatewayCustomerInput): Promise<string>
  /** Cartão recusado → lança `CardDeclinedError`. */
  createCharge(input: CreateChargeInput): Promise<GatewayCharge>
  getCharge(id: string): Promise<GatewayCharge>
  cancelCharge(id: string): Promise<void>
  refundCharge(id: string, amount?: number): Promise<GatewayCharge>
  /** `paidAt` em `yyyy-MM-dd`. */
  receiveInCash(id: string, paidAt: string, amount: number): Promise<GatewayCharge>
  simulatePayment(id: string): Promise<void>
  /**
   * QR Pix atual de um pagamento em aberto, sem criar outro (o Asaas mantém o
   * QR dinâmico válido depois do vencimento). Opcional: quem não implementa
   * (simulado) regera o pagamento quando o Pix guardado expira.
   */
  currentPix?(id: string): Promise<ClubPixData | null>
}

/** Cartão recusado pelo emissor/antifraude. `message` = motivo do gateway (seguro para a tela). */
export class CardDeclinedError extends AppError {
  constructor(message = 'Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.') {
    super(ERROR_CODES.BUSINESS_RULE_VIOLATION, message)
    this.name = 'CardDeclinedError'
  }
}

/** Mensagem única para falha de comunicação com o processador (a tela oferece nova tentativa). */
export const GATEWAY_UNAVAILABLE_MESSAGE = 'Não foi possível falar com o processador de pagamento'
