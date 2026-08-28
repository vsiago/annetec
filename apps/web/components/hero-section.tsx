"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Heart, Stethoscope, Pill, SmilePlus } from "lucide-react"

const floatingCards = [
  { icon: Stethoscope, label: "Consultas", value: "a partir de R$ 40", delay: 0 },
  { icon: SmilePlus, label: "Odontologia", value: "R$ 19,90/mês", delay: 0.15 },
  { icon: Pill, label: "Farmácia", value: "até 60% OFF", delay: 0.3 },
]

export function HeroSection() {
  return (
    <section className="relative min-h-screen min-h-[100dvh] flex items-center overflow-hidden pt-20 md:pt-20">
      {/* ───── Rich Background ───── */}
      <div className="absolute inset-0 -z-10">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#f8fafc] via-[#eef3f9] to-[#dce7f3]" />
        
        {/* Geometric accent shapes */}
        <div className="absolute top-0 right-0 w-[55%] h-full bg-gradient-to-bl from-[#e84364]/[0.06] via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[60%] bg-gradient-to-tr from-[#26365f]/[0.06] via-transparent to-transparent" />
        
        {/* Glowing orbs */}
        <div className="absolute top-[15%] left-[5%] w-[500px] h-[500px] bg-[#e84364]/[0.08] rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[600px] h-[600px] bg-[#26365f]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute top-[50%] left-[50%] w-[300px] h-[300px] bg-[#e84364]/[0.05] rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
        
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, #26365f 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-6 items-center min-h-[calc(100vh-5rem)]">

          {/* ───── Left: Copy & CTAs ───── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col justify-center order-2 lg:order-1 py-8 lg:py-12"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/80 backdrop-blur-sm rounded-full text-sm font-semibold text-[#26365f] border border-[#26365f]/10 shadow-sm mb-8 w-fit"
            >
              <Heart size={15} className="text-[#e84364]" />
              Plano de Assistência Familiar
            </motion.div>

            {/* Main Headline */}
            <h1 className="text-[2.5rem] sm:text-[3.25rem] lg:text-[3.5rem] xl:text-[4rem] font-extrabold text-[#26365f] leading-[1.08] tracking-tight">
              A melhor plataforma de{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#e84364]">benefícios</span>
                <span className="absolute bottom-1 left-0 w-full h-3 bg-[#e84364]/15 rounded-sm -z-0" />
              </span>{" "}
              para os associados
            </h1>

            {/* Subheadline */}
            <p className="mt-7 text-lg sm:text-xl text-[#26365f]/70 leading-relaxed max-w-xl font-medium">
              Planos de Saúde, Odontológicos e Assistência Familiar com a força da{" "}
              <strong className="text-[#26365f]">União Inteligente</strong>.
            </p>

            {/* Brand Tagline */}
            <div className="mt-6 flex items-center gap-3">
              <img src="/annetec.svg" alt="ANNETEC" className="h-7 opacity-90" />
              <div className="w-px h-6 bg-[#26365f]/20" />
              <span className="text-[#26365f] font-bold text-lg tracking-wide">União Inteligente</span>
            </div>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-[#e84364] hover:bg-[#d12d4f] text-white text-base sm:text-lg font-extrabold px-10 py-7 rounded-full shadow-lg shadow-[#e84364]/25 hover:shadow-xl hover:shadow-[#e84364]/30 transition-all duration-300 hover:scale-[1.03] uppercase tracking-wider flex items-center justify-center gap-2.5"
                asChild
              >
                <Link href="#contrate">
                  ASSOCIE-SE
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-[#26365f]/20 text-[#26365f] hover:bg-[#26365f] hover:text-white hover:border-[#26365f] text-base sm:text-lg font-bold px-10 py-7 rounded-full transition-all duration-300 flex items-center justify-center backdrop-blur-sm"
                asChild
              >
                <Link href="#beneficios">Conheça os Benefícios</Link>
              </Button>
            </div>

            {/* Quick Feature Highlights */}
            <div className="mt-10 pt-7 border-t border-[#26365f]/10 flex flex-wrap gap-x-8 gap-y-3">
              {[
                "Sem taxa de adesão",
                "Cobertura Ampla",
                "Telemedicina 24h",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm font-semibold text-[#26365f]">
                  <CheckCircle2 className="w-[18px] h-[18px] text-[#e84364] shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ───── Right: Image + Floating Elements ───── */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="relative flex items-center justify-center order-1 lg:order-2 py-4 lg:py-0"
          >
            {/* Decorative ring behind image */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[85%] aspect-square rounded-full border-2 border-dashed border-[#e84364]/10 animate-[spin_60s_linear_infinite]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[95%] aspect-square rounded-full border border-[#26365f]/5" />
            </div>

            {/* Main Image Container */}
            <div className="relative w-full max-w-[520px] xl:max-w-[560px]">
              {/* Gradient blob behind image */}
              <div className="absolute -inset-4 bg-gradient-to-br from-[#e84364]/20 via-[#e84364]/10 to-[#26365f]/10 rounded-[2rem] blur-2xl -z-10" />
              
              <div className="relative rounded-[1.75rem] overflow-hidden shadow-2xl shadow-[#26365f]/15 border-4 border-white/60">
                <img
                  src="/images/hero-girl-clean.png"
                  alt="Associada ANNETEC"
                  className="w-full h-auto object-cover"
                />
                {/* Subtle gradient overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#26365f]/10 to-transparent" />
              </div>

              {/* ── Floating Benefit Cards ── */}
              {floatingCards.map((card, index) => {
                const positions = [
                  "absolute -left-8 xl:-left-14 top-[15%]",         // top-left
                  "absolute -right-6 xl:-right-12 top-[45%]",       // mid-right
                  "absolute -left-4 xl:-left-10 bottom-[12%]",      // bottom-left
                ]
                return (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 + card.delay, duration: 0.5 }}
                    className={`${positions[index]} z-20 hidden md:block`}
                  >
                    <motion.div
                      animate={{ y: [0, index % 2 === 0 ? -8 : 8, 0] }}
                      transition={{ duration: 3 + index * 0.5, repeat: Infinity, ease: "easeInOut" }}
                      className="bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-lg shadow-[#26365f]/10 border border-white/80 flex items-center gap-3"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: index === 0 ? '#26365f' : index === 1 ? '#e84364' : '#26365f' }}
                      >
                        <card.icon size={20} className="text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-[#26365f]/60 font-medium">{card.label}</p>
                        <p className="text-sm font-bold text-[#26365f]">{card.value}</p>
                      </div>
                    </motion.div>
                  </motion.div>
                )
              })}

              {/* Price badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-20 hidden sm:block"
              >
                <div className="bg-gradient-to-r from-[#26365f] to-[#3a4e82] rounded-2xl px-8 py-4 shadow-xl shadow-[#26365f]/20 text-center">
                  <p className="text-white/70 text-xs mb-0.5">A partir de</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-white text-sm">R$</span>
                    <span className="text-3xl font-extrabold text-white">14,90</span>
                    <span className="text-white/60 text-sm">/mês</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ───── Bottom wave transition ───── */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block">
          <path d="M0 60V30C240 0 480 0 720 15C960 30 1200 45 1440 30V60H0Z" fill="white"/>
        </svg>
      </div>
    </section>
  )
}
