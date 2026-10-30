'use client'

import { useState, type ReactNode } from 'react'
import {
  CircleAlert,
  CircleCheckBig,
  Clock,
  ExternalLink,
  FileUp,
  Handshake,
  Landmark,
  LoaderCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ASAAS_COMPANY_TYPE_LABELS,
  MANAGED_AUTO_DEBIT_STATUS_LABELS,
  formatBRL,
  type ClubManagedAccountStatus,
  type ClubReceivingAccount,
  type ManagedAccountRequest,
  type ManagedAutoDebit,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { listManagedDebitsAction, refreshManagedAccountAction } from '@/lib/actions/faturamento-api'
import { formatDateBR, formatDateTimeBR } from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError } from './billing-ui'
import { useActionData } from './use-action-data'

// ---------------------------------------------------------------------------
// Cartões de escolha (clube sem conta)
// ---------------------------------------------------------------------------

export function ManagedOffer({
  status,
  onRequest,
}: {
  status: ClubManagedAccountStatus | null
  onRequest: () => void
}) {
  const blocked = status ? !status.canRequest : false
  return (
    <Card className="flex h-full flex-col border-primary/30 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Handshake className="h-5 w-5 text-primary" />
            Deixar a ANNETEC gerenciar
          </CardTitle>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            Mais simples
          </span>
        </div>
        <CardDescription>A ANNETEC abre e cuida da conta de recebimento do clube.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Você não precisa entrar no Asaas nem gerar chave nenhuma.</li>
          <li>Você envia só os documentos, por um link que a conta mostra aqui.</li>
          <li>As mensalidades dos associados caem nessa conta de recebimento do clube.</li>
          <li>
            <strong className="text-foreground">No vencimento da fatura da ANNETEC, o valor é debitado automaticamente
            do saldo</strong>. Se não houver saldo, a fatura segue normal, por Pix ou boleto.
          </li>
          <li>A ANNETEC analisa o pedido e aprova antes de abrir a conta.</li>
        </ul>
        {blocked && status?.blockedReason && (
          <p
            role="note"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {status.blockedReason}
          </p>
        )}
        <div className="mt-auto">
          <Button className="w-full gap-2 sm:w-auto" onClick={onRequest} disabled={!status || blocked}>
            <Handshake className="h-4 w-4" />
            Solicitar conta gerenciada
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function OwnAccountOffer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5 text-primary" />
          Usar minha conta Asaas
        </CardTitle>
        <CardDescription>O clube já tem (ou prefere abrir) a sua própria conta no Asaas.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Você gera uma chave de API na sua conta Asaas e cola aqui.</li>
          <li>As mensalidades caem direto na sua conta; a ANNETEC não passa pelo dinheiro.</li>
          <li>A fatura da ANNETEC é paga à parte, por Pix ou boleto.</li>
        </ul>
        <div className="mt-auto">
          <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={onToggle} aria-expanded={open}>
            <Landmark className="h-4 w-4" />
            {open ? 'Ocultar o passo a passo' : 'Conectar minha conta Asaas'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pedido em análise / recusado
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function RequestSummary({ request }: { request: ManagedAccountRequest }) {
  const a = request.address
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Row label="Pedido enviado em">{formatDateTimeBR(request.createdAt)}</Row>
      <Row label="Empresa">
        {request.name}
        {request.cpfCnpj ? <span className="block text-xs font-normal text-muted-foreground">{request.cpfCnpj}</span> : null}
      </Row>
      <Row label={request.personType === 'PF' ? 'Nascimento' : 'Tipo de empresa'}>
        {request.personType === 'PF'
          ? (request.birthDate ? formatDateBR(request.birthDate) : '—')
          : request.companyType
            ? ASAAS_COMPANY_TYPE_LABELS[request.companyType]
            : '—'}
      </Row>
      <Row label="Faturamento mensal estimado">{formatBRL(request.incomeValue)}</Row>
      <Row label="E-mail de acesso">{request.loginEmail}</Row>
      <Row label="Celular">{request.mobilePhone}</Row>
      <Row label="Endereço">
        {a.street}, {a.number}
        {a.complement ? ` — ${a.complement}` : ''} · {a.province} · CEP {a.postalCode}
      </Row>
      <Row label="Termo aceito">
        Versão {request.terms.version}, em {formatDateTimeBR(request.terms.acceptedAt)}
      </Row>
    </dl>
  )
}

export function ManagedRequestCard({
  request,
  canRequest,
  blockedReason,
  onRequestAgain,
}: {
  request: ManagedAccountRequest
  canRequest: boolean
  blockedReason: string | null
  onRequestAgain: () => void
}) {
  if (request.status === 'recusado') {
    return (
      <Card className="border-destructive/30 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleAlert className="h-5 w-5 text-destructive" />
            Pedido recusado
          </CardTitle>
          <CardDescription>
            A ANNETEC não aprovou o pedido{request.decidedAt ? ` em ${formatDateTimeBR(request.decidedAt)}` : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <strong>Motivo:</strong> {request.refuseReason ?? 'Não informado.'}
          </p>
          {!canRequest && blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
          <div className="flex justify-end">
            <Button className="gap-2" onClick={onRequestAgain} disabled={!canRequest}>
              <Handshake className="h-4 w-4" />
              Enviar novo pedido
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const failed = request.status === 'falhou'
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-amber-600" />
          {failed ? 'Estamos resolvendo a abertura da conta' : 'Pedido em análise pela ANNETEC'}
        </CardTitle>
        <CardDescription>
          {failed
            ? 'Aprovamos o pedido, mas a abertura da conta não terminou. A equipe da ANNETEC já foi avisada e cuida disso: você não precisa fazer nada.'
            : request.status === 'aprovando'
              ? 'Aprovado! Estamos abrindo a conta agora. Em instantes ela aparece aqui para você enviar os documentos.'
              : 'Recebemos o pedido. Assim que a ANNETEC aprovar, a conta é aberta e você recebe um aviso para enviar os documentos.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RequestSummary request={request} />
        <p className="text-xs text-muted-foreground">
          Enquanto isso, o clube ainda não recebe mensalidades por aqui. Se preferir, conecte a sua própria conta Asaas.
        </p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Conta gerenciada criada
// ---------------------------------------------------------------------------

const DEBIT_TONE: Record<ManagedAutoDebit['status'], string> = {
  concluida:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  em_andamento:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  falhou: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
}

function DebitBadge({ debit }: { debit: ManagedAutoDebit }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        DEBIT_TONE[debit.status],
      )}
    >
      {MANAGED_AUTO_DEBIT_STATUS_LABELS[debit.status]}
    </span>
  )
}

function DebitHistory({ tenantSlug, refreshKey }: { tenantSlug: string; refreshKey: number }) {
  const debits = useActionData(() => listManagedDebitsAction(tenantSlug), [tenantSlug, refreshKey])
  if (!debits.data) {
    if (debits.error && !debits.loading) return <LoadError message={debits.error} onRetry={() => void debits.reload()} />
    return <Skeleton className="h-24 rounded-lg" />
  }
  if (debits.data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
        Nenhum débito ainda. Eles aparecem aqui quando uma fatura da ANNETEC vence.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-136 text-left text-sm">
        <caption className="sr-only">Histórico do débito automático das faturas da ANNETEC</caption>
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Data</th>
            <th scope="col" className="px-3 py-2 font-medium">Fatura</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
            <th scope="col" className="px-3 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {debits.data.map(debit => (
            <tr key={debit.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2">{formatDateTimeBR(debit.startedAt)}</td>
              <td className="px-3 py-2">
                {debit.chargeDescription ?? 'Fatura da ANNETEC'}
                {debit.chargeDueDate && (
                  <span className="block text-xs text-muted-foreground">vencimento {formatDateBR(debit.chargeDueDate)}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{formatBRL(debit.amount)}</td>
              <td className="px-3 py-2">
                <DebitBadge debit={debit} />
                {debit.status === 'falhou' && debit.failureReason && (
                  <span className="mt-1 block text-xs text-muted-foreground">{debit.failureReason}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ManagedConnected({
  tenantSlug,
  account,
  onUpdate,
}: {
  tenantSlug: string
  account: ClubReceivingAccount
  onUpdate: (account: ClubReceivingAccount) => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const managed = account.managed

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      const result = await refreshManagedAccountAction(tenantSlug)
      if (!result.success) {
        setError(result.error)
        toast.error('Não foi possível atualizar a situação', { description: result.error })
        return
      }
      onUpdate(result.data)
      setRefreshKey(key => key + 1)
      toast.success('Situação atualizada')
    } finally {
      setRefreshing(false)
    }
  }

  if (!managed) return null
  const active = managed.generalStatus === 'aprovada' && managed.pendingDocuments === 0
  const docsToSend = managed.documents.filter(doc => doc.actionRequired)
  const sandbox = account.env === 'sandbox'

  return (
    <div className="space-y-5">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              {active ? (
                <CircleCheckBig className="h-5 w-5 text-emerald-600" />
              ) : (
                <FileUp className="h-5 w-5 text-amber-600" />
              )}
              {active ? 'Conta aprovada e ativa' : 'Conta criada: envie os documentos'}
            </CardTitle>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Handshake className="h-3.5 w-3.5" />
              Gerenciada pela ANNETEC
            </span>
          </div>
          <CardDescription>
            {active
              ? 'As mensalidades dos associados caem nesta conta. Mudanças na conta são feitas pela ANNETEC.'
              : 'A conta já foi aberta. Para liberar os recebimentos, envie os documentos pedidos abaixo.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sandbox && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
              Ambiente de testes: as cobranças usam dinheiro de teste.
            </p>
          )}

          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Situação da conta">{managed.generalStatusLabel}</Row>
            <Row label="Nome da conta">{account.accountName || '—'}</Row>
            <Row label="CPF/CNPJ">{account.cpfCnpj || '—'}</Row>
            <Row label="Débito automático">
              <span className={managed.autoDebitEnabled ? 'text-emerald-700 dark:text-emerald-300' : undefined}>
                {managed.autoDebitEnabled ? 'Ligado' : 'Desligado'}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {managed.autoDebitEnabled
                  ? 'No vencimento da fatura da ANNETEC, o valor sai do saldo desta conta.'
                  : 'As faturas da ANNETEC são pagas por Pix ou boleto.'}{' '}
                Quem liga ou desliga é a ANNETEC.
              </span>
            </Row>
            <Row label="Último débito">
              {managed.lastDebit ? (
                <span className="space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {formatBRL(managed.lastDebit.amount)} <DebitBadge debit={managed.lastDebit} />
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {formatDateTimeBR(managed.lastDebit.startedAt)}
                    {managed.lastDebit.status === 'falhou' && managed.lastDebit.failureReason
                      ? ` · ${managed.lastDebit.failureReason}`
                      : ''}
                  </span>
                </span>
              ) : (
                'Nenhum ainda'
              )}
            </Row>
            <Row label="Última verificação">
              {managed.documentsCheckedAt ? formatDateTimeBR(managed.documentsCheckedAt) : 'Ainda não verificada'}
            </Row>
          </dl>

          {managed.rejectReasons && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {managed.rejectReasons}
            </p>
          )}

          <section aria-labelledby="mg-docs" className="space-y-2 border-t border-border pt-4">
            <h3 id="mg-docs" className="text-sm font-semibold text-foreground">
              Documentos
            </h3>
            {managed.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum documento pedido até agora. Clique em &quot;Atualizar situação&quot; para conferir.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {managed.documents.map(doc => (
                  <li key={doc.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{doc.title}</p>
                      {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                      {doc.responsibleName && (
                        <p className="text-xs text-muted-foreground">Responsável: {doc.responsibleName}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          doc.status === 'APPROVED'
                            ? DEBIT_TONE.concluida
                            : doc.actionRequired
                              ? doc.status === 'REJECTED'
                                ? DEBIT_TONE.falhou
                                : DEBIT_TONE.em_andamento
                              : 'border-border bg-muted text-muted-foreground',
                        )}
                      >
                        {doc.statusLabel}
                      </span>
                      {doc.actionRequired && doc.onboardingUrl && (
                        <Button asChild size="sm" className="gap-1.5">
                          <a href={doc.onboardingUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Enviar documento
                            <span className="sr-only"> (abre em nova aba)</span>
                          </a>
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {docsToSend.length > 0 && (
              <p className="text-xs text-muted-foreground">
                O envio é feito pelo link seguro do nosso parceiro de pagamentos. Depois de enviar, volte e clique em
                &quot;Atualizar situação&quot;.
              </p>
            )}
          </section>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Para trocar ou desconectar esta conta, fale com a ANNETEC: as mudanças são feitas por ela.
            </p>
            <Button variant="outline" className="gap-2" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refreshing ? 'Atualizando…' : 'Atualizar situação'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-primary" />
            Histórico de débitos
          </CardTitle>
          <CardDescription>
            Cada vez que uma fatura da ANNETEC vence, o valor é debitado do saldo da conta. Se não houver saldo, a fatura
            segue por Pix ou boleto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DebitHistory tenantSlug={tenantSlug} refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  )
}
