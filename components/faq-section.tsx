"use client"

import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

const faqs = [
  {
    question: "Plano de Assistência ou Club de Benefícios é o mesmo que plano de saúde?",
    answer: "De forma alguma. Plano de saúde é um produto bem definido, regulamentado e regulado pela Agência Nacional de Saúde Suplementar – ANS, que tem regras claras e é regido pela Lei 9.656/98. Dentre as principais regras que os planos de saúde estão sujeitos estão a cobertura mínima, por meio do ROL de Procedimentos Obrigatórios, editado pela ANS, a formação de reservas técnicas e de garantias financeiras, internação hospitalar e muito mais. Já um Plano de Assistência ou um Clube de Benefícios prioriza muito mais coberturas ligadas à qualidade de vida, à prevenção e ao bem-estar, por meio de descontos e benefícios organizados para o seu público-alvo."
  },
  {
    question: "As coberturas do Clube de Benefícios são distribuídas por faixa etária?",
    answer: "Não. Em um Plano de Assistência o participante encontrará descontos, vantagens e coberturas para todas as faixas etárias. No entanto, há empresas que focam determinado segmento, como é o caso da Annetec em que, o público prioritário, são pessoas mais maduras, em torno dos 40 anos de idade ou mais. Esta segmentação é um grande diferencial da Annetec porque seus produtos são pensados e organizados para oferecerem coberturas que mais se identificam com o seu público-alvo. A Annetec é o único clube de benefícios a oferecer um conjunto de vantagens, benefícios e coberturas voltadas completamente para esta faixa etária."
  },
  {
    question: "A Annetec foi criada apenas para quem não tem plano de saúde?",
    answer: "De forma alguma. Se você não possui um plano de saúde, a Annetec pode te ajudar oferecendo descontos, benefícios e vantagens em diversos estabelecimentos para a realização de consultas, exames e terapias, em nível ambulatorial, para que você possa cuidar da sua Saúde & Bem-Estar. Mas, se você já é beneficiário de um plano ou seguro privado de assistência à saúde, seja ele coletivo, empresarial ou individual, a Annetec proporciona um complemento perfeito para cuidar de você e de sua família, por meio de coberturas exclusivas e pensadas para melhorarem a sua vida. Portanto, a Annetec é para quem tem um plano de saúde e para quem não tem."
  },
  {
    question: "O que é um Plano de Assistência?",
    answer: "É um plano de atenção familiar que, por meio de descontos, benefícios e vantagens disponibilizados de forma organizada, tem como objetivo melhorar a qualidade de vida e o bem-estar dos seus associados. Diferente de um plano de saúde tradicional, o foco está na prevenção e promoção da saúde."
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="py-20 lg:py-32 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1c3670] mb-6">
            Perguntas <span className="text-[#e5375b]">Frequentes</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Tire suas dúvidas sobre a Annetec
          </p>
        </motion.div>

        {/* FAQ Items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div 
                className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                  openIndex === index 
                    ? "border-[#e5375b]/30 shadow-lg" 
                    : "border-border hover:border-[#1c3670]/30"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-[#1c3670] pr-4">{faq.question}</span>
                  <ChevronDown 
                    size={20} 
                    className={`text-[#e5375b] flex-shrink-0 transition-transform duration-300 ${
                      openIndex === index ? "rotate-180" : ""
                    }`} 
                  />
                </button>
                <motion.div
                  initial={false}
                  animate={{
                    height: openIndex === index ? "auto" : 0,
                    opacity: openIndex === index ? 1 : 0,
                  }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-5">
                    <p className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
