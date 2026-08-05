"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Send, CheckCircle, UserPlus, Heart, Shield, Gift, Sparkles, ArrowRight } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

const benefits = [
  {
    icon: Heart,
    title: "Saúde & Bem-Estar",
    description: "Consultas médicas, odontologia, teleorientação 24h e muito mais para toda a família.",
  },
  {
    icon: Shield,
    title: "Proteção Completa",
    description: "Auxílio funeral, benefício farmácia com até 60% de desconto em mais de 1.000 farmácias.",
  },
  {
    icon: Gift,
    title: "Club de Vantagens",
    description: "Descontos exclusivos em saúde, lazer, educação, beleza, compras e viagens.",
  },
]

export default function CadastroPage() {
  const [formState, setFormState] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    entity: "",
    plan: "",
  })
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)
    setTimeout(() => setIsSubmitted(false), 5000)
  }

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Header */}
      <section className="pt-32 pb-16 lg:pt-40 lg:pb-20 bg-gradient-to-b from-white to-[#f0f4f9] relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#e84364]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 right-0 w-[500px] h-[500px] bg-[#26365f]/10 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
              <UserPlus size={16} />
              Cadastre-se
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Faça parte da <span className="text-[#e84364]">família ANNETEC</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Preencha o formulário abaixo e comece a aproveitar todos os benefícios 
              que a ANNETEC tem para você e sua família.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Benefits Strip */}
      <section className="py-12 bg-gradient-to-r from-[#26365f] to-[#3a4e82]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-start gap-4"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/10 shrink-0">
                  <benefit.icon size={24} className="text-[#e84364]" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{benefit.title}</h3>
                  <p className="text-sm text-white/70 leading-relaxed">{benefit.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-20 lg:py-32 bg-white relative overflow-hidden">
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-[#e84364]/5 rounded-full blur-3xl -translate-y-1/2" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-5 gap-12 lg:gap-16">
            {/* Form - 3 cols */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-3"
            >
              <div className="bg-white rounded-3xl p-8 lg:p-10 shadow-xl border border-border/50">
                {isSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16"
                  >
                    <div className="w-20 h-20 bg-green-100 rounded-full mx-auto flex items-center justify-center mb-6">
                      <CheckCircle size={40} className="text-green-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-[#26365f] mb-3">Cadastro Recebido!</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Seus dados foram enviados com sucesso. Nossa equipe entrará em contato em breve 
                      para finalizar sua associação.
                    </p>
                    <Button
                      className="bg-[#e84364] hover:bg-[#d12d4f] text-white rounded-full px-8"
                      asChild
                    >
                      <Link href="/">Voltar ao Início</Link>
                    </Button>
                  </motion.div>
                ) : (
                  <>
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold text-[#26365f] mb-2">
                        Dados para Cadastro
                      </h2>
                      <p className="text-muted-foreground">
                        Preencha seus dados e entraremos em contato para finalizar sua associação.
                      </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid sm:grid-cols-2 gap-5">
                        <div>
                          <label htmlFor="cadastro-name" className="block text-sm font-medium text-[#26365f] mb-2">
                            Nome completo *
                          </label>
                          <Input
                            id="cadastro-name"
                            type="text"
                            value={formState.name}
                            onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                            placeholder="Seu nome completo"
                            className="h-12"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="cadastro-cpf" className="block text-sm font-medium text-[#26365f] mb-2">
                            CPF *
                          </label>
                          <Input
                            id="cadastro-cpf"
                            type="text"
                            value={formState.cpf}
                            onChange={(e) => setFormState({ ...formState, cpf: e.target.value })}
                            placeholder="000.000.000-00"
                            className="h-12"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-5">
                        <div>
                          <label htmlFor="cadastro-email" className="block text-sm font-medium text-[#26365f] mb-2">
                            E-mail *
                          </label>
                          <Input
                            id="cadastro-email"
                            type="email"
                            value={formState.email}
                            onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                            placeholder="seu@email.com"
                            className="h-12"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="cadastro-phone" className="block text-sm font-medium text-[#26365f] mb-2">
                            Telefone *
                          </label>
                          <Input
                            id="cadastro-phone"
                            type="tel"
                            value={formState.phone}
                            onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                            placeholder="(00) 00000-0000"
                            className="h-12"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-5">
                        <div>
                          <label htmlFor="cadastro-city" className="block text-sm font-medium text-[#26365f] mb-2">
                            Cidade *
                          </label>
                          <Input
                            id="cadastro-city"
                            type="text"
                            value={formState.city}
                            onChange={(e) => setFormState({ ...formState, city: e.target.value })}
                            placeholder="Sua cidade"
                            className="h-12"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="cadastro-state" className="block text-sm font-medium text-[#26365f] mb-2">
                            Estado *
                          </label>
                          <select
                            id="cadastro-state"
                            value={formState.state}
                            onChange={(e) => setFormState({ ...formState, state: e.target.value })}
                            className="w-full h-12 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                          >
                            <option value="">Selecione</option>
                            <option value="AC">Acre</option>
                            <option value="AL">Alagoas</option>
                            <option value="AP">Amapá</option>
                            <option value="AM">Amazonas</option>
                            <option value="BA">Bahia</option>
                            <option value="CE">Ceará</option>
                            <option value="DF">Distrito Federal</option>
                            <option value="ES">Espírito Santo</option>
                            <option value="GO">Goiás</option>
                            <option value="MA">Maranhão</option>
                            <option value="MT">Mato Grosso</option>
                            <option value="MS">Mato Grosso do Sul</option>
                            <option value="MG">Minas Gerais</option>
                            <option value="PA">Pará</option>
                            <option value="PB">Paraíba</option>
                            <option value="PR">Paraná</option>
                            <option value="PE">Pernambuco</option>
                            <option value="PI">Piauí</option>
                            <option value="RJ">Rio de Janeiro</option>
                            <option value="RN">Rio Grande do Norte</option>
                            <option value="RS">Rio Grande do Sul</option>
                            <option value="RO">Rondônia</option>
                            <option value="RR">Roraima</option>
                            <option value="SC">Santa Catarina</option>
                            <option value="SP">São Paulo</option>
                            <option value="SE">Sergipe</option>
                            <option value="TO">Tocantins</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="cadastro-entity" className="block text-sm font-medium text-[#26365f] mb-2">
                          Entidade / Associação / Sindicato
                        </label>
                        <Input
                          id="cadastro-entity"
                          type="text"
                          value={formState.entity}
                          onChange={(e) => setFormState({ ...formState, entity: e.target.value })}
                          placeholder="Nome da entidade (se aplicável)"
                          className="h-12"
                        />
                      </div>

                      <div>
                        <label htmlFor="cadastro-plan" className="block text-sm font-medium text-[#26365f] mb-2">
                          Plano de Interesse
                        </label>
                        <select
                          id="cadastro-plan"
                          value={formState.plan}
                          onChange={(e) => setFormState({ ...formState, plan: e.target.value })}
                          className="w-full h-12 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">Selecione um plano</option>
                          <option value="essencial">ANNETEC Essencial — R$ 29,90/mês</option>
                          <option value="odonto">Plano Odontológico — R$ 19,90/mês</option>
                          <option value="assistencia">Plano de Assistência Familiar — R$ 14,90/mês</option>
                          <option value="empresarial">Plano Empresarial — Consultar</option>
                          <option value="entidade">Convênio para Entidade — Consultar</option>
                        </select>
                      </div>

                      <Button
                        type="submit"
                        size="lg"
                        className="w-full bg-[#e84364] hover:bg-[#d12d4f] text-white h-14 text-base font-bold shadow-lg hover:shadow-xl transition-all duration-300"
                      >
                        <Send size={18} className="mr-2" />
                        Enviar Cadastro
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        Ao enviar, você concorda com os termos de uso e a política de privacidade da ANNETEC.
                      </p>
                    </form>
                  </>
                )}
              </div>
            </motion.div>

            {/* Sidebar - 2 cols */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-2 space-y-6"
            >
              {/* Price Card */}
              <div className="bg-gradient-to-br from-[#26365f] to-[#3a4e82] rounded-3xl p-8 shadow-2xl text-center">
                <div className="w-16 h-16 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-4">
                  <Sparkles size={28} className="text-[#e84364]" />
                </div>
                <p className="text-white/70 text-sm mb-1">A partir de</p>
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-white text-lg">R$</span>
                  <span className="text-5xl font-bold text-white">14,90</span>
                  <span className="text-white/70">/mês</span>
                </div>
                <p className="text-white/60 text-sm mb-6">por pessoa</p>
                <div className="space-y-3 text-left">
                  {[
                    "Sem taxa de adesão",
                    "Sem carência",
                    "Sem burocracia",
                    "Cancele quando quiser",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-[#e84364] flex-shrink-0" />
                      <span className="text-white/90 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
                <h3 className="font-bold text-[#26365f] mb-3">O que somos</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  A Annetec é um <strong className="text-[#26365f]">Plano de Assistência</strong> e 
                  não um plano de saúde. É uma <strong className="text-[#e84364]">&quot;Assist Tech&quot;</strong>, 
                  focada em múltiplos benefícios para melhorar a Saúde & Bem-Estar dos seus associados.
                </p>
              </div>

              {/* Help Card */}
              <div className="bg-[#f8fafc] rounded-2xl p-6 border border-border/50">
                <h3 className="font-bold text-[#26365f] mb-3">Precisa de ajuda?</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Fale com nossa equipe para tirar dúvidas sobre planos e benefícios.
                </p>
                <Link
                  href="/#contato"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#e84364] hover:text-[#d12d4f] transition-colors"
                >
                  Fale Conosco
                  <ArrowRight size={16} />
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
