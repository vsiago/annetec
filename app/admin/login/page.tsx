'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

export default function PlatformLoginPage() {
  const { login } = usePlatformAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    const result = await login(email, password)
    if (!result.success) setError(result.error || 'Erro ao fazer login')
    setIsSubmitting(false)
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-8">
          <img src="/annetec.svg" alt="Annetec" className="h-9" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l border-border pl-2">
            Painel da Plataforma
          </span>
        </div>

        <h1 className="text-2xl font-bold text-secondary mb-1">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground mb-6">Entre com sua conta de superadmin ou administrador da plataforma.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={isSubmitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isSubmitting} />
          </div>
          <Button type="submit" className="w-full bg-primary hover:opacity-90 text-white h-11" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Acesso de demonstração</p>
          <div className="space-y-2 text-xs">
            <button
              type="button"
              className="w-full text-left p-2 rounded-lg border border-border hover:border-secondary/30"
              onClick={() => { setEmail('superadmin@annetec.com.br'); setPassword('super123') }}
            >
              <span className="font-medium text-secondary">Superadmin</span> — superadmin@annetec.com.br / super123
            </button>
            <button
              type="button"
              className="w-full text-left p-2 rounded-lg border border-border hover:border-secondary/30"
              onClick={() => { setEmail('operacoes@annetec.com.br'); setPassword('operacoes123') }}
            >
              <span className="font-medium text-secondary">Padrão</span> — operacoes@annetec.com.br / operacoes123
            </button>
          </div>
        </div>

        <Link href="/" className="block text-center text-sm text-muted-foreground mt-6 hover:underline">
          Voltar ao site
        </Link>
      </div>
    </div>
  )
}
