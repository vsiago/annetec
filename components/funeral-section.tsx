"use client"

import { motion } from "framer-motion"
import { Heart, ArrowRight } from "lucide-react"
import Link from "next/link"

export function FuneralSection() {
  return (
    <section id="funeral" className="py-20 lg:py-32 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Visual */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-[#f8fafc] to-white rounded-3xl p-8 lg:p-12 shadow-xl border border-border/50">
              <div className="text-center">
                <div className="w-24 h-24 bg-[#1c3670]/10 rounded-full mx-auto flex items-center justify-center mb-6">
                  <Heart size={48} className="text-[#1c3670]" />
                </div>
                <h3 className="text-2xl font-bold text-[#1c3670] mb-4">Auxílio Funeral</h3>
                <p className="text-muted-foreground mb-6">Reembolso garantido de até</p>
                <div className="inline-block bg-[#1c3670] rounded-2xl px-8 py-6">
                  <span className="text-4xl lg:text-5xl font-bold text-white">R$ 3.000</span>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Em caso de falecimento do associado
                </p>
              </div>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1c3670]/10 rounded-full text-[#1c3670] text-sm font-medium mb-6">
              <Heart size={16} className="text-[#e5375b]" />
              Proteção Familiar
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6 text-balance">
              Auxílio Funeral em dinheiro,{" "}
              <span className="text-[#e5375b]">no momento em que você mais precisa</span>
            </h2>

            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                A Annetech quer te ajudar, sem criar dificuldades ou excesso de burocracia 
                para conseguir este benefício, pois sabemos o quanto é doloroso a perda de um 
                ente querido.
              </p>
              <p>
                O auxílio funeral é uma cobertura na qual a Annetech reembolsa todos os 
                custos referentes ao funeral em caso de falecimento do associado 
                (excluídos cônjuge e filhos), até o limite de{" "}
                <strong className="text-[#1c3670]">R$ 3.000,00</strong>.
              </p>
              <p>
                Somente é necessário que o familiar (cônjuge, companheiro(a), filho(a) 
                maior de idade, por exemplo) tenha todas as notas fiscais dos serviços e a 
                devida documentação exigida de comprovação do óbito, então, solicitar o 
                reembolso.
              </p>
              <p className="text-sm bg-[#f8fafc] p-4 rounded-xl border border-border/50">
                <strong className="text-[#1c3670]">Importante:</strong> Neste tipo de serviço, 
                a família não tem nenhuma assistência em relação aos outros trâmites envolvidos 
                no velório, transporte e preparo do corpo. Todas as decisões, assim como a escolha 
                das empresas, ficam a cargo da família.
              </p>
            </div>

            <div className="mt-8">
              <Link 
                href="#condicoes-funeral" 
                className="inline-flex items-center gap-2 text-[#e5375b] hover:text-[#d12d4f] font-medium transition-colors"
              >
                Consulte as Condições Gerais desta cobertura
                <ArrowRight size={18} />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
