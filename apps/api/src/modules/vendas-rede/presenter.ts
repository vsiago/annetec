import type { VendasAgente } from '@annetec/contracts'
import type { VendasAgenteRow } from '@/db/schema'
import { estaOnline } from './rules'

/** `vendas_agentes` (+ e-mail da conta) → contrato `VendasAgente`. */
export function toVendasAgente(
  row: VendasAgenteRow,
  options: { email: string | null; agora: Date; presencaMinutos: number },
): VendasAgente {
  return {
    id: row.id,
    scope: row.scope,
    tenantId: row.tenantId ?? null,
    userId: row.userId,
    papel: row.papel,
    corretoraId: row.corretoraId ?? null,
    unidadeId: row.unidadeId ?? null,
    equipeId: row.equipeId ?? null,
    codigoIndicacao: row.codigoIndicacao,
    ativo: row.ativo,
    metaMensal: row.metaMensal ?? null,
    nome: row.nome,
    email: options.email,
    cpf: row.cpf ?? null,
    telefone: row.telefone ?? null,
    dataNascimento: row.dataNascimento ?? null,
    endereco: row.endereco ?? null,
    repasse: (row.repasse as Record<string, unknown> | null) ?? null,
    observacoes: row.observacoes ?? null,
    ultimaPresencaEm: row.ultimaPresencaEm ? row.ultimaPresencaEm.toISOString() : null,
    online: row.ativo && estaOnline(row.ultimaPresencaEm, options.agora, options.presencaMinutos),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
