/**
 * Mundo de teste da Rede Comercial (banco em memória): corretoras, equipes e agentes
 * com `id` previsível, e atalhos para semear leads/config. Compartilhado por
 * `vendas-rede-leads.test.ts` e `vendas-rede-intake.test.ts`.
 */
import type { MemoryDb } from './memory-db'

export const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const CLUBE_A = { id: 'org-clube-a', slug: 'clube-a', name: 'Clube A' }
export const CLUBE_B = { id: 'org-clube-b', slug: 'clube-b', name: 'Clube B' }

export const ID = {
  corretora1: uid(101),
  corretora2: uid(102),
  equipe1: uid(111),
  equipe2: uid(112),
  equipe3: uid(113),
  gerente1: uid(201),
  gerente2: uid(202),
  supervisor1: uid(211),
  supervisor2: uid(212),
  supervisor3: uid(213),
  vendedor1: uid(221),
  vendedor1b: uid(222),
  vendedor2: uid(223),
  vendedor3: uid(224),
  solo: uid(225),
  balcaoA: uid(231),
  vendedorA: uid(232),
  vendedorB: uid(233),
} as const

type Papel = 'master' | 'gerente' | 'supervisor' | 'vendedor' | 'balcao'

export interface AgenteSeed {
  id: string
  /** `user.id` e token da sessão de teste. */
  userId: string
  papel: Papel
  nome: string
  scope?: 'platform' | 'tenant'
  tenantId?: string | null
  corretoraId?: string | null
  equipeId?: string | null
  ativo?: boolean
  codigo: string
  ultimaPresencaEm?: Date | null
}

export const AGENTES: AgenteSeed[] = [
  { id: ID.gerente1, userId: 'u-gerente1', papel: 'gerente', nome: 'Gerente Um', corretoraId: ID.corretora1, codigo: 'GER0001' },
  { id: ID.gerente2, userId: 'u-gerente2', papel: 'gerente', nome: 'Gerente Dois', corretoraId: ID.corretora2, codigo: 'GER0002' },
  { id: ID.supervisor1, userId: 'u-supervisor1', papel: 'supervisor', nome: 'Supervisor Um', corretoraId: ID.corretora1, equipeId: ID.equipe1, codigo: 'SUP0001' },
  { id: ID.supervisor2, userId: 'u-supervisor2', papel: 'supervisor', nome: 'Supervisor Dois', corretoraId: ID.corretora1, equipeId: ID.equipe2, codigo: 'SUP0002' },
  { id: ID.supervisor3, userId: 'u-supervisor3', papel: 'supervisor', nome: 'Supervisor Três', corretoraId: ID.corretora2, equipeId: ID.equipe3, codigo: 'SUP0003' },
  { id: ID.vendedor1, userId: 'u-vendedor1', papel: 'vendedor', nome: 'Vendedor Um', corretoraId: ID.corretora1, equipeId: ID.equipe1, codigo: 'VEN0001' },
  { id: ID.vendedor1b, userId: 'u-vendedor1b', papel: 'vendedor', nome: 'Vendedor Um B', corretoraId: ID.corretora1, equipeId: ID.equipe1, codigo: 'VEN0011' },
  { id: ID.vendedor2, userId: 'u-vendedor2', papel: 'vendedor', nome: 'Vendedor Dois', corretoraId: ID.corretora1, equipeId: ID.equipe2, codigo: 'VEN0002' },
  { id: ID.vendedor3, userId: 'u-vendedor3', papel: 'vendedor', nome: 'Vendedor Três', corretoraId: ID.corretora2, equipeId: ID.equipe3, codigo: 'VEN0003' },
  { id: ID.solo, userId: 'u-solo', papel: 'vendedor', nome: 'Vendedor Solo', codigo: 'SOLO001' },
  { id: ID.balcaoA, userId: 'u-balcaoA', papel: 'balcao', nome: 'Balcão A', scope: 'tenant', tenantId: CLUBE_A.id, codigo: 'BAL0001' },
  { id: ID.vendedorA, userId: 'u-vendedorA', papel: 'vendedor', nome: 'Vendedor do Clube A', scope: 'tenant', tenantId: CLUBE_A.id, codigo: 'CLA0001' },
  { id: ID.vendedorB, userId: 'u-vendedorB', papel: 'vendedor', nome: 'Vendedor do Clube B', scope: 'tenant', tenantId: CLUBE_B.id, codigo: 'CLB0001' },
]

