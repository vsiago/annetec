import type { db } from '@/db/client'
import { logger } from '@/lib/logger'

/**
 * Embrulho dos ganchos que rodam DENTRO de uma transação alheia (pagamento, transição da
 * proposta): savepoint próprio e erro só no log — um erro SQL aqui não deixa a transação
 * externa "aborted" e nunca desfaz o pagamento/transição. FOLHA: sem imports de módulos de domínio.
 */

type ExecutorBase = Pick<typeof db, 'select' | 'insert' | 'update'>

export async function safely<E extends ExecutorBase>(executor: E, label: string, work: (tx: E) => Promise<unknown>): Promise<void> {
  try {
    const runner = executor as unknown as { transaction?: (fn: (sp: E) => Promise<void>) => Promise<void> }
    if (typeof runner.transaction === 'function') {
      await runner.transaction(async sp => {
        await work(sp)
      })
    } else {
      await work(executor)
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), label }, 'Falha nos ganchos da Rede Comercial (a operação principal segue)')
  }
}
