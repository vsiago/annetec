'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, FileSearch } from 'lucide-react'
import {
  CONTRACTOR_TYPE_LABELS,
  LEGAL_FORM_LABELS,
  onlyDigits,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Field, LoadError, Pill, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ProposalStatusPill } from '@/components/admin-platform/compliance/compliance-ui'
import { DocumentViewer } from '@/components/admin-platform/compliance/document-viewer'
import { DocumentsPanel, orderedDocuments } from '@/components/admin-platform/compliance/documents-panel'
import type { ConsoleActionResult } from '@/lib/adapters/platform-console'
import { findPlatformSubscriptionByTenantAction } from '@/lib/actions/platform-billing-api'
import {
  findOnboardingProposalForTenantAction,
  getOnboardingProposalAction,
} from '@/lib/actions/platform-onboarding-api'
import { formatCnpj, formatDateTimeBR, precheckSummaryMeta } from '@/lib/adapters/platform-console'

/**
 * Aba "KYB / Documentos" do inquilino: a proposta de contratação que originou
 * o clube (análise cadastral, decisão e documentos), em modo consulta. A
 * proposta vem da assinatura de plataforma ou, na falta dela, da busca pelo
 * CNPJ na fila. Inquilino criado fora da contratação pública não tem KYB aqui.
 */

async function loadProposal(
  tenantId: string,
  tenantSlug: string,
  document: string,
): Promise<ConsoleActionResult<OnboardingProposalDetail | null>> {
  let proposalId: string | null = null
  const sub = await findPlatformSubscriptionByTenantAction(tenantId, tenantSlug)
  if (sub.success && sub.data?.proposalId) proposalId = sub.data.proposalId
  if (!proposalId) {
    const cnpj = onlyDigits(document)
    const found = await findOnboardingProposalForTenantAction(tenantId, cnpj || tenantSlug)
    if (!found.success) return sub.success ? found : sub
    proposalId = found.data?.id ?? null
  }
  if (!proposalId) return { success: true, data: null }
  return getOnboardingProposalAction(proposalId)
}

export function TenantOnboardingPanel({
  tenantId,
  tenantSlug,
  document,
}: {
  tenantId: string
  tenantSlug: string
  document: string
}) {
  const { data, error, loading, reload } = useConsoleData(
    () => loadProposal(tenantId, tenantSlug, document),
    [tenantId, tenantSlug, document],
  )
  const [viewerDoc, setViewerDoc] = useState<string | null>(null)
  const documents = useMemo(() => (data ? orderedDocuments(data) : []), [data])

  if (loading && !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }
  if (error && !data) return <LoadError message={error} onRetry={() => reload()} />
  if (!data) {
    return (
      <Card className="shadow-none">
        <CardContent>
          <EmptyState
            icon={FileSearch}
            title="Sem contratação pelo site"
            description="Este inquilino foi criado fora da contratação pública, então não há análise cadastral (KYB) nem documentos registrados na plataforma."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Proposta <span className="font-mono">{data.code}</span>
            <ProposalStatusPill status={data.status} short={false} />
            <Pill meta={precheckSummaryMeta(data.precheckSummary)} />
          </CardTitle>
          <CardDescription>
            {formatCnpj(data.cnpj)} · {CONTRACTOR_TYPE_LABELS[data.contractorType]} · {LEGAL_FORM_LABELS[data.legalForm]}
          </CardDescription>
          <CardAction>
            <Button size="sm" className="gap-1.5" asChild>
              <Link href={`/admin/compliance/${data.id}`}>
                Abrir no compliance
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Enviada">{data.submittedAt ? formatDateTimeBR(data.submittedAt) : '—'}</Field>
          <Field label="Decisão">
            {data.decision?.decidedAt
              ? `${formatDateTimeBR(data.decision.decidedAt)}${data.decision.decidedBy ? ` · ${data.decision.decidedBy}` : ''}`
              : '—'}
          </Field>
          <Field label="No ar desde">
            {data.provisioning.provisionedAt ? formatDateTimeBR(data.provisioning.provisionedAt) : '—'}
            {data.provisioning.activationWaived && <span className="block text-xs text-muted-foreground">ativação isenta</span>}
          </Field>
          <Field label="Pessoas / PEP">
            {(data.people ?? []).length} pessoa(s){data.hasPep ? ' · com PEP' : ''}
          </Field>
          {data.decision?.overrideReason && (
            <Field label="Aprovada com ressalva" className="sm:col-span-2 xl:col-span-4">
              {data.decision.overrideReason}
            </Field>
          )}
        </CardContent>
      </Card>

      <DocumentsPanel proposal={data} onOpenDocument={setViewerDoc} />

      <DocumentViewer
        proposal={data}
        documents={documents}
        documentId={viewerDoc}
        onDocumentChange={setViewerDoc}
        open={viewerDoc !== null}
        onOpenChange={open => !open && setViewerDoc(null)}
        onUpdated={() => void reload({ silent: true })}
        editable={false}
        onRequestResend={() => undefined}
      />
    </div>
  )
}
