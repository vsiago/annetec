"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { Briefcase, Store, Users, Building2, HeartHandshake, Handshake, ArrowRight, CheckCircle } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const categories = [
  {
    key: "associacoes-comerciais",
    icon: Briefcase,
    badge: "Associações Comerciais",
    title: "Fortaleça o vínculo com seus associados",
    description:
      "Sua associação comercial pode oferecer aos associados todos os benefícios ANNETEC via convênio, fortalecendo o relacionamento com a base associativa e agregando valor à sua entidade.",
    highlights: [
      "Convênio sem custo para a associação",
      "Benefícios exclusivos para associados",
      "Gestão completa pela ANNETEC",
      "Fortalecimento da base associativa",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
  {
    key: "cdl",
    icon: Store,
    badge: "CDL - Câmaras Lojistas",
    title: "Saúde & Benefícios para seus lojistas",
    description:
      "Câmaras de Dirigentes Lojistas contam com condições especiais para levar Saúde & Benefícios aos seus lojistas associados. Uma parceria que agrega valor e fideliza a base.",
    highlights: [
      "Condições especiais para CDLs",
      "Planos adaptados ao perfil lojista",
      "Rede conveniada em todo o Brasil",
      "Suporte dedicado à sua CDL",
    ],
    color: "#e84364",
    accentColor: "#26365f",
  },
  {
    key: "sindicatos",
    icon: Users,
    badge: "Sindicatos",
    title: "Benefícios para seus representados",
    description:
      "Sindicatos patronais e laborais podem disponibilizar aos seus representados planos de saúde e assistência com condições diferenciadas. A ANNETEC cuida da gestão completa dos benefícios.",
    highlights: [
      "Planos de saúde coletivos por adesão",
      "Assistência familiar completa",
      "Gestão de cobrança e faturamento",
      "Ampla rede credenciada nacional",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
  {
    key: "outras-associacoes",
    icon: Building2,
    badge: "Outras Associações",
    title: "Toda entidade pode fazer parte",
    description:
      "Federações, conselhos de classe e demais entidades sem fins lucrativos também fazem parte da União Inteligente ANNETEC. A força da coletividade em benefício dos seus membros.",
    highlights: [
      "Federações e conselhos de classe",
      "Entidades sem fins lucrativos",
      "Modelo flexível de convênio",
      "Benefícios sob medida",
    ],
    color: "#26365f",
    accentColor: "#e84364",
  },
  {
    key: "parcerias-saude",
    icon: HeartHandshake,
    badge: "Parcerias na Saúde",
    title: "A rede que sustenta nossos benefícios",
    description:
      "Operadoras, administradoras e prestadores de saúde, odontologia e bem-estar formam a rede de parceiros que sustenta os benefícios ANNETEC. Uma rede sólida e de qualidade.",
    highlights: [
      "Operadoras de saúde e odonto",
      "Administradoras de benefícios",
      "Prestadores credenciados",
      "Parceiros de bem-estar e qualidade de vida",
    ],
    color: "#e84364",
    accentColor: "#26365f",
  },
]

export default function EntidadesPage() {
  useEffect(() => {
    // Handle hash scrolling after page load
    const hash = window.location.hash
    if (hash) {
      setTimeout(() => {
        const element = document.querySelector(hash)
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      }, 300)
    }
  }, [])

  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Header */}
      <section className="pt-32 pb-16 lg:pt-40 lg:pb-20 bg-gradient-to-b from-white to-[#f0f4f9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
              <Handshake size={16} />
              Entidades Conveniadas
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Entidades Associativas & <span className="text-[#e84364]">Parcerias</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Parcerias na saúde, odonto e bem-estar. Associações Comerciais e Industriais,
              Federações Estaduais, Sindicatos e outras entidades sem fins lucrativos têm tudo a ver
              com a ANNETEC — por meio de convênio, oferecem excelentes benefícios aos seus associados.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Individual Category Sections */}
      <section className="py-20 lg:py-32 bg-white relative overflow-hidden">
        <div className="absolute top-1/4 right-0 w-96 h-96 bg-[#e84364]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-[#26365f]/5 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="space-y-16 lg:space-y-24">
            {categories.map((category, index) => {
              const isReversed = index % 2 !== 0

              return (
                <motion.div
                  key={category.key}
                  id={category.key}
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
                          backgroundColor: `${category.color}10`,
                          color: category.color,
                        }}
                      >
                        <category.icon size={16} className="text-[#e84364]" />
                        {category.badge}
                      </div>

                      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#26365f] mb-6 leading-tight">
                        {category.title}
                      </h2>

                      <p className="text-lg text-muted-foreground leading-relaxed mb-8">
                        {category.description}
                      </p>

                      <Button
                        size="lg"
                        className="bg-[#e84364] hover:bg-[#d12d4f] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] rounded-full px-8"
                        asChild
                      >
                        <Link href="/#contato">
                          Quero ser parceiro
                          <ArrowRight size={18} className="ml-2" />
                        </Link>
                      </Button>
                    </div>

                    {/* Highlights Card */}
                    <div className={isReversed ? "lg:[direction:ltr]" : ""}>
                      <div className="rounded-3xl p-8 lg:p-10 shadow-xl border border-border/50 relative overflow-hidden bg-white">
                        {/* Decorative top accent */}
                        <div
                          className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl"
                          style={{ background: `linear-gradient(90deg, ${category.accentColor}, ${category.color})` }}
                        />

                        {/* Icon */}
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
                          style={{ backgroundColor: `${category.color}15` }}
                        >
                          <category.icon size={32} style={{ color: category.color }} />
                        </div>

                        {/* Highlights List */}
                        <div className="space-y-4">
                          {category.highlights.map((highlight, hIndex) => (
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
                                style={{ color: category.accentColor }}
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

      {/* CTA Section */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-[#26365f] to-[#3a4e82] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#e84364]/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 text-balance">
              Sua entidade pode fazer parte da{" "}
              <span className="text-[#e84364]">União Inteligente</span>
            </h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-10">
              Entre em contato conosco e descubra como a ANNETEC pode agregar valor
              à sua entidade com benefícios exclusivos para seus associados.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-[#e84364] hover:bg-[#d12d4f] text-white text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 rounded-full"
                asChild
              >
                <Link href="/#contato">
                  Fale Conosco
                  <ArrowRight size={20} className="ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
