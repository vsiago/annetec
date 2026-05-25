"use client"

import { motion } from "framer-motion"
import { SmilePlus, CheckCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const dentalCoverages = [
  "Consultas",
  "Urgência e Emergência",
  "Radiologia",
  "Prevenção",
  "Dentística",
  "Endodontia",
  "Periodontia",
  "Cirurgia",
  "Odontopediatria",
]

export function DentalSection() {
  return (
    <section id="odonto" className="py-20 lg:py-32 bg-gradient-to-br from-[#1c3670] to-[#2d4a8c] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#e5375b]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white/90 text-sm font-medium mb-6">
              <SmilePlus size={16} className="text-[#e5375b]" />
              Odontologia
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 text-balance">
              Plano Odontológico Completo:{" "}
              <span className="text-[#e5375b]">cuide da sua saúde oral</span>
            </h2>

            <p className="text-lg text-white/80 mb-8 leading-relaxed">
              Só na Annetec você tem acesso ao melhor da Odontologia, por 
              meio de um plano dental completo, com cobertura nacional, por apenas{" "}
              <span className="font-bold text-[#e5375b]">R$ 19,90 por mês</span>, por beneficiário.
            </p>

            {/* Price Card */}
            <div className="inline-block p-6 bg-white/10 backdrop-blur-sm rounded-2xl mb-8">
              <p className="text-sm text-white/70">Por apenas</p>
              <div className="flex items-baseline gap-1">
                <span className="text-sm text-white">R$</span>
                <span className="text-5xl font-bold text-white">19,90</span>
                <span className="text-sm text-white/70">/mês</span>
              </div>
              <p className="text-xs text-white/60 mt-1">por beneficiário</p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-[#e5375b] hover:bg-[#d12d4f] text-white"
                asChild
              >
                <Link href="#adesao-wdental">
                  Fazer adesão à W.Dental
                  <ArrowRight size={18} className="ml-2" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="!bg-transparent border border-white/40 !text-white hover:bg-white/10 hover:border-white/80 transition-all duration-300"
                asChild
              >
                <Link href="#condicoes-odonto">Condições Gerais</Link>
              </Button>
            </div>
          </motion.div>

          {/* Coverages Grid */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8">
              <h3 className="text-xl font-bold text-white mb-6">
                Aproveite essa chance e contrate agora para ter direito às COBERTURAS:
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {dentalCoverages.map((coverage, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <CheckCircle size={20} className="text-[#e5375b] flex-shrink-0" />
                    <span className="text-white/90">{coverage}</span>
                  </motion.div>
                ))}
              </div>

              {/* Partner Logo Placeholder */}
              <div className="mt-8 pt-6 border-t border-white/10">
                <p className="text-sm text-white/60 mb-3">O benefício odontológico é garantido por:</p>
                <div className="bg-white/20 rounded-xl p-4 inline-block">
                  <span className="text-white font-bold text-xl">W.Dental</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
