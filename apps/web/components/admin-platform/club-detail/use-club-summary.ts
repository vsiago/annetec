'use client'

import { useCallback } from 'react'
import type { Tenant } from '@/lib/types'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { loadTenantProposal } from '@/components/admin-platform/compliance/tenant-onboarding-panel'
import { getTenantHealthAction } from '@/lib/actions/platform-billing-api'
import { getTenantIntegrationAction } from '@/lib/actions/tenants-api'
import { listOperatorClubPlansAction } from '@/lib/actions/operator-network-api'

/**
 * Tudo o que o Resumo do clube lê, de uma vez e em paralelo:
 *
 *  - `health`      → holding: linha do ranking (`tenant`), assinatura da ANNETEC,
 *                    alertas e as últimas ações da auditoria do clube;
 *  - `proposal`    → cadastro de contratação (data da aprovação);
 *  - `integration` → ligação com a Digital Saúde (status e último teste);
 *  - `plans`       → planos do clube (`/t/:slug/rede/planos`). A sessão da
 *                    plataforma LÊ as rotas do clube (regra A5), então não
 *                    precisa entrar como administrador para contar.
 *
 * Cada pedaço falha sozinho: um erro nos planos não derruba o resto do Resumo.
 */
export function useClubSummary(tenant: Pick<Tenant, 'id' | 'slug' | 'document' | 'status'>) {
  // A holding guarda o retrato por 60 s: um clube recém-cadastrado (o "abrir o
  // clube" logo depois de cadastrar) ainda não está nele e a API responde 404.
  // Nesse caso pede o recálculo uma vez. Clube encerrado nunca entra no
  // retrato, então não adianta recalcular.
  const cancelled = tenant.status === 'cancelled'
  const health = useConsoleData(async () => {
    const first = await getTenantHealthAction(tenant.id)
    if (first.success || cancelled) return first
    return getTenantHealthAction(tenant.id, { fresh: true })
  }, [tenant.id, cancelled])
  const proposal = useConsoleData(
    () => loadTenantProposal(tenant.id, tenant.slug, tenant.document),
    [tenant.id, tenant.slug, tenant.document],
  )
  const integration = useConsoleData(() => getTenantIntegrationAction(tenant.id), [tenant.id])
  const plans = useConsoleData(() => listOperatorClubPlansAction(tenant.slug), [tenant.slug])

  /** Recarrega tudo sem voltar ao esqueleto (depois de mudar a situação, por exemplo). */
  const reloadHealth = health.reload
  const reloadProposal = proposal.reload
  const reloadIntegration = integration.reload
  const reloadPlans = plans.reload
  const reloadAll = useCallback(() => {
    void reloadHealth({ silent: true })
    void reloadProposal({ silent: true })
    void reloadIntegration({ silent: true })
    void reloadPlans({ silent: true })
  }, [reloadHealth, reloadProposal, reloadIntegration, reloadPlans])

  return { health, proposal, integration, plans, reloadAll }
}

export type ClubSummary = ReturnType<typeof useClubSummary>
