'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, ExternalLink, FileSearch, Mail } from 'lucide-react'
import type { PlatformEmail } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, Pill, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { getPlatformEmailAction } from '@/lib/actions/platform-emails-api'
import { emailStatusMeta, emailTemplateLabel, formatDateTimeBR } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Prévia de um e-mail da caixa de saída: cabeçalho, versão HTML renderizada
 * num iframe isolado (`sandbox` sem scripts nem mesma origem — o HTML é
 * gerado pela API, mas quem vê é o console) e a versão texto.
 */

/** Links do e-mail abrem em nova aba — dentro do iframe isolado não navegam. */
function htmlDocument(html: string): string {
  const base = '<base target="_blank">'
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
  return `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`
}

export function EmailPreview({ email, className }: { email: PlatformEmail; className?: string }) {
  const [view, setView] = useState<'html' | 'text'>(email.bodyHtml ? 'html' : 'text')
  const status = emailStatusMeta(email.status)

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold leading-snug text-foreground">{email.subject}</h2>
          <Pill meta={status} />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Para</dt>
          <dd className="min-w-0 break-words text-foreground">
            {email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail}
          </dd>
          <dt className="text-muted-foreground">Modelo</dt>
          <dd className="text-foreground">{emailTemplateLabel(email.template)}</dd>
          <dt className="text-muted-foreground">Registrado em</dt>
          <dd className="text-foreground">
            {formatDateTimeBR(email.createdAt)}
            {email.sentAt ? ` · enviado ${formatDateTimeBR(email.sentAt)}` : ''}
            {' · '}
            {email.provider === 'outbox' ? 'somente caixa de saída (modo demonstração)' : `via ${email.provider}`}
          </dd>
        </dl>
        {email.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Falha no envio: {email.error}
          </p>
        )}
        {(email.proposalId || email.organizationId) && (
          <div className="flex flex-wrap gap-3 text-xs">
            {email.proposalId && (
              <Link href={`/admin/compliance/${email.proposalId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <FileSearch className="h-3.5 w-3.5" />
                Ver proposta
              </Link>
            )}
            {email.organizationId && (
              <Link
                href={`/admin/inquilinos/${email.organizationId}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" />
                Ver inquilino
              </Link>
            )}
          </div>
        )}
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {(['html', 'text'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              disabled={option === 'html' && !email.bodyHtml}
              className={cn(
                'rounded-md px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                view === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option === 'html' ? 'Visualização' : 'Texto puro'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 pt-4">
        {view === 'html' && email.bodyHtml ? (
          <iframe
            title={`E-mail: ${email.subject}`}
            srcDoc={htmlDocument(email.bodyHtml)}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            className="h-[60vh] w-full rounded-lg border border-border bg-white"
          />
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-sans text-sm leading-relaxed text-foreground">
            {email.bodyText}
          </pre>
        )}
      </div>
    </div>
  )
}

export function EmailPreviewSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-[40vh] w-full rounded-lg" />
    </div>
  )
}

/** Abre um e-mail pelo id (usado no detalhe da proposta e nas abas do inquilino). */
export function EmailPreviewDialog({
  emailId,
  onOpenChange,
}: {
  emailId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { data, error, loading, reload } = useConsoleData(
    emailId ? () => getPlatformEmailAction(emailId) : null,
    [emailId],
  )

  return (
    <Dialog open={!!emailId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>E-mail da caixa de saída</DialogTitle>
          <DialogDescription>Prévia do e-mail enviado pela plataforma</DialogDescription>
        </DialogHeader>
        {loading && !data ? (
          <EmailPreviewSkeleton />
        ) : error ? (
          <LoadError message={error} onRetry={() => reload()} />
        ) : data ? (
          <EmailPreview key={data.id} email={data} />
        ) : null}
        {data && (
          <Link
            href={`/admin/emails?email=${data.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Mail className="h-3.5 w-3.5" />
            Abrir na caixa de saída
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </DialogContent>
    </Dialog>
  )
}
