'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
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
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-6 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="m-0">Somente o superadmin vê e muda as configurações avançadas do clube.</p>
      </div>
    )
  }

  /** O catálogo é uma tela por clube: escolhe este clube antes de abrir. */
  function openCatalog() {
    select(tenant.slug)
    router.push('/admin/catalogo')
  }

  return (
    <div className="flex flex-col gap-4">
      <IntegrationPanel tenantId={tenant.id} />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white p-6">
        <div className="min-w-0">
          <h2 className="m-0 text-base font-bold text-foreground">Catálogo da Digital Saúde</h2>
          <p className="m-0 mt-1 text-[13px] text-muted-foreground">
            Veja os planos e produtos que a Digital Saúde libera para o {tenant.name}. Só consulta.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={openCatalog}
          className="min-h-11 gap-2 rounded-[10px] border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
        >
          Abrir catálogo
          <ArrowRight aria-hidden="true" />
        </Button>
      </section>
    </div>
  )
}
