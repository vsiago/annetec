"use client"

import { motion } from "framer-motion"
import { Briefcase, Store, Users, Building2, HeartHandshake, Handshake } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

const categories = [
  {
    key: "associacoes-comerciais",
    icon: Briefcase,
    title: "Associações Comerciais",
    description:
      "Sua associação comercial pode oferecer aos associados todos os benefícios ANNETEC via convênio, fortalecendo o relacionamento com a base associativa.",
  },
  {
    key: "cdl",
    icon: Store,
    title: "CDL - Câmaras Lojistas",
    description:
      "Câmaras de Dirigentes Lojistas contam com condições especiais para levar Saúde & Benefícios aos seus lojistas associados.",
  },
  {
    key: "sindicatos",
    icon: Users,
    title: "Sindicatos",
    description:
      "Sindicatos patronais e laborais podem disponibilizar aos seus representados planos de saúde e assistência com condições diferenciadas.",
  },
  {
    key: "outras-associacoes",
    icon: Building2,
    title: "Outras associações",
    description:
      "Federações, conselhos de classe e demais entidades sem fins lucrativos também fazem parte da União Inteligente ANNETEC.",
  },
  {
    key: "parcerias-saude",
    icon: HeartHandshake,
    title: "Parcerias na saúde, odonto e bem-estar",
    description:
      "Operadoras, administradoras e prestadores de saúde, odontologia e bem-estar formam a rede de parceiros que sustenta os benefícios ANNETEC.",
  },
]

export default function EntidadesPage() {
  return (
    <main className="min-h-screen">
      <Navbar />

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

      <section className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => (
              <motion.div
                key={category.key}
                id={category.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="scroll-mt-28 h-full p-6 bg-white rounded-2xl shadow-lg border border-border/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-[#e84364]/30"
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-[#26365f]/10">
                  <category.icon size={28} className="text-[#26365f]" />
                </div>
                <h3 className="text-xl font-bold text-[#26365f] mb-2">{category.title}</h3>
                <p className="text-muted-foreground">{category.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
