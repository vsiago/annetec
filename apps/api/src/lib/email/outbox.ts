import type { ListPlatformEmailsQuery, PlatformEmail, PlatformEmailListItem } from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformEmailOutbox } from '@/db/schema'
import { unsealSecrets } from './secrets'

/** Leitura da caixa de saída (console da plataforma). */
type OutboxRow = typeof platformEmailOutbox.$inferSelect

const PREVIEW_LENGTH = 160

function preview(bodyText: string): string {
  return unsealSecrets(bodyText, 'mask').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH)
}

export function toEmailListItem(row: OutboxRow): PlatformEmailListItem {
  return {
    id: row.id,
    template: row.template,
    toEmail: row.toEmail,
    toName: row.toName,
    subject: row.subject,
    provider: row.provider,
    status: row.status,
    error: row.error,
    organizationId: row.organizationId,
    proposalId: row.proposalId,
    relatedType: row.relatedType,
    relatedId: row.relatedId,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    preview: preview(row.bodyText),
  }
}

/**
 * Detalhe do e-mail. `revealSecrets` abre os segredos lacrados (senha
 * provisória) — o controller só pede isso para superadmin fora de produção;
 * e `unsealSecrets` ainda mascara em produção de qualquer jeito.
 */
export function toEmailDetail(row: OutboxRow, opts: { revealSecrets?: boolean } = {}): PlatformEmail {
  const { preview: _preview, ...base } = toEmailListItem(row)
  const mode = opts.revealSecrets ? 'reveal' : 'mask'
  return {
    ...base,
    bodyText: unsealSecrets(row.bodyText, mode),
    bodyHtml: row.bodyHtml ? unsealSecrets(row.bodyHtml, mode) : null,
  }
}

export async function listOutboxEmails(query: ListPlatformEmailsQuery): Promise<{ items: PlatformEmailListItem[]; total: number }> {
  const filters: SQL[] = []
  if (query.template) filters.push(eq(platformEmailOutbox.template, query.template))
  if (query.status) filters.push(eq(platformEmailOutbox.status, query.status))
  if (query.proposalId) filters.push(eq(platformEmailOutbox.proposalId, query.proposalId))
  if (query.organizationId) filters.push(eq(platformEmailOutbox.organizationId, query.organizationId))
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, m => `\\${m}`)}%`
    const match = or(ilike(platformEmailOutbox.toEmail, term), ilike(platformEmailOutbox.subject, term))
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(platformEmailOutbox)
      .where(where)
      .orderBy(desc(platformEmailOutbox.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(platformEmailOutbox).where(where),
  ])
  return { items: rows.map(toEmailListItem), total: total?.value ?? 0 }
}

export async function getOutboxEmail(id: string, opts: { revealSecrets?: boolean } = {}): Promise<PlatformEmail | null> {
  const [row] = await db.select().from(platformEmailOutbox).where(eq(platformEmailOutbox.id, id)).limit(1)
  return row ? toEmailDetail(row, opts) : null
}

/** E-mails de uma proposta (detalhe do compliance), mais recentes primeiro. */
export async function listProposalEmails(proposalId: string, limit = 50): Promise<PlatformEmailListItem[]> {
  const rows = await db
    .select()
    .from(platformEmailOutbox)
    .where(eq(platformEmailOutbox.proposalId, proposalId))
    .orderBy(desc(platformEmailOutbox.createdAt))
    .limit(limit)
  return rows.map(toEmailListItem)
}
