import { randomUUID } from 'node:crypto'
import { getTableColumns } from 'drizzle-orm'

/**
 * Banco FALSO em memória que INTERPRETA as consultas do drizzle (nenhuma
 * conexão real): `select/insert/update/delete` com `where` feito de
 * `eq/ne/lt/lte/gt/gte/inArray/isNull/isNotNull/and/or`, `leftJoin`/
 * `innerJoin` por igualdade de colunas, `orderBy(asc|desc)`, `limit`,
 * `returning`, `selectDistinctOn` (1ª linha por chave, após o `orderBy`), `onConflictDoNothing/onConflictDoUpdate` e índices únicos
 * (inclusive parciais) declarados pelo teste. `sql\`…\`` cru no `where` não é
 * suportado (lança — o teste fica sabendo). Cada operação resolve numa volta
 * nova da fila de tarefas, então `Promise.all` intercala como no banco real.
 */

type Row = Record<string, unknown>
type Table = object

export interface UniqueIndex {
  table: Table
  keys: string[]
  /** Índice parcial: só linhas que passam aqui. */
  where?: (row: Row) => boolean
}

export interface MemoryDbOptions {
  tables: Table[]
  uniques?: UniqueIndex[]
  /** Falha injetada: lançar aqui derruba a operação (ex.: banco fora ao gravar). */
  beforeWrite?: (kind: 'insert' | 'update' | 'delete', table: Table, values: Row | Row[] | null) => void
}

interface ColumnRef {
  table: Table
  key: string
  column: Record<string, unknown>
}

const name = (value: unknown) => (value as { constructor?: { name?: string } } | null)?.constructor?.name
const isSQL = (value: unknown) => name(value) === 'SQL'
const strOf = (value: unknown): string | null => (name(value) === 'StringChunk' ? (value as { value: string[] }).value.join('') : null)
const isParam = (value: unknown) => name(value) === 'Param'
const paramValue = (value: unknown) => (isParam(value) ? (value as { value: unknown }).value : value)

