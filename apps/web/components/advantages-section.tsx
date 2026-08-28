"use client"

import { motion } from "framer-motion"
import { Gift, Percent, ShoppingBag, Ticket, ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const categories = [
  { icon: "🏥", label: "Saúde" },
  { icon: "🎉", label: "Lazer" },
  { icon: "🏋️", label: "Esporte" },
  { icon: "📚", label: "Educação" },
  { icon: "💄", label: "Beleza" },
  { icon: "🛍️", label: "Compras" },
  { icon: "🍽️", label: "Restaurantes" },
  { icon: "✈️", label: "Viagens" },
]

export function AdvantagesSection() {
  return (
    <section id="vantagens" className="py-20 lg:py-32 bg-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-[#e84364]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-[#26365f]/5 rounded-full blur-3xl" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
              <Gift size={16} />
              Club de Vantagens
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Um completo Club de Vantagens com{" "}
              <span className="text-[#e84364]">descontos exclusivos</span>
            </h2>

            <div className="space-y-4 text-muted-foreground leading-relaxed mb-8">
              <p>
                Só na Annetec, o Associado tem um completo Club de Vantagens que proporciona 
                descontos em um enorme número de estabelecimentos comerciais, serviços gerais, 
                serviços de saúde, medicamentos, educação, lazer e muito mais.
              </p>
              <p>
                Além dos descontos e vantagens tradicionais, o Associado Annetec ainda conta 
                com diversas opções de parcerias celebradas especificamente para o nosso Club, 
                com benefícios voltados exclusivamente para a família Annetec.
              </p>
            </div>

            <Button
              size="lg"
              className="bg-[#e84364] hover:bg-[#d12d4f] text-white shadow-lg"
              asChild
            >
              <Link href="#club-vantagens">
                <ShieldCheck size={18} className="mr-2" />
                Acesse o Club de Vantagens
              </Link>
            </Button>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="relative">
              {/* Main Card */}
              <div className="bg-gradient-to-br from-[#f8fafc] to-white rounded-3xl p-8 shadow-2xl border border-border/50">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-gradient-to-br from-[#e84364] to-[#ff6b8b] rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
                    <Gift size={40} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#26365f] mb-2">Club de Vantagens</h3>
                  <p className="text-muted-foreground">Descontos em diversas categorias</p>
                </div>

                {/* Categories Grid */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {categories.map((category, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      className="flex flex-col items-center gap-2 p-3 bg-[#f8fafc] rounded-xl hover:bg-[#e84364]/5 transition-colors cursor-pointer"
                    >
                      <span className="text-2xl">{category.icon}</span>
                      <span className="text-xs font-medium text-[#26365f]">{category.label}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Discount Badge */}
                <div className="bg-[#26365f] rounded-xl p-4 text-center">
                  <p className="text-white/80 text-sm">Descontos de até</p>
                  <span className="text-3xl font-bold text-[#e84364]">70%</span>
                  <p className="text-white/80 text-sm">em parceiros selecionados</p>
                </div>
              </div>

              {/* Floating Elements */}
              <motion.div
                animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -top-4 -right-4 bg-[#e84364] rounded-xl p-3 shadow-lg"
              >
                <Percent size={24} className="text-white" />
              </motion.div>
              <motion.div
                animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
                transition={{ duration: 3.5, repeat: Infinity }}
                className="absolute -bottom-4 -left-4 bg-[#26365f] rounded-xl p-3 shadow-lg"
              >
                <ShoppingBag size={24} className="text-white" />
              </motion.div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute top-1/2 -right-8 bg-white rounded-xl p-3 shadow-lg border border-border/50"
              >
                <Ticket size={24} className="text-[#e84364]" />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
