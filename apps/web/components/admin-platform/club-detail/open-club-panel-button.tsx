'use client'

import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/admin-platform/ui/button'
import { SuperadminOnly, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { impersonateTenantRoleAction, stopImpersonatingAction } from '@/lib/actions/auth-api'

/**
 * "Abrir painel do clube".
 *
 * Navegação direta para `/<slug>/admin` NÃO funciona com a sessão da
 * plataforma: a regra A5 (sessão de plataforma lê as rotas do clube, só
 * superadmin escreve) vale na API, mas o painel do clube (`ProtectedRoute` +
 * `AuthProvider` de `app/[tenant]/admin`) só aceita sessão `scope: 'tenant'`
 * com o `tenantSlug` da URL — com a sessão de plataforma a pessoa é mandada
 * para a tela de login do clube.
 *
 * Por isso o botão usa a ação que já existia: abre uma sessão real da conta
 * principal de administrador do clube (`impersonateTenantRoleAction`, só
 * superadmin, até 1 h, na trilha de auditoria) e vai para `/<slug>/admin` na
 * MESMA aba — o cookie de sessão é único e global, em outra aba o console da
 * plataforma passaria a enxergar a sessão do clube também. A faixa no topo do
 * painel do clube traz o caminho de volta.
 */
export function OpenClubPanelButton({
  tenantId,
  slug,
  cancelled,
}: {
  tenantId: string
  slug: string
  /** Clube encerrado: a API recusa tudo em `/t/<slug>/*`, então nem tenta. */
  cancelled: boolean
}) {
  const { isSuperadmin } = usePlatformRole()
  const [opening, setOpening] = useState(false)

  async function open() {
    setOpening(true)
    // Trocar de simulação com uma já aberta falhava ("Rota restrita à equipe
    // Annetec"): o cookie é único, e `entrar-como` exige sessão de plataforma.
    // Devolver a sessão de superadmin antes resolve em um clique. Erro aqui é
    // ignorado de propósito: "nenhuma simulação ativa" é o caso normal.
    await stopImpersonatingAction().catch(() => null)

    const result = await impersonateTenantRoleAction(tenantId, 'admin', `/admin/inquilinos/${tenantId}`)
    if (!result.success) {
      setOpening(false)
      toast.error('Não foi possível abrir o painel do clube.', { description: result.error })
      return
    }
    // Navegação dura: a identidade da sessão inteira muda, e um `router.push`
    // reaproveitaria a árvore de contexto já montada com a sessão antiga.
    window.location.href = `/${slug}/admin`
  }

  const button = (
    <Button
      type="button"
      onClick={open}
      disabled={opening || cancelled}
      title={
        cancelled
          ? 'O clube está encerrado, então o painel não abre.'
          : 'Abre o painel como administrador do clube, nesta mesma aba. Para voltar, use a faixa no topo.'
      }
      className="min-h-11 gap-2 rounded-[10px] bg-secondary px-4 text-sm font-semibold text-white hover:bg-secondary/90"
    >
      {opening ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
      {opening ? 'Abrindo…' : 'Abrir painel do clube'}
    </Button>
  )

  return (
    <SuperadminOnly isSuperadmin={isSuperadmin} reason="Somente o superadmin abre o painel do clube.">
      {button}
    </SuperadminOnly>
  )
}
