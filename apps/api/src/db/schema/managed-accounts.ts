import type {
  AsaasCompanyType,
  ManagedAccountAddress,
  ManagedAccountRequestStatus,
  ManagedAutoDebitFailureCode,
  ManagedAutoDebitStatus,
} from '@annetec/contracts'
import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { platformCharges } from './platform-billing'

/**
 * Conta de recebimento GERENCIADA pela ANNETEC (`modules/managed-account`):
 * pedido do clube (com o aceite do termo) e tentativas de débito automático
 * das faturas da ANNETEC no saldo da subconta. A conta em si (chave cifrada,
 * carteira, documentos) mora em `tenant_asaas_accounts` com
 * `source = 'subaccount'`.
 */
const REQUEST_STATUS = ['pendente', 'aprovando', 'aprovado', 'recusado', 'falhou'] as const
const DEBIT_STATUS = ['em_andamento', 'concluida', 'falhou'] as const
const DEBIT_FAILURE = [
  'saldo_insuficiente',
  'fatura_paga',
  'transferencia_recusada',
  'transferencia_cancelada',
  'erro_asaas',
  'pagamento_duplicado',
] as const
const DEBIT_SOURCE = ['automation', 'manual'] as const

REQUEST_STATUS satisfies readonly ManagedAccountRequestStatus[]
DEBIT_STATUS satisfies readonly ManagedAutoDebitStatus[]
DEBIT_FAILURE satisfies readonly ManagedAutoDebitFailureCode[]

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })

/** Dados da subconta enviados no pedido (vão para `POST /v3/accounts` na aprovação). */
export interface ManagedAccountRequestData {
  name: string
  /** Só dígitos (do cadastro do clube). */
  cpfCnpj: string
  companyType: AsaasCompanyType | null
  birthDate: string | null
  incomeValue: number
  email: string
  loginEmail: string
  phone: string | null
  mobilePhone: string
  site: string | null
  address: ManagedAccountAddress
  /**
   * Correções do superadmin antes da aprovação (`PATCH …/pedido`). O aceite do
   * termo segue o original; o antes/depois de cada campo vai para a auditoria.
   */
  corrections?: { at: string; byUserId: string | null; byName: string | null; fields: string[] }[]
}

/**
 * Pedido de conta gerenciada. Um ABERTO por clube (`pendente`, `aprovando`,
 * `falhou` — índice único parcial): pedido em aberto bloqueia um novo. O
 * aceite do termo (texto e versão exatos, usuário, data/hora, IP e
 * user-agent) fica gravado na linha como prova.
 */
export const managedAccountRequests = pgTable(
  'managed_account_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    status: text('status', { enum: REQUEST_STATUS }).notNull().default('pendente'),
    data: jsonb('data').$type<ManagedAccountRequestData>().notNull(),
    termsVersion: text('terms_version').notNull(),
    termsText: text('terms_text').notNull(),
    /** Sem FK: a prova do aceite sobrevive à conta do usuário. */
    acceptedByUserId: text('accepted_by_user_id').notNull(),
    acceptedByName: text('accepted_by_name'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    /** IP do cliente (1º salto do `x-forwarded-for` só atrás de proxy confiável — `TRUST_PROXY`). */
    acceptedIp: text('accepted_ip'),
    acceptedUserAgent: text('accepted_user_agent'),
    decidedByUserId: text('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    refuseReason: text('refuse_reason'),
    /** Subconta no Asaas (gravada assim que conhecida — serve para recuperar a chave). */
    asaasAccountId: text('asaas_account_id'),
    walletId: text('wallet_id'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('managed_account_requests_open_key')
      .on(table.organizationId)
      .where(sql`status in ('pendente', 'aprovando', 'falhou')`),
    index('managed_account_requests_org_created_idx').on(table.organizationId, table.createdAt),
    index('managed_account_requests_status_idx').on(table.status),
  ],
)

/**
 * Tentativa de débito automático: transferência do saldo da subconta do
 * clube para a carteira da ANNETEC, quitando uma fatura da plataforma.
 *
 * Idempotência (nunca transferir duas vezes para a mesma fatura):
 *  - no máximo UMA tentativa `em_andamento` e UMA `concluida` por fatura
 *    (índices únicos parciais) — o INSERT da tentativa é a trava entre
 *    processos;
 *  - `external_reference` único vai na transferência (`adb_<id>`): resposta
 *    perdida é reencontrada no Asaas por ele, nunca repetida;
 *  - `transfer_id` único (o webhook de validação aprova só a nossa).
 */
export const managedAccountDebits = pgTable(
  'managed_account_debits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    chargeId: uuid('charge_id').references(() => platformCharges.id, { onDelete: 'set null' }),
    /** Nº da tentativa nesta fatura. */
    attempt: integer('attempt').notNull().default(1),
    status: text('status', { enum: DEBIT_STATUS }).notNull().default('em_andamento'),
    source: text('source', { enum: DEBIT_SOURCE }).notNull(),
    actorUserId: text('actor_user_id'),
    amount: money('amount').notNull(),
    /** Saldo da subconta consultado antes de transferir. */
    balance: money('balance'),
    /** Carteira da ANNETEC (destino). */
    destinationWalletId: text('destination_wallet_id'),
    externalReference: text('external_reference').notNull(),
    transferId: text('transfer_id'),
    transferStatus: text('transfer_status'),
    /** `POST /transfers` enviado (a partir daqui a transferência PODE existir no Asaas). */
    transferRequestedAt: timestamp('transfer_requested_at', { withTimezone: true }),
    /** O webhook de validação de transferências aprovou esta. */
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    /** Cobrança da fatura baixada no Asaas da ANNETEC (`receiveInCash`). */
    gatewaySettledAt: timestamp('gateway_settled_at', { withTimezone: true }),
    /** Fatura quitada no nosso banco. */
    settledAt: timestamp('settled_at', { withTimezone: true }),
    failureCode: text('failure_code', { enum: DEBIT_FAILURE }),
    failureReason: text('failure_reason'),
    /** O valor saiu do saldo, mas a fatura já estava paga/encerrada: devolver ao clube. */
    refundRequired: boolean('refund_required').notNull().default(false),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('managed_account_debits_charge_running_key')
      .on(table.chargeId)
      .where(sql`status = 'em_andamento'`),
    uniqueIndex('managed_account_debits_charge_done_key')
      .on(table.chargeId)
      .where(sql`status = 'concluida'`),
    uniqueIndex('managed_account_debits_transfer_key').on(table.transferId),
    uniqueIndex('managed_account_debits_reference_key').on(table.externalReference),
    index('managed_account_debits_org_created_idx').on(table.organizationId, table.createdAt),
    index('managed_account_debits_status_idx').on(table.status),
  ],
)
