import type { VendasAgente, VendasArvoreAgente, VendasCorretora, VendasEquipe, VendasUnidade } from '@annetec/contracts'
import type { VendasAgenteRow, VendasCorretoraRow, VendasEquipeRow, VendasUnidadeRow } from '@/db/schema'
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

/** `vendas_corretoras` → contrato `VendasCorretora`. */
export function toVendasCorretora(row: VendasCorretoraRow): VendasCorretora {
  return {
    id: row.id,
    nomeFantasia: row.nomeFantasia,
    razaoSocial: row.razaoSocial,
    cnpj: row.cnpj,
    email: row.email ?? null,
    telefone: row.telefone ?? null,
    endereco: row.endereco ?? null,
    gerenteAgenteId: row.gerenteAgenteId ?? null,
    status: row.status,
    comissaoOverrides: row.comissaoOverrides ?? null,
    observacoes: row.observacoes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** `vendas_unidades` → contrato `VendasUnidade`. */
export function toVendasUnidade(row: VendasUnidadeRow): VendasUnidade {
  return {
    id: row.id,
    corretoraId: row.corretoraId ?? null,
    nome: row.nome,
    tipo: row.tipo,
    endereco: row.endereco ?? null,
    telefone: row.telefone ?? null,
    responsavelAgenteId: row.responsavelAgenteId ?? null,
    status: row.status,
  }
}

/** `vendas_equipes` → contrato `VendasEquipe`. */
export function toVendasEquipe(row: VendasEquipeRow): VendasEquipe {
  return {
    id: row.id,
    corretoraId: row.corretoraId ?? null,
    unidadeId: row.unidadeId ?? null,
    nome: row.nome,
    supervisorAgenteId: row.supervisorAgenteId ?? null,
    status: row.status,
  }
}

/** Nó de agente da árvore da rede (sem dados cadastrais). */
export function toArvoreAgente(row: VendasAgenteRow, options: { agora: Date; presencaMinutos: number }): VendasArvoreAgente {
  return {
    id: row.id,
    nome: row.nome,
    papel: row.papel,
    ativo: row.ativo,
    online: row.ativo && estaOnline(row.ultimaPresencaEm, options.agora, options.presencaMinutos),
    equipeId: row.equipeId ?? null,
    unidadeId: row.unidadeId ?? null,
    corretoraId: row.corretoraId ?? null,
  }
}
