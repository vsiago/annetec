'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { stopImpersonatingAction } from '@/lib/actions/auth-api'
import { Loader2, LogOut, UserRoundCog } from 'lucide-react'

/**
 * Fica visível em qualquer tela de `/[tenant]/*` enquanto o superadmin está
 * dentro da conta de outra pessoa ("Entrar como", aba Acessos) — sem isto,
 * fica fácil esquecer que não é a própria conta e mexer em algo por engano.
 */
export function ImpersonationBanner() {
  const { user, isImpersonating } = useAuth()
  const [saindo, setSaindo] = useState(false)

  if (!isImpersonating) return null

  async function sair() {
    setSaindo(true)
    const resultado = await stopImpersonatingAction()
    if (!resultado.success) {
      setSaindo(false)
      return
    }
    // Navegação dura pelo mesmo motivo da entrada: a sessão volta a ser outra.
    window.location.href = resultado.data.returnTo
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span className="inline-flex items-center gap-1.5">
        <UserRoundCog className="h-4 w-4" />
        Operando como <strong>{user?.name}</strong> — sessão simulada pela equipe Annetec.
      </span>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="inline-flex items-center gap-1 rounded-md border border-amber-950/30 bg-amber-950/10 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-amber-950/20 disabled:opacity-60"
      >
        {saindo ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
        Sair da simulação
      </button>
    </div>
  )
}
