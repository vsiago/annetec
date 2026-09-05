'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAdminScope } from '@/contexts/admin-scope-context'
import {
  BadgeDollarSign,
  ExternalLink,
  Eye,
  Globe,
  Handshake,
  IdCard,
  Kanban,
  Layers,
  LogIn,
  Receipt,
  UserCog,
  UsersRound,
} from 'lucide-react'

/**
 * Atalhos para "ver o lado do inquilino".
 *
 * São dois caminhos diferentes e vale não confundi-los:
 *
 *  - **Por dentro do /admin** — as rotas de operação já aceitam sessão de
 *    plataforma (`requireTenantRole` deixa passar), então basta trocar o
 *    escopo e ir para a tela equivalente. Funciona agora, com a sessão que a
 *    pessoa já tem, e é a visão de superadmin de verdade.
 *  - **Portal do inquilino** — `/{slug}/admin`, `/vendedor`, `/cliente` são o
 *    aplicativo que o cliente usa. Exigem sessão DAQUELE inquilino: abrir sem
 *    login cai na tela de entrada. Servem para conferir marca e experiência,
 *    não para operar.
 */
const TELAS_INTERNAS = [
  { href: '/admin/clientes', label: 'Clientes', icon: UsersRound },
  { href: '/admin/vendedores', label: 'Vendedores', icon: UserCog },
  { href: '/admin/leads', label: 'Leads', icon: Kanban },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Receipt },
  { href: '/admin/comissoes', label: 'Comissões', icon: BadgeDollarSign },
  { href: '/admin/catalogo', label: 'Catálogo', icon: Layers },
  { href: '/admin/parceiros', label: 'Parceiros', icon: Handshake },
]

export function TenantShortcuts({ slug }: { slug: string }) {
  const router = useRouter()
  const { select } = useAdminScope()

  /** Troca o escopo para este inquilino e abre a tela na mesma aba. */
  function abrirComoSuperadmin(href: string) {
    select(slug)
    router.push(href)
  }

  const portais = [
    { href: `/${slug}`, label: 'Site do clube', icon: Globe, publico: true },
    { href: `/${slug}/login`, label: 'Tela de login', icon: LogIn, publico: true },
    { href: `/${slug}/admin`, label: 'Portal do admin', icon: UserCog, publico: false },
    { href: `/${slug}/vendedor`, label: 'Portal do vendedor', icon: UserCog, publico: false },
    { href: `/${slug}/cliente`, label: 'Portal do beneficiário', icon: IdCard, publico: false },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-primary" />
            Operar como superadmin
          </CardTitle>
          <CardDescription>
            Abre as telas do painel já apontadas para a carteira deste inquilino. Usa a sua própria
            sessão — não precisa de senha dele.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TELAS_INTERNAS.map(tela => (
            <Button
              key={tela.href}
              variant="outline"
              size="sm"
              onClick={() => abrirComoSuperadmin(tela.href)}
            >
              <tela.icon className="mr-2 h-3.5 w-3.5" />
              {tela.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-4 w-4 text-secondary" />
            Portal do inquilino
          </CardTitle>
          <CardDescription>
            O aplicativo que o cliente dele usa, com a marca dele. Abre em nova aba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {portais.map(portal => (
              <Button key={portal.href} variant="outline" size="sm" asChild>
                <a href={portal.href} target="_blank" rel="noreferrer">
                  <portal.icon className="mr-2 h-3.5 w-3.5" />
                  {portal.label}
                  {!portal.publico && (
                    <span className="ml-1.5 text-xs text-muted-foreground">· exige login</span>
                  )}
                </a>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Os portais de admin, vendedor e beneficiário exigem uma conta daquele inquilino. Para
            entrar em um deles, redefina a senha na aba <strong>Acessos</strong> e use as credenciais.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
