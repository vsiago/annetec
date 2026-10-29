'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/admin-platform/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTenants } from '@/contexts/tenants-context'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { updatePlatformUserAction } from '@/lib/actions/platform-users-api'
import { getInitials } from '@/lib/utils'
import type { PlatformRole } from '@/lib/types'
import { Plus, ShieldCheck, Shield, Mail, Phone, Pencil, UserX, UserCheck } from 'lucide-react'

export default function PlatformUsuariosPage() {
  const { platformUsers, createPlatformUser, refresh } = useTenants()
  const { user: contaAtual } = usePlatformAuth()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [error, setError] = useState('')
  /** `null` = criando; com id = editando aquela conta. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [listError, setListError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<PlatformRole>('platform_admin')
  const [password, setPassword] = useState('')

  const abrirNovo = () => {
    setEditingId(null)
    setName('')
    setEmail('')
    setPhone('')
    setRole('platform_admin')
    setPassword('')
    setError('')
    setIsAddOpen(true)
  }

  const abrirEdicao = (conta: (typeof platformUsers)[number]) => {
    setEditingId(conta.id)
    setName(conta.name)
    setEmail(conta.email)
    setPhone(conta.phone ?? '')
    setRole(conta.role)
    setPassword('')
    setError('')
    setIsAddOpen(true)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Editar não mexe em e-mail nem senha: e-mail é a identidade da conta no
    // Better Auth e senha tem fluxo próprio de troca.
    if (editingId) {
      const result = await updatePlatformUserAction(editingId, { name, phone: phone || null, role })
      if (!result.success) {
        setError(result.error || 'Não foi possível salvar as alterações. Confira os dados e tente de novo.')
        return
      }
      await refresh()
      setIsAddOpen(false)
      setEditingId(null)
      return
    }

    if (!name || !email || !password) {
      setError('Preencha nome, e-mail e senha inicial para adicionar a pessoa.')
      return
    }
    const result = await createPlatformUser({ name, email, phone, role, password })
    if (!result.success) {
      setError(result.error || 'Não foi possível adicionar a pessoa. Confira os dados e tente de novo.')
      return
    }
    setIsAddOpen(false)
    setName('')
    setEmail('')
    setPhone('')
    setRole('platform_admin')
    setPassword('')
  }

  /**
   * Desativar em vez de apagar: a conta continua assinando o histórico da
   * trilha de auditoria. A API recusa autodesativação e recusa deixar a
   * plataforma sem nenhum superadmin ativo — a mensagem dela aparece aqui.
   */
  const alternarAtivacao = async (id: string, ativo: boolean) => {
    setListError('')
    setBusyId(id)
    const result = await updatePlatformUserAction(id, { active: !ativo })
    setBusyId(null)
    if (!result.success) {
      setListError(result.error || 'Não foi possível alterar o acesso desta pessoa. Tente de novo.')
      return
    }
    await refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe ANNETEC</h1>
          <p className="text-muted-foreground">Quem da ANNETEC tem acesso ao console.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar pessoa
        </Button>
      </div>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Pessoa</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Acesso</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {platformUsers.map(u => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 bg-secondary">
                          <AvatarFallback className="bg-secondary text-white text-sm">{getInitials(u.name)}</AvatarFallback>
                        </Avatar>
                        <p className="font-medium">{u.name}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5" />
                          {u.email}
                        </div>
                        {u.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            {u.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.role === 'superadmin' ? (
                          <Badge className="bg-red-100 text-[#B42318]">
                            <ShieldCheck className="w-3 h-3 mr-1" /> Superadmin
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-100 text-blue-700">
                            <Shield className="w-3 h-3 mr-1" /> Padrão
                          </Badge>
                        )}
                        {!u.active && <Badge variant="outline">Desativado</Badge>}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicao(u)}>
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Editar {u.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === u.id || u.id === contaAtual?.id}
                          title={u.id === contaAtual?.id ? 'Você não pode desativar a própria conta' : undefined}
                          onClick={() => alternarAtivacao(u.id, u.active)}
                          className={u.active ? 'text-[#B42318] hover:text-[#B42318]' : ''}
                        >
                          {u.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          <span className="sr-only">
                            {u.active ? 'Desativar' : 'Reativar'} {u.name}
                          </span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar pessoa' : 'Adicionar pessoa à equipe'}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? 'O e-mail e a senha não mudam por aqui.'
                  : 'Escolha o nível de acesso: superadmin tem acesso total; padrão cuida da operação.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {error && <p className="text-sm text-[#B42318]">{error}</p>}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome *</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">E-mail {editingId ? '' : '*'}</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required={!editingId}
                  disabled={Boolean(editingId)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Acesso *</label>
                <Select value={role} onValueChange={v => setRole(v as PlatformRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="superadmin">Superadmin (acesso total)</SelectItem>
                    <SelectItem value="platform_admin">Padrão (operacional)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editingId && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Senha inicial *</label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingId ? 'Salvar alterações' : 'Adicionar pessoa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
