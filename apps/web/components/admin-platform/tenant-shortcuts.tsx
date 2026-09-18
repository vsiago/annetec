'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { impersonateTenantRoleAction, stopImpersonatingAction } from '@/lib/actions/auth-api'
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Globe,
  IdCard,
  Kanban,
  Loader2,
  LogIn,
  Receipt,
  UserCog,
  UsersRound,
  type LucideIcon,
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
 *    aplicativo que o cliente usa, e exigem sessão DAQUELE inquilino. Por isso
 *    esses três não são link: abrem uma sessão real da conta principal daquele
 *    papel (`impersonateTenantRoleAction`) e navegam na MESMA aba. Mesma aba
 *    porque a sessão vive num cookie único e global — em outra aba, o painel
 *    de plataforma passaria a enxergar a sessão do inquilino também.
 *    Site do clube e tela de login continuam sendo link público em nova aba:
 *    não precisam de conta nenhuma.
 *
 * A lista "por dentro" mostra só as quatro telas do dia a dia. Comissões,
 * Catálogo e Parceiros já são itens de primeiro nível na sidebar da
 * plataforma — e clicar em qualquer atalho abaixo troca o escopo para este
 * inquilino e o mantém trocado ao navegar por ela, então não precisam de
 * duplicata aqui.
 */
const TELAS_INTERNAS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: '/admin/clientes', label: 'Clientes', description: 'Carteira de beneficiários', icon: UsersRound },
  { href: '/admin/vendedores', label: 'Vendedores', description: 'Equipe comercial', icon: UserCog },
  { href: '/admin/leads', label: 'Leads', description: 'Funil de vendas', icon: Kanban },
  { href: '/admin/financeiro', label: 'Financeiro', description: 'Faturas e recebíveis', icon: Receipt },
]

const PORTAIS = [
  { papel: 'admin', caminho: 'admin', label: 'Portal do admin', icon: UserCog },
  { papel: 'seller', caminho: 'vendedor', label: 'Portal do vendedor', icon: UserCog },
  { papel: 'client', caminho: 'cliente', label: 'Portal do beneficiário', icon: IdCard },
] as const

export function TenantShortcuts({ slug, tenantId }: { slug: string; tenantId: string }) {
  const router = useRouter()
  const { select } = useAdminScope()
  const [entrando, setEntrando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  /** Troca o escopo para este inquilino e abre a tela na mesma aba. */
  function abrirComoSuperadmin(href: string) {
    select(slug)
    router.push(href)
  }

  /**
   * Navegação dura (`window.location`) de propósito: a identidade da sessão
   * inteira muda aqui. Um `router.push` reaproveitaria o cache de rota do
   * cliente e a árvore de contexto já montada com a sessão antiga.
   */
  async function entrarNoPortal(papel: 'admin' | 'seller' | 'client', caminho: string) {
    setErro('')
    setEntrando(papel)

    // Trocar de portal com uma simulação já aberta falhava com "Rota restrita
    // à equipe Annetec": o cookie de sessão é único, então a chamada saía com
    // a identidade do inquilino, e `entrar-como` exige sessão de plataforma.
    // Devolver a sessão de superadmin antes resolve em um clique só. Erro aqui
    // é ignorado de propósito — "nenhuma simulação ativa" é o caso normal.
    await stopImpersonatingAction().catch(() => null)

    const resultado = await impersonateTenantRoleAction(tenantId, papel, `/admin/inquilinos/${tenantId}`)
    if (!resultado.success) {
      setEntrando(null)
      setErro(resultado.error)
      return
    }
    window.location.href = `/${slug}/${caminho}`
  }

  const publicos = [
    { href: `/${slug}`, label: 'Site do clube', icon: Globe },
    { href: `/${slug}/login`, label: 'Tela de login', icon: LogIn },
  ]

  return (
    <div className="space-y-4">
      <Card className="border border-border/80 bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="h-4 w-4" />
            </span>
            Operar como superadmin
          </CardTitle>
          <CardDescription>
            Abre as telas do dia a dia já apontadas para a carteira deste inquilino. Usa a sua
            própria sessão — não precisa de senha dele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TELAS_INTERNAS.map(tela => (
              <button
                key={tela.href}
                type="button"
                onClick={() => abrirComoSuperadmin(tela.href)}
                className="group flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border/80 bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <tela.icon className="h-5 w-5" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold text-foreground">{tela.label}</span>
                  <span className="block text-xs text-muted-foreground">{tela.description}</span>
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/80 bg-card shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <ExternalLink className="h-4 w-4" />
            </span>
            Portal do inquilino
          </CardTitle>
          <CardDescription>
            O aplicativo que o cliente dele usa, com a marca dele.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PORTAIS.map(portal => (
              <button
                key={portal.papel}
                type="button"
                onClick={() => entrarNoPortal(portal.papel, portal.caminho)}
                disabled={entrando !== null}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-secondary/50 hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {entrando === portal.papel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
                ) : (
                  <portal.icon className="h-3.5 w-3.5 text-secondary" />
                )}
                {portal.label}
              </button>
            ))}

            {publicos.map(publico => (
              <a
                key={publico.href}
                href={publico.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <publico.icon className="h-3.5 w-3.5" />
                {publico.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>

          {erro && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            Os três primeiros entram na conta principal daquele papel, nesta mesma aba — a simulação
            fica marcada por uma faixa no topo, dura até 1h e está na trilha de auditoria. Para entrar
            numa conta específica, use <strong>Entrar como</strong> na aba Acessos. Site do clube e
            tela de login são públicos e abrem em nova aba.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
