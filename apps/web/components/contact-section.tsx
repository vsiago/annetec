"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { Send, Mail, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { enviarLeadPlataformaAction } from "@/lib/actions/vendas-publico-api"

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contato@annetec.org.br"

export function ContactSection() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
    website: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setError(null)
    const result = await enviarLeadPlataformaAction({
      nome: formState.name,
      email: formState.email,
      telefone: formState.phone,
      empresa: formState.company || undefined,
      origemDetalhe: "site-contato",
      mensagem: formState.message || undefined,
      website: formState.website || undefined,
    })
    setSending(false)
    if (!result.success) {
      // 429: o servidor limita a 10 pedidos por hora por origem.
      setError(
        result.code === 'RATE_LIMITED' || result.code === 'UPSTREAM_RATE_LIMITED'
          ? 'Você já enviou muitas mensagens. Tente de novo em uma hora.'
          : result.error,
      )
      return
    }
    setIsSubmitted(true)
  }

  return (
    <section id="contato" className="py-20 lg:py-32 bg-gradient-to-b from-[#f8fafc] to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Fale <span className="text-[#e84364]">Conosco</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Preencha o formulário ao lado, ou mande um e-mail diretamente para:
            </p>

            <a 
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-3 p-4 bg-[#26365f] rounded-xl text-white hover:bg-[#152a5c] transition-colors mb-8"
            >
              <Mail size={24} />
              <span className="font-medium">{CONTACT_EMAIL}</span>
            </a>

            {/* What We Are */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-border/50">
              <h3 className="font-bold text-[#26365f] mb-3">O que somos</h3>
              <p className="text-muted-foreground leading-relaxed">
                A Annetec é um <strong className="text-[#26365f]">Plano de Assistência</strong> e não um plano de saúde. 
                É uma <strong className="text-[#e84364]">&quot;Assist Tech&quot;</strong>, focada em múltiplos benefícios para 
                melhorar a Saúde & Bem-Estar dos seus associados.
              </p>
            </div>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-border/50">
              {isSubmitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-4">
                    <CheckCircle size={32} className="text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-[#26365f] mb-2">Mensagem enviada!</h3>
                  <p className="text-muted-foreground">Recebemos o seu contato. Respondemos em horário comercial.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="relative space-y-6">
                  {error && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </p>
                  )}
                  {/* Honeypot: fora da tela e da ordem de tabulação; só robô preenche. */}
                  <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                    <label htmlFor="contato-website">Não preencha este campo</label>
                    <input
                      id="contato-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={formState.website}
                      onChange={(e) => setFormState({ ...formState, website: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-[#26365f] mb-2">
                      Nome completo
                    </label>
                    <Input
                      id="name"
                      type="text"
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      placeholder="Seu nome"
                      className="h-12"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#26365f] mb-2">
                      E-mail
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={formState.email}
                      onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                      placeholder="seu@email.com"
                      className="h-12"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-[#26365f] mb-2">
                      Telefone / WhatsApp
                    </label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formState.phone}
                      onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="h-12"
                      autoComplete="tel"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="company" className="block text-sm font-medium text-[#26365f] mb-2">
                      Entidade ou empresa <span className="font-normal text-muted-foreground">(opcional)</span>
                    </label>
                    <Input
                      id="company"
                      type="text"
                      value={formState.company}
                      onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                      placeholder="Nome da entidade ou empresa"
                      className="h-12"
                      autoComplete="organization"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-[#26365f] mb-2">
                      Mensagem
                    </label>
                    <textarea
                      id="message"
                      value={formState.message}
                      onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                      placeholder="Como podemos ajudar?"
                      rows={4}
                      className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-[#e84364] hover:bg-[#d12d4f] text-white h-14"
                    disabled={sending}
                  >
                    {sending ? <Loader2 size={18} className="mr-2 animate-spin" aria-hidden="true" /> : <Send size={18} className="mr-2" />}
                    {sending ? "Enviando…" : "Enviar mensagem"}
                  </Button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
