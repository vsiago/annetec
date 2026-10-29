'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
  Building2,
  CircleCheck,
  CircleX,
  ClipboardList,
  FileStack,
  Hand,
  History,
  Loader2,
  Mail,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Rocket,
  ShieldQuestion,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  ONBOARDING_SECTION_LABELS,
  type OnboardingProposalDetail,
  type PendingRequestItem,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import {
  ConfirmDialog,
  LoadError,
  runCommand,
  usePlatformRole,
  useConsoleData,
} from '@/components/admin-platform/billing/console-kit'
import { ActivationCard } from '@/components/admin-platform/compliance/activation-card'
import { ChecklistPanel } from '@/components/admin-platform/compliance/checklist-panel'
import { CommercialPanel, DecisionNotes } from '@/components/admin-platform/compliance/commercial-panel'
import { CompanyPanel } from '@/components/admin-platform/compliance/company-panel'
import {
  APPROVAL_CONSEQUENCE,
  CANCELABLE_STATUSES,
  DECIDABLE_STATUSES,
  LOAD_ERROR_MESSAGE,
  REVIEWABLE_STATUSES,
  ProposalStatusPill,
  SlaBadge,
  approvalReadiness,
  proposalName,
  proposalSla,
  proposalStatusLabel,
} from '@/components/admin-platform/compliance/compliance-ui'
import {
  ApproveDialog,
  PendingInfoDialog,
  ProvisionDialog,
  ReadinessList,
} from '@/components/admin-platform/compliance/decision-dialogs'
import { DocumentViewer } from '@/components/admin-platform/compliance/document-viewer'
import { DocumentsPanel, orderedDocuments } from '@/components/admin-platform/compliance/documents-panel'
import { PeoplePanel } from '@/components/admin-platform/compliance/people-panel'
import { PrecheckPanel } from '@/components/admin-platform/compliance/precheck-panel'
import { ProposalEmails, ProposalTimeline } from '@/components/admin-platform/compliance/proposal-timeline'
import { EmailPreviewDialog } from '@/components/admin-platform/emails/email-preview'
import {
  cancelOnboardingAction,
  claimOnboardingProposalAction,
  getOnboardingProposalAction,
  rejectOnboardingAction,
  rerunOnboardingPrechecksAction,
} from '@/lib/actions/platform-onboarding-api'
import { formatCnpj, formatDateTimeBR, formatRelative } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Análise de um clube em Aprovações (blueprint §Q4, roteiro §F passo 3):
 * assumir a análise → revisar os documentos → conferir os itens → aprovar.
 * Cada comando devolve o detalhe inteiro e a tela troca o estado de uma vez.
 */

/** De onde veio o cadastro. "Demonstração" só aparece quando o dado é mesmo de demonstração (`seed`). */
const SOURCE_LABEL: Record<OnboardingProposalDetail['source'], string> = {
  site: 'Cadastro pelo site',
  console: 'Cadastro feito pela equipe',
  seed: 'Demonstração',
}

/** Status em que o pagamento/liberação ainda anda sozinho (a tela acompanha). */
const IN_FLIGHT = ['approved', 'awaiting_payment', 'provisioning']

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}

function ReadinessChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
      )}
    >
      {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  )
}

