"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Heart, Stethoscope, Pill, SmilePlus, Video, CreditCard, Users } from "lucide-react"

const youCardItems = [
  { icon: Stethoscope, label: "Planos de saúde" },
  { icon: SmilePlus, label: "Odontologia" },
  { icon: Video, label: "Telemedicina 24h" },
  { icon: Pill, label: "Farmácia e descontos" },
]

const createCardItems = [
  "Estratégia e validação",
  "Produtos e parceiros",
  "Tecnologia e plataforma",
  "Operação e suporte",
]

export function HeroSection() {
  return (
    <section className="relative isolate min-h-screen min-h-[100dvh] flex items-center overflow-hidden pt-20 md:pt-20 pb-[calc(100vw/24)]">
      {/* ───── Rich Background ───── */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Gradient fill — mesma linguagem visual da página de login, agora em toda a largura da Hero */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#e84364] via-[#e84364] to-[#26365f]" />
        <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-[#26365f]/30 blur-[120px]" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-white/10 blur-[110px]" />
        <div className="absolute top-[40%] left-[35%] w-[350px] h-[350px] rounded-full bg-white/5 blur-[90px] -translate-x-1/2 -translate-y-1/2" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="w-full max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        {/*
          A onda branca do rodapé (SVG 1440×60, largura total, logo abaixo)
          fica em posição absoluta e cobre o fundo da seção. A altura dela é
          sempre 100vw ÷ 24 — 60px em 1440, 80px em 1920 — e o pico da curva
          cai bem embaixo da coluna de texto. Centralizar o conteúdo na altura
          inteira deixava os selos de confiança colados na curva. Por isso a
          seção reserva exatamente essa altura no `pb` e esta grade desconta
          o mesmo valor: o conteúdo centraliza na área visível acima da onda,
          em qualquer largura de tela.
        */}
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-6 items-center min-h-[calc(100vh-5rem-100vw/24)]">

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
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-full text-sm font-semibold text-white border border-white/20 shadow-sm mb-8 w-fit"
            >
              <Heart size={15} className="text-white" />
              Plano de Assistência Familiar
            </motion.div>

            {/*
              Título principal — o único em corpo de display (72px no xl).
              Peso 600, não 800: na Saira condensada o extrabold fechava o miolo
              do "a", "e" e "o" e o título virava bloco. O destaque vem do corpo,
              não da espessura — por isso o tamanho subiu ~12% em todos os
              breakpoints ao mesmo tempo que o peso desceu.
              Largura 93% (os demais títulos usam 96%): em 72px a condensação
              ganha presença sem custar leitura. Tracking -0,02em: com o traço
              mais fino sobra ar entre as letras, e dá para apertar sem encostar
              os acentos de "ã" e "ç".
              Entrelinha 1,02 (era 1,08): em 72px sobrava ar entre as linhas.
              O ponto crítico é a 1ª para a 2ª linha, onde a perna do "p" de
              "proteção" cai sobre o acento do "í" de "benefícios" — medido
              no print em escala real, estavam a ~20px; em 1,02 sobram ~15px.
            */}
            <h1 className="text-[2.75rem] sm:text-[3.5rem] lg:text-[3.875rem] xl:text-[4.5rem] font-semibold text-white leading-[1.02] tracking-[-0.02em] [font-stretch:93%]">
              Saúde, proteção e benefícios para pessoas e organizações.
            </h1>

            {/* Subheadline */}
            <p className="mt-7 text-lg sm:text-xl text-white/80 leading-relaxed max-w-xl font-medium">
              Planos de saúde e benefícios para você. Soluções para entidades. Estratégia e tecnologia para quem quer criar seu próprio cartão de benefícios.
            </p>

            {/* Brand Tagline */}
            <div className="mt-6 flex items-center gap-3">
              <img src="/annetec-light.svg" alt="ANNETEC" className="h-7 opacity-90" />
              <div className="w-px h-6 bg-white/25" />
              <span className="text-white font-bold text-lg tracking-wide">União Inteligente</span>
            </div>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-white hover:bg-white/90 text-[#e84364] text-base sm:text-lg font-extrabold px-10 py-7 rounded-full shadow-lg shadow-black/10 hover:shadow-xl transition-all duration-300 hover:scale-[1.03] uppercase tracking-wider flex items-center justify-center gap-2.5"
                asChild
              >
                <Link href="#contrate">
                  EXPLORE AS POSSIBILIDADES
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-2 border-white/40 text-white hover:bg-white hover:text-[#26365f] hover:border-white text-base sm:text-lg font-bold px-10 py-7 rounded-full transition-all duration-300 flex items-center justify-center backdrop-blur-sm"
                asChild
              >
                <Link href="#contato">FALE COM A ANNETEC</Link>
              </Button>
            </div>

            {/* Quick Feature Highlights */}
            <div className="mt-10 pt-7 border-t border-white/20 flex flex-wrap gap-x-8 gap-y-3">
              {[
                "Sem taxa de adesão",
                "Cobertura Ampla",
                "Telemedicina 24h",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckCircle2 className="w-[18px] h-[18px] text-white shrink-0" />
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
              <div className="w-[85%] aspect-square rounded-full border-2 border-dashed border-white/25 animate-[spin_60s_linear_infinite]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[95%] aspect-square rounded-full border border-white/10" />
            </div>

            {/* Main Image Container */}
            <div className="relative w-full max-w-[640px] xl:max-w-[720px] -mt-10 lg:-mt-16 xl:-mt-20">
              {/* Halo behind image — pop sobre o painel em degradê */}
              <div className="absolute -inset-4 bg-gradient-to-br from-white/30 via-white/10 to-white/5 rounded-t-[2rem] rounded-b-[9999px] blur-2xl -z-10" />

              <div className="relative rounded-t-[1.75rem] rounded-b-[9999px] overflow-hidden shadow-2xl shadow-[#26365f]/15">
                <img
                  src="/images/mulher-hero.png"
                  alt="Associada ANNETEC"
                  className="w-full h-auto object-cover"
                />
                {/* Subtle gradient overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#26365f]/10 to-transparent" />
              </div>

              {/* ── "Para Você" Featured Card (top-left) ── */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute -left-5 xl:-left-10 -top-5 sm:-top-8 z-20 hidden md:block w-[230px] xl:w-[250px]"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="bg-white rounded-2xl p-5 shadow-xl shadow-[#26365f]/15 border border-white/80"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#e84364] flex items-center justify-center shrink-0">
                      <Heart size={22} className="text-white" fill="currentColor" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[#e84364] uppercase tracking-wide">Para você</p>
                      <p className="text-base font-extrabold text-[#26365f] leading-tight">Saúde e<br />benefícios</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {youCardItems.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-2.5 bg-[#faf1ef] rounded-full px-3 py-2"
                      >
                        <item.icon size={14} className="text-[#26365f] shrink-0" />
                        <span className="text-xs font-semibold text-[#26365f]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>

              {/* ── "Para Entidades" Featured Card (top-right) ── */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="absolute -right-4 xl:-right-8 -top-5 sm:-top-8 z-20 hidden md:block w-[190px] xl:w-[210px]"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="bg-white rounded-2xl p-4 shadow-xl shadow-[#26365f]/15 border border-white/80"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#e84364] flex items-center justify-center shrink-0">
                      <Users size={22} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[#e84364] uppercase tracking-wide">Para entidades</p>
                      <p className="text-base font-extrabold text-[#26365f] leading-tight">Mais valor<br />para seus<br />associados</p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* ── "Crie seu Cartão" Featured Card (bottom-right) ── */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="absolute -right-5 xl:-right-10 -bottom-6 sm:-bottom-10 z-20 hidden md:block w-[230px] xl:w-[250px]"
              >
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="bg-white rounded-2xl p-5 shadow-xl shadow-[#26365f]/15 border border-white/80"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#e84364] flex items-center justify-center shrink-0">
                      <CreditCard size={22} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[#e84364] uppercase tracking-wide">Crie seu cartão</p>
                      <p className="text-base font-extrabold text-[#26365f] leading-tight">Da ideia à<br />operação</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {createCardItems.map((label) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <CheckCircle2 size={16} className="text-[#26365f]/40 shrink-0" />
                        <span className="text-xs font-semibold text-[#26365f]">{label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>

      {/* ───── Bottom wave transition ───── */}
      <div className="absolute -bottom-px left-0 right-0 z-10 leading-[0]">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block">
          <path d="M0 60V30C240 0 480 0 720 15C960 30 1200 45 1440 30V60H0Z" fill="white"/>
        </svg>
      </div>
    </section>
  )
}
