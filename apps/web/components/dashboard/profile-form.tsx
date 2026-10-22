'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/contexts/auth-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { changePasswordAction } from '@/lib/actions/account-api'
import { AlertCircle, CheckCircle2, Lock, Save, User } from 'lucide-react'

// Formulário "minha conta" de vendedor e associado. Os dois papéis editam os
// mesmos três campos e a senha; uma implementação só mantém o comportamento
// igual nas duas telas. A senha vai para `POST /auth/password` (Better Auth),
// que exige a senha atual.
export function ProfileForm({
  title = 'Dados do Perfil',
  description = 'Informações da sua conta',
  readOnlyFields,
}: {
  title?: string
  description?: string
  readOnlyFields?: { label: string; value: string; hint?: string }[]
}) {
  const { user } = useAuth()
  const { updateUser } = useTenantData()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setEmail(user.email)
    setPhone(user.phone ?? '')
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (password && password !== confirmPassword) {
      setFeedback({ type: 'error', message: 'As senhas não conferem.' })
      return
    }
    if (password && password.length < 8) {
      setFeedback({ type: 'error', message: 'A nova senha precisa ter pelo menos 8 caracteres.' })
      return
    }
    if (password && !currentPassword) {
      setFeedback({ type: 'error', message: 'Informe a senha atual para trocar a senha.' })
      return
    }

    setIsSaving(true)
    setFeedback(null)

    // Só chama a gravação de cadastro quando algo mudou: trocar apenas a senha
    // não depende da rota de usuários (que é restrita ao admin do clube).
    const profileChanged = name !== user.name || email !== user.email || phone !== (user.phone ?? '')
    if (profileChanged) {
      const result = await updateUser(user.id, { name, email, phone })
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? 'Não foi possível salvar.' })
        setIsSaving(false)
        return
      }
    }

    if (password) {
      const changed = await changePasswordAction({ currentPassword, newPassword: password })
      if (!changed.success) {
        setFeedback({
          type: 'error',
          message: profileChanged
            ? `Dados salvos, mas a senha não foi alterada: ${changed.error}`
            : `A senha não foi alterada: ${changed.error}`,
        })
        setIsSaving(false)
        return
      }
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
    }

    setFeedback({ type: 'success', message: 'Dados atualizados com sucesso.' })
    setIsSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {feedback && (
        <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'}>
          {feedback.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-secondary" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Usado para entrar no portal.</p>
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          {readOnlyFields?.map(field => (
            <div key={field.label} className="space-y-2">
              <Label>{field.label}</Label>
              <Input value={field.value} disabled />
              {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Alterar Senha
          </CardTitle>
          <CardDescription>Deixe em branco para manter a senha atual</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Senha atual</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirmar nova senha</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving} className="bg-primary hover:opacity-90 text-white">
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </div>
    </form>
  )
}
