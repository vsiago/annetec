'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, Lock } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { IntegrationPanel } from '@/components/admin-platform/integration-panel'
import { useAdminScope } from '@/contexts/admin-scope-context'
import type { Tenant } from '@/lib/types'

/**
 * Aba "Avançado" (só superadmin): configurações técnicas do clube. Hoje é a
 * integração com a Digital Saúde, que a equipe técnica usa para ligar o clube
 * ao sistema da operadora — fora do dia a dia de quem acompanha o clube.
 */
export function AdvancedTab({ tenant, isSuperadmin }: { tenant: Pick<Tenant, 'id' | 'slug' | 'name'>; isSuperadmin: boolean }) {
  const router = useRouter()
  const { select } = useAdminScope()

  if (!isSuperadmin) {
    return (
      <EmptyState
        framed
        icon={Lock}
        title="Somente o superadmin vê e muda as configurações avançadas do clube."
      />
    )
  }

  /** O catálogo é uma tela por clube: escolhe este clube antes de abrir. */
  function openCatalog() {
    select(tenant.slug)
    router.push('/admin/catalogo')
  }

  return (
    <div className="flex flex-col gap-6">
      <IntegrationPanel tenantId={tenant.id} />

      <SectionCard
        title="Catálogo da Digital Saúde"
        description={`Veja os planos e produtos que a Digital Saúde libera para o ${tenant.name}. Só consulta.`}
        icon={BookOpen}
      >
        <Button
          type="button"
          variant="outline"
          onClick={openCatalog}
          className="min-h-11 gap-2 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
        >
          Abrir catálogo
          <ArrowRight aria-hidden="true" />
        </Button>
      </SectionCard>
    </div>
  )
}
