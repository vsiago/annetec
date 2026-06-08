"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Shield, Heart, Phone, Users } from "lucide-react"
import { cn } from "@/lib/utils"

function AnnetecLogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 982.67 982.67" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M402.38,679.76c0,47.76,38.72,86.49,86.47,86.49s86.49-38.73,86.49-86.49c0-28.67-14.01-54.01-35.51-69.74v-307.58l399.94,389.96c-76.83,171.11-248.71,290.27-448.44,290.27C219.98,982.67,0,762.69,0,491.33S219.98,0,491.33,0s491.34,219.98,491.34,491.33c0,28.99-2.51,57.39-7.32,85l-396.17-386.87c-14.49-14.34-32.44-21.93-51.07-21.93-46.95,0-84.91,45.53-84.91,102.88v336c-24.48,15.27-40.82,42.37-40.82,73.35Z"/>
      <path fill="currentColor" d="M517.01,679.76c0,15.55-12.61,28.15-28.16,28.15s-28.14-12.6-28.14-28.15,12.6-28.15,28.14-28.15,28.16,12.61,28.16,28.15Z"/>
    </svg>
  )
}

function VendiLogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* White Y shape */}
      {/* Left arm */}
      <path d="M30,20 L42,20 L52,52 L40,52 Z" fill="#ffffff" />
      {/* Right arm and stem */}
      <path d="M70,20 L58,20 L35,80 L47,80 L56,52 L70,20 Z" fill="#ffffff" />
      {/* Pink triangle in the V space */}
      <path d="M42,20 L58,20 L50,42 Z" fill="#e84364" />
    </svg>
  )
}

// Set 1: Annetec View (Partner Brands & Plain Names)
const SATELLITE_SET_1 = [
  {
    id: "amep",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <span className="text-[6px] sm:text-[7px] font-bold text-sky-400 tracking-widest uppercase mb-0.5">Saúde</span>
        <span className="text-[10px] sm:text-[14px] font-black text-[#1a2d54] tracking-tight italic">AMEP</span>
        <div className="w-8 h-0.5 bg-[#e84364] rounded-full mt-0.5" />
      </div>
    ),
  },
  {
    id: "clubassisty",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex items-center justify-center h-full w-full p-1 text-center select-none">
        <span className="text-[9px] sm:text-[11px] leading-tight text-[#26365f]">
          <span className="font-extrabold">club</span>
          <span className="font-light">assisty</span>
        </span>
      </div>
    ),
  },
  {
    id: "telemedicina",
    bg: "bg-[#1a2d54]",
    borderColor: "border-transparent",
    content: (
      <div className="flex items-center justify-center h-full w-full p-1 text-center select-none">
        <span className="text-[9px] sm:text-[11px] font-bold text-white leading-tight">Telemedicina</span>
      </div>
    ),
  },
  {
    id: "farmacia",
    bg: "bg-[#e84364]",
    borderColor: "border-transparent",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-tight select-none">
        <span className="text-[9px] sm:text-[10px] font-medium text-white">Benefício</span>
        <span className="text-[9px] sm:text-[10px] font-bold text-white">Farmácia</span>
      </div>
    ),
  },
  {
    id: "vendi-partner",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <div className="w-5 h-5 rounded-full bg-[#3c1b9b] flex items-center justify-center text-white mb-0.5 shadow-sm">
          <VendiLogoIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-[8px] font-extrabold text-[#26365f]">vendi</span>
        <span className="text-[7px] font-semibold text-slate-500">seguros</span>
      </div>
    ),
  },
  {
    id: "descontos",
    bg: "bg-[#e84364]",
    borderColor: "border-transparent",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-tight select-none">
        <span className="text-[9px] sm:text-[10px] font-medium text-white">Club de</span>
        <span className="text-[9px] sm:text-[10px] font-bold text-white">Descontos</span>
      </div>
    ),
  },
  {
    id: "funeral",
    bg: "bg-[#1a2d54]",
    borderColor: "border-transparent",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-tight select-none">
        <span className="text-[9px] sm:text-[10px] font-medium text-white">Plano</span>
        <span className="text-[9px] sm:text-[10px] font-bold text-white">Funeral</span>
      </div>
    ),
  },
  {
    id: "porto",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <svg className="w-5 h-3 text-[#004b8d] mb-0.5" fill="currentColor" viewBox="0 0 24 12">
          <path d="M0,6 C6,12 12,0 18,6 C21,9 23,8 24,7 L24,12 L0,12 Z" />
        </svg>
        <span className="text-[8px] font-black text-[#004b8d] tracking-tighter uppercase leading-[1.1]">Porto</span>
        <span className="text-[8px] font-black text-[#004b8d] tracking-tighter uppercase leading-[1.1]">Seguro</span>
        <span className="text-[7px] font-medium text-[#009bde] mt-0.5 leading-[1.1]">Odontológico</span>
      </div>
    ),
  },
]

