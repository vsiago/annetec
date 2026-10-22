import type { ClubReceiptItem, ClubReceiptsPage, ListClubReceiptsQuery } from '@annetec/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { AppError } from '@/http/errors'
import { asCardBrand } from './presenter'
import {
  buildReceiptsTotals,
  decodeReceiptsCursor,
  encodeReceiptsCursor,
  resolveReceiptsPeriod,
} from './receipts.rules'

/**
 * `GET /faturamento/recebimentos` — movimentações de dinheiro do clube num
 * período: cada pagamento confirmado (pela data do pagamento) e cada estorno
 * (pela data do estorno). Fonte: `club_charges` — `paid_at`/`paid_amount` e
 * `refunded_at`. Período em datas de São Paulo, convertido para instantes no
 * SQL (o índice `club_charges_org_paid_idx` cobre o filtro principal).
 */

const TZ = 'America/Sao_Paulo'

type Row = Record<string, unknown>

const rowsOf = (result: unknown) => result as Row[]
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100

export const receiptsService = {
  async list(orgId: string, query: ListClubReceiptsQuery, now = new Date()): Promise<ClubReceiptsPage> {
    const period = resolveReceiptsPeriod(query, now)
    if ('error' in period) throw AppError.validation([{ path: 'from', message: period.error }])
    const cursor = query.cursor ? decodeReceiptsCursor(query.cursor) : null
    if (query.cursor && !cursor) throw AppError.validation([{ path: 'cursor', message: 'Cursor inválido' }])

    const { from, to } = period
    // [início do dia `from`, início do dia seguinte a `to`) no fuso de SP.
    const start = sql`(${from}::date::timestamp at time zone ${TZ})`
    const end = sql`((${to}::date + 1)::timestamp at time zone ${TZ})`
    const methodFilter: SQL = query.method ? sql`and c.method = ${query.method}` : sql``
    const cursorFilter: SQL = cursor
      ? sql`where (m.occurred_at, m.key) < (${cursor.at}::timestamptz, ${cursor.key})`
      : sql``

    const [itemsResult, totalsResult, dailyResult] = await Promise.all([
      db.execute(sql`
        with m as (
          select c.id::text || ':received' as key, 'received' as kind, c.id as charge_id, c.paid_at as occurred_at,
            coalesce(c.paid_amount, c.amount) as amount, c.method, c.card_brand, c.card_last4,
            c.subscription_id, c.due_date, c.kind, c.description, s.holder_name, s.plan_name
          from club_charges c
          join club_subscriptions s on s.id = c.subscription_id
          where c.organization_id = ${orgId}
            and c.status in ('paid', 'refunded')
            and c.paid_at >= ${start} and c.paid_at < ${end}
            ${methodFilter}
          union all
          select c.id::text || ':refunded', 'refunded', c.id, c.refunded_at,
            coalesce(c.paid_amount, c.amount), c.method, c.card_brand, c.card_last4,
            c.subscription_id, c.due_date, c.kind, c.description, s.holder_name, s.plan_name
          from club_charges c
          join club_subscriptions s on s.id = c.subscription_id
          where c.organization_id = ${orgId}
            and c.status = 'refunded'
            and c.refunded_at >= ${start} and c.refunded_at < ${end}
            ${methodFilter}
        )
        select m.*,
          to_char(m.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at,
          to_char(m.due_date, 'YYYY-MM-DD') as due
        from m
        ${cursorFilter}
        order by m.occurred_at desc, m.key desc
        limit ${query.limit + 1}`),
      db.execute(sql`
        select
          coalesce(sum(coalesce(c.paid_amount, c.amount)) filter (
            where c.status in ('paid', 'refunded') and c.paid_at >= ${start} and c.paid_at < ${end}), 0) as received,
          count(*) filter (
            where c.status in ('paid', 'refunded') and c.paid_at >= ${start} and c.paid_at < ${end})::int as received_count,
          coalesce(sum(coalesce(c.paid_amount, c.amount)) filter (
            where c.status = 'refunded' and c.refunded_at >= ${start} and c.refunded_at < ${end}), 0) as refunded,
          count(*) filter (
            where c.status = 'refunded' and c.refunded_at >= ${start} and c.refunded_at < ${end})::int as refunded_count,
          coalesce(sum(c.amount) filter (
            where c.status in ('pending', 'overdue', 'failed') and c.due_date >= ${from}::date and c.due_date <= ${to}::date), 0) as receivable,
          count(*) filter (
            where c.status in ('pending', 'overdue', 'failed') and c.due_date >= ${from}::date and c.due_date <= ${to}::date)::int as receivable_count
        from club_charges c
        where c.organization_id = ${orgId}
          ${methodFilter}`),
      // Só na primeira página: as seguintes reaproveitam o que a tela já tem.
      cursor
        ? Promise.resolve([])
        : db.execute(sql`
            select to_char(c.paid_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
              coalesce(sum(coalesce(c.paid_amount, c.amount)), 0) as amount
            from club_charges c
            where c.organization_id = ${orgId}
              and c.status in ('paid', 'refunded')
              and c.paid_at >= ${start} and c.paid_at < ${end}
              ${methodFilter}
            group by 1
            order by 1`),
    ])

    const rows = rowsOf(itemsResult)
    const hasMore = rows.length > query.limit
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows
    const last = pageRows[pageRows.length - 1]
    const totals = rowsOf(totalsResult)[0] ?? {}

    return {
      from,
      to,
      items: pageRows.map(toReceiptItem),
      totals: buildReceiptsTotals({
        received: totals.received,
        receivedCount: totals.received_count,
        refunded: totals.refunded,
        refundedCount: totals.refunded_count,
        receivable: totals.receivable,
        receivableCount: totals.receivable_count,
      }),
      daily: rowsOf(dailyResult).map(row => ({ date: String(row.day), amount: money(row.amount) })),
      nextCursor:
        hasMore && last ? encodeReceiptsCursor({ at: String(last.cursor_at), key: String(last.key) }) : null,
    }
  },
}

function toReceiptItem(row: Row): ClubReceiptItem {
  const last4 = typeof row.card_last4 === 'string' && /^\d{4}$/.test(row.card_last4) ? row.card_last4 : null
  const occurred = row.occurred_at instanceof Date ? row.occurred_at : new Date(String(row.occurred_at))
  return {
    id: String(row.key),
    kind: row.kind === 'refunded' ? 'refunded' : 'received',
    chargeId: String(row.charge_id),
    subscriptionId: String(row.subscription_id),
    occurredAt: occurred.toISOString(),
    holderName: String(row.holder_name ?? ''),
    planName: String(row.plan_name ?? ''),
    chargeKind: row.kind === 'one_off' ? 'one_off' : 'cycle',
    description: String(row.description ?? ''),
    method: row.method as ClubReceiptItem['method'],
    card: last4 ? { brand: asCardBrand(row.card_brand as string | null), last4, expiry: null } : null,
    amount: money(row.amount),
    dueDate: String(row.due),
  }
}
