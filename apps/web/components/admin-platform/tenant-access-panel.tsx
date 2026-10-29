'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/admin-platform/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SuperadminOnly, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { getInitials } from '@/lib/utils'
import {
  addTenantResponsibleAction,
  listTenantMembersAction,
  removeTenantMemberAction,
  resetTenantMemberPasswordAction,
  setTenantMemberAccessAction,
  type TenantMember,
} from '@/lib/actions/tenants-api'
import { impersonateTenantMemberAction } from '@/lib/actions/auth-api'
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogIn,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'

/**
 * Aba "Pessoas com acesso" do clube.
 *
 * Redefinir senha aqui é ato da equipe Annetec sobre a conta de outra pessoa —
 * por isso não pede a senha atual (isso é `POST /auth/password`, o fluxo do
 * próprio dono) e por isso a API exige superadmin, confere o vínculo com o
 * inquilino antes e registra na trilha de auditoria. A senha aparece uma única
 * vez; nem a API nem esta tela conseguem lê-la de volta depois.
 *
 * "Entrar como" é a alternativa sem trocar a senha de ninguém: abre uma
 * sessão real daquela conta (até 1h), também restrita a superadmin e também
 * auditada — só que em vez de devolver uma credencial pra copiar, já navega
 * pro portal daquela pessoa. Ver `impersonateTenantMemberAction`.
 *
 * Responsáveis (admins) ficam no topo: o clube precisa de pelo menos um ativo,
 * e a API recusa (422) desativar ou remover o último — a mensagem aparece no
 * diálogo. "Remover" exclui a conta quando era o único vínculo da pessoa; a
 * lista já diz qual dos casos vale para cada conta (`removal`).
 */
const PAPEL: Record<TenantMember['role'], { label: string; classe: string }> = {
  admin: { label: 'Responsável', classe: 'bg-red-100 text-[#B42318]' },
  seller: { label: 'Vendedor', classe: 'bg-blue-100 text-blue-700' },
  client: { label: 'Associado', classe: 'bg-slate-100 text-slate-700' },
}

const PORTAL_PATH: Record<TenantMember['role'], string> = {
  admin: 'admin',
  seller: 'vendedor',
  client: 'cliente',
}

type AcaoConfirmada = { tipo: 'desativar' | 'remover'; membro: TenantMember }