// Set 2: Vendi View (Daughter Brands)
const SATELLITE_SET_2 = [
  {
    id: "amep",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <span className="text-[6px] sm:text-[7px] font-bold text-sky-400 tracking-widest uppercase mb-0.5">Saúde</span>
        <span className="text-[10px] sm:text-[14px] font-black text-[#1a2d54] tracking-tight italic">AMEP</span>
        <div className="w-8 h-0.5 bg-[#e84364] rounded-full mt-0.5" />
      </div>
    ),
  },
  {
    id: "sulamerica",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        {/* Orange wave */}
        <svg className="w-8 h-1.5 sm:w-10 sm:h-2 text-amber-500 mb-0.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 40 10">
          <path d="M2,6 C12,0 28,10 38,4" />
        </svg>
        <span className="text-[8px] sm:text-[10px] text-[#002f6c] leading-none">
          <span className="font-extrabold">Sul</span>
          <span className="font-medium">América</span>
        </span>
        <span className="text-[6px] sm:text-[7px] font-bold text-amber-500 uppercase mt-0.5 tracking-wider">Saúde</span>
      </div>
    ),
  },
  {
    id: "assim",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <span className="text-[6px] sm:text-[7px] font-bold text-sky-500 uppercase tracking-widest self-end mr-2">Saúde</span>
        <span className="text-[10px] sm:text-[13px] font-black text-[#0c2a5c] relative mt-0.5">
          <span className="absolute -top-1 left-[1px] w-1 h-1 sm:w-1.2 sm:h-1.2 bg-[#e84364] rounded-full" />
          ASSIM
        </span>
      </div>
    ),
  },
  {
    id: "qualicorp",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex items-center justify-center gap-1 h-full w-full p-1 leading-none select-none">
        {/* Dotted sun circle */}
        <div className="relative w-4 h-4 sm:w-6 sm:h-6 flex items-center justify-center flex-shrink-0">
          <div className="w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full border border-amber-500 bg-amber-50" />
          <div className="absolute inset-0 rounded-full border border-dashed border-amber-500 animate-spin" style={{ animationDuration: '8s' }} />
        </div>
        <div className="flex flex-col items-start justify-center">
          <span className="text-[8px] sm:text-[11px] font-extrabold text-[#00174f]">quali</span>
          <span className="text-[6px] sm:text-[8px] font-light text-slate-400">corp</span>
        </div>
      </div>
    ),
  },
  {
    id: "annetec-daughter",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-[#e84364] flex items-center justify-center text-white mb-0.5 shadow-sm">
          <svg viewBox="0 0 982.67 982.67" className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M402.38,679.76c0,47.76,38.72,86.49,86.47,86.49s86.49-38.73,86.49-86.49c0-28.67-14.01-54.01-35.51-69.74v-307.58l399.94,389.96c-76.83,171.11-248.71,290.27-448.44,290.27C219.98,982.67,0,762.69,0,491.33S219.98,0,491.33,0s491.34,219.98,491.34,491.33c0,28.99-2.51,57.39-7.32,85l-396.17-386.87c-14.49-14.34-32.44-21.93-51.07-21.93-46.95,0-84.91,45.53-84.91,102.88v336c-24.48,15.27-40.82,42.37-40.82,73.35Z"/>
            <path fill="currentColor" d="M517.01,679.76c0,15.55-12.61,28.15-28.16,28.15s-28.14-12.6-28.14-28.15,12.6-28.15,28.14-28.15,28.16,12.61,28.16,28.15Z"/>
          </svg>
        </div>
        <span className="text-[7px] sm:text-[9px] font-black text-[#26365f]">annetec</span>
        <span className="text-[5px] sm:text-[6px] text-[#e84364] mt-0.5 uppercase tracking-tighter scale-90 sm:scale-100">saúde & benefícios</span>
      </div>
    ),
  },
  {
    id: "vendi-daughter",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <span className="text-[8px] sm:text-[10px] font-black text-[#4c1d95] tracking-tight">
          vendi<span className="font-light text-slate-400">seguros</span>
        </span>
        <span className="text-[5px] sm:text-[6px] text-[#e84364] font-bold mt-1 uppercase tracking-tighter scale-90 sm:scale-100">planos de saúde</span>
      </div>
    ),
  },
  {
    id: "amil",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex items-center justify-center h-full w-full p-1 text-center select-none">
        <span className="text-[12px] sm:text-[18px] font-black tracking-tight text-[#581c87]">
          amil
        </span>
      </div>
    ),
  },
  {
    id: "porto",
    bg: "bg-white",
    borderColor: "border-[#1a2d54]",
    content: (
      <div className="flex flex-col items-center justify-center h-full w-full p-1 text-center leading-none select-none">
        <svg className="w-5 h-3 text-[#004b8d] mb-0.5" fill="currentColor" viewBox="0 0 24 12">
          <path d="M0,6 C6,12 12,0 18,6 C21,9 23,8 24,7 L24,12 L0,12 Z" />
        </svg>
        <span className="text-[8px] font-black text-[#004b8d] tracking-tighter uppercase leading-[1.1]">Porto</span>
        <span className="text-[8px] font-black text-[#004b8d] tracking-tighter uppercase leading-[1.1]">Seguro</span>
        <span className="text-[7px] font-medium text-[#009bde] mt-0.5 leading-[1.1]">Odontológico</span>
      </div>
    ),
  },
]

