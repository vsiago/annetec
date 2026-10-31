'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  CircleAlert,
  FileCheck2,
  Handshake,
  KeyRound,
  Loader2,
  PencilLine,
  Power,
  RefreshCw,
  Send,
  Unplug,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react'
import {
  ASAAS_COMPANY_TYPE_LABELS,
  MANAGED_ACCOUNT_GENERAL_STATUS_LABELS,
  MANAGED_ACCOUNT_REQUEST_STATUS_LABELS,
  MANAGED_AUTO_DEBIT_STATUS_LABELS,
  RECEIVING_ACCOUNT_SOURCE_LABELS,
  type ManagedAccountDetail,
  type ManagedAutoDebit,
  type ManagedDebitResult,
} from '@annetec/contracts'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionHeading } from '@/components/admin-platform/ui/section-card'
import {
  ConfirmDialog,
  Field,
  LoadError,
  SuperadminOnly,
  runCommand,
  useConsoleData,
  usePlatformRole,
} from '@/components/admin-platform/billing/console-kit'
import { DebitNowDialog, TypedConfirmDialog } from '@/components/admin-platform/managed-accounts/managed-account-dialogs'
import { DEBIT_TONE, GENERAL_TONE, Pill, REQUEST_TONE } from '@/components/admin-platform/managed-accounts/managed-bits'
import { ManagedRequestCorrectionDialog } from '@/components/admin-platform/managed-accounts/managed-request-correction'
import {
  approveManagedAccountAction,
  disconnectManagedAccountAction,
  forceManagedDebitAction,
  getManagedAccountDetailAction,
  recoverManagedAccountKeyAction,
  refreshManagedAccountStatusAction,
  refuseManagedAccountAction,
  setManagedAutoDebitAction,
} from '@/lib/actions/platform-managed-accounts-api'
import { formatBRL, formatDateBR, formatDateTimeBR } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

type DialogKind = 'approve' | 'refuse' | 'recover' | 'debit' | 'disconnect' | 'auto-debit' | 'correct' | null

const OUTCOME_LABEL: Record<ManagedDebitResult['outcome'], string> = {
  concluida: 'Débito concluído',
  em_andamento: 'Débito em andamento',
  falhou: 'Débito não realizado',
  ignorada: 'Nada a debitar',
}

const OUTCOME_CLASS: Record<ManagedDebitResult['outcome'], string> = {
  concluida: 'border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]',
  em_andamento: 'border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]',
  falhou: 'border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]',
  ignorada: 'border-[#E4E7EC] bg-[#F2F4F7] text-[#344054]',
}

function Block({ title, icon, children }: { title: string; icon: typeof Wallet; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeading title={title} icon={icon} />
      {children}
    </section>
  )
}

