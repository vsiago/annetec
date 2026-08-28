import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Enums do Postgres derivados de `@annetec/contracts/annetec/enums`. Mantidos
 * aqui em literais explícitos porque o drizzle-kit precisa dos valores em
 * tempo de compilação para gerar a migração.
 *
 * Papel de plataforma e papel de inquilino NÃO são enums do Postgres aqui:
 * são o campo `role` (texto livre) de `user`/`member`, tabelas do Better Auth
 * (auth.ts) — colunas dele, formato dele.
 */
export const tenantStatusEnum = pgEnum('tenant_status', ['trial', 'active', 'suspended', 'cancelled'])

export const contractStatusEnum = pgEnum('contract_status', [
  'pendente',
  'produzido',
  'ativo',
  'suspenso',
  'cancelado',
  'desconhecido',
])

export const beneficiaryKindEnum = pgEnum('beneficiary_kind', ['titular', 'dependente', 'agregado'])

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'closed',
  'lost',
])

export const interactionTypeEnum = pgEnum('interaction_type', [
  'call',
  'email',
  'meeting',
  'note',
  'whatsapp',
])

export const saleStatusEnum = pgEnum('sale_status', ['pending', 'confirmed', 'cancelled'])

export const partnerCategoryEnum = pgEnum('partner_category', [
  'health',
  'dental',
  'pharmacy',
  'wellness',
  'food',
  'education',
  'other',
])

export const benefitCategoryEnum = pgEnum('benefit_category', [
  'health',
  'dental',
  'pharmacy',
  'funeral',
  'discount',
])

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'aguardando',
  'em_atendimento',
  'concluido',
])

export const activeStatusEnum = pgEnum('active_status', ['active', 'inactive'])
