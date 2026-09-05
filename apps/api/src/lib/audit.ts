import type { Context } from 'hono'
import { db } from '@/db/client'
import { auditLogs } from '@/db/schema'
import type { AppEnv } from '@/http/types'
import { logger } from './logger'

/**
 * Trilha de auditoria — quem fez o quê, em qual inquilino.
 *
 * A tabela `audit_logs` existia desde o começo com essa promessa no comentário
 * do schema, mas nenhum código escrevia nela: a trilha estava vazia. Este
 * módulo é o único ponto de escrita.
 *
 * Duas decisões que valem registrar:
 *
 *  - **Auditoria nunca derruba a operação.** Se o insert falhar (banco fora,
 *    coluna nova ainda não migrada), o erro vai para o log da aplicação e a
 *    requisição segue. Perder uma linha de trilha é ruim; perder a adesão de
 *    um cliente porque a trilha falhou é pior.
 *  - **É `await`, não fire-and-forget.** Em runtime serverless (o app roda em
 *    Vercel Functions) a instância pode ser congelada assim que a resposta
 *    sai, e uma promessa solta simplesmente não termina. O custo é um insert
 *    por escrita relevante.
 *
 * `actorId` e `actorScope` ficam soltos (texto, sem FK) de propósito: a trilha
 * precisa sobreviver ao apagamento da conta do ator.
 */
export interface AuditEntry {
  /** Verbo no passado, em snake_case: `tenant.created`, `contract.synced`. */
  action: string
  /** Entidade tocada: `tenant`, `contract`, `partner`, `platform_user`… */
  resource: string
  resourceId?: string | null
  /** Contexto útil para entender a linha depois — nunca segredo nem senha. */
  metadata?: Record<string, unknown>
  /** Sobrescreve o inquilino do contexto (rotas de plataforma agem sobre outro). */
  organizationId?: string | null
}

export async function recordAudit(c: Context<AppEnv>, entry: AuditEntry): Promise<void> {
  try {
    const session = c.get('auth')
    const tenant = c.get('tenant')

    await db.insert(auditLogs).values({
      organizationId: entry.organizationId ?? tenant?.id ?? session?.membership?.tenantId ?? null,
      actorId: session?.user.id ?? null,
      actorScope: session?.membership?.scope === 'platform' ? 'platform' : session ? 'tenant' : null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
      ip: clientIp(c),
      requestId: c.get('requestId') ?? null,
    })
  } catch (error) {
    logger.error({ err: error, action: entry.action, resource: entry.resource }, 'Falha ao gravar auditoria')
  }
}

/**
 * IP de quem chamou. Atrás do proxy da Vercel o socket é da própria
 * infraestrutura, então o valor real vem do cabeçalho — primeiro salto do
 * `x-forwarded-for`, que é o cliente.
 */
function clientIp(c: Context<AppEnv>): string | null {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return c.req.header('x-real-ip') ?? null
}
