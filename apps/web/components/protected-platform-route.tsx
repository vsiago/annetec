'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { stopImpersonatingAction } from '@/lib/actions/auth-api'
import { Button } from '@/components/ui/button'
import type { PlatformRole } from '@annetec/contracts'
import { platformHomePath } from '@/lib/auth/redirect'
import { Loader2, LogOut, UserRoundCog } from 'lucide-react'

interface ProtectedPlatformRouteProps {
  children: React.ReactNode
  /**
   * Papéis que entram na área. Padrão: a EQUIPE (console `/admin`). A área do
   * vendedor ANNETEC (`/vendas`) passa `['platform_seller']`.
   */
  allowedRoles?: PlatformRole[]
}

const STAFF_ROLES: PlatformRole[] = ['superadmin', 'platform_admin']

/**
 * Guard das áreas de plataforma. Quem não tem o papel da área vai para a
 * área DELE (`platformHomePath`): vendedor que abre `/admin/**` cai em
 * `/vendas`, e a equipe que abre `/vendas/**` cai em `/admin`. Enquanto
 * decide, nada da área é montado — os providers do console (que chamam rotas
 * da equipe) nem chegam a carregar para o vendedor.
 */
export function ProtectedPlatformRoute({
  children,
  allowedRoles = STAFF_ROLES,
}: ProtectedPlatformRouteProps) {
  const { user, isLoading, isAuthenticated, isImpersonating, impersonatedName } = usePlatformAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    // Simulação ativa não é sessão expirada: mandar para /login faria o
    // superadmin logar de novo e perder a sessão guardada. A tela abaixo
    // devolve a conta dele em um clique.
    if (isImpersonating) return

    if (!isAuthenticated) {
      router.push('/login')
    } else if (!user?.platformRole || !allowedRoles.includes(user.platformRole)) {
      router.replace(platformHomePath(user?.platformRole))
    }
  }, [isLoading, isAuthenticated, isImpersonating, user, allowedRoles, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (isImpersonating) return <ImpersonationBlock name={impersonatedName} />

  if (!isAuthenticated || !user?.platformRole || !allowedRoles.includes(user.platformRole)) {
    return null
  }

  return <>{children}</>
}

/**
 * O painel da Annetec e o portal do inquilino dividem um único cookie de
 * sessão. Enquanto a simulação está aberta, o cookie é do inquilino — então
 * o painel não tem como carregar. Em vez de um redirect silencioso para o
 * login, explica o que está acontecendo e oferece a volta.
 */
function ImpersonationBlock({ name }: { name: string | null }) {
  const [saindo, setSaindo] = useState(false)
  const [erro, setErro] = useState('')

  async function sair() {
    setSaindo(true)
    setErro('')
    const resultado = await stopImpersonatingAction()
    if (!resultado.success) {
      setErro(resultado.error)
      setSaindo(false)
      return
    }
    // Navegação dura: a identidade da sessão inteira muda aqui.
    window.location.href = resultado.data.returnTo
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
          <UserRoundCog className="h-6 w-6" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-amber-950">Simulação em andamento</h1>
          <p className="text-sm text-amber-900">
            Você está operando como <strong>{name ?? 'um usuário do inquilino'}</strong>. O painel da
            Annetec só volta depois de encerrar a simulação — a sua sessão de superadmin está
            guardada e será restaurada.
          </p>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <Button onClick={sair} disabled={saindo} className="w-full gap-2">
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sair da simulação
        </Button>
      </div>
    </div>
  )
}