export function HeroSection() {
  const [centerLogo, setCenterLogo] = useState(0) // 0 = annetec, 1 = vendi

  useEffect(() => {
    const interval = setInterval(() => {
      setCenterLogo((prev) => (prev === 0 ? 1 : 0))
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const currentSatellites = centerLogo === 0 ? SATELLITE_SET_1 : SATELLITE_SET_2

  return (
    <section className="relative min-h-[100dvh] flex flex-col justify-center overflow-hidden bg-gradient-to-br from-white via-[#f0f4f9] to-white pt-24 pb-12 lg:pt-28">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#e84364]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#26365f]/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-[#26365f]/5 to-transparent rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#26365f]/5 rounded-full text-[#26365f] text-sm font-medium mb-6"
            >
              <Shield size={16} className="text-[#e84364]" />
              Plano de Assistência Familiar
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-5xl sm:text-6xl lg:text-[4.5rem] xl:text-[5rem] font-extrabold text-[#26365f] leading-[1.1] tracking-tight"
            >
              Planos de Saúde e <br className="hidden lg:block" />
              <span className="text-[#e84364]">Club de Benefícios</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8 text-xl sm:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto lg:mx-0 font-medium"
            >
              Exclusivo para Entidades Associativas e Profissionais, Servidores Públicos, Militares
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button
                size="lg"
                className="bg-[#e84364] hover:bg-[#d12d4f] text-white text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 animate-pulse-glow"
                asChild
              >
                <Link href="#contrate">
                  Contrate Agora!
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-[#26365f] text-[#26365f] hover:bg-[#26365f] hover:text-white text-lg px-8 py-6 transition-all duration-300"
                asChild
              >
                <Link href="#beneficios">Conheça os Benefícios</Link>
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-8 flex flex-wrap gap-6 justify-center lg:justify-start"
            >
              {[
                { icon: Users, text: "+10.000 associados" },
                { icon: Heart, text: "Saúde & Bem-Estar" },
                { icon: Phone, text: "Suporte 24h" },
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <item.icon size={18} className="text-[#e84364]" />
                  <span>{item.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right Content - Rotating Benefits Graphic */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative flex items-center justify-center lg:justify-end mt-10 lg:mt-0 w-full"
          >
            <div className="relative w-full max-w-[600px] aspect-square flex items-center justify-center">
              
              {/* Floating Price Highlight (Desktop) */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 1, duration: 0.6, type: "spring" }}
                className="absolute -top-8 -right-2 lg:-top-12 lg:-right-4 z-50 p-5 bg-white/90 backdrop-blur-2xl rounded-[1.5rem] shadow-[0_20px_40px_-15px_rgba(38,54,95,0.15)] border border-white hidden md:flex flex-col items-start"
              >
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">A partir de</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-[#26365f]">R$</span>
                  <span className="text-[3rem] leading-none font-black tracking-tighter text-[#e84364]">14,90</span>
                  <span className="text-sm font-semibold text-muted-foreground">/mês</span>
                </div>
                <div className="mt-2.5 inline-flex items-center gap-2 bg-[#26365f]/5 px-3 py-1.5 rounded-full border border-[#26365f]/10">
                  <svg className="w-3.5 h-3.5 text-[#26365f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <p className="text-[11px] uppercase tracking-wider font-extrabold text-[#26365f]">
                    Plano Individual
                  </p>
                </div>
              </motion.div>

              {/* Decorative Connections - Multiple Rings */}
              <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none" viewBox="0 0 600 600">
                {/* Inner Ring (Logo Orbit) */}
                <circle cx="300" cy="300" r="234" fill="none" stroke="#26365f" strokeWidth="2" strokeDasharray="6 6" className="opacity-20" />
                {/* Outer Decorative Ring */}
                <circle cx="300" cy="300" r="280" fill="none" stroke="#e84364" strokeWidth="1" strokeDasharray="3 9" className="opacity-10" />
              </svg>

              {/* Central Logo - Alternating with Blur transition */}
              <div className="absolute z-20 w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center select-none shadow-2xl border-4 border-white overflow-hidden bg-white">
                <AnimatePresence mode="wait">
                  {centerLogo === 0 ? (
                    <motion.div
                      key="annetec"
                      initial={{ opacity: 0, filter: "blur(8px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.4 }}
                      className="w-full h-full bg-[#e84364] flex items-center justify-center rounded-full"
                    >
                      <AnnetecLogoIcon className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="vendi"
                      initial={{ opacity: 0, filter: "blur(8px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.4 }}
                      className="w-full h-full bg-[#3c1b9b] flex items-center justify-center rounded-full"
                    >
                      <VendiLogoIcon className="w-16 h-16 sm:w-20 sm:h-20 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Orbital Carousel - Ferris wheel rotation using native CSS animations */}
              <div className="absolute inset-0 z-10 animate-orbit">
                <div className="w-full h-full relative">
                  {/* Satellites */}
                  {currentSatellites.map((satellite, index) => {
                    const angle = (index * 360) / 8
                    
                    return (
                      <div
                        key={`satellite-wrapper-${index}`}
                        className="absolute w-full h-full top-0 left-0 pointer-events-none"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <div 
                          className="absolute left-1/2 -ml-8 sm:-ml-12 w-16 h-16 sm:w-24 sm:h-24 pointer-events-auto"
                          style={{ 
                            top: '3%',
                            transform: `rotate(${-angle}deg)`
                          }}
                        >
                          <div className="w-full h-full animate-satellite">
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.5, delay: index * 0.08 }}
                              className="w-full h-full"
                            >
                              <div
                                className={cn(
                                  "w-full h-full rounded-full border shadow-lg flex items-center justify-center p-1 select-none hover:shadow-xl transition-all duration-500",
                                  satellite.bg,
                                  satellite.borderColor
                                )}
                              >
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key={`${satellite.id}-${centerLogo}`}
                                    initial={{ opacity: 0, filter: "blur(4px)" }}
                                    animate={{ opacity: 1, filter: "blur(0px)" }}
                                    exit={{ opacity: 0, filter: "blur(4px)" }}
                                    transition={{ duration: 0.3 }}
                                    className="w-full h-full flex items-center justify-center"
                                  >
                                    {satellite.content}
                                  </motion.div>
                                </AnimatePresence>
                              </div>
                            </motion.div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-6 h-10 border-2 border-[#26365f]/30 rounded-full flex justify-center pt-2"
        >
          <div className="w-1.5 h-3 bg-[#26365f]/50 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
