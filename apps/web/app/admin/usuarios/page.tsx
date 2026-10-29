'use client'

import { useState } from 'react'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { DataTable, TableLoading, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Input } from '@/components/ui/input'
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
import { Plus, ShieldCheck, Shield, Mail, Phone, Pencil, UserX, UserCheck, Users } from 'lucide-react'

const BOTAO = 'h-11 rounded-[10px] px-4 font-semibold'
const CAMPO = 'h-11 rounded-[10px]'

export default function PlatformUsuariosPage() {
  const { platformUsers, createPlatformUser, refresh, isLoading } = useTenants()
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

  const botaoAdicionar = (
    <Button onClick={abrirNovo} className={BOTAO}>
      <Plus aria-hidden="true" />
      Adicionar pessoa
    </Button>
  )

  return (
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Equipe ANNETEC"
        description="Quem da ANNETEC tem acesso ao console."
        actions={botaoAdicionar}
      />

      {listError && (
        <p
          role="alert"
          className="m-0 rounded-xl border border-[#B42318]/20 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]"
        >
          {listError}
        </p>
      )}

      {isLoading && platformUsers.length === 0 ? (
        <TableLoading rows={4} label="Carregando a equipe…" />
      ) : platformUsers.length === 0 ? (
        <EmptyState
          framed
          icon={Users}
          title="Nenhuma pessoa na equipe ainda"
          description="Adicione quem da ANNETEC precisa de acesso ao console."
          action={botaoAdicionar}
        />
      ) : (
        <DataTable caption="Pessoas da equipe ANNETEC com acesso ao console" minWidth="min-w-[720px]">
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Contato</Th>
              <Th>Acesso</Th>
              <Th align="right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {platformUsers.map(u => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 bg-secondary">
                      <AvatarFallback className="bg-secondary text-sm text-white">{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    <p className="m-0 font-medium text-foreground">{u.name}</p>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                      {u.email}
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        {u.phone}
                      </div>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {u.role === 'superadmin' ? (
                      <StatusPill tone="danger" icon={<ShieldCheck />}>
                        Superadmin
                      </StatusPill>
                    ) : (
                      <StatusPill tone="info" icon={<Shield />}>
                        Padrão
                      </StatusPill>
                    )}
                    {!u.active && <StatusPill tone="neutral">Desativado</StatusPill>}
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-lg" onClick={() => abrirEdicao(u)}>
                      <Pencil aria-hidden="true" />
                      <span className="sr-only">Editar {u.name}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      disabled={busyId === u.id || u.id === contaAtual?.id}
                      title={u.id === contaAtual?.id ? 'Você não pode desativar a própria conta' : undefined}
                      onClick={() => alternarAtivacao(u.id, u.active)}
                      className={u.active ? 'text-[#B42318] hover:text-[#B42318]' : ''}
                    >
                      {u.active ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                      <span className="sr-only">
                        {u.active ? 'Desativar' : 'Reativar'} {u.name}
                      </span>
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[425px]">
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
              {error && (
                <p role="alert" className="m-0 text-sm text-[#B42318]">
                  {error}
                </p>
              )}
              <div className="grid gap-2">
                <label htmlFor="equipe-nome" className="text-sm font-medium">
                  Nome *
                </label>
                <Input id="equipe-nome" className={CAMPO} value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label htmlFor="equipe-email" className="text-sm font-medium">
                  E-mail {editingId ? '' : '*'}
                </label>
                <Input
                  id="equipe-email"
                  className={CAMPO}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required={!editingId}
                  disabled={Boolean(editingId)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="equipe-telefone" className="text-sm font-medium">
                  Telefone
                </label>
                <Input id="equipe-telefone" className={CAMPO} value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label htmlFor="equipe-acesso" className="text-sm font-medium">
                  Acesso *
                </label>
                <Select value={role} onValueChange={v => setRole(v as PlatformRole)}>
                  <SelectTrigger id="equipe-acesso" className={`${CAMPO} w-full data-[size=default]:h-11`}>
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
                  <label htmlFor="equipe-senha" className="text-sm font-medium">
                    Senha inicial *
                  </label>
                  <Input
                    id="equipe-senha"
                    className={CAMPO}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className={BOTAO} onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className={BOTAO}>
                {editingId ? 'Salvar alterações' : 'Adicionar pessoa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
