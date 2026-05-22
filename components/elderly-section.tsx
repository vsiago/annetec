"use client"

import { motion } from "framer-motion"
import { UserCheck, Heart, Gift, Phone, CheckCircle } from "lucide-react"

const elderlyBenefits = [
  {
    icon: UserCheck,
    title: "Consulta Geriátrica Grátis Anual",
    description: "Queremos que as pessoas mais maduras, com 50 anos de idade ou mais, não deixem de ir ao médico pelo menos uma vez ao ano. E para não ter mais desculpas, a Annetech oferece uma consulta anual, sem qualquer custo para o associado.",
  },
  {
    icon: Gift,
    title: "Cesta Natalidade para Netos",
    description: "No caso de nascimento de netos de associados da Annetech, independentemente de os pais serem ou não membros também, filho e mamãe ganham uma cesta com produtos para ambos.",
  },
  {
    icon: Phone,
    title: "Teleorientação em Saúde",
    description: "As pessoas com 50 anos ou mais, além de contarem com uma central de orientação médica por telefone 24 horas por dia, ainda têm acesso também a Teleorientação Gerontológica, com dicas e orientações sobre vários aspectos da Saúde & Bem-Estar de idosos e pessoas da maturidade 50+.",
  },
]

export function ElderlySection() {
  return (
    <section id="idoso" className="py-20 lg:py-32 bg-gradient-to-br from-[#1c3670] via-[#1c3670] to-[#2d4a8c] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#e5375b]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white text-sm font-medium mb-6">
            <Heart size={16} className="text-[#e5375b]" />
            Benefícios 50+
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 text-balance">
            Benefícios especiais ao idoso.{" "}
            <span className="text-[#e5375b]">Nós valorizamos sua experiência</span>
          </h2>
          <p className="text-lg text-white/80 max-w-3xl mx-auto">
            Só na Annetech, a pessoa idosa tem um tratamento diferenciado, com benefícios 
            exclusivos para valorizar, incentivar e ajudar idosos e pessoas com mais de 50 anos de idade.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {elderlyBenefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div className="h-full p-6 lg:p-8 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 transition-all duration-300 hover:bg-white/15 hover:-translate-y-1">
                {/* Icon */}
                <div className="w-14 h-14 bg-[#e5375b] rounded-xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110">
                  <benefit.icon size={28} className="text-white" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-white mb-4 leading-tight">
                  {benefit.title}
                </h3>
                <p className="text-white/70 leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Highlight Banner */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/10"
        >
          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="w-20 h-20 bg-[#e5375b] rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-4xl font-bold text-white">50+</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                Sua maturidade, sua Saúde & Bem-Estar
              </h3>
              <p className="text-white/70">
                A Annetech é o único Plano de Assistência a oferecer um conjunto de 
                vantagens, benefícios e coberturas voltadas completamente para esta faixa etária.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CheckCircle size={24} className="text-[#e5375b]" />
              <span className="text-white font-medium">Exclusivo</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