export function createMemoryDb(options: MemoryDbOptions) {
  const store = new Map<Table, Row[]>()
  const columns = new Map<unknown, ColumnRef>()
  for (const table of options.tables) {
    store.set(table, [])
    for (const [key, column] of Object.entries(getTableColumns(table as never))) {
      columns.set(column, { table, key, column: column as unknown as Record<string, unknown> })
    }
  }
  const uniques = options.uniques ?? []

  function rows(table: Table): Row[] {
    const list = store.get(table)
    if (!list) throw new Error('Tabela não registrada no banco em memória')
    return list
  }

  type Context = Map<Table, Row | null>

  function valueOf(ref: unknown, ctx: Context): unknown {
    const column = columns.get(ref)
    if (!column) return paramValue(ref)
    const row = ctx.get(column.table)
    return row ? row[column.key] ?? null : null
  }

  function comparable(value: unknown): unknown {
    if (value instanceof Date) return value.getTime()
    return value
  }

  function compare(a: unknown, b: unknown): number {
    const x = comparable(a)
    const y = comparable(b)
    if (typeof x === 'number' || typeof y === 'number') return Number(x) - Number(y)
    if (typeof x === 'string' && typeof y === 'string' && /^-?\d+(\.\d+)?$/.test(x) && /^-?\d+(\.\d+)?$/.test(y)) return Number(x) - Number(y)
    return String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0
  }

  function equal(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined || b === null || b === undefined) return false
    return compare(a, b) === 0
  }

  function evaluate(node: unknown, ctx: Context): boolean {
    if (node === undefined || node === null) return true
    if (!isSQL(node)) throw new Error('Condição desconhecida no banco em memória')
    const chunks = (node as { queryChunks: unknown[] }).queryChunks
    const meaningful = chunks.filter(chunk => {
      const text = strOf(chunk)
      return text === null || !['', '(', ')'].includes(text.trim())
    })
    if (meaningful.length === 1 && isSQL(meaningful[0])) return evaluate(meaningful[0], ctx)
    const texts = meaningful.map(strOf).filter((text): text is string => text !== null).map(text => text.trim())
    const subs = meaningful.filter(isSQL)
    if (subs.length > 0 && subs.length + texts.length === meaningful.length) {
      if (texts.every(text => text === 'and')) return subs.every(sub => evaluate(sub, ctx))
      if (texts.every(text => text === 'or')) return subs.some(sub => evaluate(sub, ctx))
    }
    const columnChunk = meaningful.find(chunk => columns.has(chunk))
    const op = texts[0]
    if (!columnChunk || !op) throw new Error(`Condição sem suporte no banco em memória (${texts.join(' ')})`)
    const left = valueOf(columnChunk, ctx)
    if (op === 'is null') return left === null || left === undefined
    if (op === 'is not null') return left !== null && left !== undefined
    const rest = meaningful.filter(chunk => chunk !== columnChunk && strOf(chunk) === null)
    if (op === 'in' || op === 'not in') {
      const list = (rest[0] as unknown[]).map(paramValue)
      const found = list.some(item => equal(left, item))
      return op === 'in' ? found : !found
    }
    const right = valueOf(rest[0], ctx)
    if (left === null || left === undefined || right === null || right === undefined) return false
    const diff = compare(left, right)
    switch (op) {
      case '=':
        return diff === 0
      case '<>':
        return diff !== 0
      case '<':
        return diff < 0
      case '<=':
        return diff <= 0
      case '>':
        return diff > 0
      case '>=':
        return diff >= 0
      default:
        throw new Error(`Operador sem suporte no banco em memória: ${op}`)
    }
  }

  function project(fields: unknown, ctx: Context, base: Table): Row | null {
    if (!fields) {
      const row = ctx.get(base)
      return row ? { ...row } : null
    }
    const out: Row = {}
    for (const [key, ref] of Object.entries(fields as Record<string, unknown>)) {
      if (store.has(ref as Table)) {
        const row = ctx.get(ref as Table)
        out[key] = row ? { ...row } : null
      } else if (columns.has(ref)) {
        out[key] = valueOf(ref, ctx)
      } else if (ref && typeof ref === 'object' && !isSQL(ref)) {
        out[key] = project(ref, ctx, base)
      } else {
        throw new Error(`Campo sem suporte no select em memória: ${key}`)
      }
    }
    return out
  }

  function sortRows(list: Context[], args: unknown[]): Context[] {
    const keys = args.map(arg => {
      if (columns.has(arg)) return { ref: arg, desc: false }
      if (isSQL(arg)) {
        const chunks = (arg as { queryChunks: unknown[] }).queryChunks
        const ref = chunks.find(chunk => columns.has(chunk))
        const text = chunks.map(strOf).filter(Boolean).join(' ')
        if (ref) return { ref, desc: /desc/.test(text) }
      }
      throw new Error('orderBy sem suporte no banco em memória')
    })
    return [...list].sort((a, b) => {
      for (const key of keys) {
        const x = valueOf(key.ref, a)
        const y = valueOf(key.ref, b)
        if (x === y) continue
        if (x === null || x === undefined) return 1
        if (y === null || y === undefined) return -1
        const diff = compare(x, y)
        if (diff !== 0) return key.desc ? -diff : diff
      }
      return 0
    })
  }

  function withDefaults(table: Table, values: Row): Row {
    const row: Row = {}
    for (const [key, column] of Object.entries(getTableColumns(table as never))) {
      const col = column as unknown as { default?: unknown; defaultFn?: () => unknown; hasDefault?: boolean; columnType?: string; dataType?: string }
      if (values[key] !== undefined) {
        row[key] = values[key]
      } else if (col.defaultFn) {
        row[key] = col.defaultFn()
      } else if (col.hasDefault) {
        if (isSQL(col.default)) {
          row[key] = col.columnType === 'PgUUID' ? randomUUID() : col.dataType === 'date' || col.columnType === 'PgTimestamp' ? new Date() : null
        } else {
          row[key] = structuredClone(col.default)
        }
      } else {
        row[key] = null
      }
    }
    return row
  }

  function conflictOf(table: Table, candidate: Row, ignore?: Row): Row | null {
    for (const index of uniques.filter(u => u.table === table)) {
      if (index.where && !index.where(candidate)) continue
      if (index.keys.some(key => candidate[key] === null || candidate[key] === undefined)) continue
      const hit = rows(table).find(
        row => row !== ignore && (!index.where || index.where(row)) && index.keys.every(key => equal(row[key], candidate[key])),
      )
      if (hit) return hit
    }
    return null
  }

  class UniqueViolation extends Error {
    readonly code = '23505'
  }

  function chain(kind: 'select' | 'insert' | 'update' | 'delete', table: Table | null, fields?: unknown, distinctOn?: unknown[]) {
    const ops: { name: string; args: unknown[] }[] = []
    const arg = (op: string) => ops.find(item => item.name === op)?.args
    const run = (): unknown => {
      if (kind === 'select') {
        const base = arg('from')?.[0] as Table
        let contexts: Context[] = rows(base).map(row => new Map([[base, row]]))
        for (const op of ops.filter(item => item.name === 'leftJoin' || item.name === 'innerJoin')) {
          const [joined, on] = op.args as [Table, unknown]
          const next: Context[] = []
          for (const ctx of contexts) {
            const matches = rows(joined).filter(row => evaluate(on, new Map([...ctx, [joined, row]])))
            if (matches.length === 0 && op.name === 'leftJoin') next.push(new Map([...ctx, [joined, null]]))
            for (const row of matches) next.push(new Map([...ctx, [joined, row]]))
          }
          contexts = next
        }
        const where = arg('where')?.[0]
        contexts = contexts.filter(ctx => evaluate(where, ctx))
        // Agregado simples: `select({ total: sql\`count(*)::int\` })`.
        const aggregate = fields
          ? Object.entries(fields as Record<string, unknown>).find(([, ref]) => isSQL(ref) && /count\(/i.test(JSON.stringify((ref as { queryChunks: unknown[] }).queryChunks.map(strOf))))
          : undefined
        if (aggregate) return [{ [aggregate[0]]: contexts.length }]
        const orderBy = arg('orderBy')
        if (orderBy) contexts = sortRows(contexts, orderBy)
        // `selectDistinctOn([colunas], campos)`: mantém a 1ª linha de cada chave, já na ordem pedida.
        if (distinctOn) {
          const vistos = new Set<string>()
          contexts = contexts.filter(ctx => {
            const chave = JSON.stringify(distinctOn.map(ref => comparable(valueOf(ref, ctx))))
            if (vistos.has(chave)) return false
            vistos.add(chave)
            return true
          })
        }
        const limit = arg('limit')?.[0] as number | undefined
        if (limit !== undefined) contexts = contexts.slice(0, limit)
        return contexts.map(ctx => project(fields, ctx, base))
      }

      const target = table as Table
      if (kind === 'insert') {
        const raw = arg('values')?.[0] as Row | Row[]
        options.beforeWrite?.('insert', target, raw)
        const list = Array.isArray(raw) ? raw : [raw]
        const doNothing = Boolean(arg('onConflictDoNothing'))
        const doUpdate = arg('onConflictDoUpdate')?.[0] as { set: Row } | undefined
        const out: Row[] = []
        for (const values of list) {
          const row = withDefaults(target, values)
          const conflict = conflictOf(target, row)
          if (conflict) {
            if (doUpdate) {
              Object.assign(conflict, Object.fromEntries(Object.entries(doUpdate.set).filter(([, v]) => v !== undefined)))
              out.push(conflict)
              continue
            }
            if (doNothing) continue
            throw new UniqueViolation('duplicate key value violates unique constraint')
          }
          rows(target).push(row)
          out.push(row)
        }
        const returning = arg('returning')
        return returning ? out.map(row => project(returning[0], new Map([[target, row]]), target)) : []
      }

      const where = arg('where')?.[0]
      const matched = rows(target).filter(row => evaluate(where, new Map([[target, row]])))
      if (kind === 'update') {
        const set = arg('set')?.[0] as Row
        options.beforeWrite?.('update', target, set)
        for (const row of matched) {
          const next = { ...row, ...Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined)) }
          if (conflictOf(target, next, row)) throw new UniqueViolation('duplicate key value violates unique constraint')
          Object.assign(row, next)
        }
      } else {
        options.beforeWrite?.('delete', target, null)
        store.set(
          target,
          rows(target).filter(row => !matched.includes(row)),
        )
      }
      const returning = arg('returning')
      return returning ? matched.map(row => project(returning[0], new Map([[target, row]]), target)) : []
    }

    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
            new Promise((resolve, reject) => {
              // Uma volta da fila por operação: concorrência intercala como no banco.
              setImmediate(() => {
                try {
                  resolve(run())
                } catch (error) {
                  reject(error)
                }
              })
            }).then(onFulfilled, onRejected)
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
    selectDistinctOn: (on: unknown[], fields?: unknown) => chain('select', null, fields, on),
    insert: (table: Table) => chain('insert', table),
    update: (table: Table) => chain('update', table),
    delete: (table: Table) => chain('delete', table),
    execute: async () => [],
  }
  // Transação com ROLLBACK: erro dentro dela devolve as tabelas ao estado do início (savepoint = aninhada).
  db.transaction = async (work: (tx: unknown) => unknown) => {
    const snapshot = new Map([...store].map(([table, list]) => [table, list.map(row => ({ ...row }))]))
    try {
      return await work(db)
    } catch (error) {
      for (const [table, list] of snapshot) store.set(table, list)
      throw error
    }
  }

  return {
    db,
    rows,
    insertRow(table: Table, values: Row): Row {
      const row = withDefaults(table, values)
      rows(table).push(row)
      return row
    },
    reset() {
      for (const table of store.keys()) store.set(table, [])
    },
  }
}

export type MemoryDb = ReturnType<typeof createMemoryDb>
