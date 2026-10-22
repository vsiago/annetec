'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
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
  ONBOARDING_STATUS_LABELS,
  type OnboardingProposalDetail,
  type PendingRequestItem,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
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
  CANCELABLE_STATUSES,
  DECIDABLE_STATUSES,
  REVIEWABLE_STATUSES,
  ProposalStatusPill,
  SlaBadge,
  approvalReadiness,
  proposalSla,
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
 * Detalhe da proposta no console de compliance (blueprint §Q4, roteiro §F
 * passo 3): assumir → revisar documentos → checklist → aprovar. Cada comando
 * devolve o detalhe inteiro e a tela troca o estado de uma vez.
 */

const SOURCE_LABEL: Record<OnboardingProposalDetail['source'], string> = {
  site: 'Site',
  console: 'Console',
  seed: 'Demonstração',
}

/** Status em que o pagamento/provisionamento ainda anda sozinho (a tela acompanha). */
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

  // Depois do pagamento simulado (ou do provisionamento manual) a API anda
  // sozinha: `awaiting_payment → provisioning → active`. A tela acompanha por
  // alguns segundos em vez de pedir para a pessoa recarregar.
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
      toast.success('Clube no ar!', {
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
          Voltar para a fila
        </Link>
        <LoadError message={error ?? 'Proposta não encontrada.'} onRetry={() => reload()} />
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
  const name =
    proposal.company?.tradeName || proposal.receita?.tradeName || proposal.company?.legalName || proposal.receita?.legalName || 'Proposta'
  const incomplete = (proposal.completeness ?? []).filter(item => !item.complete)

  const claim = async () => {
    setBusy('claim')
    const detail = await runCommand(claimOnboardingProposalAction(proposal.id), 'Análise assumida — a proposta está com você')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const rerunPrechecks = async () => {
    setBusy('prechecks')
    const detail = await runCommand(rerunOnboardingPrechecksAction(proposal.id), 'Pré-checagens executadas novamente')
    setBusy(null)
    if (detail) onUpdated(detail)
  }

  const reject = async (reason: string) => {
    const detail = await runCommand(rejectOnboardingAction(proposal.id, { reason }), 'Proposta reprovada — o contratante foi avisado')
    if (detail) onUpdated(detail)
    return !!detail
  }

  const cancel = async (reason: string) => {
    const detail = await runCommand(cancelOnboardingAction(proposal.id, { reason }), 'Proposta cancelada')
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
        Voltar para a fila
      </Link>

      {/* ------------------------------------------------------ cabeçalho */}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                  {proposal.code}
                </span>
                <ProposalStatusPill status={status} short={false} />
                {proposal.hasPep && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    PEP
                  </span>
                )}
                <SlaBadge slaDueAt={sla.slaDueAt} slaBreached={sla.slaBreached} />
              </div>
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{name}</h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono">{formatCnpj(proposal.cnpj)}</span>
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
                <span>Origem: {SOURCE_LABEL[proposal.source] ?? proposal.source}</span>
                <span aria-hidden>·</span>
                <span title={formatDateTimeBR(proposal.createdAt)}>Criada {formatRelative(proposal.createdAt)}</span>
                {proposal.submittedAt && (
                  <>
                    <span aria-hidden>·</span>
                    <span title={formatDateTimeBR(proposal.submittedAt)}>Enviada {formatRelative(proposal.submittedAt)}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" />
                  {proposal.assignedTo ? `Com ${assignedToMe ? 'você' : proposal.assignedTo.name}` : 'Sem responsável'}
                </span>
              </p>
            </div>

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
                    Pedir pendência
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30"
                    onClick={() => setConfirm('reject')}
                  >
                    <CircleX className="h-4 w-4" />
                    Reprovar
                  </Button>
                  <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setApproveOpen(true)}>
                    <CircleCheck className="h-4 w-4" />
                    Aprovar
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais ações">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onClick={() => reload()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Recarregar
                  </DropdownMenuItem>
                  {reviewable && (
                    <DropdownMenuItem onClick={rerunPrechecks} disabled={busy !== null}>
                      <ClipboardList className="mr-2 h-4 w-4" />
                      Reexecutar pré-checagens
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/emails?proposalId=${proposal.id}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      E-mails desta proposta
                    </Link>
                  </DropdownMenuItem>
                  {isSuperadmin && (status === 'approved' || status === 'awaiting_payment' || (status === 'provisioning' && proposal.provisioning.error)) && (
                    <DropdownMenuItem onClick={() => setProvisionOpen(true)}>
                      <Rocket className="mr-2 h-4 w-4" />
                      {status === 'provisioning' ? 'Reprocessar provisionamento' : 'Isentar ativação e provisionar'}
                    </DropdownMenuItem>
                  )}
                  {cancelable && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setConfirm('cancel')} className="text-red-600 focus:text-red-700">
                        <Ban className="mr-2 h-4 w-4" />
                        Cancelar proposta
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {decidable && readiness && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Para aprovar</span>
              <ReadinessChip
                ok={readiness.prechecksRan && readiness.blocking.length === 0}
                label={readiness.blocking.length > 0 ? `${readiness.blocking.length} bloqueante(s)` : 'Pré-checagens'}
              />
              <ReadinessChip
                ok={readiness.requiredApproved === readiness.requiredTotal}
                label={`Documentos ${readiness.requiredApproved}/${readiness.requiredTotal}`}
              />
              <ReadinessChip
                ok={readiness.checklistComplete}
                label={`Checklist ${readiness.checklistChecked}/${readiness.checklistTotal}`}
              />
              {readiness.ready && (
                <span className="ml-auto text-xs font-medium text-emerald-700 dark:text-emerald-300">Pronta para aprovar</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && <LoadError message={error} onRetry={() => reload()} />}

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
            Análise
          </SectionTab>
          <SectionTab value="cadastro">
            <Receipt className="h-4 w-4" />
            Dados cadastrais
          </SectionTab>
          <SectionTab value="pessoas" badge={(proposal.people ?? []).length}>
            <Users className="h-4 w-4" />
            Sócios e representantes
          </SectionTab>
          <SectionTab value="documentos" badge={toReview > 0 ? `${toReview} a revisar` : (proposal.documents ?? []).length}>
            <FileStack className="h-4 w-4" />
            Documentos
          </SectionTab>
          <SectionTab value="comercial">
            <Receipt className="h-4 w-4" />
            Plano, marca e contrato
          </SectionTab>
          <SectionTab value="historico" badge={(proposal.events ?? []).length}>
            <History className="h-4 w-4" />
            Linha do tempo
          </SectionTab>
        </SectionTabsList>

        <TabsContent value="analise" className="space-y-4">
          <DecisionNotes proposal={proposal} />
          {incomplete.length > 0 && (status === 'draft' || status === 'pending_info') && (
            <Card className="gap-2 py-4 shadow-none">
              <CardContent className="space-y-2 px-5">
                <p className="text-sm font-semibold text-foreground">O contratante ainda precisa completar</p>
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
                    <p className="text-sm font-semibold text-foreground">Prontidão para aprovar</p>
                    <ReadinessList readiness={readiness} />
                    <p className="text-xs text-muted-foreground">
                      A API reexecuta as pré-checagens na aprovação quando têm mais de 24 h.
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
        title={`Reprovar a proposta ${proposal.code}?`}
        description={
          <p>
            A decisão é final: a proposta vai para “{ONBOARDING_STATUS_LABELS.rejected}” e o contratante recebe o motivo por
            e-mail. Para corrigir algo, prefira pedir pendência.
          </p>
        }
        confirmLabel="Reprovar proposta"
        destructive
        reason={{ label: 'Motivo (o contratante vai ler)', placeholder: 'Ex.: situação cadastral BAIXADA na Receita Federal.', minLength: 10 }}
        onConfirm={reject}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={value => !value && setConfirm(null)}
        title={`Cancelar a proposta ${proposal.code}?`}
        description="Encerra a proposta sem decisão de mérito (desistência, duplicidade). Cobrança de ativação em aberto é cancelada. Não há como desfazer."
        confirmLabel="Cancelar proposta"
        destructive
        reason={{ label: 'Motivo do cancelamento', placeholder: 'Ex.: contratante desistiu por telefone', minLength: 3 }}
        onConfirm={cancel}
      />
      <EmailPreviewDialog emailId={emailId} onOpenChange={open => !open && setEmailId(null)} />
    </div>
  )
}
