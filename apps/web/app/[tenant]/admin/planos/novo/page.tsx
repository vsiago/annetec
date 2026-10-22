'use client'

import { PlanForm } from '@/components/admin/planos/plan-form'
import { PlanFormSkeleton } from '@/components/admin/planos/plan-form-skeleton'
import { usePlanosData } from '@/components/admin/planos/use-planos-data'
import { useTenant } from '@/contexts/tenant-context'

/** Novo plano. A lista (nome repetido) e as formas do clube carregam antes do formulário. */
export default function NovoPlanoPage() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const { plans, settings } = usePlanosData(slug, { stats: false })

  if (!slug || (plans.loading && !plans.data) || (settings.loading && !settings.data)) {
    return <PlanFormSkeleton />
  }

  return (
    <PlanForm
      slug={slug}
      tenantName={tenant?.name ?? ''}
      plan={null}
      plans={plans.data ?? []}
      settings={settings.data}
    />
  )
}
