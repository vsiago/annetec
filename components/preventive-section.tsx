"use client"

import { motion } from "framer-motion"
import { Heart, Baby, UserRound, ArrowRight, CheckCircle } from "lucide-react"
import Link from "next/link"

const preventiveConsultations = [
  {
    icon: UserRound,
    title: "Consulta Geriátrica e Gerontológica Grátis",
    description: "Na Annetech você que tem mais que 50 anos é super valorizado. Único Plano de Assistência a oferecer uma consulta Geriátrica e Gerontológica anual para você ficar em dia com a sua saúde global.",
    highlight: "Para 50+ anos",
    color: "#1c3670",
  },
  {
    icon: Heart,
    title: "Para as Mulheres, Prevenção é Fundamental",
    description: "Na Annetech cada Associada têm direito a uma consulta Ginecológica anual gratuita. Assim, você se previne e se mantém ativa para curtir a vida com Saúde & Bem-Estar.",
    highlight: "Ginecologia anual grátis",
    color: "#e5375b",
  },
  {
    icon: Baby,
    title: "As Crianças Também Têm Atenção Especial",
    description: "Queremos que seu filho também se previna de riscos e doenças típicas desta faixa etária. Por isso, Associados dependentes com menos que 12 anos têm direito à uma consulta Pediátrica grátis por ano de contrato.",
    highlight: "Pediatria até 12 anos",
    color: "#1c3670",
  },
]

export function PreventiveSection() {
  return (
    <section id="preventivas" className="py-20 lg:py-32 bg-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-[#e5375b]/5 rounded-full blur-3xl -translate-y-1/2" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1c3670]/10 rounded-full text-[#1c3670] text-sm font-medium mb-6">
            <CheckCircle size={16} className="text-[#e5375b]" />
            Prevenção
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6 text-balance">
            Consultas Médicas Preventivas: um incentivo à mais para{" "}
            <span className="text-[#e5375b]">cuidar da sua saúde</span>
          </h2>
        </motion.div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {preventiveConsultations.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div className="h-full p-6 lg:p-8 bg-gradient-to-br from-white to-[#f8fafc] rounded-2xl shadow-lg border border-border/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                {/* Icon */}
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <item.icon size={32} style={{ color: item.color }} />
                </div>

                {/* Highlight Badge */}
                <div 
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mb-4"
                  style={{ 
                    backgroundColor: `${item.color}15`, 
                    color: item.color 
                  }}
                >
                  {item.highlight}
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-[#1c3670] mb-4 leading-tight">
                  {item.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-12"
        >
          <Link 
            href="#regulamento-preventivas" 
            className="inline-flex items-center gap-2 text-[#1c3670] hover:text-[#e5375b] font-medium transition-colors"
          >
            Acesse aqui o Regulamento/Condições Gerais deste benefício
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
