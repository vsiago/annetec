'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PackageSearch } from 'lucide-react'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { Button } from '@/components/ui/button'
import { PlanForm } from '@/components/admin/planos/plan-form'
import { PlanFormSkeleton } from '@/components/admin/planos/plan-form-skeleton'
import { LoadErrorBox } from '@/components/admin/planos/plan-ui'
import { usePlanosData } from '@/components/admin/planos/use-planos-data'
import { useTenant } from '@/contexts/tenant-context'

/** Editar plano: o formulário só monta com o plano carregado (o estado inicial vem dele). */
export default function EditarPlanoPage() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const { plans, settings } = usePlanosData(slug, { stats: false })
  const listHref = `/${slug}/admin/planos`

  if (!slug || (plans.loading && !plans.data) || (settings.loading && !settings.data)) {
    return <PlanFormSkeleton />
  }

  if (plans.error && !plans.data) {
    return <LoadErrorBox message={plans.error} onRetry={() => void plans.reload()} />
  }

  const plan = plans.data?.find(item => item.id === id) ?? null
  if (!plan) {
    return (
      <EmptyStateCard
        icon={PackageSearch}
        title="Plano não encontrado"
        description="Ele pode ter sido excluído. Volte à lista para ver os planos do clube."
        action={
          <Button asChild variant="outline">
            <Link href={listHref}>Ver todos os planos</Link>
          </Button>
        }
      />
    )
  }

  return (
    <PlanForm
      key={plan.id}
      slug={slug}
      tenantName={tenant?.name ?? ''}
      plan={plan}
      plans={plans.data ?? []}
      settings={settings.data}
    />
  )
}
