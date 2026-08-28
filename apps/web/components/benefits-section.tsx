"use client"

import { motion } from "framer-motion"
import { 
  Stethoscope, 
  Pill, 
  Heart, 
  FlaskConical, 
  Cross, 
  UserCheck,
  ArrowRight
} from "lucide-react"
import Link from "next/link"

const benefits = [
  {
    icon: Stethoscope,
    title: "Plano Odontológico Completo",
    description: "Cobertura nacional por apenas R$ 19,90/mês por beneficiário",
    color: "#26365f",
    href: "#odonto",
  },
  {
    icon: FlaskConical,
    title: "Consultas e Exames",
    description: "Consultas a partir de R$ 40,00 em nossa rede conveniada",
    color: "#e84364",
    href: "#consultas",
  },
  {
    icon: Pill,
    title: "Benefício Farmácia",
    description: "Até 60% de desconto em mais de 1.000 farmácias parceiras",
    color: "#26365f",
    href: "#farmacia",
  },
  {
    icon: Heart,
    title: "Consultas Médicas Preventivas",
    description: "Ginecologia, Pediatria e Geriatria grátis anualmente",
    color: "#e84364",
    href: "#preventivas",
  },
  {
    icon: Cross,
    title: "Auxílio Funeral",
    description: "Reembolso de até R$ 3.000,00 em caso de falecimento",
    color: "#26365f",
    href: "#funeral",
  },
  {
    icon: UserCheck,
    title: "Benefícios ao Idoso",
    description: "Atenção especial para pessoas com 50+ anos",
    color: "#e84364",
    href: "#idoso",
  },
]

export function BenefitsSection() {
  return (
    <section id="beneficios" className="py-20 lg:py-32 bg-gradient-to-b from-white to-[#f0f4f9]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
            <Heart size={16} />
            Benefícios Múltiplos
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
            Só na Annetec você conta com{" "}
            <span className="text-[#e84364]">diversos benefícios</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Nossa prioridade é criar condições para que você e sua família tenham 
            incentivo e condições para se cuidar e cuidar de quem você ama.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <Link href={benefit.href} className="block group">
                <div className="h-full p-6 bg-white rounded-2xl shadow-lg border border-border/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#e84364]/30">
                  <div 
                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${benefit.color}15` }}
                  >
                    <benefit.icon size={28} style={{ color: benefit.color }} />
                  </div>
                  <h3 className="text-xl font-bold text-[#26365f] mb-2 group-hover:text-[#e84364] transition-colors">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {benefit.description}
                  </p>
                  <div className="flex items-center gap-2 text-sm font-medium text-[#e84364] group-hover:gap-3 transition-all">
                    Saiba mais
                    <ArrowRight size={16} />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-12"
        >
          <Link 
            href="#condicoes-gerais" 
            className="inline-flex items-center gap-2 text-[#26365f] hover:text-[#e84364] font-medium transition-colors"
          >
            Acesse aqui as Condições Gerais dos benefícios
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
