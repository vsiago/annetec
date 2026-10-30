import type { ManagedAutoDebit } from '@annetec/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { managedAccountDebits, platformCharges } from '@/db/schema'
import { debitStatusLabel } from './rules'

/** Leituras do histórico de débitos (sem dependência dos serviços — o recebimento do clube também usa). */

export type DebitRow = typeof managedAccountDebits.$inferSelect

export function debitDto(row: DebitRow, charge: { description: string | null; dueDate: string | null } | null): ManagedAutoDebit {
  return {
    id: row.id,
    chargeId: row.chargeId,
    chargeDescription: charge?.description ?? null,
    chargeDueDate: charge?.dueDate ?? null,
    attempt: row.attempt,
    status: row.status,
    statusLabel: debitStatusLabel(row.status),
    failureCode: row.failureCode ?? null,
    failureReason: row.failureReason ?? null,
    amount: Number(row.amount),
    balance: row.balance === null || row.balance === undefined ? null : Number(row.balance),
    transferId: row.transferId ?? null,
    transferStatus: row.transferStatus ?? null,
    source: row.source,
    refundRequired: Boolean(row.refundRequired),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

/** Débitos do clube, mais recentes primeiro. */
export async function listDebitsOf(orgId: string, limit = 50): Promise<ManagedAutoDebit[]> {
  const rows = await db
    .select({ debit: managedAccountDebits, description: platformCharges.description, dueDate: platformCharges.dueDate })
    .from(managedAccountDebits)
    .leftJoin(platformCharges, eq(platformCharges.id, managedAccountDebits.chargeId))
    .where(eq(managedAccountDebits.organizationId, orgId))
    .orderBy(desc(managedAccountDebits.createdAt))
    .limit(limit)
  return rows.map(row => debitDto(row.debit, { description: row.description, dueDate: row.dueDate }))
}

export async function lastDebitOf(orgId: string): Promise<ManagedAutoDebit | null> {
  const [last] = await listDebitsOf(orgId, 1)
  return last ?? null
}

/** Há débito automático em andamento (transferência possivelmente no ar) no clube. */
export async function hasRunningDebit(orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: managedAccountDebits.id })
    .from(managedAccountDebits)
    .where(and(eq(managedAccountDebits.organizationId, orgId), eq(managedAccountDebits.status, 'em_andamento')))
    .limit(1)
  return Boolean(row)
}