export default function ComplianceProposalPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const { isSuperadmin, user } = usePlatformRole()
  const { data: proposal, error, loading, reload, setData } = useConsoleData(() => getOnboardingProposalAction(id), [id])

  const [tab, setTab] = useState('analise')
  const [viewerDoc, setViewerDoc] = useState<string | null>(null)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [pendingItems, setPendingItems] = useState<PendingRequestItem[] | undefined>(undefined)
  const [approveOpen, setApproveOpen] = useState(false)
  const [confirm, setConfirm] = useState<'reject' | 'cancel' | null>(null)
  const [provisionOpen, setProvisionOpen] = useState(false)
  const [emailId, setEmailId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'claim' | 'prechecks' | null>(null)
  const [tracking, setTracking] = useState(0)
  const lastStatus = useRef<string | null>(null)

  const onUpdated = (detail: OnboardingProposalDetail) => setData(detail)

  // Depois do pagamento simulado (ou da liberação manual) a API anda sozinha:
  // `awaiting_payment → provisioning → active`. A tela acompanha por alguns
  // segundos em vez de pedir para a pessoa recarregar.
  useEffect(() => {
    if (tracking === 0) return
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      void reload({ silent: true })
      if (attempts >= 12) clearInterval(timer)
    }, 2000)
    return () => clearInterval(timer)
  }, [tracking, reload])

  useEffect(() => {
    if (!proposal) return
    if (lastStatus.current && lastStatus.current !== proposal.status && proposal.status === 'active') {
      toast.success('Clube liberado', {
        description: proposal.tenant ? `${proposal.tenant.name} — /${proposal.tenant.slug}` : undefined,
      })
    }
    lastStatus.current = proposal.status
  }, [proposal])

  const readiness = useMemo(() => (proposal ? approvalReadiness(proposal) : null), [proposal])
  const documents = useMemo(() => (proposal ? orderedDocuments(proposal) : []), [proposal])

  if (loading && !proposal) return <DetailSkeleton />

  if (!proposal) {
    return (
      <div className="space-y-4">
        <Link href="/admin/compliance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Aprovações
        </Link>
        <LoadError
          message={error ? LOAD_ERROR_MESSAGE : 'Não encontramos este clube. Volte para Aprovações e escolha outro.'}
          onRetry={() => reload()}
        />
      </div>
    )
  }

  const status = proposal.status
  const decidable = DECIDABLE_STATUSES.includes(status)
  const reviewable = REVIEWABLE_STATUSES.includes(status)
  const cancelable = CANCELABLE_STATUSES.includes(status)
  const sla = proposalSla(proposal)
  const assignedToMe = !!user && proposal.assignedTo?.userId === user.id
  const canClaim = decidable && !assignedToMe
  const toReview = (proposal.documents ?? []).filter(doc => doc.status === 'uploaded').length
  const name = proposalName(proposal)
  const incomplete = (proposal.completeness ?? []).filter(item => !item.complete)

  const claim = async () => {
    setBusy('claim')
    const detail = await runCommand(claimOnboardingProposalAction(proposal.id), 'Análise assumida. Este clube agora está com você')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const rerunPrechecks = async () => {
    setBusy('prechecks')
    const detail = await runCommand(rerunOnboardingPrechecksAction(proposal.id), 'Verificação automática refeita')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const reject = async (reason: string) => {
    const detail = await runCommand(rejectOnboardingAction(proposal.id, { reason }), 'Clube recusado. Ele foi avisado por e-mail')
    if (detail) onUpdated(detail)
    return !!detail
  }

  const cancel = async (reason: string) => {
    const detail = await runCommand(cancelOnboardingAction(proposal.id, { reason }), 'Cadastro cancelado')
    if (detail) onUpdated(detail)
    return !!detail
  }

  const openPending = (items?: PendingRequestItem[]) => {
    setPendingItems(items)
    setPendingOpen(true)
  }

  const startTracking = () => {
    void reload({ silent: true })
    setTracking(value => value + 1)
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/compliance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Voltar para Aprovações
      </Link>

      {/* ------------------------------------------------------ cabeçalho */}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <ProposalStatusPill status={status} short={false} />
                {proposal.hasPep && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    Pessoa politicamente exposta
                  </span>
                )}
                <SlaBadge slaDueAt={sla.slaDueAt} slaBreached={sla.slaBreached} withPrefix />
              </div>
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{name}</h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>CNPJ {formatCnpj(proposal.cnpj)}</span>
                <span aria-hidden>·</span>
                <span>
                  {CONTRACTOR_TYPE_LABELS[proposal.contractorType]} · {LEGAL_FORM_LABELS[proposal.legalForm]}
                </span>
                {proposal.plan.offer && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      Plano {proposal.plan.offer.name} · {proposal.plan.expectedLives.toLocaleString('pt-BR')} vidas
                    </span>
                  </>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {proposal.submittedAt ? (
                  <span title={formatDateTimeBR(proposal.submittedAt)}>
                    Enviado {formatRelative(proposal.submittedAt)} por {proposal.applicant.name}
                  </span>
                ) : (
                  <span title={formatDateTimeBR(proposal.createdAt)}>Cadastro iniciado {formatRelative(proposal.createdAt)}</span>
                )}
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" />
                  {proposal.assignedTo
                    ? `Com ${assignedToMe ? 'você' : proposal.assignedTo.name}`
                    : 'Ninguém assumiu ainda'}
                </span>
                {proposal.source === 'seed' && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{SOURCE_LABEL.seed}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>
                  Código <span className="font-mono">{proposal.code}</span>
                </span>
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                {canClaim && (
                  <Button variant="outline" className="gap-2" onClick={claim} disabled={busy !== null}>
                    {busy === 'claim' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />}
                    Assumir análise
                  </Button>
                )}
                {decidable && (
                  <>
                    <Button variant="outline" className="gap-2" onClick={() => openPending()}>
                      <ShieldQuestion className="h-4 w-4" />
                      Pedir correção
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-red-200 text-[#B42318] hover:bg-red-50 hover:text-[#B42318] dark:border-red-500/30"
                      onClick={() => setConfirm('reject')}
                    >
                      <CircleX className="h-4 w-4" />
                      Recusar
                    </Button>
                    <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setApproveOpen(true)}>
                      <CircleCheck className="h-4 w-4" />
                      Aprovar clube
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Mais ações">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onClick={() => reload()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Atualizar página
                    </DropdownMenuItem>
                    {reviewable && (
                      <DropdownMenuItem onClick={rerunPrechecks} disabled={busy !== null}>
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Refazer a verificação automática
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/emails?proposalId=${proposal.id}`}>
                        <Mail className="mr-2 h-4 w-4" />
                        E-mails enviados a este clube
                      </Link>
                    </DropdownMenuItem>
                    {isSuperadmin && (status === 'approved' || status === 'awaiting_payment' || (status === 'provisioning' && proposal.provisioning.error)) && (
                      <DropdownMenuItem onClick={() => setProvisionOpen(true)}>
                        <Rocket className="mr-2 h-4 w-4" />
                        {status === 'provisioning' ? 'Tentar liberar o clube de novo' : 'Liberar o clube sem cobrança'}
                      </DropdownMenuItem>
                    )}
                    {cancelable && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setConfirm('cancel')} className="text-[#B42318] focus:text-[#B42318]">
                          <Ban className="mr-2 h-4 w-4" />
                          Cancelar cadastro
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {decidable && <p className="max-w-sm text-xs text-muted-foreground lg:text-right">{APPROVAL_CONSEQUENCE}</p>}
            </div>
          </div>

          {decidable && readiness && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Antes de aprovar</span>
              <ReadinessChip
                ok={readiness.prechecksRan && readiness.blocking.length === 0}
                label={
                  readiness.blocking.length > 0
                    ? `${readiness.blocking.length} ${readiness.blocking.length === 1 ? 'impedimento' : 'impedimentos'}`
                    : 'Verificação automática'
                }
              />
              <ReadinessChip
                ok={readiness.requiredApproved === readiness.requiredTotal}
                label={`Documentos ${readiness.requiredApproved} de ${readiness.requiredTotal}`}
              />
              <ReadinessChip
                ok={readiness.checklistComplete}
                label={`Itens conferidos ${readiness.checklistChecked} de ${readiness.checklistTotal}`}
              />
              {readiness.ready && (
                <span className="ml-auto text-xs font-medium text-emerald-700 dark:text-emerald-300">Pronto para aprovar</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && <LoadError message={LOAD_ERROR_MESSAGE} onRetry={() => reload()} />}

      {IN_FLIGHT.includes(status) || status === 'active' || proposal.activationCharge ? (
        <ActivationCard
          proposal={proposal}
          isSuperadmin={isSuperadmin}
          onUpdated={onUpdated}
          onPaid={startTracking}
          onProvision={() => setProvisionOpen(true)}
        />
      ) : null}

      {/* ---------------------------------------------------------- abas */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <SectionTabsList>
          <SectionTab value="analise">
            <ClipboardList className="h-4 w-4" />
            Verificação
          </SectionTab>
          <SectionTab value="cadastro">
            <Building2 className="h-4 w-4" />
            Empresa
          </SectionTab>
          <SectionTab value="pessoas" badge={(proposal.people ?? []).length}>
            <Users className="h-4 w-4" />
            Sócios
          </SectionTab>
          <SectionTab value="documentos" badge={toReview > 0 ? `${toReview} para revisar` : (proposal.documents ?? []).length}>
            <FileStack className="h-4 w-4" />
            Documentos
          </SectionTab>
          <SectionTab value="comercial">
            <Receipt className="h-4 w-4" />
            Plano contratado
          </SectionTab>
          <SectionTab value="historico" badge={(proposal.events ?? []).length}>
            <History className="h-4 w-4" />
            Histórico
          </SectionTab>
        </SectionTabsList>

        <TabsContent value="analise" className="space-y-4">
          <DecisionNotes proposal={proposal} />
          {incomplete.length > 0 && (status === 'draft' || status === 'pending_info') && (
            <Card className="gap-2 py-4 shadow-none">
              <CardContent className="space-y-2 px-5">
                <p className="text-sm font-semibold text-foreground">O clube ainda precisa completar</p>
                <ul className="space-y-1 text-sm">
                  {incomplete.map(item => (
                    <li key={item.section} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{ONBOARDING_SECTION_LABELS[item.section]}:</span>{' '}
                      {item.missing.join('; ') || 'incompleto'}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <PrecheckPanel proposal={proposal} onUpdated={onUpdated} canRerun={reviewable} />
            <div className="space-y-4">
              <ChecklistPanel proposal={proposal} onUpdated={onUpdated} editable={reviewable} />
              {decidable && readiness && (
                <Card className="gap-3 py-4 shadow-none">
                  <CardContent className="space-y-3 px-5">
                    <p className="text-sm font-semibold text-foreground">Antes de aprovar</p>
                    <ReadinessList readiness={readiness} />
                    <p className="text-xs text-muted-foreground">
                      Ao aprovar, a verificação automática é refeita se a última tiver mais de 24 horas.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cadastro">
          <CompanyPanel proposal={proposal} />
        </TabsContent>

        <TabsContent value="pessoas">
          <PeoplePanel proposal={proposal} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocumentsPanel proposal={proposal} onOpenDocument={setViewerDoc} />
        </TabsContent>

        <TabsContent value="comercial">
          <CommercialPanel proposal={proposal} />
        </TabsContent>

        <TabsContent value="historico" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ProposalTimeline proposal={proposal} onUpdated={onUpdated} canNote />
          <ProposalEmails proposal={proposal} onOpenEmail={setEmailId} />
        </TabsContent>
      </Tabs>

      {/* -------------------------------------------------------- diálogos */}
      <DocumentViewer
        proposal={proposal}
        documents={documents}
        documentId={viewerDoc}
        onDocumentChange={setViewerDoc}
        open={viewerDoc !== null}
        onOpenChange={open => !open && setViewerDoc(null)}
        onUpdated={onUpdated}
        editable={reviewable}
        onRequestResend={item => openPending([item])}
      />
      <PendingInfoDialog
        proposal={proposal}
        open={pendingOpen}
        onOpenChange={setPendingOpen}
        onUpdated={onUpdated}
        initialItems={pendingItems}
      />
      {readiness && (
        <ApproveDialog
          proposal={proposal}
          readiness={readiness}
          open={approveOpen}
          onOpenChange={setApproveOpen}
          onUpdated={onUpdated}
        />
      )}
      <ProvisionDialog proposal={proposal} open={provisionOpen} onOpenChange={setProvisionOpen} onDone={startTracking} />
      <ConfirmDialog
        open={confirm === 'reject'}
        onOpenChange={value => !value && setConfirm(null)}
        title={`Recusar o clube ${name}?`}
        description={
          <p>
            A decisão é final: o cadastro fica como “{proposalStatusLabel('rejected')}” e o clube recebe o motivo por e-mail.
            Se for algo que ele pode corrigir, prefira pedir correção.
          </p>
        }
        confirmLabel="Recusar clube"
        destructive
        reason={{ label: 'Motivo (o clube vai ler)', placeholder: 'Ex.: situação cadastral BAIXADA na Receita Federal.', minLength: 10 }}
        onConfirm={reject}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={value => !value && setConfirm(null)}
        title={`Cancelar o cadastro de ${name}?`}
        description="Encerra o cadastro sem decisão sobre o clube (desistência, duplicidade). A cobrança de ativação em aberto é cancelada. Não há como desfazer."
        confirmLabel="Cancelar cadastro"
        destructive
        reason={{ label: 'Motivo do cancelamento', placeholder: 'Ex.: o clube desistiu por telefone', minLength: 3 }}
        onConfirm={cancel}
      />
      <EmailPreviewDialog emailId={emailId} onOpenChange={open => !open && setEmailId(null)} />
    </div>
  )
}
