"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, CheckCircle, Shield } from "lucide-react"

export function CTASection() {
  return (
    <section id="contrate" className="py-20 lg:py-32 bg-gradient-to-br from-[#26365f] via-[#26365f] to-[#3a4e82] relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#e84364]/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white text-sm font-medium mb-8">
            <Shield size={16} className="text-[#e84364]" />
            Plano Individual ou Empresarial
          </div>

          {/* Headline */}
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 text-balance">
            Comece a cuidar da sua{" "}
            <span className="text-[#e84364]">Saúde & Bem-Estar</span> hoje mesmo
          </h2>

          <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
            Por apenas R$ 14,90/mês, você tem acesso a diversos benefícios, vantagens, 
            descontos e muito mais. Consulte também Plano Empresarial com condições 
            especiais para grupos!
          </p>

          {/* Features */}
          <div className="flex flex-wrap justify-center gap-6 mb-10">
            {[
              "Sem carência",
              "Sem burocracia",
              "Cancele quando quiser",
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-white/90">
                <CheckCircle size={18} className="text-[#e84364]" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Price */}
          <div className="inline-block bg-white/10 backdrop-blur-sm rounded-2xl px-8 py-6 mb-10">
            <p className="text-white/70 text-sm mb-1">A partir de</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-white text-lg">R$</span>
              <span className="text-6xl font-bold text-white">14,90</span>
              <span className="text-white/70">/mês</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-[#e84364] hover:bg-[#d12d4f] text-white text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
              asChild
            >
              <Link href="#checkout">
                Contrate Agora!
                <ArrowRight size={20} className="ml-2" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="!bg-transparent border border-white/40 !text-white hover:bg-white/10 hover:border-white/80 text-lg px-8 py-6 transition-all duration-300"
              asChild
            >
              <Link href="#empresarial">Plano Empresarial</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
