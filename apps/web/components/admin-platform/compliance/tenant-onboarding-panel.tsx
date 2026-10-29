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
import { Button } from '@/components/admin-platform/ui/button'
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
 * Aba "Documentos" do clube: o cadastro de contratação que originou o clube
 * (análise, decisão e "Documentos da empresa"), em modo consulta. O cadastro
 * vem da assinatura da ANNETEC ou, na falta dela, da busca pelo CNPJ na fila.
 * Clube criado fora da contratação pública não tem documentos aqui.
 *
 * `loadTenantProposal` também alimenta o item "Cadastro aprovado" do Resumo.
 */

export async function loadTenantProposal(
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
    () => loadTenantProposal(tenantId, tenantSlug, document),
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
            title="Sem documentos da empresa"
            description="Este clube foi cadastrado direto pela equipe da ANNETEC, sem contratação pelo site. Por isso não há análise do cadastro nem documentos guardados aqui."
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
            Documentos da empresa
            <ProposalStatusPill status={data.status} short={false} />
            <Pill meta={precheckSummaryMeta(data.precheckSummary)} />
          </CardTitle>
          <CardDescription>
            {formatCnpj(data.cnpj)} · {CONTRACTOR_TYPE_LABELS[data.contractorType]} · {LEGAL_FORM_LABELS[data.legalForm]}
            <span className="block text-xs">
              Código do cadastro: <span className="font-mono">{data.code}</span>
            </span>
          </CardDescription>
          <CardAction>
            <Button size="sm" className="gap-1.5" asChild>
              <Link href={`/admin/compliance/${data.id}`}>
                Abrir em Aprovações
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Cadastro enviado em">{data.submittedAt ? formatDateTimeBR(data.submittedAt) : '—'}</Field>
          <Field label="Aprovado em">{data.decision?.decidedAt ? formatDateTimeBR(data.decision.decidedAt) : '—'}</Field>
          <Field label="Clube no ar desde">
            {data.provisioning.provisionedAt ? formatDateTimeBR(data.provisioning.provisionedAt) : '—'}
            {data.provisioning.activationWaived && (
              <span className="block text-xs text-muted-foreground">sem cobrança de ativação</span>
            )}
          </Field>
          <Field label="Pessoas do cadastro">
            {(data.people ?? []).length} pessoa(s)
            {data.hasPep ? ' · inclui pessoa politicamente exposta' : ''}
          </Field>
          {data.decision?.overrideReason && (
            <Field label="Aprovado com ressalva" className="sm:col-span-2 xl:col-span-4">
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
