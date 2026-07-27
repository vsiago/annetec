"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Info, Landmark, Shield, UserCog, Building2, Users } from "lucide-react"

const audiences = [
  {
    key: "sobre",
    label: "Sobre nós",
    icon: Info,
    title: "Sobre nós",
    text: "A ANNETEC é uma instituição sem fins lucrativos que transforma a força coletiva de associações, sindicatos, prefeituras e categorias profissionais em acesso a Saúde e Benefícios Múltiplos com escala e economia. Isso é União Inteligente.",
  },
  {
    key: "servidor",
    label: "Servidor Público",
    icon: Landmark,
    title: "Servidor Público",
    text: "Valorizar o servidor é a essência da ANNETEC. Por meio da nossa gestão, servidores municipais, estaduais e federais acessam planos de saúde e de benefícios com condições diferenciadas.",
  },
  {
    key: "militar",
    label: "Militar",
    icon: Shield,
    title: "Militar",
    text: "Reconhecer e acolher a família militar também está nos nossos planos. Com a nossa força e a nossa união, a família militar acessa planos de saúde e benefícios múltiplos com condições diferenciadas.",
  },
  {
    key: "profissional",
    label: "Profissional, Técnico e Tecnólogo",
    icon: UserCog,
    title: "Profissional, Técnico e Tecnólogo",
    text: "O olhar atento para as profissões ligadas aos eixos Profissional, Técnico e Tecnológico, garante excelentes condições de planos de saúde e de benefícios múltiplos aos nossos associados, por meio da União Inteligente entre os públicos alcançados pela Annetec.",
  },
  {
    key: "entidades",
    label: "Entidades Associativas",
    icon: Building2,
    title: "Entidades Associativas",
    text: "Associações Comerciais e Industriais, Federações Estaduais, Sindicatos e outras entidades sem fins lucrativos têm tudo a ver com a ANNETEC. Por meio de convênio, as entidades podem oferecer excelentes benefícios disponibilizados pela ANNETEC aos seus associados. Aproveite a força da União Inteligente das Entidades Associativas!",
  },
]

export function AudienceSection() {
  const [active, setActive] = useState(audiences[0].key)

  useEffect(() => {
    const hash = window.location.hash.replace("#publico-", "")
    if (audiences.some((a) => a.key === hash)) {
      setActive(hash)
    }
  }, [])

  const current = audiences.find((a) => a.key === active) ?? audiences[0]

  return (
    <section id="publicos" className="py-20 lg:py-32 bg-[#f8fafc]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
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

        <div className="grid lg:grid-cols-[320px_1fr] gap-6 lg:gap-10">
          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0"
          >
            {audiences.map((audience) => (
              <button
                key={audience.key}
                onClick={() => setActive(audience.key)}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-left font-semibold whitespace-nowrap lg:whitespace-normal shrink-0 transition-all duration-300 ${
                  active === audience.key
                    ? "bg-[#26365f] text-white shadow-lg"
                    : "bg-white text-[#26365f] hover:bg-[#26365f]/5 border border-border/50"
                }`}
              >
                <audience.icon
                  size={20}
                  className={active === audience.key ? "text-[#e84364]" : "text-[#e84364]/80"}
                />
                {audience.label}
              </button>
            ))}
          </motion.div>

          {/* Content Panel */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white rounded-3xl shadow-xl border border-border/50 p-8 lg:p-12 min-h-[280px] flex items-center"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-2xl sm:text-3xl font-bold text-[#26365f] mb-4">
                  {current.title}
                </h3>
                <p className="text-lg text-muted-foreground leading-relaxed">{current.text}</p>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
