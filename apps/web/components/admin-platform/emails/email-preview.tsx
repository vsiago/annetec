'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2, ExternalLink, FileSearch, Mail } from 'lucide-react'
import type { PlatformEmail } from '@annetec/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Pill, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { getPlatformEmailAction } from '@/lib/actions/platform-emails-api'
import { emailStatusMeta, emailTemplateLabel, formatDateTimeBR } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Prévia de um e-mail enviado: cabeçalho, versão HTML renderizada
 * num iframe isolado (`sandbox` sem scripts nem mesma origem — o HTML é
 * gerado pela API, mas quem vê é o console) e a versão texto.
 */

/** Links do e-mail abrem em nova aba — dentro do iframe isolado não navegam. */
function htmlDocument(html: string): string {
  const base = '<base target="_blank">'
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${base}`)
  return `<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`
}

const LINK_CLASS =
  'inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2'

export function EmailPreview({ email, className }: { email: PlatformEmail; className?: string }) {
  const [view, setView] = useState<'html' | 'text'>(email.bodyHtml ? 'html' : 'text')
  const status = emailStatusMeta(email.status)

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex flex-col gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold leading-snug text-foreground">{email.subject}</h2>
          <Pill meta={status} />
        </div>
        <dl className="m-0 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Para</dt>
          <dd className="m-0 min-w-0 break-words text-foreground">
            {email.toName ? `${email.toName} <${email.toEmail}>` : email.toEmail}
          </dd>
          <dt className="text-muted-foreground">Modelo</dt>
          <dd className="m-0 text-foreground">{emailTemplateLabel(email.template)}</dd>
          <dt className="text-muted-foreground">Registrado em</dt>
          <dd className="m-0 text-foreground">
            {formatDateTimeBR(email.createdAt)}
            {email.sentAt ? ` · enviado ${formatDateTimeBR(email.sentAt)}` : ''}
            {' · '}
            {email.provider === 'outbox' ? 'só registrado aqui, não enviado ao destinatário' : `via ${email.provider}`}
          </dd>
        </dl>
        {email.error && (
          <p className="m-0 rounded-xl border border-[#B42318]/20 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
            Falha no envio: {email.error}
          </p>
        )}
        {(email.proposalId || email.organizationId) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {email.proposalId && (
              <Link href={`/admin/compliance/${email.proposalId}`} className={LINK_CLASS}>
                <FileSearch className="size-4" aria-hidden="true" />
                Ver proposta
              </Link>
            )}
            {email.organizationId && (
              <Link href={`/admin/inquilinos/${email.organizationId}`} className={LINK_CLASS}>
                <Building2 className="size-4" aria-hidden="true" />
                Ver clube
              </Link>
            )}
          </div>
        )}
        <div className="inline-flex w-fit rounded-xl bg-muted p-1 text-sm font-medium">
          {(['html', 'text'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              disabled={option === 'html' && !email.bodyHtml}
              aria-pressed={view === option}
              className={cn(
                'min-h-10 rounded-lg px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-40',
                view === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
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
            className="h-[60vh] w-full rounded-xl border border-border bg-white"
          />
        ) : (
          <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-muted/30 p-4 font-sans text-sm leading-relaxed text-foreground">
            {email.bodyText}
          </pre>
        )}
      </div>
    </div>
  )
}

export function EmailPreviewSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Carregando o e-mail…</span>
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-[40vh] w-full rounded-xl" />
    </div>
  )
}

/** Abre um e-mail pelo id (usado no detalhe da proposta e nas abas do clube). */
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
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>E-mail enviado</DialogTitle>
          <DialogDescription>Prévia do e-mail como o destinatário recebe</DialogDescription>
        </DialogHeader>
        {loading && !data ? (
          <EmailPreviewSkeleton />
        ) : error ? (
          <ErrorState
            size="sm"
            framed={false}
            title="Não foi possível abrir o e-mail"
            description={error}
            onRetry={() => reload()}
          />
        ) : data ? (
          <EmailPreview key={data.id} email={data} />
        ) : null}
        {data && (
          <Link href={`/admin/emails?email=${data.id}`} className={cn(LINK_CLASS, 'text-muted-foreground hover:text-foreground')}>
            <Mail className="size-4" aria-hidden="true" />
            Abrir em E-mails enviados
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </DialogContent>
    </Dialog>
  )
}
