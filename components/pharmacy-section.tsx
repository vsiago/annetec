"use client"

import { motion } from "framer-motion"
import { Pill, Percent, MapPin, CreditCard, ArrowRight } from "lucide-react"
import Link from "next/link"

export function PharmacySection() {
  return (
    <section id="farmacia" className="py-20 lg:py-32 bg-[#f8fafc] relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#e5375b]/5 via-transparent to-[#1c3670]/5" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e5375b]/10 rounded-full text-[#e5375b] text-sm font-medium mb-6">
              <Pill size={16} />
              Benefício Farmácia
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6 text-balance">
              Bons descontos de até{" "}
              <span className="text-[#e5375b]">60% na compra de medicamentos</span>
            </h2>

            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Basta apresentar a sua Carteirinha no Celular direto nas mais de 1.000 
              farmácias disponíveis para você não deixar de se cuidar.
            </p>

            {/* Features */}
            <div className="space-y-4 mb-8">
              {[
                { icon: Percent, text: "Até 60% de desconto em medicamentos" },
                { icon: MapPin, text: "+1.000 farmácias parceiras em todo Brasil" },
                { icon: CreditCard, text: "Carteirinha digital direto no celular" },
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm"
                >
                  <div className="w-10 h-10 bg-[#1c3670]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <feature.icon size={20} className="text-[#1c3670]" />
                  </div>
                  <span className="text-[#1c3670] font-medium">{feature.text}</span>
                </motion.div>
              ))}
            </div>

            <Link 
              href="#rede-farmacias" 
              className="inline-flex items-center gap-2 text-[#e5375b] hover:text-[#d12d4f] font-medium transition-colors"
            >
              Ver rede de farmácias parceiras
              <ArrowRight size={18} />
            </Link>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2"
          >
            <div className="relative">
              {/* Main Card */}
              <div className="bg-gradient-to-br from-[#1c3670] to-[#2d4a8c] rounded-3xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-4">
                    <Pill size={40} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Carteirinha Digital</h3>
                  <p className="text-white/70">Apresente no celular</p>
                </div>

                {/* Discount Badge */}
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="bg-[#e5375b] rounded-2xl p-6 text-center"
                >
                  <p className="text-white/90 text-sm mb-1">Desconto de até</p>
                  <span className="text-5xl font-bold text-white">60%</span>
                  <p className="text-white/90 text-sm mt-1">em medicamentos</p>
                </motion.div>

                {/* Pharmacies Count */}
                <div className="mt-6 text-center">
                  <p className="text-white/60 text-sm">Disponível em</p>
                  <p className="text-2xl font-bold text-white">+1.000 farmácias</p>
                </div>
              </div>

              {/* Floating Elements */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute -top-4 -right-4 bg-white rounded-xl p-3 shadow-lg"
              >
                <span className="text-3xl">💊</span>
              </motion.div>
              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 3.5, repeat: Infinity }}
                className="absolute -bottom-4 -left-4 bg-white rounded-xl p-3 shadow-lg"
              >
                <span className="text-3xl">🏥</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
