'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { email as emailSchema, loginInput } from '@annetec/contracts'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, HeartPulse, ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { googleLoginConfigAction, loginMethodAction } from '@/lib/actions/auth-api'
import { cpfError, maskCpfInput } from '@/lib/cpf'
import { GoogleSignInButton, googleClientIdConfigured } from '@/components/auth/google-sign-in-button'
import { SESSION_ENDED_REASON } from '@/lib/auth/redirect'

type Step = 'email' | 'password' | 'portal'

const passwordSchema = loginInput.shape.password

const inputClassName =
  'h-14 px-4 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base'

// Login com marca do inquilino, único para admin, vendedor e associado. A
// pessoa digita só o e-mail; a API diz se o próximo passo é CPF (associado
// deste inquilino) ou senha (admin/vendedor, ou e-mail que ela não revela). O
// slug vem da URL e vai junto em todas as chamadas, então só entra quem tem
// vínculo com ESTE inquilino; o papel decide o destino. Em qualquer etapa, o
// botão do Google é a alternativa de um clique (só aparece com o client id no
// web E o login com Google ligado na API).
export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cpf, setCpf] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const { login, loginPortal, loginGoogle } = useAuth()
  const { tenant } = useTenant()
  // `?motivo=sessao-encerrada`: a sessão anterior caiu no servidor (ver
  // `endSession` no AuthProvider). Some assim que a pessoa tenta entrar.
  const searchParams = useSearchParams()
  const [sessionEndedNotice, setSessionEndedNotice] = useState(
    () => searchParams?.get('motivo') === SESSION_ENDED_REASON,
  )
  useEffect(() => {
    if (searchParams?.get('motivo') === SESSION_ENDED_REASON) setSessionEndedNotice(true)
  }, [searchParams])

  // A API diz se o login com Google está configurado lá; sem client id no web
  // o botão não teria como existir, então nem pergunta.
  useEffect(() => {
    if (!googleClientIdConfigured) return
    let cancelled = false
    void googleLoginConfigAction().then(result => {
      if (!cancelled && result.success) setGoogleEnabled(result.data.googleEnabled)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const showGoogle = googleClientIdConfigured && googleEnabled

  const handleGoogleCredential = async (credential: string) => {
    setError('')
    setSessionEndedNotice(false)
    setIsSubmitting(true)
    const result = await loginGoogle(credential)
    if (!result.success) {
      setError(result.error || 'Não foi possível entrar com o Google. Tente novamente.')
    }
    setIsSubmitting(false)
  }

  const changeEmail = () => {
    setStep('email')
    setPassword('')
    setCpf('')
    setShowPassword(false)
    setError('')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSessionEndedNotice(false)
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setError(email.trim() ? 'Digite um e-mail válido, como nome@exemplo.com.' : 'Informe seu e-mail para continuar.')
      return
    }
    if (!tenant) {
      setError('Não foi possível carregar os dados do clube. Recarregue a página e tente de novo.')
      return
    }

    setIsSubmitting(true)
    const result = await loginMethodAction({ tenantSlug: tenant.slug, email: parsed.data })
    setIsSubmitting(false)
    if (!result.success) {
      setError(result.error || 'Não foi possível verificar seu e-mail agora. Tente novamente em instantes.')
      return
    }
    setEmail(parsed.data)
    setGoogleEnabled(result.data.googleEnabled)
    setStep(result.data.method)
  }

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (step === 'password') {
      if (!password) {
        setError('Informe sua senha.')
        return
      }
      // Senha abaixo do mínimo nunca é válida: responde como credencial
      // errada, sem ida ao servidor.
      if (!passwordSchema.safeParse(password).success) {
        setError('E-mail ou senha inválidos.')
        return
      }
    } else {
      const problem = cpfError(cpf)
      if (problem) {
        setError(problem === 'Informe o CPF' ? 'Informe o CPF do titular.' : `${problem}. Confira os números digitados.`)
        return
      }
    }

    setIsSubmitting(true)
    const result = step === 'password' ? await login(email, password) : await loginPortal(cpf, email)
    if (!result.success) {
      setError(
        result.error ||
          (step === 'password'
            ? 'Não foi possível entrar. Confira o e-mail e a senha.'
            : 'Não foi possível entrar. Confira o CPF e o e-mail.'),
      )
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
              {step === 'email'
                ? 'Informe seu e-mail para acessar sua conta e aproveitar seus benefícios.'
                : step === 'password'
                  ? 'Digite sua senha para continuar.'
                  : 'Para sua segurança, confirme o CPF do titular da assinatura.'}
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.form
              key={step === 'email' ? 'email' : 'credential'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              onSubmit={step === 'email' ? handleEmailSubmit : handleCredentialSubmit}
              className="space-y-5"
              noValidate
            >
              {sessionEndedNotice && !error && (
                <Alert className="rounded-xl border-amber-200 bg-amber-50/60 text-amber-900">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-amber-900">
                    Sua sessão foi encerrada. Entre novamente.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive" className="border-red-200 bg-red-50/50 rounded-xl">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {step === 'email' ? (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-bold text-secondary">
                    E-mail de acesso
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="nome@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClassName}
                    disabled={isSubmitting}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-sm font-bold text-secondary">E-mail de acesso</span>
                  <div className="flex items-center justify-between gap-3 h-14 px-4 rounded-xl border border-gray-200 bg-gray-50/50">
                    <span className="truncate text-base text-foreground">{email}</span>
                    <button
                      type="button"
                      onClick={changeEmail}
                      disabled={isSubmitting}
                      className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Trocar e-mail
                    </button>
                  </div>
                </div>
              )}

              {step === 'password' && (
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-bold text-secondary">
                    Sua senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      autoFocus
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`${inputClassName} pr-12`}
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-secondary transition-colors p-1"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              )}

              {step === 'portal' && (
                <div className="space-y-2">
                  <Label htmlFor="cpf" className="text-sm font-bold text-secondary">
                    CPF do titular
                  </Label>
                  <Input
                    id="cpf"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpfInput(e.target.value))}
                    required
                    className={inputClassName}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">O mesmo CPF informado na contratação da assinatura.</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-14 mt-4 bg-primary hover:opacity-90 text-white font-bold text-base rounded-xl transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {step === 'email' ? 'Verificando...' : 'Conectando...'}
                  </>
                ) : step === 'email' ? (
                  'Continuar'
                ) : (
                  'Acessar minha conta'
                )}
              </Button>

              {showGoogle && (
                <>
                  <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-gray-200" />
                    ou
                    <span className="h-px flex-1 bg-gray-200" />
                  </div>
                  <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isSubmitting} />
                </>
              )}
            </motion.form>
          </AnimatePresence>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Ainda não é associado?{' '}
            <Link href={`/${tenant?.slug}/planos`} className="font-semibold text-primary hover:underline">
              Conheça os planos
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}
