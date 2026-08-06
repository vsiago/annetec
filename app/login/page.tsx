"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShieldCheck,
  Building2,
  Users,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  HeartPulse,
  Lock,
  ChevronLeft,
  ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

type LoginMode = "select" | "admin" | "tenant-admin" | "tenant"

const loginModes = [
  {
    key: "admin" as LoginMode,
    icon: ShieldCheck,
    title: "Administrador da Plataforma",
    description: "Acesso ao painel de gerenciamento da plataforma ANNETEC.",
    color: "#26365f",
    bgGradient: "from-[#26365f] to-[#3a4e82]",
  },
  {
    key: "tenant-admin" as LoginMode,
    icon: Building2,
    title: "Admin do Tenant",
    description: "Gerencie sua entidade conveniada, associados e benefícios.",
    color: "#e84364",
    bgGradient: "from-[#e84364] to-[#ff6b8b]",
  },
  {
    key: "tenant" as LoginMode,
    icon: Users,
    title: "Associado / Cliente",
    description: "Acesse seus benefícios, carteirinha digital e mais.",
    color: "#26365f",
    bgGradient: "from-[#26365f] to-[#3a4e82]",
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<LoginMode>("select")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tenantSlug, setTenantSlug] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentMode = loginModes.find((m) => m.key === mode)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    // Simulate delay
    await new Promise((r) => setTimeout(r, 800))

    if (mode === "admin") {
      // Redirect to admin login page which has the actual auth context
      router.push("/admin/login")
    } else if (mode === "tenant-admin") {
      if (!tenantSlug.trim()) {
        setError("Informe o identificador do tenant.")
        setIsSubmitting(false)
        return
      }
      // Redirect to tenant login page
      router.push(`/${tenantSlug}/login`)
    } else if (mode === "tenant") {
      if (!tenantSlug.trim()) {
        setError("Informe o identificador da sua entidade.")
        setIsSubmitting(false)
        return
      }
      router.push(`/${tenantSlug}/login`)
    }

    setIsSubmitting(false)
  }

  const resetForm = () => {
    setEmail("")
    setPassword("")
    setTenantSlug("")
    setError("")
    setShowPassword(false)
  }

  return (
    <div className="min-h-[100dvh] flex bg-white">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex w-1/2 bg-[#e84364] relative overflow-hidden flex-col justify-between p-12 lg:p-16">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#e84364] via-[#e84364] to-[#26365f] opacity-90" />
        <div className="absolute -top-[30%] -right-[10%] w-[80%] h-[80%] rounded-full bg-[#26365f]/20 blur-3xl" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-white/10 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/">
            <img src="/annetec-light.svg" alt="Annetec" className="h-14" />
          </Link>
        </div>

        {/* Content */}
        <div className="relative z-10 text-white max-w-lg mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-sm font-medium mb-8 border border-white/10">
              <ShieldCheck size={16} />
              União Inteligente
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight tracking-tight">
              Sua saúde e{" "}
              <span className="whitespace-nowrap">bem-estar</span> em{" "}
              <span className="text-[#26365f]">um só lugar.</span>
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Acesse seu painel para gerenciar benefícios, visualizar sua
              carteirinha digital e aproveitar a melhor rede conveniada.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-6">
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-[#26365f]/30 flex items-center justify-center">
                  <ShieldCheck className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Segurança</h3>
                  <p className="text-xs text-white/70">Dados protegidos</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-sm p-4 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-[#26365f]/30 flex items-center justify-center">
                  <HeartPulse className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Praticidade</h3>
                  <p className="text-xs text-white/70">Tudo pelo celular</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-white/60 text-sm">
            &copy; {new Date().getFullYear()} ANNETEC. Todos os direitos
            reservados.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex flex-col p-6 sm:p-12 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-[#f8fafc] to-white -z-10" />

        {/* Mobile Logo */}
        <div className="lg:hidden mb-8">
          <Link href="/">
            <img src="/annetec.svg" alt="Annetec" className="h-12" />
          </Link>
        </div>

        <main className="flex-1 flex flex-col justify-center max-w-[460px] w-full mx-auto">
          <AnimatePresence mode="wait">
            {mode === "select" ? (
              /* ────── Mode Selection ────── */
              <motion.div
                key="select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-10 text-center lg:text-left">
                  <h2 className="text-3xl font-extrabold text-[#26365f] tracking-tight mb-3">
                    Como deseja acessar?
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Selecione o tipo de acesso para entrar na plataforma.
                  </p>
                </div>

                <div className="space-y-4">
                  {loginModes.map((item, index) => (
                    <motion.button
                      key={item.key}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
                      onClick={() => {
                        resetForm()
                        setMode(item.key)
                      }}
                      className="w-full flex items-center gap-4 p-5 rounded-2xl border border-border/50 bg-white hover:shadow-lg hover:-translate-y-0.5 hover:border-[#e84364]/30 transition-all duration-300 text-left group"
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundColor: `${item.color}15` }}
                      >
                        <item.icon
                          size={26}
                          style={{ color: item.color }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[#26365f] mb-0.5">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-snug">
                          {item.description}
                        </p>
                      </div>
                      <ArrowRight
                        size={20}
                        className="text-muted-foreground/40 group-hover:text-[#e84364] transition-colors shrink-0"
                      />
                    </motion.button>
                  ))}
                </div>

                {/* Exemplo de Inquilino: MepCard */}
                <div className="mt-8 pt-6 border-t border-border/60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#C4737B]" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Exemplo de Inquilino Ativo
                      </span>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#C4737B]/10 text-[#C4737B] font-medium border border-[#C4737B]/20">
                      MepCard
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl border border-[#C4737B]/25 bg-gradient-to-br from-[#C4737B]/5 via-white to-white shadow-sm hover:shadow-md hover:border-[#C4737B]/40 transition-all duration-300">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <img src="/mepcard-logo.svg" alt="MepCard" className="h-8 object-contain" />
                      <span className="text-[11px] text-muted-foreground font-mono">/mepcard</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                      Inquilino completo de demonstração com branding exclusivo, planos de saúde, rede credenciada e portais.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs font-medium border-[#C4737B]/30 text-[#C4737B] hover:bg-[#C4737B]/10 hover:text-[#C4737B]"
                        asChild
                      >
                        <Link href="/mepcard" target="_blank">
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          Visitar Site
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        className="w-full text-xs font-medium bg-[#C4737B] hover:bg-[#B5677A] text-white shadow-sm"
                        asChild
                      >
                        <Link href="/mepcard/login">
                          <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                          Ir ao Login
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-center">
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-[#e84364] transition-colors"
                  >
                    ← Voltar ao site
                  </Link>
                </div>
              </motion.div>
            ) : (
              /* ────── Login Form ────── */
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Back button */}
                <button
                  onClick={() => {
                    resetForm()
                    setMode("select")
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#26365f] transition-colors mb-8 group"
                >
                  <ChevronLeft
                    size={16}
                    className="group-hover:-translate-x-0.5 transition-transform"
                  />
                  Voltar
                </button>

                {/* Mode Header */}
                <div className="mb-8 text-center lg:text-left">
                  <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4"
                    style={{
                      backgroundColor: `${currentMode?.color}10`,
                      color: currentMode?.color,
                    }}
                  >
                    {currentMode && <currentMode.icon size={16} />}
                    {currentMode?.title}
                  </div>
                  <h2 className="text-3xl font-extrabold text-[#26365f] tracking-tight mb-3">
                    {mode === "admin"
                      ? "Acesso Administrativo"
                      : mode === "tenant-admin"
                      ? "Administrar Tenant"
                      : "Acessar sua conta"}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {mode === "admin"
                      ? "Entre com suas credenciais de superadmin ou administrador da plataforma."
                      : mode === "tenant-admin"
                      ? "Informe o identificador do seu tenant e suas credenciais de administrador."
                      : "Informe o identificador da sua entidade para acessar seus benefícios."}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <Alert
                      variant="destructive"
                      className="border-red-200 bg-red-50/50 rounded-xl"
                    >
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* Tenant slug field for tenant modes */}
                  {(mode === "tenant-admin" || mode === "tenant") && (
                    <div className="space-y-2">
                      <Label
                        htmlFor="tenant-slug"
                        className="text-sm font-bold text-[#26365f]"
                      >
                        Identificador do Tenant *
                      </Label>
                      <Input
                        id="tenant-slug"
                        type="text"
                        placeholder="ex: annetec"
                        value={tenantSlug}
                        onChange={(e) =>
                          setTenantSlug(
                            e.target.value.toLowerCase().replace(/\s/g, "")
                          )
                        }
                        required
                        className="h-14 px-4 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base"
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">
                        O identificador único da sua entidade na plataforma.
                      </p>
                    </div>
                  )}

                  {/* Email */}
                  {mode === "admin" && (
                    <div className="space-y-2">
                      <Label
                        htmlFor="login-email"
                        className="text-sm font-bold text-[#26365f]"
                      >
                        E-mail de acesso
                      </Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="nome@exemplo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 px-4 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base"
                        disabled={isSubmitting}
                      />
                    </div>
                  )}

                  {/* Password */}
                  {mode === "admin" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="login-password"
                          className="text-sm font-bold text-[#26365f]"
                        >
                          Sua senha
                        </Label>
                        <Link
                          href="#"
                          className="text-sm font-semibold text-[#e84364] hover:underline"
                        >
                          Esqueceu a senha?
                        </Link>
                      </div>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-14 px-4 pr-12 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-all text-base"
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#26365f] transition-colors p-1"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-14 mt-2 bg-[#e84364] hover:bg-[#d12d4f] text-white font-bold text-base rounded-xl transition-all shadow-lg hover:shadow-xl"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {mode === "admin"
                          ? "Entrando..."
                          : "Redirecionando..."}
                      </>
                    ) : (
                      <>
                        <Lock size={18} className="mr-2" />
                        {mode === "admin"
                          ? "Acessar Painel"
                          : "Continuar"}
                      </>
                    )}
                  </Button>
                </form>

                {/* Demo credentials for admin */}
                {mode === "admin" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mt-10"
                  >
                    <div className="relative flex items-center justify-center mb-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative bg-[#f8fafc] px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Acesso de Demonstração
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {[
                        {
                          role: "Superadmin",
                          email: "superadmin@annetec.com.br",
                          pass: "super123",
                          color: "bg-[#26365f]",
                        },
                        {
                          role: "Operações",
                          email: "operacoes@annetec.com.br",
                          pass: "operacoes123",
                          color: "bg-[#e84364]",
                        },
                      ].map((cred, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group"
                          onClick={() => {
                            setEmail(cred.email)
                            setPassword(cred.pass)
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${cred.color}`}
                            />
                            <span className="font-bold text-[#26365f] text-sm">
                              {cred.role}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground group-hover:text-gray-900 transition-colors">
                            {cred.email}{" "}
                            <span className="opacity-40">/</span>{" "}
                            {cred.pass}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Demo tenant slugs */}
                {(mode === "tenant-admin" || mode === "tenant") && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mt-10"
                  >
                    <div className="relative flex items-center justify-center mb-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative bg-[#f8fafc] px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Tenants de Demonstração
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {[
                        {
                          name: "ANNETEC",
                          slug: "annetec",
                          color: "bg-[#e84364]",
                        },
                      ].map((t, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer group"
                          onClick={() => setTenantSlug(t.slug)}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${t.color}`}
                            />
                            <span className="font-bold text-[#26365f] text-sm">
                              {t.name}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground group-hover:text-gray-900 transition-colors">
                            {t.slug}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Não tem uma conta?{" "}
                    <Link
                      href="/cadastro"
                      className="font-semibold text-[#e84364] hover:underline"
                    >
                      Cadastre-se
                    </Link>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
