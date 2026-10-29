'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Check, Loader2, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { HOLDING_RECEIVING_ISSUE_LABELS, type OnboardingProposalDetail } from '@annetec/contracts'
import { Skeleton } from '@/components/ui/skeleton'
import { copyToClipboard } from '@/components/admin-platform/billing/console-kit'
import { proposalStatusLabel } from '@/components/admin-platform/compliance/compliance-ui'
import {
  RECEIVING_ISSUE_TEXT,
  receivingInstructions,
} from '@/components/admin-platform/club-detail/club-model'
import type { ClubSummary } from '@/components/admin-platform/club-detail/use-club-summary'
import { testTenantIntegrationAction } from '@/lib/actions/tenants-api'
import { formatDateBR } from '@/lib/adapters/platform-console'
import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Depois de quantos dias sem teste a conexão com a Digital Saúde passa a pedir atenção. */
const INTEGRATION_STALE_DAYS = 7

/** Etapas do cadastro que já passaram pela aprovação da equipe. */
const APPROVED_STATUSES: OnboardingProposalDetail['status'][] = ['approved', 'awaiting_payment', 'provisioning', 'active']

type ItemState = 'done' | 'todo' | 'unknown'

interface ReadyItem {
  id: string
  state: ItemState
  title: string
  detail: ReactNode
  action?: ReactNode
}

