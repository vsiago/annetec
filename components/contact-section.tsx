"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { Send, Mail, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ContactSection() {
  const [formState, setFormState] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate form submission
    setIsSubmitted(true)
    setTimeout(() => setIsSubmitted(false), 3000)
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6 text-balance">
              Fale <span className="text-[#e5375b]">Conosco</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Preencha o formulário ao lado, ou mande um e-mail diretamente para:
            </p>

            <a 
              href="mailto:contato@annetec.com.br"
              className="inline-flex items-center gap-3 p-4 bg-[#1c3670] rounded-xl text-white hover:bg-[#152a5c] transition-colors mb-8"
            >
              <Mail size={24} />
              <span className="font-medium">contato@annetec.com.br</span>
            </a>

            {/* What We Are */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-border/50">
              <h3 className="font-bold text-[#1c3670] mb-3">O que somos</h3>
              <p className="text-muted-foreground leading-relaxed">
                A Annetec é um <strong className="text-[#1c3670]">Plano de Assistência</strong> e não um plano de saúde. 
                É uma <strong className="text-[#e5375b]">&quot;Assist Tech&quot;</strong>, focada em múltiplos benefícios para 
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
                  <h3 className="text-xl font-bold text-[#1c3670] mb-2">Mensagem Enviada!</h3>
                  <p className="text-muted-foreground">Entraremos em contato em breve.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-[#1c3670] mb-2">
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
                    <label htmlFor="email" className="block text-sm font-medium text-[#1c3670] mb-2">
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
                    <label htmlFor="phone" className="block text-sm font-medium text-[#1c3670] mb-2">
                      Telefone
                    </label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formState.phone}
                      onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="h-12"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-[#1c3670] mb-2">
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
                    className="w-full bg-[#e5375b] hover:bg-[#d12d4f] text-white h-14"
                  >
                    <Send size={18} className="mr-2" />
                    Enviar Mensagem
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