export function semearRede(mem: MemoryDb, schema: typeof import('@/db/schema')): void {
  const platform = { scope: 'platform' as const, tenantId: null }
  mem.insertRow(schema.vendasCorretoras, { id: ID.corretora1, ...platform, nomeFantasia: 'Corretora 1', razaoSocial: 'C1 LTDA', cnpj: '11111111000111', gerenteAgenteId: ID.gerente1 })
  mem.insertRow(schema.vendasCorretoras, { id: ID.corretora2, ...platform, nomeFantasia: 'Corretora 2', razaoSocial: 'C2 LTDA', cnpj: '22222222000122', gerenteAgenteId: ID.gerente2 })
  mem.insertRow(schema.vendasEquipes, { id: ID.equipe1, ...platform, corretoraId: ID.corretora1, nome: 'Equipe 1', supervisorAgenteId: ID.supervisor1 })
  mem.insertRow(schema.vendasEquipes, { id: ID.equipe2, ...platform, corretoraId: ID.corretora1, nome: 'Equipe 2', supervisorAgenteId: ID.supervisor2 })
  mem.insertRow(schema.vendasEquipes, { id: ID.equipe3, ...platform, corretoraId: ID.corretora2, nome: 'Equipe 3', supervisorAgenteId: ID.supervisor3 })
  for (const a of AGENTES) {
    mem.insertRow(schema.vendasAgentes, {
      id: a.id,
      scope: a.scope ?? 'platform',
      tenantId: a.tenantId ?? null,
      userId: a.userId,
      papel: a.papel,
      nome: a.nome,
      corretoraId: a.corretoraId ?? null,
      equipeId: a.equipeId ?? null,
      ativo: a.ativo ?? true,
      codigoIndicacao: a.codigo,
      ultimaPresencaEm: a.ultimaPresencaEm ?? null,
    })
    mem.insertRow(schema.user, { id: a.userId, name: a.nome, email: `${a.userId}@teste.com`, banned: false })
  }
}

export interface LeadSeed {
  id: string
  scope?: 'platform' | 'tenant'
  tenantId?: string | null
  nome?: string
  agenteId?: string | null
  etapa?: 'novo' | 'em_contato' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
  telefone?: string | null
  email?: string | null
  documento?: string | null
  reivindicadoEm?: Date | null
  poolDesde?: Date | null
  ultimoContatoEm?: Date | null
  interessePlanoId?: string | null
  conversao?: Record<string, unknown> | null
  ganhoEm?: Date | null
  perdidoEm?: Date | null
  origem?: string
  valorEstimado?: string | null
  proximoPasso?: string | null
  proximoPassoEm?: Date | null
  updatedAt?: Date
  createdAt?: Date
}

export function semearLead(mem: MemoryDb, schema: typeof import('@/db/schema'), lead: LeadSeed) {
  return mem.insertRow(schema.vendasLeads, {
    scope: 'platform',
    tenantId: null,
    tipo: 'empresa',
    nome: 'Lead de teste',
    origem: 'site',
    etapa: 'novo',
    agenteId: null,
    dados: {},
    ...lead,
  })
}

export function semearConfig(
  mem: MemoryDb,
  schema: typeof import('@/db/schema'),
  escopo: { scope: 'platform' | 'tenant'; tenantId: string | null },
  extra: Record<string, unknown> = {},
) {
  return mem.insertRow(schema.vendasConfig, {
    ...escopo,
    escalaMensal: [100, 50, 25],
    percentualAdesao: '50.00',
    overrides: { supervisor: 10, gerente: 5, corretora: 5 },
    balcaoPercentual: null,
    distribuicao: 'pool',
    poolRetornoHoras: 48,
    presencaMinutos: 3,
    balcaoDescontoPadrao: 30,
    metaMensalPadrao: 10,
    modelosMensagem: [],
    ...extra,
  })
}

export const horasAtras = (horas: number, base: number = Date.now()): Date => new Date(base - horas * 3_600_000)
