"use client"

import { motion } from "framer-motion"
import { Info, Landmark, Shield, UserCog, Building2, Users, ArrowRight, CheckCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const audiences = [
  {
    id: "publico-servidor",
    icon: Landmark,
    badge: "Servidor Público",
    title: "Valorizar o Servidor é a essência da ANNETEC",
    text: "Por meio da nossa gestão, servidores municipais, estaduais e federais acessam planos de saúde e de benefícios com condições diferenciadas. A ANNETEC celebra convênios com associações e sindicatos de servidores públicos para oferecer o melhor em Saúde & Bem-Estar.",
    highlights: [
      "Planos de saúde com condições exclusivas",
      "Benefícios para toda a família",
      "Convênios com associações de servidores",
      "Acesso a rede credenciada ampla",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
  {
    id: "publico-militar",
    icon: Shield,
    badge: "Militar",
    title: "Reconhecer e acolher a família militar",
    text: "Com a nossa força e a nossa união, a família militar acessa planos de saúde e benefícios múltiplos com condições diferenciadas. A ANNETEC entende as necessidades específicas da vida militar e oferece soluções personalizadas.",
    highlights: [
      "Benefícios adaptados à rotina militar",
      "Cobertura para dependentes",
      "Atendimento em todo o território nacional",
      "Condições especiais para militares da ativa e reserva",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
  {
    id: "publico-profissional",
    icon: UserCog,
    badge: "Profissional, Técnico e Tecnólogo",
    title: "Olhar atento para os profissionais técnicos",
    text: "O olhar atento para as profissões ligadas aos eixos Profissional, Técnico e Tecnológico, garante excelentes condições de planos de saúde e de benefícios múltiplos aos nossos associados, por meio da União Inteligente entre os públicos alcançados pela Annetec.",
    highlights: [
      "Planos adaptados por categoria profissional",
      "Descontos exclusivos em educação continuada",
      "Rede de parceiros para cada área de atuação",
      "Benefícios que valorizam sua carreira",
    ],
    color: "#e84364",
    accentColor: "#26365f",
  },
  {
    id: "publico-entidades",
    icon: Building2,
    badge: "Entidades Associativas",
    title: "A força da União Inteligente das Entidades",
    text: "Associações Comerciais e Industriais, Federações Estaduais, Sindicatos e outras entidades sem fins lucrativos têm tudo a ver com a ANNETEC. Por meio de convênio, as entidades podem oferecer excelentes benefícios disponibilizados pela ANNETEC aos seus associados.",
    highlights: [
      "Convênios personalizados para cada entidade",
      "Gestão completa de benefícios",
      "Fortalecimento do vínculo com associados",
      "Sem custo para a entidade conveniada",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
]

export function AudienceSection() {
  return (
    <section id="publicos" className="py-20 lg:py-32 bg-[#f8fafc] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-1/2 w-[800px] h-[800px] bg-[#26365f]/[0.03] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#e84364]/5 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#26365f]/5 rounded-full text-[#26365f] text-sm font-medium mb-6">
            <Users size={16} className="text-[#e84364]" />
            União Inteligente
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
            Para <span className="text-[#e84364]">quem é</span> a ANNETEC
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Benefícios sob medida para cada público que faz parte da nossa União Inteligente.
          </p>
        </motion.div>

        {/* Individual Audience Sections */}
        <div className="space-y-12 lg:space-y-20">
          {audiences.map((audience, index) => {
            const isReversed = index % 2 !== 0

            return (
              <motion.div
                key={audience.id}
                id={audience.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7 }}
                className="scroll-mt-28"
              >
                <div className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${isReversed ? "lg:[direction:rtl]" : ""}`}>
                  {/* Content Side */}
                  <div className={isReversed ? "lg:[direction:ltr]" : ""}>
                    {/* Badge */}
                    <div
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
                      style={{
                        backgroundColor: `${audience.color}10`,
                        color: audience.color,
                      }}
                    >
                      <audience.icon size={16} className="text-[#e84364]" />
                      {audience.badge}
                    </div>

                    <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#26365f] mb-6 leading-tight">
                      {audience.title}
                    </h3>

                    <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                      {audience.text}
                    </p>

                    <Button
                      size="lg"
                      className="bg-[#e84364] hover:bg-[#d12d4f] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] rounded-full px-8"
                      asChild
                    >
                      <Link href="/#contrate">
                        Associe-se agora
                        <ArrowRight size={18} className="ml-2" />
                      </Link>
                    </Button>
                  </div>

                  {/* Highlights Card Side */}
                  <div className={isReversed ? "lg:[direction:ltr]" : ""}>
                    <div
                      className="rounded-3xl p-8 lg:p-10 shadow-xl border border-border/50 relative overflow-hidden bg-white"
                    >
                      {/* Decorative top accent */}
                      <div
                        className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl"
                        style={{ background: `linear-gradient(90deg, ${audience.accentColor}, ${audience.color})` }}
                      />

                      {/* Icon */}
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
                        style={{ backgroundColor: `${audience.color}15` }}
                      >
                        <audience.icon size={32} style={{ color: audience.color }} />
                      </div>

                      {/* Highlights List */}
                      <div className="space-y-4">
                        {audience.highlights.map((highlight, hIndex) => (
                          <motion.div
                            key={hIndex}
                            initial={{ opacity: 0, x: -10 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 + hIndex * 0.1 }}
                            className="flex items-start gap-3"
                          >
                            <CheckCircle
                              size={20}
                              className="flex-shrink-0 mt-0.5"
                              style={{ color: audience.accentColor }}
                            />
                            <span className="text-[#26365f] font-medium">
                              {highlight}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
