"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Shield, Heart, Phone, Users, CheckCircle } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-white via-[#f0f4f9] to-white pt-20">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#e5375b]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#1c3670]/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-[#1c3670]/5 to-transparent rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1c3670]/5 rounded-full text-[#1c3670] text-sm font-medium mb-6"
            >
              <Shield size={16} className="text-[#e5375b]" />
              Plano de Assistência Familiar
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1c3670] leading-tight text-balance"
            >
              O primeiro Plano de Assistência com{" "}
              <span className="text-[#e5375b]">benefícios incríveis</span> para
              toda a família
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              Cuide da Saúde & Bem-Estar de quem você ama com consultas, exames,
              odontologia, farmácia e muito mais.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button
                size="lg"
                className="bg-[#e5375b] hover:bg-[#d12d4f] text-white text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 animate-pulse-glow"
                asChild
              >
                <Link href="#contrate">
                  Contrate Agora!
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-[#1c3670] text-[#1c3670] hover:bg-[#1c3670] hover:text-white text-lg px-8 py-6 transition-all duration-300"
                asChild
              >
                <Link href="#beneficios">Conheça os Benefícios</Link>
              </Button>
            </motion.div>

            {/* Price Highlight */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-8 p-4 bg-white rounded-2xl shadow-lg border border-border/50 inline-block"
            >
              <p className="text-sm text-muted-foreground">A partir de</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-[#1c3670]">R$</span>
                <span className="text-4xl font-bold text-[#e5375b]">14,90</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Plano Individual
              </p>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-8 flex flex-wrap gap-6 justify-center lg:justify-start"
            >
              {[
                { icon: Users, text: "+10.000 associados" },
                { icon: Heart, text: "Saúde & Bem-Estar" },
                { icon: Phone, text: "Suporte 24h" },
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icon size={18} className="text-[#e5375b]" />
                  <span>{item.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Content - Phone Mockups */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative"
          >
            <div className="relative flex justify-center items-center">
              {/* Main Phone */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-20"
              >
                <div className="w-64 h-[500px] bg-[#1c3670] rounded-[3rem] p-3 shadow-2xl">
                  <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
                    {/* Phone Screen Content */}
                    <div className="p-4 h-full flex flex-col">
                      <div className="text-center py-4">
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <span className="text-lg font-bold text-[#1c3670]">Anne</span>
                          <span className="text-lg font-bold text-[#e5375b]">tech</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Teleorientação em Saúde</p>
                      </div>
                      
                      {/* Feature Cards */}
                      <div className="space-y-3 flex-1">
                        {[
                          { icon: "🩺", title: "Orientação Médica", desc: "24 horas" },
                          { icon: "👴", title: "Gerontologia", desc: "Para 50+" },
                          { icon: "👶", title: "Pediatria", desc: "Até 12 anos" },
                          { icon: "👩", title: "Ginecologia", desc: "Anual grátis" },
                        ].map((item, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.8 + index * 0.1 }}
                            className="flex items-center gap-3 p-3 bg-gradient-to-r from-[#f0f4f9] to-white rounded-xl"
                          >
                            <span className="text-2xl">{item.icon}</span>
                            <div>
                              <p className="text-sm font-semibold text-[#1c3670]">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                            <CheckCircle size={16} className="text-green-500 ml-auto" />
                          </motion.div>
                        ))}
                      </div>

                      {/* Bottom CTA */}
                      <div className="mt-4">
                        <div className="bg-[#e5375b] text-white text-center py-3 rounded-xl text-sm font-semibold">
                          Acessar Teleorientação
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Secondary Phone - Benefits */}
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-8 top-12 z-10 hidden lg:block"
              >
                <div className="w-52 h-[400px] bg-[#e5375b] rounded-[2.5rem] p-3 shadow-xl transform -rotate-6">
                  <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden">
                    <div className="p-3 h-full flex flex-col">
                      <div className="text-center py-3">
                        <p className="text-sm font-bold text-[#1c3670]">Benefícios Múltiplos</p>
                      </div>
                      <div className="space-y-2 flex-1">
                        {[
                          { icon: "🦷", text: "Odontologia" },
                          { icon: "💊", text: "Farmácia -60%" },
                          { icon: "🏥", text: "Consultas" },
                          { icon: "🔬", text: "Exames" },
                          { icon: "⚱️", text: "Auxílio Funeral" },
                        ].map((item, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-[#f0f4f9] rounded-lg">
                            <span className="text-lg">{item.icon}</span>
                            <span className="text-xs font-medium text-[#1c3670]">{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Tertiary Phone - Vantagens */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-8 top-20 z-10 hidden lg:block"
              >
                <div className="w-48 h-[350px] bg-[#1c3670] rounded-[2.5rem] p-3 shadow-xl transform rotate-6">
                  <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden">
                    <div className="p-3 h-full flex flex-col">
                      <div className="text-center py-3">
                        <p className="text-sm font-bold text-[#1c3670]">Club de Vantagens</p>
                      </div>
                      <div className="space-y-2 flex-1">
                        {[
                          { icon: "🎉", text: "Lazer" },
                          { icon: "📚", text: "Educação" },
                          { icon: "💄", text: "Beleza" },
                          { icon: "🏋️", text: "Esporte" },
                        ].map((item, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-[#e5375b]/10 rounded-lg">
                            <span className="text-lg">{item.icon}</span>
                            <span className="text-xs font-medium text-[#1c3670]">{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 border-2 border-[#1c3670]/30 rounded-full flex justify-center pt-2"
        >
          <div className="w-1.5 h-3 bg-[#1c3670]/50 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
