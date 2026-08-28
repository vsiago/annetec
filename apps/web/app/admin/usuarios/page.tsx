'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { getInitials } from '@/lib/utils'
import type { PlatformRole } from '@/lib/types'
import { Plus, ShieldCheck, Shield, Mail, Phone } from 'lucide-react'

export default function PlatformUsuariosPage() {
  const { platformUsers, createPlatformUser } = useTenants()
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<PlatformRole>('platform_admin')
  const [password, setPassword] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !email || !password) {
      setError('Preencha nome, e-mail e senha')
      return
    }
    const result = await createPlatformUser({ name, email, phone, role, password })
    if (!result.success) {
      setError(result.error || 'Não foi possível criar o usuário')
      return
    }
    setIsAddOpen(false)
    setName('')
    setEmail('')
    setPhone('')
    setRole('platform_admin')
    setPassword('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários da Plataforma</h1>
          <p className="text-muted-foreground">Contas com acesso ao painel administrativo da Annetec</p>
        </div>
        <Button className="bg-primary hover:opacity-90 text-white" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Contato</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Tipo</th>
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
                      {u.role === 'superadmin' ? (
                        <Badge className="bg-red-100 text-red-700">
                          <ShieldCheck className="w-3 h-3 mr-1" /> Superadmin
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700">
                          <Shield className="w-3 h-3 mr-1" /> Padrão
                        </Badge>
                      )}
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
              <DialogTitle>Novo Usuário da Plataforma</DialogTitle>
              <DialogDescription>Cadastre um superadmin ou um usuário padrão (operacional)</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="grid gap-2">
                <label className="text-sm font-medium">Nome *</label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">E-mail *</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Tipo *</label>
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
              <div className="grid gap-2">
                <label className="text-sm font-medium">Senha inicial *</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:opacity-90 text-white">
                Cadastrar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
