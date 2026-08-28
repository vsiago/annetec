'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, HeartPulse } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

// Login com marca do inquilino — só admin/vendedor (senha). O slug já é
// conhecido pela URL, então é passado direto ao backend: sem ambiguidade,
// sem precisar da detecção automática que o /login genérico usa. Associado
// não tem senha (entra por CPF + e-mail): vai para o portal único em /login.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()
  const { tenant } = useTenant()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const result = await login(email, password)

    if (!result.success) {
      setError(result.error || 'Erro ao fazer login')
    }

    setIsSubmitting(false)
  }

  return (
    <div className="min-h-[100dvh] flex bg-white">
      {/* Left Panel - Branding (hidden on mobile) */}
      <div className="hidden lg:flex w-1/2 bg-primary relative overflow-hidden flex-col justify-between p-12 lg:p-16">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-secondary opacity-90" />
        <div className="absolute -top-[30%] -right-[10%] w-[80%] h-[80%] rounded-full bg-gradient-radial from-secondary/30 to-transparent blur-3xl mix-blend-screen" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-radial from-white/20 to-transparent blur-3xl mix-blend-screen" />

        <div className="relative z-10">
          <Link href={`/${tenant?.slug}`}>
            {tenant?.branding.logoUrl ? (
              <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-14" />
            ) : (
              <span className="text-white font-bold text-2xl">{tenant?.name}</span>
            )}
          </Link>
        </div>

        <div className="relative z-10 text-white max-w-lg mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-sm font-medium mb-8 border border-white/10">
              <ShieldCheck size={16} className="text-secondary" />
              Clube de Benefícios {tenant?.name}
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight tracking-tight">
              Sua saúde e <span className="whitespace-nowrap">bem-estar</span> em <span className="text-secondary">um só lugar.</span>
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Acesse seu painel para gerenciar benefícios, visualizar sua carteirinha digital e aproveitar a melhor rede conveniada.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-6">
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                  <ShieldCheck className="text-secondary" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Segurança</h3>
                  <p className="text-xs text-white/70">Dados protegidos</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                  <HeartPulse className="text-secondary" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Praticidade</h3>
                  <p className="text-xs text-white/70">Tudo pelo celular</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="relative z-10">
          <p className="text-white/60 text-sm">
            &copy; {new Date().getFullYear()} {tenant?.name}. Todos os direitos reservados.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[#f8fafc] to-white -z-10" />

        <div className="lg:hidden mb-12">
          <Link href={`/${tenant?.slug}`}>
            {tenant?.branding.logoUrl ? (
              <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-14" />
            ) : (
              <span className="text-secondary font-bold text-2xl">{tenant?.name}</span>
            )}
          </Link>
        </div>

        <main className="flex-1 flex flex-col justify-center max-w-[420px] w-full mx-auto">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mb-10 text-center lg:text-left"
          >
            <h2 className="text-3xl font-extrabold text-secondary tracking-tight mb-3">Bem-vindo de volta</h2>
            <p className="text-muted-foreground text-sm">
              Entre com suas credenciais para acessar sua conta e aproveitar seus benefícios.
            </p>
          </motion.div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {error && (
              <Alert variant="destructive" className="border-red-200 bg-red-50/50 rounded-xl">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-bold text-secondary">
                E-mail de acesso
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 px-4 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-bold text-secondary">
                Sua senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-14 px-4 pr-12 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-secondary transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-14 mt-4 bg-primary hover:opacity-90 text-white font-bold text-base rounded-xl transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Conectando...
                </>
              ) : (
                'Acessar minha conta'
              )}
            </Button>
          </motion.form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            É associado do clube?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Entrar com CPF
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}
