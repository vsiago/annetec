"use client"

import { motion } from "framer-motion"
import { Cross, Percent, Pill, PhoneCall, Video, CheckCircle, Building2, User, Stethoscope, ClipboardList, Receipt, HelpingHand } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

const associacaoBenefits = [
  { icon: Cross, title: "Plano Funeral" },
  { icon: Percent, title: "Club de Descontos" },
  { icon: Pill, title: "Benefício Farmácia" },
  { icon: PhoneCall, title: "Teleassistências" },
  { icon: Video, title: "Telemedicina" },
]

const gestaoFeatures = [
  { icon: ClipboardList, title: "Cadastro" },
  { icon: Receipt, title: "Cobrança e Faturamento" },
  { icon: HelpingHand, title: "Auxílio completo" },
]

const essencialChecklist = [
  "Consultas Médicas com até 80% de desconto",
  "Cartão de Benefícios com milhares de descontos",
  "Auxílio Funeral",
  "Plano de Saúde Ambulatorial com desconto exclusivo",
  "Plano Odontológico com desconto exclusivo",
  "Pacote de Cursos Online com 50% de desconto",
  "Orientação Jurídica por telefone (Direito Civil e do Consumidor)",
]

export default function PlanosPage() {
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#26365f] mb-6 text-balance">
              Planos <span className="text-[#e84364]">Club de Saúde & Benefícios</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Escolha o plano ideal para sua associação ou sindicato, sua empresa ou para você.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Gestão de Saúde */}
      <section id="gestao" className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#26365f]/5 rounded-full text-[#26365f] text-sm font-medium mb-6">
                <Stethoscope size={16} className="text-[#e84364]" />
                Gestão de Saúde
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#26365f] mb-6 text-balance">
                Somos a entidade <span className="text-[#e84364]">gestora</span> do seu plano
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                A ANNETEC é entidade gestora de planos de saúde e odontológicos na modalidade
                Coletivo por Adesão. Possui uma estrutura operacional completa de cadastro, cobrança,
                faturamento e auxílio completo a todas as atividades relacionadas com a administração
                do plano de saúde, odontológico ou, ainda, de planos de assistência familiar como
                cartões de benefícios e outros por assinatura.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="grid gap-4"
            >
              {gestaoFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="flex items-center gap-4 p-5 bg-white rounded-2xl shadow-lg border border-border/50"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#e84364]/10 shrink-0">
                    <feature.icon size={22} className="text-[#e84364]" />
                  </div>
                  <span className="font-bold text-[#26365f]">{feature.title}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Planos para associação/sindicato */}
      <section id="associacao" className="py-20 lg:py-32 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-[#26365f] mb-6 text-balance">
              Planos para sua <span className="text-[#e84364]">associação ou sindicato</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Na ANNETEC, a sua associação ou sindicato conta com opções de assistências e benefícios
              com condições diferenciadas. São planos de saúde adaptados para seus associados, planos
              odontológicos, planos de assistência familiar e muito mais.
              <br />
              ANNETEC e a sua entidade: uma União Inteligente!
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {associacaoBenefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="flex flex-col items-center text-center gap-3 p-6 bg-white rounded-2xl shadow-lg border border-border/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-[#e84364]/10">
                  <benefit.icon size={26} className="text-[#e84364]" />
                </div>
                <span className="font-bold text-[#26365f] text-sm">{benefit.title}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Planos para empresa */}
      <section id="empresa" className="py-20 lg:py-32 bg-gradient-to-br from-[#26365f] to-[#3a4e82]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-white/90 text-sm font-medium mb-6">
              <Building2 size={16} className="text-[#e84364]" />
              Para empresas
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 text-balance">
              Planos para sua <span className="text-[#e84364]">empresa</span>
            </h2>
            <p className="text-lg text-white/80 leading-relaxed">
              A ANNETEC, por meio de parcerias firmadas com as maiores corretoras de seguros,
              operadoras de planos de saúde e administradoras de benefícios, é a melhor plataforma
              para a contratação do benefício saúde para seus funcionários e dependentes.
              <br />
              <br />
              União Inteligente entre os maiores players do mercado de saúde suplementar.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Planos para você */}
      <section id="voce" className="py-20 lg:py-32 bg-gradient-to-b from-white to-[#f0f4f9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#e84364]/10 rounded-full text-[#e84364] text-sm font-medium mb-6">
                <User size={16} />
                Para você
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#26365f] mb-6 text-balance">
                Planos para <span className="text-[#e84364]">você</span>
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Na ANNETEC o Associado conta com diversos benefícios com foco na Prevenção de Doenças
                e Promoção de Saúde. Além disso, uma série de programas com múltiplas assistências,
                atendem às mais diversas necessidades.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-gradient-to-br from-[#26365f] to-[#3a4e82] rounded-3xl p-8 shadow-2xl"
            >
              <p className="text-white/70 text-sm mb-1">Plano</p>
              <h3 className="text-2xl font-bold text-white mb-4">ANNETEC ESSENCIAL</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-sm text-white">R$</span>
                <span className="text-5xl font-bold text-white">29,90</span>
              </div>
              <p className="text-xs text-white/60 mb-8">por mês / por pessoa</p>

              <div className="space-y-3">
                {essencialChecklist.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle size={20} className="text-[#e84364] flex-shrink-0 mt-0.5" />
                    <span className="text-white/90 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
