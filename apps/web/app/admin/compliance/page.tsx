'use client'

import { Suspense, useCallback, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { isApprovalKind, type ApprovalKind } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import {
  ApprovalKindSwitcher,
  SITUATIONS,
  requestsText,
  situationOf,
  useApprovalsSummary,
} from '@/components/admin-platform/approvals/approvals-kit'
import { ClubProposalsPanel } from '@/components/admin-platform/approvals/club-proposals-panel'
import { DiscountsPanel } from '@/components/admin-platform/approvals/discounts-panel'
import { ManagedAccountsPanel } from '@/components/admin-platform/approvals/managed-accounts-panel'
import { replaceQuery } from '@/lib/replace-query'

/**
 * Aprovações — a central de tudo o que espera a decisão da equipe ANNETEC:
 *
 *  - **Novos clubes**: propostas de contratação (detalhe em `/admin/compliance/<id>`);
 *  - **Contas gerenciadas**: pedidos da conta de recebimento gerenciada (gaveta, `&clube=<orgId>`);
 *  - **Descontos de vendedores**: condições especiais pedidas pelos vendedores (gaveta, `&pedido=<id>`).
 *
 * O cartão tem uma linha de abas: as situações do tipo à esquerda e o seletor
 * de tipo (com os pendentes) à direita. Tudo na URL —
 * `?tipo=clubes|contas-gerenciadas|descontos&situacao=…` — para os links das
 * notificações e os redirecionamentos das telas antigas abrirem a aba e o
 * detalhe certos sozinhos.
 */

const DESCRIPTION = 'Tudo o que espera a sua decisão: novos clubes, contas gerenciadas e descontos de vendedores.'

function ApprovalsCenter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paramsRef = useRef(searchParams)
  paramsRef.current = searchParams

  const rawKind = searchParams.get('tipo')
  const kind: ApprovalKind = isApprovalKind(rawKind) ? rawKind : 'clubes'
  const rawSituation = searchParams.get('situacao')
  const clube = searchParams.get('clube')
  const pedido = searchParams.get('pedido')
  const proposta = searchParams.get('proposta')

  /** "Atualizar" (e cada decisão) relê o resumo e a fila aberta. */
  const [version, setVersion] = useState(0)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const { summary } = useApprovalsSummary(version + summaryVersion)

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(paramsRef.current.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const query = params.toString()
      replaceQuery(query ? `${pathname}?${query}` : pathname)
    },
    [pathname],
  )

  const setKind = useCallback(
    (next: ApprovalKind) => update({ tipo: next, situacao: null, clube: null, pedido: null, proposta: null }),
    [update],
  )
  const setSituation = useCallback(
    (next: string) => update({ situacao: next === SITUATIONS[kind][0].value ? null : next }),
    [update, kind],
  )
  const focusClub = useCallback((orgId: string | null) => update({ clube: orgId }), [update])
  const focusDiscount = useCallback(
    (focus: { pedido: string | null; proposta?: string | null }) =>
      update({ pedido: focus.pedido, ...(focus.proposta !== undefined ? { proposta: focus.proposta } : {}) }),
    [update],
  )
  const bumpSummary = useCallback(() => setSummaryVersion(value => value + 1), [])

  const total = summary?.total ?? null
  const switcher = <ApprovalKindSwitcher value={kind} onChange={setKind} summary={summary} />

  return (
    <PageContainer>
      <PageHeader
        icon={ShieldCheck}
        title="Aprovações"
        badge={
          total === null ? null : total > 0 ? (
            <StatusPill tone="warning">{`${requestsText(total)} aguardando você`}</StatusPill>
          ) : (
            <StatusPill tone="success">Nada aguardando você</StatusPill>
          )
        }
        description={DESCRIPTION}
        actions={
          <Button type="button" variant="outline" className="h-10 gap-2" onClick={() => setVersion(value => value + 1)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      {kind === 'clubes' ? (
        <ClubProposalsPanel
          situation={situationOf('clubes', rawSituation)}
          onSituationChange={setSituation}
          kindSwitcher={switcher}
          version={version}
        />
      ) : kind === 'contas-gerenciadas' ? (
        <ManagedAccountsPanel
          situation={situationOf('contas-gerenciadas', rawSituation)}
          onSituationChange={setSituation}
          kindSwitcher={switcher}
          focusedClub={clube}
          onFocusClub={focusClub}
          version={version}
          onChanged={bumpSummary}
        />
      ) : (
        <DiscountsPanel
          situation={situationOf('descontos', rawSituation)}
          onSituationChange={setSituation}
          kindSwitcher={switcher}
          focusedRequest={pedido}
          focusedProposal={proposta}
          onFocus={focusDiscount}
          version={version}
          onChanged={bumpSummary}
        />
      )}
    </PageContainer>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader icon={ShieldCheck} title="Aprovações" description={DESCRIPTION} />
          <SectionCard>
            <SectionSkeleton rows={6} label="Carregando as aprovações…" />
          </SectionCard>
        </PageContainer>
      }
    >
      <ApprovalsCenter />
    </Suspense>
  )
}