function LinkButton({
  children,
  onClick,
  busy,
}: {
  children: ReactNode
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-sm font-semibold text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

function daysSince(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * "Pronto para vender": quatro coisas que precisam estar de pé para o clube
 * conseguir vender planos e receber as mensalidades. Cada item que falta diz
 * o que fazer. Um item que não deu para conferir (erro de leitura) aparece
 * neutro e fica fora da contagem — nunca vira "ok" nem "falta" por palpite.
 */
export function ReadyToSellCard({
  tenant,
  summary,
  isSuperadmin,
  onOpenAdvanced,
}: {
  tenant: Tenant
  summary: ClubSummary
  isSuperadmin: boolean
  onOpenAdvanced: () => void
}) {
  const [testing, setTesting] = useState(false)
  const { health, proposal, integration, plans } = summary
  const loading =
    (health.loading && !health.data) ||
    (proposal.loading && !proposal.data) ||
    (integration.loading && !integration.data) ||
    (plans.loading && !plans.data)

  async function copyInstructions(issue: keyof typeof RECEIVING_ISSUE_TEXT) {
    const text = receivingInstructions(tenant.name, issue, `${window.location.origin}/${tenant.slug}/admin`)
    const ok = await copyToClipboard(text)
    if (ok) toast.success('Instruções copiadas. Cole na mensagem para o responsável.')
    else toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
  }

  async function testConnection() {
    setTesting(true)
    const result = await testTenantIntegrationAction(tenant.id)
    setTesting(false)
    if (!result.success) {
      toast.error('Não foi possível testar a conexão.', { description: result.error })
      return
    }
    if (result.data.ok) toast.success('A Digital Saúde respondeu. Conexão em ordem.')
    else toast.error('A Digital Saúde recusou a conexão.', { description: 'Confira a chave de acesso e a senha da API.' })
    void integration.reload({ silent: true })
  }

  const items: ReadyItem[] = []

  // 1. Cadastro aprovado -----------------------------------------------------
  {
    const detail = proposal.data
    if (proposal.error) {
      items.push({ id: 'cadastro', state: 'unknown', title: 'Cadastro aprovado', detail: 'Não foi possível conferir agora.' })
    } else if (detail === null) {
      items.push({
        id: 'cadastro',
        state: 'done',
        title: 'Cadastro aprovado',
        detail: `Clube cadastrado direto pela equipe da ANNETEC em ${formatDateBR(tenant.createdAt)}.`,
      })
    } else if (detail && APPROVED_STATUSES.includes(detail.status)) {
      const when = detail.decision?.decidedAt ?? detail.provisioning.provisionedAt
      items.push({
        id: 'cadastro',
        state: 'done',
        title: 'Cadastro aprovado',
        detail: when ? `Aprovado em ${formatDateBR(when)}` : 'Aprovado pela equipe da ANNETEC.',
      })
    } else if (detail) {
      items.push({
        id: 'cadastro',
        state: 'todo',
        title: 'Cadastro aprovado',
        detail: `Situação do cadastro: ${proposalStatusLabel(detail.status, false).toLowerCase()}.`,
        action: (
          <Link
            href={`/admin/compliance/${detail.id}`}
            className="inline-flex min-h-8 items-center text-sm font-semibold text-secondary hover:underline"
          >
            Abrir em Aprovações
          </Link>
        ),
      })
    }
  }

  // 2. Recebimento das mensalidades ----------------------------------------
  {
    const row = health.data?.tenant
    if (!row) {
      items.push({
        id: 'recebimento',
        state: 'unknown',
        title: 'Recebimento das mensalidades conectado',
        detail: 'Não foi possível conferir agora.',
      })
    } else if (row.receivingIssue === null && row.receivingConnected) {
      items.push({
        id: 'recebimento',
        state: 'done',
        title: 'Recebimento das mensalidades conectado',
        detail: `Conta Asaas do próprio clube${row.receivingEnv === 'sandbox' ? ' · ambiente de testes' : ''}`,
      })
    } else {
      const issue = row.receivingIssue ?? 'nao_conectado'
      items.push({
        id: 'recebimento',
        state: 'todo',
        title: 'Recebimento das mensalidades conectado',
        detail: `${HOLDING_RECEIVING_ISSUE_LABELS[issue]}. ${RECEIVING_ISSUE_TEXT[issue]}`,
        action: <LinkButton onClick={() => void copyInstructions(issue)}>Copiar instruções</LinkButton>,
      })
    }
  }

  // 3. Planos no site ---------------------------------------------------------
  {
    if (plans.data) {
      const active = plans.data.filter(plan => plan.status === 'active').length
      items.push(
        active > 0
          ? {
              id: 'planos',
              state: 'done',
              title: 'Planos no site',
              detail: `${active} ${active === 1 ? 'plano publicado' : 'planos publicados'}`,
            }
          : {
              id: 'planos',
              state: 'todo',
              title: 'Planos no site',
              detail: 'Nenhum plano ativo. Peça ao responsável para publicar um plano em Planos, no painel do clube.',
            },
      )
    } else {
      items.push({
        id: 'planos',
        state: 'unknown',
        title: 'Planos no site',
        detail: 'Não foi possível conferir os planos agora.',
        action: <LinkButton onClick={() => void plans.reload({ silent: true })}>Tentar de novo</LinkButton>,
      })
    }
  }

  // 4. Integração com a Digital Saúde ----------------------------------------
  {
    const data = integration.data
    const title = 'Integração com a Digital Saúde'
    const configure = isSuperadmin ? <LinkButton onClick={onOpenAdvanced}>Configurar integração</LinkButton> : undefined
    const test = <LinkButton onClick={() => void testConnection()} busy={testing}>Testar conexão</LinkButton>
    if (integration.error && integration.data === null) {
      items.push({ id: 'integracao', state: 'unknown', title, detail: 'Não foi possível conferir agora.' })
    } else if (data === null) {
      items.push({ id: 'integracao', state: 'todo', title, detail: 'A integração ainda não foi configurada.', action: configure })
    } else if (!data.enabled) {
      items.push({ id: 'integracao', state: 'todo', title, detail: 'A integração está desativada.', action: configure })
    } else if (data.lastCheckOk === false) {
      items.push({ id: 'integracao', state: 'todo', title, detail: 'A Digital Saúde recusou a conexão no último teste.', action: test })
    } else if (!data.lastCheckedAt) {
      items.push({ id: 'integracao', state: 'todo', title, detail: 'A conexão nunca foi testada.', action: test })
    } else if (daysSince(data.lastCheckedAt) >= INTEGRATION_STALE_DAYS) {
      const days = daysSince(data.lastCheckedAt)
      items.push({ id: 'integracao', state: 'todo', title, detail: `A conexão não é testada há ${days} dias.`, action: test })
    } else {
      items.push({
        id: 'integracao',
        state: 'done',
        title,
        detail: `Conexão testada em ${formatDateBR(data.lastCheckedAt)}`,
      })
    }
  }

  const counted = items.filter(item => item.state !== 'unknown')
  const done = counted.filter(item => item.state === 'done').length

  return (
    <section
      aria-labelledby="club-ready"
      className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-white p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="club-ready" className="m-0 text-base font-bold text-foreground">
          Pronto para vender
        </h2>
        {!loading ? (
          <span className="text-[13px] font-semibold text-muted-foreground">
            {done} de {counted.length}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3 pt-2" aria-busy="true" aria-label="Carregando">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${done} de ${counted.length} itens concluídos`}
            className="my-1 mb-2 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${Math.max(counted.length, 1)}, minmax(0, 1fr))` }}
          >
            {counted.map((item, index) => (
              <div
                key={item.id}
                className={cn('h-1.5 rounded-full', index < done ? 'bg-[#12B76A]' : 'bg-[#E4E7EC]')}
              />
            ))}
          </div>
          <ul className="m-0 list-none p-0">
            {items.map(item => (
              <li key={item.id} className="flex items-start gap-3.5 border-b border-[#EEF0F3] py-3.5 last:border-b-0">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full',
                    item.state === 'done' && 'bg-[#ECFDF3] text-[#067647]',
                    item.state === 'todo' && 'bg-[#FFFAEB] text-[#B54708]',
                    item.state === 'unknown' && 'bg-[#F2F4F7] text-muted-foreground',
                  )}
                >
                  {item.state === 'done' ? (
                    <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
                  ) : item.state === 'todo' ? (
                    <span aria-hidden="true" className="text-sm font-bold leading-none">
                      !
                    </span>
                  ) : (
                    <Minus className="size-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {item.state === 'done' ? 'Pronto' : item.state === 'todo' ? 'Falta fazer' : 'Não conferido'}
                  </span>
                </span>
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <strong className="text-sm font-semibold text-foreground">{item.title}</strong>
                  <span className="text-[13px] leading-snug text-muted-foreground">{item.detail}</span>
                  {item.action}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
