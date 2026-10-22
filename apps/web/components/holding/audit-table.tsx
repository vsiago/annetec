'use client'

import Link from 'next/link'
import type { AuditEntry } from '@annetec/contracts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  auditActionLabel,
  auditMetadataSummary as metadataSummary,
  auditReason,
  formatDateTimeBR,
  isLifecycleAudit,
} from '@/lib/adapters/holding'
import { SoftBadge } from './holding-ui'

/**
 * Trilha de auditoria (`audit_logs` + nome do inquilino e do ator). Ações de
 * ciclo de vida ganham destaque; o motivo gravado aparece na própria linha e
 * os dados completos ficam em "dados".
 */
export function AuditTable({
  entries,
  showTenant = true,
  showIp = true,
  className,
}: {
  entries: AuditEntry[]
  showTenant?: boolean
  showIp?: boolean
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border', className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-40">Quando</TableHead>
            {showTenant && <TableHead>Inquilino</TableHead>}
            <TableHead>Ação</TableHead>
            <TableHead className="min-w-55">Motivo e detalhes</TableHead>
            <TableHead>Quem</TableHead>
            {showIp && <TableHead>IP</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(entry => {
            const reason = auditReason(entry)
            const summary = metadataSummary(entry)
            return (
              <TableRow key={entry.id} className="align-top">
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatDateTimeBR(entry.createdAt)}
                </TableCell>
                {showTenant && (
                  <TableCell className="max-w-50 text-sm">
                    {entry.organizationId && entry.tenantName ? (
                      <Link href={`/admin/holding/${entry.organizationId}`} className="block truncate hover:underline">
                        {entry.tenantName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{entry.tenantName ?? 'Plataforma'}</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="max-w-65 whitespace-normal">
                  <div className="space-y-0.5">
                    {isLifecycleAudit(entry) ? (
                      <SoftBadge tone={entry.action.endsWith('reactivate') || entry.action.endsWith('clear_override') ? 'positive' : 'warning'}>
                        {auditActionLabel(entry.action)}
                      </SoftBadge>
                    ) : (
                      <p className="text-sm text-foreground">{auditActionLabel(entry.action)}</p>
                    )}
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {entry.action}
                      {entry.resource ? ` · ${entry.resource}` : ''}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="max-w-90 whitespace-normal text-sm">
                  {reason ? <p className="text-foreground">“{reason}”</p> : null}
                  {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none hover:text-foreground">dados</summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed text-foreground">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                  {!reason && !summary && (!entry.metadata || Object.keys(entry.metadata).length === 0) && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  <p>{entry.actorName ?? 'Sistema'}</p>
                  {entry.actorScope && (
                    <p className="text-xs text-muted-foreground">
                      {entry.actorScope === 'platform' ? 'Equipe ANNETEC' : 'Equipe do inquilino'}
                    </p>
                  )}
                </TableCell>
                {showIp && (
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{entry.ip ?? '—'}</TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
