'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Inbox, Mail, MailOpen, RefreshCw, Search, X } from 'lucide-react'
import type { EmailStatus, EmailTemplate, PlatformEmailListItem } from '@annetec/contracts'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { FilterSelect, SearchInput, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { Pill, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import {
  EmailPreview,
  EmailPreviewDialog,
  EmailPreviewSkeleton,
} from '@/components/admin-platform/emails/email-preview'
import { getPlatformEmailAction, listPlatformEmailsAction } from '@/lib/actions/platform-emails-api'
import {
  EMAIL_STATUS_OPTIONS,
  EMAIL_TEMPLATE_OPTIONS,
  emailStatusMeta,
  emailTemplateLabel,
  formatDateTimeBR,
  formatRelative,
} from '@/lib/adapters/platform-console'
import { replaceQuery } from '@/lib/replace-query'
import { cn } from '@/lib/utils'

/**
 * E-mails enviados pela plataforma (blueprint §Q4): todo e-mail transacional da
 * ANNETEC — contratação, boas-vindas com a senha provisória, faturas e lembretes
 * de cobrança. Responde, no suporte, se o e-mail chegou para o clube.
 */

const CHIP_FILTRO =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-secondary hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2'

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function useWideScreen(): boolean {
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return wide
}

function EmailRow({
  email,
  active,
  onSelect,
}: {
  email: PlatformEmailListItem
  active: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary',
          active ? 'bg-accent ring-1 ring-inset ring-secondary/30' : 'hover:bg-accent/30',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {email.toName ? `${email.toName} · ` : ''}
            {email.toEmail}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground" title={formatDateTimeBR(email.createdAt)}>
            {formatRelative(email.createdAt)}
          </span>
        </div>
        <p className={cn('m-0 truncate text-sm', active ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>{email.subject}</p>
        <p className="m-0 line-clamp-1 text-xs text-muted-foreground">{email.preview}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-lg bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{emailTemplateLabel(email.template)}</span>
          <Pill meta={emailStatusMeta(email.status)} className="px-2 py-0 text-[11px]" />
        </div>
      </button>
    </li>
  )
}

function PreviewPane({ emailId }: { emailId: string | null }) {
  const { data, error, loading, reload } = useConsoleData(emailId ? () => getPlatformEmailAction(emailId) : null, [emailId])

  if (!emailId) {
    return (
      <EmptyState
        icon={MailOpen}
        title="Selecione um e-mail"
        description="A prévia mostra o e-mail como o destinatário recebe, em HTML e em texto."
        className="py-16"
      />
    )
  }
  if (error && !data) {
    return (
      <ErrorState
        size="sm"
        framed={false}
        title="Não foi possível abrir o e-mail"
        description={error}
        onRetry={() => reload()}
      />
    )
  }
  if (loading || !data || data.id !== emailId) return <EmailPreviewSkeleton />
  return <EmailPreview key={data.id} email={data} />
}

function EmailsEnviados() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = searchParams.get('email')
  const proposalId = searchParams.get('proposalId')
  const organizationId = searchParams.get('organizationId')
  const wide = useWideScreen()

  const [search, setSearch] = useState('')
  const [template, setTemplate] = useState<'all' | EmailTemplate>('all')
  const [status, setStatus] = useState<'all' | EmailStatus>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const [live, setLive] = useState(false)
  const q = useDebounced(search)

  const list = useConsoleData(
    () =>
      listPlatformEmailsAction({
        q: q || undefined,
        template: template === 'all' ? undefined : template,
        status: status === 'all' ? undefined : status,
        proposalId: proposalId ?? undefined,
        organizationId: organizationId ?? undefined,
        page,
        perPage: Number(perPage),
      }),
    [q, template, status, proposalId, organizationId, page, perPage],
  )

  useEffect(() => setPage(1), [q, template, status, proposalId, organizationId, perPage])

  // "Ao vivo": acompanha os e-mails chegando, sem precisar atualizar a lista.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => void list.reload({ silent: true }), 8000)
    return () => clearInterval(timer)
  }, [live, list.reload])

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const query = params.toString()
    replaceQuery(query ? `${pathname}?${query}` : pathname)
  }

  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtered = !!q || template !== 'all' || status !== 'all' || !!proposalId || !!organizationId

  return (
    <PageContainer>
      <PageHeader
        icon={Mail}
        title="E-mails enviados"
        description="Os e-mails que a ANNETEC mandou aos clubes: contratação, acesso ao painel, faturas e lembretes de cobrança."
        actions={
          <>
            <label className="inline-flex min-h-11 items-center gap-2.5 rounded-[10px] border border-border bg-card px-3.5 text-sm font-medium text-foreground">
              <Switch checked={live} onCheckedChange={setLive} />
              Ao vivo
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[10px] px-4 font-semibold"
              onClick={() => void list.reload({ silent: true })}
              disabled={list.loading}
            >
              <RefreshCw className={cn(list.loading && 'animate-spin')} aria-hidden="true" />
              Atualizar
            </Button>
          </>
        }
      />

      {(proposalId || organizationId) && (
        <div className="flex flex-wrap gap-2">
          {proposalId && (
            <button type="button" onClick={() => setParam('proposalId', null)} className={CHIP_FILTRO}>
              Só desta proposta
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
          {organizationId && (
            <button type="button" onClick={() => setParam('organizationId', null)} className={CHIP_FILTRO}>
              Só deste clube
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <SectionCard padded={false} className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por destinatário ou assunto" className="sm:min-w-0" />
            <div className="grid grid-cols-2 gap-2 [&_button]:sm:w-full">
              <FilterSelect
                label="Modelo"
                value={template}
                onChange={value => setTemplate(value as 'all' | EmailTemplate)}
                allLabel="Todos"
                options={EMAIL_TEMPLATE_OPTIONS}
              />
              <FilterSelect
                label="Situação"
                value={status}
                onChange={value => setStatus(value as 'all' | EmailStatus)}
                allLabel="Todas"
                options={EMAIL_STATUS_OPTIONS}
              />
            </div>
          </div>

          {list.error && !list.data ? (
            <ErrorState
              size="sm"
              framed={false}
              title="Não foi possível carregar os e-mails"
              description={list.error}
              onRetry={() => list.reload()}
            />
          ) : list.loading && !list.data ? (
            <div className="p-6">
              <SectionSkeleton rows={6} label="Carregando e-mails…" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={filtered ? Search : Inbox}
              title={filtered ? 'Nenhum e-mail com esses filtros' : 'Nenhum e-mail enviado ainda'}
              description={
                filtered
                  ? 'Ajuste a busca ou limpe os filtros.'
                  : 'Quando a plataforma mandar o primeiro e-mail, ele aparece aqui. Isso acontece, por exemplo, no início de uma contratação.'
              }
            />
          ) : (
            <ul className={cn('m-0 max-h-[70vh] list-none divide-y divide-border overflow-y-auto p-0', list.loading && 'opacity-60')}>
              {rows.map(email => (
                <EmailRow key={email.id} email={email} active={email.id === selected} onSelect={() => setParam('email', email.id)} />
              ))}
            </ul>
          )}

          {list.data && total > 0 && (
            <TableFooter
              page={page}
              perPage={perPage}
              total={total}
              noun="e-mails"
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          )}
        </SectionCard>

        {wide && (
          <SectionCard className="sticky top-4">
            <PreviewPane emailId={selected} />
          </SectionCard>
        )}
      </div>

      {!wide && <EmailPreviewDialog emailId={selected} onOpenChange={open => !open && setParam('email', null)} />}
    </PageContainer>
  )
}

export default function EmailsEnviadosPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <SectionCard>
            <SectionSkeleton rows={6} label="Carregando e-mails…" />
          </SectionCard>
        </PageContainer>
      }
    >
      <EmailsEnviados />
    </Suspense>
  )
}
