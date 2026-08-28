"use client"

import { motion } from "framer-motion"
import { Stethoscope, FlaskConical, MapPin, ArrowRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function ConsultationsSection() {
  return (
    <section id="consultas" className="py-20 lg:py-32 bg-gradient-to-b from-[#f8fafc] to-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxYzM2NzAiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
            <Stethoscope size={16} />
            Rede Conveniada
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
            Consultas e Exames a{" "}
            <span className="text-[#e84364]">preços mais em conta</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Uma rede de parceiros exclusivos da Annetec garante consultas a partir de{" "}
            <strong className="text-[#26365f]">R$ 40,00</strong> para que você possa cuidar 
            de você com consultas médicas muito mais em conta do que particular.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8 mb-12">
          {/* Consultations Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-white rounded-3xl p-8 shadow-xl border border-border/50"
          >
            <div className="w-16 h-16 bg-[#26365f]/10 rounded-2xl flex items-center justify-center mb-6">
              <Stethoscope size={32} className="text-[#26365f]" />
            </div>
            <h3 className="text-2xl font-bold text-[#26365f] mb-4">Consultas Médicas</h3>
            <p className="text-muted-foreground mb-6">
              Consultas com especialistas a partir de R$ 40,00 em nossa rede 
              conveniada em vários municípios do Rio de Janeiro e do Brasil.
            </p>
            <div className="bg-[#f8fafc] rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground">A partir de</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-[#26365f]">R$</span>
                <span className="text-4xl font-bold text-[#e84364]">40,00</span>
              </div>
            </div>
            <Button asChild className="w-full bg-[#26365f] hover:bg-[#152a5c] h-14 text-base rounded-xl">
              <Link href="#rede-consultas">
                <MapPin size={18} className="mr-2" />
                Confira a rede conveniada
              </Link>
            </Button>
          </motion.div>

          {/* Exams Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="bg-white rounded-3xl p-8 shadow-xl border border-border/50"
          >
            <div className="w-16 h-16 bg-[#e84364]/10 rounded-2xl flex items-center justify-center mb-6">
              <FlaskConical size={32} className="text-[#e84364]" />
            </div>
            <h3 className="text-2xl font-bold text-[#26365f] mb-4">Exames de Imagem</h3>
            <p className="text-muted-foreground mb-6">
              A Annetec também tem parcerias exclusivas para realização de exames 
              de imagem e muito mais com descontos especiais.
            </p>
            <div className="bg-[#f8fafc] rounded-xl p-4 mb-6">
              <p className="text-sm text-muted-foreground">Descontos de até</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-[#e84364]">50%</span>
                <span className="text-sm text-muted-foreground">em exames</span>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full border-[#e84364] text-[#e84364] hover:bg-[#e84364] hover:text-white h-14 text-base rounded-xl">
              <Link href="#rede-exames">
                <Search size={18} className="mr-2" />
                Conhecer todos os exames
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-gradient-to-r from-[#26365f] to-[#3a4e82] rounded-2xl p-6 lg:p-8 text-center"
        >
          <p className="text-white/90 mb-2">
            A Annetec estará continuamente atualizando essa rede de conveniados para que a 
            cada dia você tenha ainda mais opções.
          </p>
          <Link 
            href="#rede-completa" 
            className="inline-flex items-center gap-2 text-[#e84364] hover:text-[#ff6b8b] font-medium transition-colors"
          >
            Ver rede completa
            <ArrowRight size={18} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
