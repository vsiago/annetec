import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { vendasAgentes, type VendasAgenteRow } from '@/db/schema'
import type { EscopoVendas } from '@annetec/contracts'
import { gerarCodigoIndicacao } from './rules'

/**
 * Perfil comercial mínimo para quem entra pela tela de Usuários.
 *
 * A área de vendas só abre para quem tem linha em `vendas_agentes`. Quem era criado como
 * `seller` (clube) ou `platform_seller` (plataforma) por Usuários ficava sem essa linha e via
 * "acesso não liberado". Aqui nasce o perfil de vendedor solo (sem corretora, unidade ou equipe),
 * ativo, com código de indicação. A gestão da Rede ajusta o vínculo depois.
 *
 * Folha: só banco e regras puras (importado por `users` e `platform-users` sem criar ciclo).
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

function violouUnicidade(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/** Código de indicação ainda não usado por nenhum agente (7 caracteres sem ambíguos). */
export async function gerarCodigoLivre(executor: Executor = db): Promise<string> {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = gerarCodigoIndicacao()
    const [existente] = await executor
      .select({ id: vendasAgentes.id })
      .from(vendasAgentes)
      .where(eq(vendasAgentes.codigoIndicacao, codigo))
      .limit(1)
    if (!existente) return codigo
  }
  throw new Error('Não foi possível gerar o código de indicação. Tente de novo.')
}

export interface AgenteSoloInput {
  scope: EscopoVendas
  tenantId: string | null
  userId: string
  nome: string
  telefone?: string | null
  criadoPorUserId?: string | null
  /** Código desejado (ex.: o do cadastro antigo de vendedores). Vale só se estiver livre. */
  codigoPreferido?: string | null
}

/** Cria o vendedor solo ativo quando a conta ainda não tem perfil no escopo. Idempotente: nunca altera um perfil existente. */
export async function garantirAgenteSolo(input: AgenteSoloInput, executor: Executor = db): Promise<VendasAgenteRow> {
  const noEscopo = and(
    eq(vendasAgentes.userId, input.userId),
    eq(vendasAgentes.scope, input.scope),
    input.tenantId ? eq(vendasAgentes.tenantId, input.tenantId) : isNull(vendasAgentes.tenantId),
  )
  const buscar = async () => (await executor.select().from(vendasAgentes).where(noEscopo).limit(1))[0]

  const existente = await buscar()
  if (existente) return existente

  let codigo = input.codigoPreferido?.trim().toUpperCase() || ''
  if (codigo) {
    const [ocupado] = await executor.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.codigoIndicacao, codigo)).limit(1)
    if (ocupado) codigo = ''
  }
  if (!codigo) codigo = await gerarCodigoLivre(executor)

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      const [criado] = await executor
        .insert(vendasAgentes)
        .values({
          scope: input.scope,
          tenantId: input.tenantId,
          userId: input.userId,
          papel: 'vendedor',
          codigoIndicacao: codigo,
          ativo: true,
          nome: input.nome,
          telefone: input.telefone?.trim() || null,
          criadoPorUserId: input.criadoPorUserId ?? null,
        })
        .returning()
      if (criado) return criado
    } catch (error) {
      if (!violouUnicidade(error)) throw error
      // Corrida: a conta ganhou o perfil em paralelo, ou o código colidiu.
      const agora = await buscar()
      if (agora) return agora
      codigo = await gerarCodigoLivre(executor)
    }
  }
  throw new Error('Não foi possível criar o perfil de vendedor.')
}
