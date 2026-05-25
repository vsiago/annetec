'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, HeartPulse, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { login } = useAuth()

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
      <div className="hidden lg:flex w-1/2 bg-[#1c3670] relative overflow-hidden flex-col justify-between p-12 lg:p-16">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1c3670] via-[#162a5c] to-[#0f1d40]" />
        <div className="absolute -top-[30%] -right-[10%] w-[80%] h-[80%] rounded-full bg-gradient-radial from-[#e5375b]/20 to-transparent blur-3xl mix-blend-screen" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-gradient-radial from-[#2563eb]/20 to-transparent blur-3xl mix-blend-screen" />

        <div className="relative z-10">
          <Link href="/">
            <img src="/annetec-light.svg" alt="Annetec" className="h-10" />
          </Link>
        </div>
        
        <div className="relative z-10 text-white max-w-lg mb-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-sm font-medium mb-8 border border-white/10">
              <Sparkles size={16} className="text-[#e5375b]" />
              Plano de Assistência Familiar
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight tracking-tight">
              Sua saúde e <span className="whitespace-nowrap">bem-estar</span> em <span className="text-[#e5375b]">um só lugar.</span>
            </h1>
            <p className="text-white/70 text-lg leading-relaxed">
              Acesse seu painel para gerenciar benefícios, visualizar sua carteirinha digital e aproveitar a melhor rede conveniada do Brasil.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-6">
              <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-[#e5375b]/20 flex items-center justify-center">
                  <ShieldCheck className="text-[#e5375b]" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Segurança</h3>
                  <p className="text-xs text-white/60">Dados protegidos</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <HeartPulse className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Praticidade</h3>
                  <p className="text-xs text-white/60">Tudo pelo celular</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-sm">
            &copy; {new Date().getFullYear()} Annetec. Todos os direitos reservados.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[#f8fafc] to-white -z-10" />
        
        <div className="lg:hidden mb-12">
          <Link href="/">
            <img src="/annetec.svg" alt="Annetec" className="h-10" />
          </Link>
        </div>
        
        <main className="flex-1 flex flex-col justify-center max-w-[420px] w-full mx-auto">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="mb-10 text-center lg:text-left"
          >
            <h2 className="text-3xl font-extrabold text-[#1c3670] tracking-tight mb-3">Bem-vindo de volta</h2>
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
              <Label htmlFor="email" className="text-sm font-bold text-[#1c3670]">
                E-mail de acesso
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-14 px-4 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white focus:border-[#1c3670] focus:ring-[#1c3670]/20 transition-all text-base"
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-bold text-[#1c3670]">
                  Sua senha
                </Label>
                <Link href="#" className="text-sm font-semibold text-[#e5375b] hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-14 px-4 pr-12 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white focus:border-[#1c3670] focus:ring-[#1c3670]/20 transition-all text-base"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1c3670] transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-14 mt-4 bg-[#e5375b] hover:bg-[#d42d50] text-white font-bold text-base rounded-xl shadow-[0_10px_20px_-10px_rgba(229,55,91,0.5)] hover:shadow-[0_15px_25px_-10px_rgba(229,55,91,0.6)] transition-all"
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

          {/* Demo credentials */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-12"
          >
            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative bg-[#f8fafc] px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Acesso de Demonstração
              </div>
            </div>
            
            <div className="grid gap-3">
              {[
                { role: 'Admin', email: 'admin@annetec.com.br', pass: 'admin123', color: 'bg-[#1c3670]' },
                { role: 'Vendedor', email: 'maria@annetec.com.br', pass: 'seller123', color: 'bg-[#e5375b]' },
                { role: 'Cliente', email: 'ana@email.com', pass: 'client123', color: 'bg-teal-500' }
              ].map((cred, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => { setEmail(cred.email); setPassword(cred.pass); }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${cred.color}`}></div>
                    <span className="font-bold text-[#1c3670] text-sm">{cred.role}</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-gray-900 transition-colors">
                    {cred.email} <span className="opacity-40">/</span> {cred.pass}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  )
}

