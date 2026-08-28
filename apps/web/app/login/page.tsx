"use client"

import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShieldCheck,
  Building2,
  Users,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HeartPulse,
  Lock,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { cpf as cpfSchema, email as emailSchema, loginInput } from "@annetec/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { loginAction, loginClientPortalAction } from "@/lib/actions/auth-api"

type LoginMode = "admin" | "tenant-admin" | "tenant"

const loginModes: { key: LoginMode; icon: typeof ShieldCheck; label: string }[] = [
  { key: "admin", icon: ShieldCheck, label: "Plataforma" },
  { key: "tenant-admin", icon: Building2, label: "Inquilino" },
  { key: "tenant", icon: Users, label: "Associado" },
]

const submitLabel: Record<LoginMode, string> = {
  admin: "Acessar Painel",
  "tenant-admin": "Entrar",
  tenant: "Acessar Meus Benefícios",
}

const passwordSchema = loginInput.shape.password

function formatCpf(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11)
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
  let out = parts.filter(Boolean).join(".")
  if (digits.length > 9) out += `-${digits.slice(9, 11)}`
  return out
}

function firstIssue(result: ReturnType<typeof emailSchema.safeParse>) {
  return result.success ? null : result.error.issues[0]?.message ?? "Valor inválido"
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<LoginMode>("admin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [cpf, setCpf] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validation = useMemo(() => {
    const emailResult = emailSchema.safeParse(email)
    const passwordResult = passwordSchema.safeParse(password)
    const cpfResult = cpfSchema.safeParse(cpf)

    return {
      email: { valid: emailResult.success, error: email ? firstIssue(emailResult) : "Campo obrigatório" },
      password: { valid: passwordResult.success, error: password ? firstIssue(passwordResult) : "Campo obrigatório" },
      cpf: { valid: cpfResult.success, error: cpf ? firstIssue(cpfResult) : "Campo obrigatório" },
    }
  }, [email, password, cpf])

  const isFormValid =
    mode === "tenant"
      ? validation.cpf.valid && validation.email.valid
      : validation.email.valid && validation.password.valid

  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }))

  const switchMode = (next: LoginMode) => {
    setMode(next)
    setError("")
    setTouched({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (mode === "tenant") {
      setTouched({ cpf: true, email: true })
    } else {
      setTouched({ email: true, password: true })
    }

    if (!isFormValid) return

    setIsSubmitting(true)
    try {
      if (mode === "admin") {
        const result = await loginAction({ email, password })
        if (!result.success) {
          setError(result.error)
          return
        }
        router.push("/admin")
        return
      }

      if (mode === "tenant-admin") {
        const result = await loginAction({ email, password })
        if (!result.success) {
          setError(result.error)
          return
        }
        const destination = result.data.tenantRole === "seller" ? "vendedor" : "admin"
        router.push(`/${result.data.tenantSlug}/${destination}`)
        return
      }

      const result = await loginClientPortalAction({ cpf, email })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/${result.data.tenantSlug}/cliente`)
    } finally {
      setIsSubmitting(false)
    }
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
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-3xl font-extrabold text-[#26365f] tracking-tight">Entrar</h2>
          </div>

          {/* Segmented mode switcher */}
          <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-gray-100 mb-8">
            {loginModes.map((item) => {
              const active = item.key === mode
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => switchMode(item.key)}
                  className={`relative flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "text-[#26365f]"
                      : "text-muted-foreground hover:text-[#26365f]"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="login-mode-pill"
                      className="absolute inset-0 bg-white rounded-xl shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <item.icon size={18} className="relative z-10" />
                  <span className="relative z-10">{item.label}</span>
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.25 }}
            >
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {error && (
                  <Alert
                    variant="destructive"
                    className="border-red-200 bg-red-50/50 rounded-xl"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* CPF (client portal login) */}
                {mode === "tenant" && (
                  <ValidatedField
                    id="cpf"
                    label="CPF"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(v) => setCpf(formatCpf(v))}
                    onBlur={() => markTouched("cpf")}
                    touched={!!touched.cpf}
                    validation={validation.cpf}
                    disabled={isSubmitting}
                    inputMode="numeric"
                  />
                )}

                {/* Email */}
                <ValidatedField
                  id="login-email"
                  label="E-mail"
                  type="email"
                  placeholder="nome@exemplo.com"
                  value={email}
                  onChange={setEmail}
                  onBlur={() => markTouched("email")}
                  touched={!!touched.email}
                  validation={validation.email}
                  disabled={isSubmitting}
                />

                {/* Password */}
                {mode !== "tenant" && (
                  <div className="space-y-2">
                    <Label
                      htmlFor="login-password"
                      className="text-sm font-bold text-[#26365f]"
                    >
                      Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => markTouched("password")}
                        className={`h-14 px-4 pr-12 rounded-xl bg-gray-50/50 focus:bg-white transition-all text-base ${
                          touched.password && !validation.password.valid
                            ? "border-red-300 focus-visible:ring-red-200"
                            : touched.password && validation.password.valid
                            ? "border-green-300"
                            : "border-gray-200"
                        }`}
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
                    <p
                      className={`text-xs flex items-center gap-1 ${
                        touched.password && !validation.password.valid
                          ? "text-red-500"
                          : touched.password && validation.password.valid
                          ? "text-green-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {touched.password && validation.password.valid && (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {touched.password && !validation.password.valid
                        ? validation.password.error
                        : "Mínimo de 8 caracteres"}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-14 mt-2 bg-[#e84364] hover:bg-[#d12d4f] text-white font-bold text-base rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-60"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    <>
                      <Lock size={18} className="mr-2" />
                      {submitLabel[mode]}
                    </>
                  )}
                </Button>
              </form>

              {mode === "tenant" && (
                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Ainda não tem cadastro?{" "}
                    <Link
                      href="/cadastro"
                      className="font-semibold text-[#e84364] hover:underline"
                    >
                      Cadastre-se
                    </Link>
                  </p>
                </div>
              )}

              <div className="mt-8 text-center">
                <Link
                  href="/"
                  className="text-sm text-muted-foreground hover:text-[#e84364] transition-colors"
                >
                  ← Voltar ao site
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

interface ValidatedFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  touched: boolean
  validation: { valid: boolean; error: string | null }
  disabled?: boolean
  type?: string
  placeholder?: string
  hint?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}

function ValidatedField({
  id,
  label,
  value,
  onChange,
  onBlur,
  touched,
  validation,
  disabled,
  type = "text",
  placeholder,
  hint,
  inputMode,
}: ValidatedFieldProps) {
  const showError = touched && !validation.valid
  const showValid = touched && validation.valid && value.length > 0

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-bold text-[#26365f]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`h-14 px-4 rounded-xl bg-gray-50/50 focus:bg-white transition-all text-base ${
            showError
              ? "border-red-300 focus-visible:ring-red-200 pr-11"
              : showValid
              ? "border-green-300 pr-11"
              : "border-gray-200"
          }`}
          disabled={disabled}
          aria-invalid={showError}
        />
        {showValid && (
          <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
        )}
      </div>
      {showError ? (
        <p className="text-xs text-red-500">{validation.error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