function formatarAcesso(iso: string | null): string {
  if (!iso) return 'Nunca acessou'
  return `Último acesso: ${new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function TenantAccessPanel({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const { isSuperadmin } = usePlatformRole()

  const [membros, setMembros] = useState<TenantMember[]>([])
  const [adminsAtivos, setAdminsAtivos] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [alvo, setAlvo] = useState<TenantMember | null>(null)
  const [senhaManual, setSenhaManual] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroDialogo, setErroDialogo] = useState('')
  const [gerada, setGerada] = useState<{ email: string; password: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const [alvoEntrar, setAlvoEntrar] = useState<TenantMember | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [erroEntrar, setErroEntrar] = useState('')

  const [acao, setAcao] = useState<AcaoConfirmada | null>(null)
  const [executando, setExecutando] = useState(false)
  const [erroAcao, setErroAcao] = useState('')
  const [reativando, setReativando] = useState<string | null>(null)

  const [novoAberto, setNovoAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [erroNovo, setErroNovo] = useState('')

  const carregar = useCallback(async () => {
    const resultado = await listTenantMembersAction(tenantId)
    setCarregando(false)
    if (!resultado.success) {
      setErro(resultado.error)
      return
    }
    setErro('')
    setMembros(resultado.data.items)
    setAdminsAtivos(resultado.data.activeAdmins)
  }, [tenantId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function abrir(membro: TenantMember) {
    setAlvo(membro)
    setSenhaManual('')
    setErroDialogo('')
    setGerada(null)
    setCopiado(false)
  }

  async function redefinir() {
    if (!alvo) return
    setErroDialogo('')

    if (senhaManual && senhaManual.length < 8) {
      setErroDialogo('A senha precisa de pelo menos 8 caracteres.')
      return
    }

    setSalvando(true)
    const resultado = await resetTenantMemberPasswordAction(
      tenantId,
      alvo.id,
      senhaManual ? { password: senhaManual } : {},
    )
    setSalvando(false)

    if (!resultado.success) {
      setErroDialogo(resultado.error)
      return
    }
    setGerada(resultado.data)
  }

  async function entrarComo() {
    if (!alvoEntrar) return
    setErroEntrar('')
    setEntrando(true)
    const resultado = await impersonateTenantMemberAction(
      tenantId,
      alvoEntrar.id,
      `/admin/inquilinos/${tenantId}`,
    )
    if (!resultado.success) {
      setEntrando(false)
      setErroEntrar(resultado.error)
      return
    }
    // Navegação dura: a identidade da sessão inteira muda, então não dá pra
    // reaproveitar a árvore de contexto já montada com a sessão antiga.
    window.location.href = `/${tenantSlug}/${PORTAL_PATH[alvoEntrar.role]}`
  }

  async function copiar() {
    if (!gerada) return
    try {
      await navigator.clipboard.writeText(gerada.password)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Área de transferência bloqueada — a senha continua visível na tela.
    }
  }

  function pedirConfirmacao(tipo: AcaoConfirmada['tipo'], membro: TenantMember) {
    setAcao({ tipo, membro })
    setErroAcao('')
  }

  async function confirmarAcao() {
    if (!acao) return
    setErroAcao('')
    setExecutando(true)
    const { tipo, membro } = acao

    if (tipo === 'desativar') {
      const resultado = await setTenantMemberAccessAction(tenantId, membro.id, false)
      setExecutando(false)
      if (!resultado.success) {
        setErroAcao(resultado.error)
        return
      }
      toast.success(
        `Acesso de ${membro.name} desativado.` +
          (resultado.data.revokedSessions > 0 ? ` ${resultado.data.revokedSessions} sessão(ões) encerrada(s).` : ''),
      )
    } else {
      const resultado = await removeTenantMemberAction(tenantId, membro.id)
      setExecutando(false)
      if (!resultado.success) {
        setErroAcao(resultado.error)
        // Remoção bloqueada por histórico desativa o acesso no lugar: a lista mudou.
        void carregar()
        return
      }
      toast.success(
        resultado.data.accountDeleted
          ? `Conta de ${membro.name} excluída.`
          : `${membro.name} saiu deste clube.`,
      )
    }

    setAcao(null)
    void carregar()
  }

  async function reativar(membro: TenantMember) {
    setReativando(membro.id)
    const resultado = await setTenantMemberAccessAction(tenantId, membro.id, true)
    setReativando(null)
    if (!resultado.success) {
      toast.error(resultado.error)
      return
    }
    toast.success(`Acesso de ${membro.name} reativado.`)
    void carregar()
  }

  function abrirNovo() {
    setNovoAberto(true)
    setNovoNome('')
    setNovoEmail('')
    setErroNovo('')
  }

  async function adicionarResponsavel() {
    setErroNovo('')
    if (novoNome.trim().length < 2) {
      setErroNovo('Informe o nome.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(novoEmail.trim())) {
      setErroNovo('Informe um e-mail válido.')
      return
    }
    setAdicionando(true)
    const resultado = await addTenantResponsibleAction(tenantId, {
      name: novoNome.trim(),
      email: novoEmail.trim(),
    })
    setAdicionando(false)
    if (!resultado.success) {
      setErroNovo(resultado.error)
      return
    }
    const envio =
      resultado.data.emailStatus === 'failed'
        ? 'O convite por e-mail não foi enviado. Use "Redefinir senha" para gerar uma senha.'
        : resultado.data.accountCreated
          ? 'O convite com a senha provisória foi enviado por e-mail.'
          : 'A pessoa já tinha conta, então o convite foi enviado sem senha.'
    toast.success(`${resultado.data.member.name} agora é responsável pelo clube. ${envio}`)
    setNovoAberto(false)
    void carregar()
  }

  const admins = membros.filter(m => m.role === 'admin')
  const demais = membros.filter(m => m.role !== 'admin')

  function linha(membro: TenantMember) {
    return (
      <div key={membro.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9 bg-secondary">
            <AvatarFallback className="bg-secondary text-xs font-medium text-white">
              {getInitials(membro.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{membro.name}</p>
            <p className="truncate text-xs text-muted-foreground">{membro.email}</p>
            <p className="text-xs text-muted-foreground">{formatarAcesso(membro.lastLoginAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={PAPEL[membro.role].classe}>
            {membro.role === 'admin' && <ShieldCheck className="mr-1 h-3 w-3" />}
            {PAPEL[membro.role].label}
          </Badge>
          {membro.active ? (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline">Inativo</Badge>
          )}
          {membro.platformStaff && <Badge variant="outline">Equipe ANNETEC</Badge>}

          <SuperadminOnly isSuperadmin={isSuperadmin}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAlvoEntrar(membro)
                setErroEntrar('')
              }}
            >
              <LogIn className="mr-2 h-3.5 w-3.5" />
              Ver como esta pessoa
            </Button>
          </SuperadminOnly>
          <SuperadminOnly isSuperadmin={isSuperadmin}>
            <Button variant="outline" size="sm" onClick={() => abrir(membro)}>
              <KeyRound className="mr-2 h-3.5 w-3.5" />
              Redefinir senha
            </Button>
          </SuperadminOnly>
          <SuperadminOnly isSuperadmin={isSuperadmin}>
            {membro.active ? (
              <Button variant="outline" size="sm" onClick={() => pedirConfirmacao('desativar', membro)}>
                <PowerOff className="mr-2 h-3.5 w-3.5" />
                Desativar acesso
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reativar(membro)}
                disabled={reativando === membro.id}
              >
                {reativando === membro.id ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Power className="mr-2 h-3.5 w-3.5" />
                )}
                Reativar acesso
              </Button>
            )}
          </SuperadminOnly>
          <SuperadminOnly isSuperadmin={isSuperadmin}>
            <Button
              variant="outline"
              size="sm"
              className="text-[#B42318] hover:text-[#B42318]"
              onClick={() => pedirConfirmacao('remover', membro)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Remover do clube
            </Button>
          </SuperadminOnly>
        </div>
      </div>
    )
  }

  function explicacaoRemocao(membro: TenantMember) {
    if (membro.removal === 'blocked') {
      return (
        <>
          Não dá para remover {membro.name}: {membro.removalBlockedReason}. Ao confirmar, o acesso a este
          clube será apenas <strong>desativado</strong> e as sessões abertas serão encerradas.
        </>
      )
    }
    if (membro.removal === 'delete_account') {
      return (
        <>
          Este clube é o único acesso de {membro.email}. Ao remover, a <strong>conta será excluída
          de vez</strong> (login e sessões). Não dá para desfazer.
        </>
      )
    }
    return (
      <>
        Só o acesso a este clube será removido e as sessões abertas nele serão encerradas. A conta de{' '}
        {membro.email} continua existindo
        {membro.platformStaff
          ? ' (é da equipe ANNETEC).'
          : ` (a pessoa também participa de ${membro.otherMemberships} outro(s) clube(s)).`}
      </>
    )
  }

  const ultimoResponsavel = (membro: TenantMember) =>
    membro.role === 'admin' && membro.active && !membro.platformStaff && adminsAtivos <= 1

  return (
    <div className="space-y-4">
      {erro && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando as pessoas…
        </div>
      )}

      {!carregando && !erro && (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Responsáveis pelo clube
                </CardTitle>
                <CardDescription>
                  {adminsAtivos} de {admins.length} com acesso ativo. O clube precisa de pelo menos um responsável
                  ativo.
                </CardDescription>
              </div>
              <SuperadminOnly isSuperadmin={isSuperadmin}>
                <Button size="sm" onClick={abrirNovo}>
                  <UserPlus className="mr-2 h-3.5 w-3.5" />
                  Adicionar responsável
                </Button>
              </SuperadminOnly>
            </CardHeader>
            <CardContent className="p-0">
              {adminsAtivos === 0 && (
                <div className="px-6 pb-4">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Este clube está sem nenhum responsável ativo. Adicione ou reative um.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              {admins.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum responsável cadastrado.</p>
              ) : (
                <div className="divide-y divide-border border-t border-border">{admins.map(linha)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Vendedores e associados
              </CardTitle>
              <CardDescription>
                {demais.length} pessoa(s) entre vendedores e associados · {membros.length} no total
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {demais.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhuma outra pessoa neste clube.</p>
              ) : (
                <div className="divide-y divide-border border-t border-border">{demais.map(linha)}</div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Tudo o que você faz aqui fica no histórico de alterações: quem fez, quando e em qual conta. Senhas nunca
        são registradas.
      </p>

      <Dialog open={alvo !== null} onOpenChange={aberto => !aberto && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha — {alvo?.name}</DialogTitle>
            <DialogDescription>
              {gerada
                ? 'Esta senha aparece uma única vez. Copie antes de fechar.'
                : 'Define uma senha nova sem precisar da senha atual. A pessoa já pode entrar com ela.'}
            </DialogDescription>
          </DialogHeader>

          {gerada ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">{gerada.email}</p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{gerada.password}</p>
              </div>
              <Button variant="outline" size="sm" onClick={copiar}>
                {copiado ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                {copiado ? 'Copiada' : 'Copiar senha'}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="senha">Senha nova</Label>
                <Input
                  id="senha"
                  type="text"
                  value={senhaManual}
                  onChange={e => setSenhaManual(e.target.value)}
                  placeholder="Deixe em branco para gerar automaticamente"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 8 caracteres. Em branco, a ANNETEC gera uma senha provisória.
                </p>
              </div>
              {erroDialogo && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{erroDialogo}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {gerada ? (
              <Button onClick={() => setAlvo(null)}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAlvo(null)}>
                  Cancelar
                </Button>
                <Button onClick={redefinir} disabled={salvando}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Redefinir
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alvoEntrar !== null} onOpenChange={aberto => !aberto && !entrando && setAlvoEntrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ver como esta pessoa — {alvoEntrar?.name}</DialogTitle>
            <DialogDescription>
              Abre o sistema com a conta dessa pessoa, por até 1 hora, para você ver o que ela vê. O que você fizer lá
              vale de verdade. Fica registrado no histórico de alterações quem entrou, quando e em qual conta.
            </DialogDescription>
          </DialogHeader>

          {erroEntrar && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erroEntrar}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoEntrar(null)} disabled={entrando}>
              Cancelar
            </Button>
            <Button onClick={entrarComo} disabled={entrando}>
              {entrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ver como esta pessoa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={acao !== null} onOpenChange={aberto => !aberto && !executando && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao?.tipo === 'remover' ? 'Remover do clube' : 'Desativar acesso'} — {acao?.membro.name}
            </DialogTitle>
            <DialogDescription>
              {acao?.tipo === 'remover'
                ? acao && explicacaoRemocao(acao.membro)
                : 'A pessoa perde o acesso a este clube e as sessões abertas nele são encerradas na hora. Dá para reativar o acesso depois.'}
            </DialogDescription>
          </DialogHeader>

          {acao && ultimoResponsavel(acao.membro) && !erroAcao && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Este é o único responsável ativo do clube, então a plataforma vai recusar. Adicione ou reative
                outro responsável antes.
              </AlertDescription>
            </Alert>
          )}

          {erroAcao && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erroAcao}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={executando}>
              {erroAcao ? 'Fechar' : 'Cancelar'}
            </Button>
            {!erroAcao && (
              <Button variant="destructive" onClick={confirmarAcao} disabled={executando}>
                {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {acao?.tipo === 'remover'
                  ? acao.membro.removal === 'blocked'
                    ? 'Desativar no lugar'
                    : acao.membro.removal === 'delete_account'
                      ? 'Excluir conta'
                      : 'Remover do clube'
                  : 'Desativar acesso'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={novoAberto} onOpenChange={aberto => !aberto && !adicionando && setNovoAberto(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar responsável</DialogTitle>
            <DialogDescription>
              A pessoa passa a ser responsável por este clube. Se ainda não tem conta, a senha provisória é gerada
              pela plataforma e enviada só por e-mail, no convite com a marca do clube.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="novo-nome">Nome</Label>
              <Input id="novo-nome" value={novoNome} onChange={e => setNovoNome(e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="novo-email">E-mail</Label>
              <Input
                id="novo-email"
                type="email"
                value={novoEmail}
                onChange={e => setNovoEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            {erroNovo && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{erroNovo}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoAberto(false)} disabled={adicionando}>
              Cancelar
            </Button>
            <Button onClick={adicionarResponsavel} disabled={adicionando}>
              {adicionando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