function DebitsTable({ debits }: { debits: ManagedAutoDebit[] }) {
  if (debits.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">Nenhum débito tentado ainda.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-136 border-collapse text-sm">
        <caption className="sr-only">Histórico de débitos do saldo</caption>
        <thead>
          <tr className="bg-[#F6F8FB] text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#475467]">
            <th scope="col" className="px-3 py-2">Data</th>
            <th scope="col" className="px-3 py-2">Fatura</th>
            <th scope="col" className="px-3 py-2 text-right">Valor</th>
            <th scope="col" className="px-3 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {debits.map(debit => (
            <tr key={debit.id} className="border-t border-[#EDF1F6] align-top">
              <td className="whitespace-nowrap px-3 py-2">
                {formatDateTimeBR(debit.startedAt)}
                <span className="block text-xs text-muted-foreground">
                  tentativa {debit.attempt} · {debit.source === 'manual' ? 'manual' : 'automática'}
                </span>
              </td>
              <td className="px-3 py-2">
                {debit.chargeDescription ?? 'Fatura'}
                {debit.chargeDueDate && (
                  <span className="block text-xs text-muted-foreground">vencimento {formatDateBR(debit.chargeDueDate)}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatBRL(debit.amount)}
                {debit.balance !== null && (
                  <span className="block text-xs text-muted-foreground">saldo {formatBRL(debit.balance)}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <Pill tone={DEBIT_TONE[debit.status]}>{MANAGED_AUTO_DEBIT_STATUS_LABELS[debit.status]}</Pill>
                {debit.failureReason && <span className="mt-1 block text-xs text-muted-foreground">{debit.failureReason}</span>}
                {debit.refundRequired && (
                  <span className="mt-1 block text-xs font-semibold text-[#B42318]">
                    A fatura já estava paga: devolver o valor ao clube.
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Gaveta do detalhe de uma conta gerenciada: pedido com aceite, subconta
 * (saldo, documentos), débito automático e as ações do superadmin.
 */
export function ManagedAccountSheet({
  orgId,
  onClose,
  onChanged,
}: {
  orgId: string | null
  onClose: () => void
  /** Algo mudou: a lista precisa reler. */
  onChanged: () => void
}) {
  const { isSuperadmin } = usePlatformRole()
  const { data, error, loading, reload, setData } = useConsoleData(
    orgId ? () => getManagedAccountDetailAction(orgId) : null,
    [orgId],
  )
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [debitResult, setDebitResult] = useState<ManagedDebitResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    setDebitResult(null)
    setDialog(null)
  }, [orgId])

  const detail = data && data.organizationId === orgId ? data : null
  const request = detail?.request ?? null
  const account = detail?.account
  const managed = account?.managed ?? null
  const isManagedConnected = Boolean(account?.connected && account.source === 'subaccount')
  const canDecide = request?.status === 'pendente' || request?.status === 'falhou'
  // Correção dos dados: só antes de existir subconta no Asaas (a API confere de novo).
  const canCorrect = canDecide && !detail?.asaasAccountId

  function apply(next: ManagedAccountDetail | null): boolean {
    if (!next) return false
    setData(next)
    onChanged()
    return true
  }

  async function refreshStatus() {
    if (!orgId || busy) return
    setBusy('status')
    apply(await runCommand(refreshManagedAccountStatusAction(orgId), 'Situação atualizada'))
    setBusy(null)
  }

  return (
    <Sheet open={!!orgId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{detail ? detail.tenantName : 'Conta gerenciada'}</SheetTitle>
          <SheetDescription>
            {detail ? `/${detail.tenantSlug}` : 'Carregando…'}
            {request && ` · ${MANAGED_ACCOUNT_REQUEST_STATUS_LABELS[request.status]}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-7 p-4">
          {!detail && loading ? (
            <div className="space-y-3" role="status" aria-busy="true">
              <span className="sr-only">Carregando a conta…</span>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : error && !detail ? (
            <LoadError message={error} onRetry={() => reload()} />
          ) : detail && account ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {canDecide && (
                  <SuperadminOnly isSuperadmin={isSuperadmin}>
                    <Button className="gap-2" onClick={() => setDialog('approve')}>
                      <UserCheck className="h-4 w-4" aria-hidden="true" />
                      Aprovar e criar a conta
                    </Button>
                  </SuperadminOnly>
                )}
                {canCorrect && (
                  <SuperadminOnly isSuperadmin={isSuperadmin}>
                    <Button variant="outline" className="gap-2" onClick={() => setDialog('correct')}>
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      Corrigir dados
                    </Button>
                  </SuperadminOnly>
                )}
                {canDecide && (
                  <SuperadminOnly isSuperadmin={isSuperadmin}>
                    <Button variant="outline" className="gap-2" onClick={() => setDialog('refuse')}>
                      <UserX className="h-4 w-4" aria-hidden="true" />
                      Recusar pedido
                    </Button>
                  </SuperadminOnly>
                )}
                {detail.keyRecoveryNeeded && (
                  <SuperadminOnly isSuperadmin={isSuperadmin}>
                    <Button className="gap-2" onClick={() => setDialog('recover')}>
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      Recuperar chave
                    </Button>
                  </SuperadminOnly>
                )}
                {isManagedConnected && (
                  <>
                    <SuperadminOnly isSuperadmin={isSuperadmin}>
                      <Button variant="outline" className="gap-2" onClick={() => void refreshStatus()} disabled={busy !== null}>
                        {busy === 'status' ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        )}
                        Atualizar status
                      </Button>
                    </SuperadminOnly>
                    <SuperadminOnly isSuperadmin={isSuperadmin}>
                      <Button variant="outline" className="gap-2" onClick={() => setDialog('auto-debit')}>
                        <Power className="h-4 w-4" aria-hidden="true" />
                        {managed?.autoDebitEnabled ? 'Desligar débito automático' : 'Ligar débito automático'}
                      </Button>
                    </SuperadminOnly>
                    <SuperadminOnly isSuperadmin={isSuperadmin}>
                      <Button variant="outline" className="gap-2" onClick={() => setDialog('debit')}>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        Debitar agora
                      </Button>
                    </SuperadminOnly>
                    <SuperadminOnly isSuperadmin={isSuperadmin}>
                      <Button variant="outline" className="gap-2 text-[#B42318]" onClick={() => setDialog('disconnect')}>
                        <Unplug className="h-4 w-4" aria-hidden="true" />
                        Desconectar conta
                      </Button>
                    </SuperadminOnly>
                  </>
                )}
              </div>

              {!isSuperadmin && (
                <p className="m-0 text-xs text-muted-foreground">
                  Você pode consultar. Aprovar, corrigir, recusar e debitar é só com o superadmin.
                </p>
              )}

              {debitResult && (
                <div role="status" className={cn('space-y-1 rounded-xl border px-4 py-3 text-sm', OUTCOME_CLASS[debitResult.outcome])}>
                  <p className="m-0 font-semibold">{OUTCOME_LABEL[debitResult.outcome]}</p>
                  <p className="m-0">{debitResult.message}</p>
                  {debitResult.debit && (
                    <p className="m-0 text-xs">
                      {formatBRL(debitResult.debit.amount)} · {MANAGED_AUTO_DEBIT_STATUS_LABELS[debitResult.debit.status]}
                      {debitResult.debit.failureReason ? ` · ${debitResult.debit.failureReason}` : ''}
                    </p>
                  )}
                </div>
              )}

              {detail.keyRecoveryNeeded && (
                <div className="flex items-start gap-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-sm text-[#B54708]">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="m-0">
                    A subconta foi criada no Asaas, mas a chave dela não foi gravada. Use &quot;Recuperar chave&quot; para
                    concluir a conexão.
                  </p>
                </div>
              )}

              {request?.lastError && (
                <div className="flex items-start gap-2 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="m-0">Último erro: {request.lastError}</p>
                </div>
              )}

              <Block title="Pedido do clube" icon={Handshake}>
                {request ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={REQUEST_TONE[request.status]}>{MANAGED_ACCOUNT_REQUEST_STATUS_LABELS[request.status]}</Pill>
                      <span className="text-xs text-muted-foreground">
                        enviado em {formatDateTimeBR(request.createdAt)}
                        {request.decidedAt ? ` · decidido em ${formatDateTimeBR(request.decidedAt)}` : ''}
                      </span>
                    </div>
                    {request.refuseReason && <Field label="Motivo da recusa">{request.refuseReason}</Field>}
                    {request.corrections.length > 0 && (
                      <div className="space-y-1 rounded-xl border border-[#B2DDFF] bg-[#EFF8FF] px-4 py-3 text-sm text-[#175CD3]">
                        <p className="m-0 font-semibold">Dados corrigidos pela ANNETEC antes da aprovação</p>
                        <ul className="m-0 list-none space-y-0.5 p-0 text-[13px]">
                          {request.corrections.map(item => (
                            <li key={item.at}>
                              {formatDateTimeBR(item.at)}
                              {item.byName ? ` · ${item.byName}` : ''}: {item.fields.join(', ')}
                            </li>
                          ))}
                        </ul>
                        <p className="m-0 text-xs">O aceite do termo abaixo é o original, feito pelo clube.</p>
                      </div>
                    )}
                    <dl className="m-0 grid gap-4 sm:grid-cols-2">
                      <Field label="Nome">{request.name}</Field>
                      <Field label={request.personType === 'PF' ? 'CPF' : 'CNPJ'}>{request.cpfCnpj ?? '—'}</Field>
                      {request.personType === 'PF' ? (
                        <Field label="Nascimento">{request.birthDate ? formatDateBR(request.birthDate) : '—'}</Field>
                      ) : (
                        <Field label="Tipo de empresa">
                          {request.companyType ? ASAAS_COMPANY_TYPE_LABELS[request.companyType] : '—'}
                        </Field>
                      )}
                      <Field label="Faturamento mensal estimado">{formatBRL(request.incomeValue)}</Field>
                      <Field label="E-mail">{request.email}</Field>
                      <Field label="E-mail de login da subconta">{request.loginEmail}</Field>
                      <Field label="Celular">{request.mobilePhone}</Field>
                      <Field label="Telefone">{request.phone ?? '—'}</Field>
                      <Field label="Site">{request.site ?? '—'}</Field>
                      <Field label="Endereço" className="sm:col-span-2">
                        {request.address.street}, {request.address.number}
                        {request.address.complement ? ` — ${request.address.complement}` : ''} · {request.address.province}
                        {request.address.city
                          ? ` · ${request.address.city}${request.address.state ? `/${request.address.state}` : ''}`
                          : ''}{' '}
                        · CEP {request.address.postalCode}
                      </Field>
                    </dl>

                    <div className="space-y-2 rounded-xl border border-border bg-[#F6F8FB] p-4">
                      <p className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
                        <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                        Aceite do termo · versão {request.terms.version}
                      </p>
                      <p className="m-0 text-sm leading-relaxed text-foreground">{request.terms.text}</p>
                      <dl className="m-0 grid gap-3 sm:grid-cols-3">
                        <Field label="Quem aceitou">{request.terms.acceptedByName ?? '—'}</Field>
                        <Field label="Quando">{formatDateTimeBR(request.terms.acceptedAt)}</Field>
                        <Field label="IP">{request.terms.acceptedIp ?? '—'}</Field>
                      </dl>
                    </div>
                  </>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">Este clube nunca pediu a conta gerenciada.</p>
                )}
              </Block>

              <Block title="Subconta Asaas" icon={Wallet}>
                {account.connected ? (
                  <dl className="m-0 grid gap-4 sm:grid-cols-2">
                    <Field label="Tipo de conta">{account.source ? RECEIVING_ACCOUNT_SOURCE_LABELS[account.source] : '—'}</Field>
                    <Field label="Ambiente">
                      {account.env === 'sandbox' ? 'Sandbox' : account.env === 'production' ? 'Produção' : '—'}
                    </Field>
                    {managed && (
                      <Field label="Situação">
                        <Pill tone={GENERAL_TONE[managed.generalStatus]}>
                          {MANAGED_ACCOUNT_GENERAL_STATUS_LABELS[managed.generalStatus]}
                        </Pill>
                      </Field>
                    )}
                    <Field label="Saldo">
                      {detail.balance !== null ? (
                        <strong className="tabular-nums">{formatBRL(detail.balance)}</strong>
                      ) : (
                        <span className="text-muted-foreground">{detail.balanceError ?? 'Indisponível'}</span>
                      )}
                    </Field>
                    <Field label="ID da subconta">{detail.asaasAccountId ?? '—'}</Field>
                    <Field label="Carteira (walletId)">{detail.walletId ?? '—'}</Field>
                    <Field label="Chave de API">{account.keyHint ? `termina em …${account.keyHint}` : '—'}</Field>
                    <Field label="Webhook">{account.webhookStatus ?? '—'}</Field>
                    <Field label="Assinaturas de associados vinculadas">{detail.linkedSubscriptions}</Field>
                    <Field label="Conectada em">{account.connectedAt ? formatDateTimeBR(account.connectedAt) : '—'}</Field>
                  </dl>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">
                    O clube não tem conta de recebimento conectada
                    {detail.asaasAccountId ? ` (a subconta ${detail.asaasAccountId} existe no Asaas)` : ''}.
                  </p>
                )}

                {managed && (
                  <div className="space-y-2">
                    <p className="m-0 text-sm font-semibold text-foreground">
                      Documentos{managed.pendingDocuments > 0 ? ` · ${managed.pendingDocuments} pendente(s)` : ''}
                    </p>
                    {managed.rejectReasons && (
                      <p className="m-0 text-sm text-[#B42318]">Motivo informado pelo Asaas: {managed.rejectReasons}</p>
                    )}
                    {managed.documents.length === 0 ? (
                      <p className="m-0 text-sm text-muted-foreground">Nenhum documento exigido até agora.</p>
                    ) : (
                      <ul className="m-0 list-none divide-y divide-[#EDF1F6] rounded-xl border border-border p-0">
                        {managed.documents.map(doc => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                            <span className="min-w-0">
                              {doc.title}
                              {doc.responsibleName && (
                                <span className="block text-xs text-muted-foreground">{doc.responsibleName}</span>
                              )}
                            </span>
                            <Pill
                              tone={
                                doc.status === 'APPROVED'
                                  ? 'success'
                                  : doc.status === 'REJECTED'
                                    ? 'danger'
                                    : doc.actionRequired
                                      ? 'warning'
                                      : 'neutral'
                              }
                            >
                              {doc.statusLabel}
                            </Pill>
                          </li>
                        ))}
                      </ul>
                    )}
                    {managed.documentsCheckedAt && (
                      <p className="m-0 text-xs text-muted-foreground">
                        Consultado em {formatDateTimeBR(managed.documentsCheckedAt)}
                      </p>
                    )}
                  </div>
                )}
              </Block>

              <Block title="Débito automático" icon={Send}>
                {managed && (
                  <p className="m-0 text-sm">
                    Débito automático no vencimento:{' '}
                    <strong className={managed.autoDebitEnabled ? 'text-[#067647]' : 'text-muted-foreground'}>
                      {managed.autoDebitEnabled ? 'ligado' : 'desligado'}
                    </strong>
                  </p>
                )}
                <DebitsTable debits={detail.debits} />
              </Block>

              {request && canCorrect && (
                <ManagedRequestCorrectionDialog
                  open={dialog === 'correct'}
                  onOpenChange={open => !open && setDialog(null)}
                  orgId={detail.organizationId}
                  request={request}
                  onSaved={next => {
                    apply(next)
                  }}
                />
              )}
              <ConfirmDialog
                open={dialog === 'approve'}
                onOpenChange={open => !open && setDialog(null)}
                title="Aprovar e criar a conta?"
                confirmLabel="Aprovar e criar a conta"
                description={
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Isso cria uma subconta no Asaas em nome do clube</strong>{' '}
                      {detail.tenantName}, com os dados e o aceite do termo do pedido. O clube é avisado e passa a enviar
                      os documentos.
                    </p>
                    <p>Não dá para desfazer por aqui: a subconta continua existindo no Asaas mesmo se for desconectada.</p>
                  </div>
                }
                onConfirm={async () =>
                  apply(await runCommand(approveManagedAccountAction(detail.organizationId), 'Conta criada. O clube foi avisado.'))
                }
              />
              <ConfirmDialog
                open={dialog === 'refuse'}
                onOpenChange={open => !open && setDialog(null)}
                title="Recusar o pedido?"
                confirmLabel="Recusar pedido"
                destructive
                description={
                  <p className="text-sm text-muted-foreground">
                    O clube é avisado e vê o motivo. Ele pode enviar um novo pedido depois.
                  </p>
                }
                reason={{ label: 'Motivo da recusa (o clube vê)', placeholder: 'Ex.: o CNPJ não bate com o cadastro.', minLength: 3, maxLength: 500 }}
                onConfirm={async reason =>
                  apply(await runCommand(refuseManagedAccountAction(detail.organizationId, { reason }), 'Pedido recusado'))
                }
              />
              <ConfirmDialog
                open={dialog === 'recover'}
                onOpenChange={open => !open && setDialog(null)}
                title="Recuperar a chave da subconta?"
                confirmLabel="Recuperar chave"
                description={
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      A subconta existe no Asaas, mas a chave dela não foi gravada. A recuperação pede uma chave nova ao
                      Asaas e conclui a conexão do clube.
                    </p>
                    <p>
                      Para funcionar, a conta da ANNETEC no Asaas precisa estar habilitada para{' '}
                      <strong className="text-foreground">gerenciar as chaves de API das subcontas</strong>. Se o Asaas
                      recusar, a mensagem dele aparece aqui.
                    </p>
                  </div>
                }
                onConfirm={async () =>
                  apply(await runCommand(recoverManagedAccountKeyAction(detail.organizationId), 'Chave recuperada. A conta está conectada.'))
                }
              />
              <ConfirmDialog
                open={dialog === 'auto-debit'}
                onOpenChange={open => !open && setDialog(null)}
                title={managed?.autoDebitEnabled ? 'Desligar o débito automático?' : 'Ligar o débito automático?'}
                confirmLabel={managed?.autoDebitEnabled ? 'Desligar débito automático' : 'Ligar débito automático'}
                destructive={Boolean(managed?.autoDebitEnabled)}
                description={
                  <p className="text-sm text-muted-foreground">
                    {managed?.autoDebitEnabled
                      ? 'As faturas deste clube deixam de ser debitadas do saldo e seguem por Pix ou boleto.'
                      : 'No vencimento, a fatura da ANNETEC deste clube passa a ser debitada do saldo da subconta. Sem saldo, a fatura segue por Pix ou boleto.'}
                  </p>
                }
                onConfirm={async () =>
                  apply(
                    await runCommand(
                      setManagedAutoDebitAction(detail.organizationId, !managed?.autoDebitEnabled),
                      managed?.autoDebitEnabled ? 'Débito automático desligado' : 'Débito automático ligado',
                    ),
                  )
                }
              />
              <DebitNowDialog
                open={dialog === 'debit'}
                onOpenChange={open => !open && setDialog(null)}
                orgId={detail.organizationId}
                balance={detail.balance}
                onConfirm={async chargeId => {
                  const result = await runCommand(forceManagedDebitAction(detail.organizationId, { chargeId }))
                  if (!result) return false
                  setDebitResult(result)
                  void reload({ silent: true })
                  onChanged()
                  return true
                }}
              />
              <TypedConfirmDialog
                open={dialog === 'disconnect'}
                onOpenChange={open => !open && setDialog(null)}
                title="Desconectar a conta gerenciada?"
                confirmLabel="Desconectar conta"
                expected={detail.tenantSlug}
                description={
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      O clube deixa de receber as mensalidades e novas adesões e cobranças ficam bloqueadas até conectar
                      outra conta. A API recusa se houver assinaturas de associados vinculadas.
                    </p>
                    <p>
                      <strong className="text-foreground">A subconta e o saldo continuam no Asaas</strong>: nada é apagado
                      nem transferido por esta ação.
                    </p>
                  </div>
                }
                onConfirm={async () =>
                  apply(await runCommand(disconnectManagedAccountAction(detail.organizationId), 'Conta desconectada'))
                }
              />
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
