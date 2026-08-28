"use client"

import { motion } from "framer-motion"
import { FileEdit, BookDown, GraduationCap, ArrowRight } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

const materials = [
  {
    id: "blog",
    icon: FileEdit,
    label: "Blog",
    heading: "Blog ANNETEC",
    description: "Conteúdo sobre saúde, bem-estar e benefícios para associados e entidades.",
    items: [
      { title: "Prevenção começa com informação", excerpt: "Como pequenos hábitos ajudam na Promoção da Saúde." },
      { title: "Entenda seus benefícios ANNETEC", excerpt: "Um guia rápido pelos principais benefícios do plano." },
      { title: "União Inteligente na prática", excerpt: "Como associações e sindicatos ampliam o acesso a benefícios." },
    ],
  },
  {
    id: "ebooks",
    icon: BookDown,
    label: "e-Books",
    heading: "e-Books gratuitos",
    description: "Materiais para baixar e aprofundar o conhecimento sobre saúde e benefícios.",
    items: [
      { title: "Guia da Saúde Preventiva", excerpt: "Tudo sobre consultas preventivas e check-ups." },
      { title: "Benefícios para Entidades", excerpt: "Como sua associação pode oferecer mais aos associados." },
      { title: "Bem-Estar 50+", excerpt: "Cuidados e benefícios voltados à maturidade." },
    ],
  },
  {
    id: "cursos",
    icon: GraduationCap,
    label: "Cursos gratuitos",
    heading: "Cursos gratuitos",
    description: "Cursos online para associados, com certificado e desconto exclusivo.",
    items: [
      { title: "Introdução à Qualidade de Vida", excerpt: "Curso introdutório sobre hábitos saudáveis." },
      { title: "Educação Financeira Básica", excerpt: "Organize suas finanças com aulas práticas." },
      { title: "Direitos do Consumidor", excerpt: "Noções essenciais para o dia a dia." },
    ],
  },
]

export default function MateriaisPage() {
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Materiais <span className="text-[#e84364]">Gratuitos</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Blog, e-Books e Cursos gratuitos para associados da ANNETEC.
            </p>
          </motion.div>
        </div>
      </section>

      {materials.map((section, sectionIndex) => (
        <section
          key={section.id}
          id={section.id}
          className={`py-20 lg:py-32 scroll-mt-20 ${sectionIndex % 2 === 0 ? "bg-white" : "bg-[#f8fafc]"}`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="mb-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
                <section.icon size={16} />
                {section.label}
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#26365f] mb-4 text-balance">
                {section.heading}
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl">{section.description}</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {section.items.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="h-full p-6 bg-white rounded-2xl shadow-lg border border-border/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                >
                  <span className="inline-block text-xs font-bold uppercase tracking-wider text-[#e84364] bg-[#e84364]/10 rounded-full px-3 py-1 mb-4">
                    Em breve
                  </span>
                  <h3 className="text-lg font-bold text-[#26365f] mb-2">{item.title}</h3>
                  <p className="text-muted-foreground mb-4">{item.excerpt}</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-[#e84364]/60">
                    Saiba mais
                    <ArrowRight size={16} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <Footer />
    </main>
  )
}
