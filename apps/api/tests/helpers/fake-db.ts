/**
 * Banco FALSO para os testes de vendas da plataforma (nenhuma conexão real):
 * cada `db.select()/insert()/update()/delete()` vira uma cadeia que, ao ser
 * aguardada, chama `resolve(call)` com a tabela e as operações encadeadas
 * (`from`, `where`, `values`, `set`, `returning`...). `transaction` roda o
 * trabalho no próprio fake (e savepoints também).
 */

export interface Op {
  name: string
  args: unknown[]
}

export interface FakeCall {
  kind: 'select' | 'insert' | 'update' | 'delete'
  /** Tabela de `from` (select) ou do `insert/update/delete`. */
  table: unknown
  fields: unknown
  ops: Op[]
}

export function argOf(ops: Op[], name: string): Record<string, any> {
  return ops.find(op => op.name === name)?.args[0] as Record<string, any>
}

/** Valores (parâmetros) de um `where` do drizzle, na ordem. */
export function whereValues(node: unknown, out: unknown[] = []): unknown[] {
  if (typeof node === 'string' || typeof node === 'number') out.push(node)
  else if (Array.isArray(node)) for (const item of node) whereValues(item, out)
  else if (node && typeof node === 'object') {
    if (Array.isArray((node as { queryChunks?: unknown[] }).queryChunks)) {
      for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) whereValues(chunk, out)
    } else if ((node as object).constructor?.name === 'Param') {
      const value = (node as { value: unknown }).value
      if (Array.isArray(value)) out.push(...value)
      else out.push(value)
    }
  }
  return out
}

export function createFakeDb(resolve: (call: FakeCall) => unknown) {
  function chain(kind: FakeCall['kind'], table: unknown, fields?: unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
            try {
              const from = kind === 'select' ? (ops.find(op => op.name === 'from')?.args[0] ?? table) : table
              return Promise.resolve(resolve({ kind, table: from, fields, ops })).then(onFulfilled, onRejected)
            } catch (error) {
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
          }
        }
        return (...args: unknown[]) => {
          ops.push({ name: String(prop), args })
          return proxy
        }
      },
    })
    return proxy
  }
  const db: Record<string, unknown> = {
    select: (fields?: unknown) => chain('select', null, fields),
    insert: (table: unknown) => chain('insert', table),
    update: (table: unknown) => chain('update', table),
    delete: (table: unknown) => chain('delete', table),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return db
}
