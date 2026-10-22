/**
 * Tipos do Asaas v3 (docs.asaas.com, conferidos em set/2026) — só o que o
 * clube usa. Respostas são tolerantes (campos opcionais): o Asaas acrescenta
 * campos sem aviso e o nosso código lê só o que precisa.
 */

export type AsaasEnvironment = 'sandbox' | 'production'

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'

/** Status de cobrança do Asaas (lista não exaustiva — string desconhecida é tratada como pendente). */
export type AsaasPaymentStatus =
  | 'PENDING'
  | 'AWAITING_RISK_ANALYSIS'
  | 'APPROVED_BY_RISK_ANALYSIS'
  | 'REPROVED_BY_RISK_ANALYSIS'
  | 'AUTHORIZED'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'RECEIVED_IN_CASH'
  | 'OVERDUE'
  | 'REFUND_REQUESTED'
  | 'REFUND_IN_PROGRESS'
  | 'REFUNDED'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'CREDIT_CARD_CAPTURE_REFUSED'
  | (string & {})

export interface AsaasList<T> {
  object?: 'list'
  hasMore: boolean
  totalCount: number
  limit: number
  offset: number
  data: T[]
}

export interface AsaasErrorBody {
  errors?: { code?: string; description?: string }[]
}

export interface AsaasCustomer {
  id: string
  name?: string
  cpfCnpj?: string
  email?: string | null
  externalReference?: string | null
  deleted?: boolean
}

export interface AsaasCreateCustomerInput {
  name: string
  cpfCnpj: string
  email?: string
  mobilePhone?: string
  externalReference?: string
  notificationDisabled?: boolean
}

export interface AsaasListCustomersQuery {
  cpfCnpj?: string
  email?: string
  externalReference?: string
  offset?: number
  limit?: number
}

/** Cartão digitado — NUNCA logar, nunca persistir. */
export interface AsaasCreditCard {
  holderName: string
  number: string
  /** 2 dígitos. */
  expiryMonth: string
  /** 4 dígitos. */
  expiryYear: string
  ccv: string
}

export interface AsaasCreditCardHolderInfo {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  mobilePhone?: string
  phone?: string
}

export interface AsaasCreatePaymentInput {
  customer: string
  billingType: AsaasBillingType
  value: number
  /** `YYYY-MM-DD`. */
  dueDate: string
  description?: string
  externalReference?: string
  fine?: { value: number }
  interest?: { value: number }
  creditCard?: AsaasCreditCard
  creditCardHolderInfo?: AsaasCreditCardHolderInfo
  creditCardToken?: string
  remoteIp?: string
}

export interface AsaasPaymentCreditCard {
  /** Só os 4 últimos dígitos. */
  creditCardNumber?: string | null
  creditCardBrand?: string | null
  creditCardToken?: string | null
}

export interface AsaasPayment {
  id: string
  customer?: string
  status: AsaasPaymentStatus
  value?: number
  netValue?: number
  billingType?: AsaasBillingType | string
  dueDate?: string
  description?: string | null
  invoiceUrl?: string | null
  bankSlipUrl?: string | null
  nossoNumero?: string | null
  paymentDate?: string | null
  clientPaymentDate?: string | null
  confirmedDate?: string | null
  externalReference?: string | null
  deleted?: boolean
  creditCard?: AsaasPaymentCreditCard | null
}

export interface AsaasListPaymentsQuery {
  customer?: string
  externalReference?: string
  status?: AsaasPaymentStatus
  offset?: number
  limit?: number
}

export interface AsaasPixQrCode {
  /** PNG em base64, sem prefixo `data:`. */
  encodedImage: string
  payload: string
  /** `YYYY-MM-DD HH:MM:SS` (horário de Brasília). */
  expirationDate?: string | null
}

export interface AsaasIdentificationField {
  identificationField: string
  nossoNumero?: string | null
  barCode?: string | null
}

export interface AsaasRefundInput {
  value?: number
  description?: string
}

export interface AsaasReceiveInCashInput {
  /** `YYYY-MM-DD`. */
  paymentDate: string
  value: number
  notifyCustomer?: boolean
}

export interface AsaasPayWithCreditCardInput {
  creditCard?: AsaasCreditCard
  creditCardHolderInfo?: AsaasCreditCardHolderInfo
  creditCardToken?: string
}

export interface AsaasTokenizeInput {
  customer: string
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  remoteIp: string
}

export interface AsaasTokenizeResult {
  creditCardNumber?: string
  creditCardBrand?: string
  creditCardToken: string
}

export interface AsaasCreateWebhookInput {
  name: string
  url: string
  email: string
  enabled: boolean
  interrupted: boolean
  /** 32–255 caracteres; volta no header `asaas-access-token`. */
  authToken: string
  /** Versão do payload enviado (o código lê a v3). */
  apiVersion?: number
  sendType: 'SEQUENTIALLY' | 'NON_SEQUENTIALLY'
  events: string[]
}

/** `PUT /webhooks/{id}` — campo omitido mantém o valor atual (o PUT não aceita `email` nem `apiVersion`). */
export type AsaasUpdateWebhookInput = Partial<Omit<AsaasCreateWebhookInput, 'email' | 'apiVersion'>>

/** Webhook cadastrado (o token nunca volta, só `hasAuthToken`). */
export interface AsaasWebhook {
  id: string
  name?: string
  url: string
  email?: string | null
  enabled?: boolean
  interrupted?: boolean
  apiVersion?: number
  hasAuthToken?: boolean
  sendType?: 'SEQUENTIALLY' | 'NON_SEQUENTIALLY'
  penalizedRequestsCount?: number
  events?: string[]
}

export type AsaasPixAddressKeyStatus =
  | 'AWAITING_ACTIVATION'
  | 'ACTIVE'
  | 'AWAITING_DELETION'
  | 'AWAITING_ACCOUNT_DELETION'
  | 'DELETED'
  | 'ERROR'
  | (string & {})

export interface AsaasPixAddressKey {
  id: string
  key?: string
  type?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP' | (string & {})
  status?: AsaasPixAddressKeyStatus
  dateCreated?: string
}

/** `GET /myAccount/commercialInfo/` — só o que o setup mostra. */
export interface AsaasCommercialInfo {
  status?: string
  personType?: string
  name?: string | null
  companyName?: string | null
  tradingName?: string | null
  email?: string | null
}

/** Corpo do webhook de cobrança. */
export interface AsaasWebhookEvent {
  id: string
  event: string
  dateCreated?: string
  payment?: AsaasPayment
}
