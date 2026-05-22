"use client"

import { motion } from "framer-motion"
import { Phone, Stethoscope, UserCheck, Clock, ArrowRight } from "lucide-react"
import Link from "next/link"

const teleservices = [
  {
    icon: Stethoscope,
    title: "Teleorientação Médica por Telefone",
    description: "Uma equipe de profissionais especializados estará pronta para tirar suas dúvidas, passar orientações seguras sobre a sua saúde e transmitir calma e tranquilidade para você.",
    phone: "0800 000 0000",
    availability: "24 horas por dia",
    color: "#1c3670",
  },
  {
    icon: UserCheck,
    title: "Teleorientação Geral do Idoso",
    description: "Pessoas com 50 anos de idade ou mais e os idosos, podem agendar uma orientação geral sobre cuidados especializados de Gerontologia e outros aspectos sobre prevenção e qualidade de vida.",
    phone: "0800 000 0000",
    availability: "Horário comercial",
    color: "#e5375b",
  },
]

export function TeleorientationSection() {
  return (
    <section id="teleorientacao" className="py-20 lg:py-32 bg-gradient-to-b from-[#f8fafc] to-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxYzM2NzAiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
      
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
            <Phone size={16} className="text-[#e5375b]" />
            Teleorientação em Saúde
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6 text-balance">
            Fique tranquilo que tem{" "}
            <span className="text-[#e5375b]">profissionais de saúde 24 horas</span> por dia
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Basta ligar para o telefone indicado que uma equipe de profissionais especializados 
            estará pronta para orientar você. Tudo isso é gratuito e ilimitado, você pode ligar 
            quantas vezes precisar.
          </p>
        </motion.div>

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 mb-16">
          {teleservices.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group"
            >
              <div className="h-full bg-white rounded-3xl p-8 shadow-xl border border-border/50 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                {/* Phone Mockup Header */}
                <div 
                  className="rounded-2xl p-6 mb-6 relative overflow-hidden"
                  style={{ backgroundColor: `${service.color}10` }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div 
                      className="w-14 h-14 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: service.color }}
                    >
                      <service.icon size={28} className="text-white" />
                    </div>
                    <div className="flex items-center gap-2 bg-white/80 rounded-full px-3 py-1">
                      <Clock size={14} className="text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{service.availability}</span>
                    </div>
                  </div>
                  
                  {/* Phone Number */}
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">Ligue para</p>
                    <p className="text-xl font-bold" style={{ color: service.color }}>{service.phone}</p>
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-[#1c3670] mb-4">
                  {service.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {service.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Benefits */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-gradient-to-r from-[#1c3670] to-[#2d4a8c] rounded-3xl p-8 lg:p-12"
        >
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { icon: "🆓", title: "100% Gratuito", desc: "Sem custo adicional" },
              { icon: "♾️", title: "Ilimitado", desc: "Ligue quantas vezes precisar" },
              { icon: "⏰", title: "24 Horas", desc: "Atendimento a qualquer hora" },
            ].map((benefit, index) => (
              <div key={index}>
                <span className="text-4xl mb-4 block">{benefit.icon}</span>
                <h4 className="text-xl font-bold text-white mb-2">{benefit.title}</h4>
                <p className="text-white/70">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
