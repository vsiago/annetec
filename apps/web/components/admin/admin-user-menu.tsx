'use client'

import Link from 'next/link'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/contexts/auth-context'
import { cn, getInitials } from '@/lib/utils'

/**
 * Identidade de quem está logado — no topo do desktop e no header do mobile.
 * Um componente só porque os dois pontos precisam abrir exatamente o mesmo
 * menu (configurações e sair).
 */
export function AdminUserMenu({
  base,
  showDetails = true,
}: {
  base: string
  showDetails?: boolean
}) {
  const { user, logout } = useAuth()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-muted',
            showDetails && 'pr-2',
          )}
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {user?.name ? getInitials(user.name) : 'AD'}
            </AvatarFallback>
          </Avatar>
          {showDetails && (
            <>
              <div className="hidden min-w-0 text-left sm:block">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {user?.name}
                </p>
                <p className="text-xs leading-tight text-muted-foreground">Administrador</p>
              </div>
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 w-56">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuItem asChild>
          <Link href={`${base}/configuracoes`}>
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
