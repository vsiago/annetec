"use client"

import { motion } from "framer-motion"
import { Heart, Activity, Sparkles, Shield } from "lucide-react"
import Image from "next/image"

export function AboutSection() {
  return (
    <section id="sobre" className="py-20 lg:py-32 bg-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#e5375b]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1c3670]/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image Side */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-square max-w-lg mx-auto">
              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-[#e5375b]/10 rounded-2xl" />
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-[#1c3670]/10 rounded-2xl" />
              
              {/* Main Image Container */}
              <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src="/about-image.png"
                  alt="Saúde & Bem-Estar - Annetec"
                  className="w-full h-full object-cover"
                />
                {/* Floating Cards */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="absolute top-8 right-8 bg-white/95 rounded-xl p-3 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <Activity size={20} className="text-[#e5375b]" />
                    <span className="text-sm font-semibold text-[#1c3670]">Prevenção</span>
                  </div>
                </motion.div>
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity }}
                  className="absolute bottom-8 left-8 bg-white/95 rounded-xl p-3 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={20} className="text-[#1c3670]" />
                    <span className="text-sm font-semibold text-[#1c3670]">Qualidade de Vida</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* Content Side */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1c3670]/5 rounded-full text-[#1c3670] text-sm font-medium mb-6">
              <Shield size={16} className="text-[#e5375b]" />
              Saiba mais sobre a Annetec
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] leading-tight mb-6 text-balance">
              Uma <span className="text-[#e5375b]">ASSIST TECH</span> focada na sua qualidade de vida
            </h2>

            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                A Annetec é uma <strong className="text-[#1c3670]">ASSIST TECH</strong>, ou seja, 
                um Plano de Assistência familiar que tem como objetivo proporcionar melhoria da qualidade 
                de vida e bem-estar aos seus associados por meio de uma gama de benefícios exclusivos, 
                pensados cuidadosamente para toda a família.
              </p>
              <p>
                Diferentemente de um plano de saúde, que é voltado principalmente para o tratamento 
                de doenças, a Annetec é um <strong className="text-[#1c3670]">&quot;plano de assistências múltiplas&quot;</strong>; 
                um &quot;plano de bem-estar&quot;; um &quot;plano de qualidade de vida&quot;.
              </p>
              <p>
                A Annetec também é um Clube de Benefícios que valoriza muito as ações que 
                impactam na <strong className="text-[#e5375b]">Prevenção de Riscos e Doenças</strong> e 
                na <strong className="text-[#e5375b]">Promoção da Saúde</strong>.
              </p>
              <p>
                Além disso, a Annetec é uma forma divertida e conveniente de os membros 
                obterem ótimos negócios em vários setores, tais como saúde, lazer, esporte, educação, 
                beleza, etc.
              </p>
            </div>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-3 gap-6">
              {[
                { number: "+10k", label: "Associados" },
                { number: "+1000", label: "Farmácias" },
                { number: "24h", label: "Atendimento" },
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="text-center"
                >
                  <p className="text-3xl font-bold text-[#e5375b]">{stat.number}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
