"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Shield, Heart, Phone, Users, CheckCircle, Pill, Stethoscope, Activity, Sparkles } from "lucide-react"

const CAROUSEL_DATA = [
  {
    id: "farmacia",
    title: "Farmácias e Medicamentos",
    icon: Pill,
    color: "bg-[#e84364]",
    hexColor: "#e84364",
    logos: ["Raia", "Drogasil", "Pague Menos", "Extrafarma", "Medipreço", "Omni"]
  },
  {
    id: "consultas",
    title: "Consultas e Exames",
    icon: Stethoscope,
    color: "bg-[#26365f]",
    hexColor: "#26365f",
    logos: ["Hapvida", "Sabin", "Fleury", "Notredame", "Hermes", "A+"]
  },
  {
    id: "odonto",
    title: "Odontologia",
    icon: Activity,
    color: "bg-teal-500",
    hexColor: "#14b8a6",
    logos: ["OdontoPrev", "Amil Dental", "Sorridents", "OdontoCompany", "BelaDente", "SulAmérica"]
  },
  {
    id: "vantagens",
    title: "Clube de Vantagens",
    icon: Sparkles,
    color: "bg-amber-500",
    hexColor: "#f59e0b",
    logos: ["Cinemark", "SmartFit", "Magalu", "Netshoes", "Burger King", "Uber"]
  }
];

export function HeroSection() {
  const [activeCategory, setActiveCategory] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCategory((prev) => (prev + 1) % CAROUSEL_DATA.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const activeData = CAROUSEL_DATA[activeCategory];

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

          {/* Right Content - Phone Mockup and Orbital Carousel */}
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
                <circle cx="300" cy="300" r="230" fill="none" stroke="#26365f" strokeWidth="2" strokeDasharray="6 6" className="opacity-20" />
                {/* Outer Decorative Ring */}
                <circle cx="300" cy="300" r="280" fill="none" stroke="#e84364" strokeWidth="1" strokeDasharray="3 9" className="opacity-10" />
              </svg>

              {/* Central Phone Mockup */}
              <div className="absolute z-30 pointer-events-none">
                <div className="w-[240px] h-[490px] bg-[#26365f] rounded-[2.5rem] p-2.5 shadow-2xl relative">
                  <div className="w-full h-full bg-white rounded-[2rem] overflow-hidden flex flex-col relative">
                    <div className="p-5 bg-gradient-to-b from-gray-50 to-white flex-1 flex flex-col items-center">
                      <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-8 mx-auto" />
                      <img src="/annetec-vertical.svg" alt="Annetec" className="h-16 mb-8" />
                      
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activeCategory}
                          initial={{ opacity: 0, scale: 0.8, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.8, y: -10 }}
                          transition={{ duration: 0.3 }}
                          className="flex flex-col items-center text-center space-y-5"
                        >
                          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white ${activeData.color} shadow-lg shadow-${activeData.color.replace('bg-', '')}/30`}>
                            <activeData.icon className="w-10 h-10" />
                          </div>
                          <h3 className="font-bold text-[#26365f] text-xl leading-tight px-2">
                            {activeData.title}
                          </h3>
                          <p className="text-sm text-muted-foreground px-2">
                            As melhores opções disponíveis.
                          </p>
                        </motion.div>
                      </AnimatePresence>

                      <div className="mt-auto w-full">
                        <div className="bg-[#e84364] text-white text-center py-3 rounded-xl text-sm font-bold shadow-md">
                          Acessar Benefício
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Orbital Carousel */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 z-10"
              >
                <div className="w-full h-full relative">
                  {/* Satellites - Permanently mounted so their continuous spin syncs with parent orbit */}
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const angle = (index * 360) / 6;
                    const logo = activeData.logos[index];
                    
                    return (
                      <div
                        key={`satellite-wrapper-${index}`}
                        className="absolute w-full h-full top-0 left-0 pointer-events-none"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <div 
                          className="absolute left-1/2 -ml-10 w-20 h-20 pointer-events-auto"
                          style={{ top: '5%' }} /* Placed precisely on the 230px radius orbit in a 600x600 container */
                        >
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="w-full h-full"
                          >
                            <motion.div
                              animate={{ rotate: [-angle, -angle - 360] }}
                              transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                              className="w-full h-full rounded-full bg-white shadow-xl flex items-center justify-center p-2 border-[3px] transition-colors duration-500"
                              style={{ borderColor: activeData.hexColor }}
                            >
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={`content-${activeCategory}`}
                                  initial={{ opacity: 0, scale: 0.5 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.5 }}
                                  transition={{ duration: 0.3 }}
                                  className="w-full h-full flex items-center justify-center"
                                >
                                  <span className="text-[11px] leading-tight font-bold text-center text-[#26365f] break-words">
                                    {logo}
                                  </span>
                                </motion.div>
                              </AnimatePresence>
                            </motion.div>
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

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
