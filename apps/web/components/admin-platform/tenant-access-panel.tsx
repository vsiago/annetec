'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { getInitials } from '@/lib/utils'
import {
  listTenantMembersAction,
  resetTenantMemberPasswordAction,
  type TenantMember,
} from '@/lib/actions/tenants-api'
import { AlertCircle, Check, Copy, KeyRound, Loader2, ShieldCheck, Users } from 'lucide-react'

/**
 * Acesso administrativo ao inquilino.
 *
 * Redefinir senha aqui é ato da equipe Annetec sobre a conta de outra pessoa —
 * por isso não pede a senha atual (isso é `POST /auth/password`, o fluxo do
 * próprio dono) e por isso a API exige superadmin, confere o vínculo com o
 * inquilino antes e registra na trilha de auditoria. A senha aparece uma única
 * vez; nem a API nem esta tela conseguem lê-la de volta depois.
 */
const PAPEL: Record<TenantMember['role'], { label: string; classe: string }> = {
  admin: { label: 'Admin', classe: 'bg-red-100 text-red-700' },
  seller: { label: 'Vendedor', classe: 'bg-blue-100 text-blue-700' },
  client: { label: 'Beneficiário', classe: 'bg-slate-100 text-slate-700' },
}

export function TenantAccessPanel({ tenantId }: { tenantId: string }) {
  const [membros, setMembros] = useState<TenantMember[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [alvo, setAlvo] = useState<TenantMember | null>(null)
  const [senhaManual, setSenhaManual] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroDialogo, setErroDialogo] = useState('')
  const [gerada, setGerada] = useState<{ email: string; password: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    listTenantMembersAction(tenantId).then(resultado => {
      setCarregando(false)
      if (!resultado.success) {
        setErro(resultado.error)
        return
      }
      setMembros(resultado.data)
    })
  }, [tenantId])

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

  const admins = membros.filter(m => m.role === 'admin')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Contas deste inquilino
          </CardTitle>
          <CardDescription>
            {carregando
              ? 'Carregando…'
              : `${membros.length} conta(s) · ${admins.length} com acesso administrativo`}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {erro && (
            <div className="px-6 pb-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            </div>
          )}

          {carregando && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando as contas…
            </div>
          )}

          {!carregando && !erro && membros.length === 0 && (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Este inquilino não tem nenhuma conta. Isso não deveria acontecer — todo inquilino nasce
              com um admin no wizard de criação.
            </p>
          )}

          {!carregando && membros.length > 0 && (
            <div className="divide-y divide-border">
              {membros.map(membro => (
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
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={PAPEL[membro.role].classe}>
                      {membro.role === 'admin' && <ShieldCheck className="mr-1 h-3 w-3" />}
                      {PAPEL[membro.role].label}
                    </Badge>
                    {!membro.active && <Badge variant="outline">Inativo</Badge>}
                    <Button variant="outline" size="sm" onClick={() => abrir(membro)}>
                      <KeyRound className="mr-2 h-3.5 w-3.5" />
                      Redefinir senha
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Toda redefinição feita aqui entra na trilha de auditoria com quem fez, quando e para qual
        conta — a senha em si nunca é registrada.
      </p>

      <Dialog open={alvo !== null} onOpenChange={aberto => !aberto && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha — {alvo?.name}</DialogTitle>
            <DialogDescription>
              {gerada
                ? 'Esta senha aparece uma única vez. Copie antes de fechar.'
                : 'Define uma senha nova sem precisar da senha atual. A pessoa entra com ela imediatamente.'}
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
                  Mínimo de 8 caracteres. Em branco, a plataforma gera uma senha provisória.
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
    </div>
  )
}
